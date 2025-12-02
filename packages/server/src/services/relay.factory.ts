import { DefenderService } from './defender.service';

interface IRelayService {
  submitGaslessTransaction(
    paymentId: string,
    targetAddress: string,
    transactionData: string,
    options?: any
  ): Promise<any>;
  getRelayStatus(relayRequestId: string): Promise<any>;
}

/**
 * 릴레이 서비스 팩토리
 *
 * 환경에 따라 실제 OZ Defender 또는 Mock Defender를 선택하여 반환합니다.
 * - 로컬 개발 환경: MockDefender 사용
 * - 테스트넷/메인넷: OZ Defender SDK 사용
 */
export class RelayFactory {
  /**
   * 환경 변수에 따라 적절한 릴레이 서비스 생성
   */
  static createRelayService(): IRelayService {
    const useMockDefender = process.env.USE_MOCK_DEFENDER === 'true';

    if (useMockDefender) {
      // Mock Defender 초기화 로직 (향후 구현)
      // return new MockDefender(config);
      throw new Error('MockDefender not yet implemented in factory');
    }

    // 실제 OZ Defender SDK 사용
    const apiKey = process.env.DEFENDER_API_KEY;
    const apiSecret = process.env.DEFENDER_API_SECRET;
    const relayerAddress = process.env.DEFENDER_RELAYER_ADDRESS || '0x0';

    if (!apiKey || !apiSecret) {
      throw new Error('DEFENDER_API_KEY and DEFENDER_API_SECRET are required');
    }

    return new DefenderService(apiKey, apiSecret, relayerAddress);
  }

  /**
   * 현재 환경이 로컬인지 여부 반환
   */
  static isLocalEnvironment(): boolean {
    return process.env.USE_MOCK_DEFENDER === 'true';
  }

  /**
   * 현재 환경 정보 반환
   */
  static getEnvironmentInfo(): {
    isLocal: boolean;
    useMock: boolean;
    nodeEnv: string;
  } {
    return {
      isLocal: process.env.USE_MOCK_DEFENDER === 'true',
      useMock: process.env.USE_MOCK_DEFENDER === 'true',
      nodeEnv: process.env.NODE_ENV || 'development',
    };
  }
}
