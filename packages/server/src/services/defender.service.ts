import { Address } from 'viem';
import { Defender } from '@openzeppelin/defender-sdk';

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

type DefenderTxStatus =
  | 'pending'
  | 'sent'
  | 'submitted'
  | 'inmempool'
  | 'mined'
  | 'confirmed'
  | 'failed';

/**
 * OZ Defender 서비스 - Gasless 트랜잭션 릴레이
 *
 * OpenZeppelin Defender SDK를 사용하여 가스 없는 트랜잭션을 릴레이합니다.
 * 사용자는 가스비를 지불하지 않고, 릴레이어가 대신 트랜잭션을 제출합니다.
 */
export class DefenderService {
  private readonly client: Defender;
  private readonly relayerAddress: Address;

  constructor(apiKey: string, apiSecret: string, relayerAddress: string) {
    if (!apiKey || !apiSecret) {
      throw new Error('Defender API 자격증명이 필요합니다');
    }

    // Defender SDK 클라이언트 초기화
    this.client = new Defender({
      relayerApiKey: apiKey,
      relayerApiSecret: apiSecret,
    });

    this.relayerAddress = relayerAddress as Address;
  }

  /**
   * Defender 트랜잭션 상태를 내부 상태로 매핑
   */
  private mapStatus(
    defenderStatus: DefenderTxStatus
  ): RelayerResponse['status'] {
    switch (defenderStatus) {
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
   * Defender Relay를 통해 트랜잭션을 제출합니다.
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
      // Defender Relay를 통해 트랜잭션 제출
      const tx = await this.client.relaySigner.sendTransaction({
        to: targetAddress,
        data: transactionData,
        value: options?.value ?? '0',
        gasLimit: options?.gasLimit ?? '200000',
        speed: options?.speed ?? 'average',
      });

      console.log(
        `[DefenderService] 트랜잭션 제출됨: paymentId=${paymentId}, txId=${tx.transactionId}`
      );

      return {
        relayRequestId: tx.transactionId,
        transactionHash: tx.hash,
        status: this.mapStatus(tx.status as DefenderTxStatus),
      };
    } catch (error) {
      console.error('[DefenderService] Gasless 거래 제출 실패:', error);

      // 에러 타입에 따른 처리
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          throw new Error('릴레이어 잔액이 부족합니다');
        }
        if (error.message.includes('nonce')) {
          throw new Error('트랜잭션 nonce 충돌이 발생했습니다. 잠시 후 다시 시도해주세요');
        }
        if (error.message.includes('unauthorized') || error.message.includes('401')) {
          throw new Error('Defender API 인증에 실패했습니다');
        }
      }

      throw new Error('Gasless 거래를 제출할 수 없습니다');
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
      // Defender API에서 트랜잭션 상태 조회
      const tx = await this.client.relaySigner.getTransaction(relayRequestId);

      return {
        relayRequestId: tx.transactionId,
        transactionHash: tx.hash,
        status: this.mapStatus(tx.status as DefenderTxStatus),
      };
    } catch (error) {
      console.error('[DefenderService] 릴레이 상태 조회 실패:', error);

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
        console.warn(
          `[DefenderService] 트랜잭션이 이미 처리됨: ${relayRequestId}`
        );
        return false;
      }

      // 실패한 트랜잭션은 취소할 필요 없음
      if (status.status === 'failed') {
        return true;
      }

      // Defender SDK는 직접적인 취소 API를 제공하지 않음
      // 대신 replacement transaction (0 value to self)을 사용해야 함
      // 현재는 취소 불가능 상태로 반환
      console.warn(
        `[DefenderService] 트랜잭션 취소는 현재 지원되지 않습니다: ${relayRequestId}`
      );
      return false;
    } catch (error) {
      console.error('[DefenderService] 릴레이 거래 취소 실패:', error);
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
   *
   * 현재는 고정 가스 가격을 사용하며, 추후 네트워크 조회로 개선 예정
   */
  async estimateGasFee(gasLimit: string): Promise<string> {
    try {
      // TODO: 실제 네트워크 가스 가격 조회 구현
      // 현재는 50 Gwei 기준으로 추정
      const gasPrice = BigInt(gasLimit) * BigInt('50000000000');
      return gasPrice.toString();
    } catch (error) {
      console.error('[DefenderService] 가스 요금 추정 실패:', error);
      throw new Error('가스 요금을 추정할 수 없습니다');
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
   *
   * 릴레이어가 트랜잭션을 제출할 수 있는 충분한 잔액이 있는지 확인
   */
  async checkRelayerHealth(): Promise<{
    healthy: boolean;
    message: string;
  }> {
    try {
      // 간단한 API 연결 테스트
      // Defender SDK는 직접적인 health check API가 없으므로
      // 릴레이어 정보 조회로 대체
      const relayerInfo = await this.client.relaySigner.getRelayer();

      // RelayerGetResponse vs RelayerGroupResponse 처리
      const address =
        'address' in relayerInfo
          ? relayerInfo.address
          : relayerInfo.relayers?.[0]?.address ?? 'unknown';

      return {
        healthy: true,
        message: `릴레이어 연결 성공: ${address}`,
      };
    } catch (error) {
      console.error('[DefenderService] 릴레이어 헬스 체크 실패:', error);
      return {
        healthy: false,
        message: '릴레이어 연결에 실패했습니다',
      };
    }
  }
}
