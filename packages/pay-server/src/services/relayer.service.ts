import { Address } from 'viem';
import { ForwardRequest } from '../schemas/payment.schema';
import { createLogger } from '../lib/logger';

interface RelayerResponse {
  relayRequestId: string;
  transactionHash?: string;
  status: 'submitted' | 'pending' | 'mined' | 'confirmed' | 'failed';
}

interface RelayerRequest {
  to: Address;
  data: string;
  value?: string;
  gasLimit: string;
  speed: 'safeLow' | 'average' | 'fast' | 'fastest';
}


type RelayerTxStatus =
  | 'pending'
  | 'sent'
  | 'submitted'
  | 'inmempool'
  | 'mined'
  | 'confirmed'
  | 'failed';

interface RelayerApiResponse {
  transactionId: string;
  hash?: string;
  status: RelayerTxStatus;
}

interface RelayerInfo {
  address: string;
  balance: string;
}

/**
 * Relayer 서비스 - Gasless 트랜잭션 릴레이
 *
 * HTTP 클라이언트를 통해 Relayer API와 통신합니다.
 * - Production: msq-relayer-service API
 * - Local: simple-relayer HTTP 서비스 (simple-relayer:3001)
 *
 * 환경변수 RELAYER_API_URL만 변경하면 동일한 코드로 양쪽 환경에서 동작합니다.
 */
export class RelayerService {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly relayerAddress: Address;
  private readonly logger = createLogger('RelayerService');

  constructor(
    apiUrl: string,
    apiKey: string,
    _apiSecret: string, // 미사용: relay-api는 Secret 불필요, 호환성을 위해 파라미터 유지
    relayerAddress: string
  ) {
    if (!apiUrl) {
      throw new Error('Relayer API URL이 필요합니다');
    }

    this.baseUrl = apiUrl.replace(/\/$/, ''); // 끝의 슬래시 제거
    this.apiKey = apiKey;
    this.relayerAddress = relayerAddress as Address;
  }

  /**
   * HTTP 요청 헤더 생성
   *
   * relay-api (msq-relayer-service)는 x-api-key 헤더만 필요.
   * Secret은 불필요하며, 헤더 이름은 소문자로 전송.
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // API 키가 있는 경우 인증 헤더 추가
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }

    return headers;
  }

  /**
   * Relayer 트랜잭션 상태를 내부 상태로 매핑
   */
  private mapStatus(
    relayerStatus: RelayerTxStatus
  ): RelayerResponse['status'] {
    switch (relayerStatus) {
      case 'pending':
      case 'sent':
      case 'submitted':
      case 'inmempool':
        return 'pending';
      case 'mined':
        return 'mined';
      case 'confirmed':
        return 'confirmed';
      case 'failed':
        return 'failed';
      default:
        return 'pending';
    }
  }

