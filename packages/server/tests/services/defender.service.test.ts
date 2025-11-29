import { describe, it, expect, beforeEach } from 'vitest';
import { DefenderService } from '../../src/services/defender.service';

describe('DefenderService', () => {
  let defenderService: DefenderService;

  beforeEach(() => {
    defenderService = new DefenderService(
      'test-api-key',
      'test-api-secret',
      '0x' + 'f'.repeat(40)
    );
  });

  describe('constructor', () => {
    it('유효한 자격증명으로 인스턴스를 생성해야 함', () => {
      const service = new DefenderService(
        'api-key',
        'api-secret',
        '0x' + 'a'.repeat(40)
      );

      expect(service).toBeDefined();
    });

    it('누락된 API 키로 생성 시 에러를 던져야 함', () => {
      expect(() => {
        new DefenderService('', 'api-secret', '0x' + 'a'.repeat(40));
      }).toThrow('Defender API 자격증명이 필요합니다');
    });

    it('누락된 API 시크릿으로 생성 시 에러를 던져야 함', () => {
      expect(() => {
        new DefenderService('api-key', '', '0x' + 'a'.repeat(40));
      }).toThrow('Defender API 자격증명이 필요합니다');
    });
  });

  describe('submitGaslessTransaction', () => {
    it('유효한 거래 데이터로 릴레이 요청 ID를 반환해야 함', async () => {
      const result = await defenderService.submitGaslessTransaction(
        'payment-123',
        '0x' + 'a'.repeat(40),
        '0x' + 'b'.repeat(128)
      );

      expect(result.relayRequestId).toBeDefined();
      expect(result.status).toBe('submitted');
    });

    it('누락된 결제 ID로 요청 시 에러를 던져야 함', async () => {
      await expect(
        defenderService.submitGaslessTransaction('', '0x' + 'a'.repeat(40), '0x' + 'b'.repeat(128))
      ).rejects.toThrow('필수 파라미터가 누락되었습니다');
    });

    it('누락된 대상 주소로 요청 시 에러를 던져야 함', async () => {
      await expect(
        defenderService.submitGaslessTransaction('payment-123', '' as any, '0x' + 'b'.repeat(128))
      ).rejects.toThrow('필수 파라미터가 누락되었습니다');
    });

    it('누락된 거래 데이터로 요청 시 에러를 던져야 함', async () => {
      await expect(
        defenderService.submitGaslessTransaction('payment-123', '0x' + 'a'.repeat(40), '')
      ).rejects.toThrow('필수 파라미터가 누락되었습니다');
    });
  });

  describe('getRelayStatus', () => {
    it('유효한 릴레이 요청 ID로 상태를 조회해야 함', async () => {
      const result = await defenderService.getRelayStatus('relay-123');

      expect(result.relayRequestId).toBe('relay-123');
      expect(result.status).toBeDefined();
    });

    it('빈 릴레이 요청 ID로 조회 시 에러를 던져야 함', async () => {
      await expect(defenderService.getRelayStatus('')).rejects.toThrow('릴레이 요청 ID는 필수입니다');
    });
  });

  describe('cancelRelayTransaction', () => {
    it('유효한 릴레이 요청 ID로 취소해야 함', async () => {
      const result = await defenderService.cancelRelayTransaction('relay-123');

      expect(result).toBe(true);
    });

    it('빈 릴레이 요청 ID로 취소 시 에러를 던져야 함', async () => {
      await expect(defenderService.cancelRelayTransaction('')).rejects.toThrow(
        '릴레이 요청 ID는 필수입니다'
      );
    });
  });

  describe('validateTransactionData', () => {
    it('유효한 거래 데이터는 true를 반환해야 함', () => {
      const valid = defenderService.validateTransactionData('0x' + 'a'.repeat(128));

      expect(valid).toBe(true);
    });

    it('0x로 시작하지 않는 데이터는 false를 반환해야 함', () => {
      const invalid = defenderService.validateTransactionData('invalid-data');

      expect(invalid).toBe(false);
    });

    it('홀수 길이의 데이터는 false를 반환해야 함', () => {
      const invalid = defenderService.validateTransactionData('0xabc');

      expect(invalid).toBe(false);
    });

    it('0x만 있는 데이터는 false를 반환해야 함', () => {
      const invalid = defenderService.validateTransactionData('0x');

      expect(invalid).toBe(false);
    });

    it('빈 거래 데이터는 false를 반환해야 함', () => {
      const invalid = defenderService.validateTransactionData('');

      expect(invalid).toBe(false);
    });
  });

  describe('estimateGasFee', () => {
    it('가스 리미트로 가스 비용을 추정해야 함', async () => {
      const gasFee = await defenderService.estimateGasFee('200000');

      expect(gasFee).toBeDefined();
      expect(Number(gasFee)).toBeGreaterThan(0);
    });

    it('높은 가스 리미트로 높은 비용을 추정해야 함', async () => {
      const lowGasFee = await defenderService.estimateGasFee('100000');
      const highGasFee = await defenderService.estimateGasFee('500000');

      expect(Number(highGasFee)).toBeGreaterThan(Number(lowGasFee));
    });
  });

  describe('getRelayerAddress', () => {
    it('저장된 릴레이어 주소를 반환해야 함', () => {
      const address = defenderService.getRelayerAddress();

      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });
});
