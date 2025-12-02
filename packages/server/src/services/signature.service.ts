import {
  TypedDataDomain,
  TypedDataParameter,
  recoverTypedDataAddress,
} from 'viem';
import { Address } from 'viem';

interface ForwardRequest extends Record<string, unknown> {
  from: Address;
  to: Address;
  value: string;
  gas: string;
  nonce: string;
  deadline: string;
  data: string;
}

interface TypedDataTypes {
  [key: string]: TypedDataParameter[];
}

/**
 * 서명 검증 및 EIP-712 타입 데이터 관리 서비스
 *
 * ERC2771Forwarder 메타트랜잭션의 서명을 검증합니다.
 */
export class SignatureService {
  private forwarderAddress: Address;
  private chainId: number;
  private name = 'MSQPay';
  private version = '1';

  constructor(forwarderAddress: Address, chainId: number) {
    if (!forwarderAddress || !forwarderAddress.startsWith('0x') || forwarderAddress.length !== 42) {
      throw new Error('Invalid forwarder address');
    }
    if (!chainId || chainId <= 0) {
      throw new Error('Invalid chain ID');
    }

    this.forwarderAddress = forwarderAddress;
    this.chainId = chainId;
  }

  /**
   * EIP-712 도메인 구조 반환
   */
  getDomain(): TypedDataDomain {
    return {
      name: this.name,
      version: this.version,
      chainId: this.chainId,
      verifyingContract: this.forwarderAddress,
    };
  }

  /**
   * ForwardRequest 타입 정의 반환
   */
  getForwardRequestTypes(): TypedDataTypes {
    return {
      ForwardRequest: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'gas', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ],
    };
  }

  /**
   * 서명 검증
   *
   * EIP-712 타입 데이터 서명을 검증하고 서명자의 주소를 반환합니다.
   */
  async verifySignature(request: ForwardRequest, signature: string): Promise<boolean> {
    try {
      if (!this.isValidSignature(signature)) {
        return false;
      }

      if (!this.isValidForwardRequest(request)) {
        return false;
      }

      const domain = this.getDomain();
      const types = this.getForwardRequestTypes();

      const recoveredAddress = recoverTypedDataAddress({
        domain,
        types,
        primaryType: 'ForwardRequest',
        message: request as unknown as Record<string, unknown>,
        signature: signature as `0x${string}`,
      }) as unknown as `0x${string}`;

      return (recoveredAddress as string).toLowerCase() === (request.from as string).toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * 서명자 주소 복구
   *
   * 서명에서 서명자의 주소를 추출합니다.
   */
  async recoverSignerAddress(
    request: ForwardRequest,
    signature: string
  ): Promise<Address | null> {
    try {
      if (!this.isValidSignature(signature)) {
        return null;
      }

      if (!this.isValidForwardRequest(request)) {
        return null;
      }

      const domain = this.getDomain();
      const types = this.getForwardRequestTypes();

      const recovered = recoverTypedDataAddress({
        domain,
        types,
        primaryType: 'ForwardRequest',
        message: request as unknown as Record<string, unknown>,
        signature: signature as `0x${string}`,
      }) as unknown as `0x${string}`;

      return recovered as Address;
    } catch {
      return null;
    }
  }

  /**
   * 서명 형식 검증
   *
   * EIP-191 및 EIP-712 표준 서명 형식 검증:
   * - 0x로 시작
   * - 정확히 132자 (0x + 130자 hex)
   * - 올바른 hex 문자만 포함
   * - R, S, V 값이 올바른 범위 내
   */
  private isValidSignature(signature: string): boolean {
    if (!signature || typeof signature !== 'string') {
      return false;
    }

    if (!signature.startsWith('0x') || signature.length !== 132) {
      return false;
    }

    const hexRegex = /^0x[a-fA-F0-9]{130}$/;
    if (!hexRegex.test(signature)) {
      return false;
    }

    // V 값은 27 또는 28이어야 함 (마지막 2자 = 1바이트)
    const vValue = parseInt(signature.slice(-2), 16);
    return vValue === 27 || vValue === 28;
  }

  /**
   * ForwardRequest 형식 검증
   */
  private isValidForwardRequest(request: ForwardRequest): boolean {
    if (!request.from || !request.to || !request.data) {
      return false;
    }

    if (
      !request.from.startsWith('0x') ||
      request.from.length !== 42 ||
      !request.to.startsWith('0x') ||
      request.to.length !== 42
    ) {
      return false;
    }

    if (!request.data.startsWith('0x')) {
      return false;
    }

    const numericFields = [request.value, request.gas, request.nonce, request.deadline];
    if (!numericFields.every((field) => !isNaN(Number(field)) && Number(field) >= 0)) {
      return false;
    }

    return true;
  }
}