  /**
   * Gasless 거래 요청 제출
   *
   * Defender API를 통해 트랜잭션을 제출합니다.
   * 릴레이어가 가스비를 대신 지불합니다.
   */
  async submitGaslessTransaction(
    paymentId: string,
    targetAddress: Address,
    transactionData: string,
    options?: {
      value?: string;
      gasLimit?: string;
      speed?: RelayerRequest['speed'];
    }
  ): Promise<RelayerResponse> {
    // 필수 파라미터 검증
    if (!paymentId || !targetAddress || !transactionData) {
      throw new Error('필수 파라미터가 누락되었습니다');
    }

    // 트랜잭션 데이터 검증
    if (!this.validateTransactionData(transactionData)) {
      throw new Error('잘못된 트랜잭션 데이터 형식입니다');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/relay/direct`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          to: targetAddress,
          data: transactionData,
          value: options?.value ?? '0',
          gasLimit: options?.gasLimit ?? '200000',
          speed: options?.speed ?? 'average',
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const tx = (await response.json()) as RelayerApiResponse;

      this.logger.info(
        `트랜잭션 제출됨: paymentId=${paymentId}, txId=${tx.transactionId}`
      );

      return {
        relayRequestId: tx.transactionId,
        transactionHash: tx.hash,
        status: this.mapStatus(tx.status),
      };
    } catch (error) {
      this.logger.error({ err: error }, 'Gasless 거래 제출 실패');

      // 에러 타입에 따른 처리
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          throw new Error('릴레이어 잔액이 부족합니다');
        }
        if (error.message.includes('nonce')) {
          throw new Error(
            '트랜잭션 nonce 충돌이 발생했습니다. 잠시 후 다시 시도해주세요'
          );
        }
        if (
          error.message.includes('unauthorized') ||
          error.message.includes('401')
        ) {
          throw new Error('Defender API 인증에 실패했습니다');
        }
      }

      throw new Error('Gasless 거래를 제출할 수 없습니다');
    }
  }

  /**
   * ERC2771 ForwardRequest를 사용한 Gasless 거래 제출
   *
   * ForwardRequest 파라미터와 서명을 simple-defender의 /relay/forward 엔드포인트로 전송합니다.
   * simple-defender는 Forwarder.execute(ForwardRequestData)를 호출합니다.
   */
  async submitForwardTransaction(
    paymentId: string,
    forwarderAddress: Address,
    forwardRequest: ForwardRequest
  ): Promise<RelayerResponse> {
    // 필수 파라미터 검증
    if (!paymentId || !forwarderAddress || !forwardRequest) {
      throw new Error('필수 파라미터가 누락되었습니다');
    }

    // 서명 검증
    if (!this.validateTransactionData(forwardRequest.signature)) {
      throw new Error('잘못된 서명 형식입니다');
    }

    try {
      // 클라이언트가 서명 시 사용한 nonce를 그대로 사용
      // 서버에서 재조회하면 서명 검증이 실패함
      const requestBody = {
        request: {
          from: forwardRequest.from,
          to: forwardRequest.to,
          value: forwardRequest.value,
          gas: forwardRequest.gas,
          nonce: forwardRequest.nonce,
          deadline: forwardRequest.deadline,
          data: forwardRequest.data,
        },
        signature: forwardRequest.signature,
      };

      const response = await fetch(`${this.baseUrl}/api/v1/relay/gasless`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const tx = (await response.json()) as RelayerApiResponse;

      this.logger.info(
        `ForwardRequest 트랜잭션 제출됨: paymentId=${paymentId}, txId=${tx.transactionId}`
      );

      return {
        relayRequestId: tx.transactionId,
        transactionHash: tx.hash,
        status: this.mapStatus(tx.status),
      };
    } catch (error) {
      this.logger.error({ err: error }, 'ForwardRequest 거래 제출 실패');

      // 에러 타입에 따른 처리
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          throw new Error('릴레이어 잔액이 부족합니다');
        }
        if (error.message.includes('nonce')) {
          throw new Error(
            '트랜잭션 nonce 충돌이 발생했습니다. 잠시 후 다시 시도해주세요'
          );
        }
        if (
          error.message.includes('unauthorized') ||
          error.message.includes('401')
        ) {
          throw new Error('Defender API 인증에 실패했습니다');
        }
      }

      throw new Error('ForwardRequest 거래를 제출할 수 없습니다');
    }
  }

  /**
   * 릴레이 거래 상태 조회
   *
   * Defender API를 통해 트랜잭션 상태를 조회합니다.
   */
  async getRelayStatus(relayRequestId: string): Promise<RelayerResponse> {
    if (!relayRequestId) {
      throw new Error('릴레이 요청 ID는 필수입니다');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/api/v1/relay/status/${relayRequestId}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('not found');
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const tx = (await response.json()) as RelayerApiResponse;

      return {
        relayRequestId: tx.transactionId,
        transactionHash: tx.hash,
        status: this.mapStatus(tx.status),
      };
    } catch (error) {
      this.logger.error({ err: error }, '릴레이 상태 조회 실패');

      // 트랜잭션을 찾을 수 없는 경우
      if (error instanceof Error && error.message.includes('not found')) {
        throw new Error('릴레이 요청을 찾을 수 없습니다');
      }

      throw new Error('릴레이 상태를 조회할 수 없습니다');
    }
  }

  /**
   * 릴레이 거래 취소 (미제출 트랜잭션만 가능)
   *
   * 아직 블록체인에 제출되지 않은 대기 중인 트랜잭션만 취소할 수 있습니다.
   */
  async cancelRelayTransaction(relayRequestId: string): Promise<boolean> {
    if (!relayRequestId) {
      throw new Error('릴레이 요청 ID는 필수입니다');
    }

    try {
      // 먼저 트랜잭션 상태 확인
      const status = await this.getRelayStatus(relayRequestId);

      // 이미 채굴되었거나 확정된 트랜잭션은 취소 불가
      if (status.status === 'mined' || status.status === 'confirmed') {
        this.logger.warn(
          `트랜잭션이 이미 처리됨: ${relayRequestId}`
        );
        return false;
      }

      // 실패한 트랜잭션은 취소할 필요 없음
      if (status.status === 'failed') {
        return true;
      }

      // Defender SDK는 직접적인 취소 API를 제공하지 않음
      this.logger.warn(
        `트랜잭션 취소는 현재 지원되지 않습니다: ${relayRequestId}`
      );
      return false;
    } catch (error) {
      this.logger.error({ err: error }, '릴레이 거래 취소 실패');
      throw new Error('릴레이 거래를 취소할 수 없습니다');
    }
  }

  /**
   * 트랜잭션 완료까지 대기
   *
   * 트랜잭션이 채굴되거나 실패할 때까지 폴링합니다.
   */
  async waitForTransaction(
    relayRequestId: string,
    options?: {
      timeoutMs?: number;
      pollIntervalMs?: number;
    }
  ): Promise<RelayerResponse> {
    const timeout = options?.timeoutMs ?? 120000; // 기본 2분
    const pollInterval = options?.pollIntervalMs ?? 3000; // 기본 3초

    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getRelayStatus(relayRequestId);

      // 최종 상태에 도달하면 반환
      if (
        status.status === 'mined' ||
        status.status === 'confirmed' ||
        status.status === 'failed'
      ) {
        return status;
      }

      // 폴링 간격만큼 대기
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('트랜잭션 완료 대기 시간이 초과되었습니다');
  }

  /**
   * 거래 데이터 인코딩 검증
   */
  validateTransactionData(data: string): boolean {
    try {
      // 0x로 시작해야 함
      if (!data.startsWith('0x')) {
        return false;
      }
      // 최소 길이 및 짝수 길이 확인
      if (data.length <= 2 || data.length % 2 !== 0) {
        return false;
      }
      // 16진수 문자만 포함해야 함
      const hexPattern = /^0x[0-9a-fA-F]+$/;
      return hexPattern.test(data);
    } catch {
      return false;
    }
  }

  /**
   * 가스 요금 추정 (네트워크 조회 기반)
   */
  async estimateGasFee(gasLimit: string): Promise<string> {
    try {
      // 50 Gwei 기준으로 추정
      const gasPrice = BigInt(gasLimit) * BigInt('50000000000');
      return gasPrice.toString();
    } catch (error) {
      this.logger.error({ err: error }, '가스 요금 추정 실패');
      throw new Error('가스 요금을 추정할 수 없습니다');
    }
  }

  /**
   * Forwarder 컨트랙트에서 주소의 nonce 조회
   * EIP-712 서명에 필요한 nonce를 반환합니다.
   */
  async getNonce(address: Address): Promise<string> {
    if (!address) {
      throw new Error('주소는 필수입니다');
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/relay/gasless/nonce/${address}`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as { nonce: string };
      return data.nonce;
    } catch (error) {
      this.logger.error({ err: error }, 'Nonce 조회 실패');
      throw new Error('Nonce를 조회할 수 없습니다');
    }
  }

  /**
   * 릴레이어 주소 조회
   */
  getRelayerAddress(): Address {
    return this.relayerAddress;
  }

  /**
   * 릴레이어 잔액 조회 (헬스 체크용)
   */
  async checkRelayerHealth(): Promise<{
    healthy: boolean;
    message: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/health`, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const info = (await response.json()) as RelayerInfo;

      return {
        healthy: true,
        message: `릴레이어 연결 성공: ${info.address}`,
      };
    } catch (error) {
      this.logger.error({ err: error }, '릴레이어 헬스 체크 실패');
      return {
        healthy: false,
        message: '릴레이어 연결에 실패했습니다',
      };
    }
  }
}
