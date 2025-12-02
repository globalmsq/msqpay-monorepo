import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DefenderService } from '../../src/services/defender.service';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('DefenderService', () => {
  let defenderService: DefenderService;
  const mockApiUrl = 'http://simple-defender:3001';
  const mockApiKey = 'test-api-key';
  const mockApiSecret = 'test-api-secret';
  const mockRelayerAddress = '0x' + 'f'.repeat(40);

  beforeEach(() => {
    vi.clearAllMocks();

    defenderService = new DefenderService(
      mockApiUrl,
      mockApiKey,
      mockApiSecret,
      mockRelayerAddress
    );
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('유효한 URL로 인스턴스를 생성해야 함', () => {
      const service = new DefenderService(
        mockApiUrl,
        mockApiKey,
        mockApiSecret,
        mockRelayerAddress
      );

      expect(service).toBeDefined();
    });

    it('API URL이 없으면 에러를 던져야 함', () => {
      expect(() => {
        new DefenderService('', mockApiKey, mockApiSecret, mockRelayerAddress);
      }).toThrow('Defender API URL이 필요합니다');
    });

    it('API 키와 시크릿이 없어도 인스턴스가 생성되어야 함 (Local 환경)', () => {
      const service = new DefenderService(
        mockApiUrl,
        '',
        '',
        mockRelayerAddress
      );

      expect(service).toBeDefined();
    });
  });

  describe('submitGaslessTransaction', () => {
    it('유효한 거래 데이터로 릴레이 요청 ID를 반환해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          hash: '0x' + 'a'.repeat(64),
          status: 'pending',
        }),
      });

      const result = await defenderService.submitGaslessTransaction(
        'payment-123',
        ('0x' + 'a'.repeat(40)) as `0x${string}`,
        '0x' + 'b'.repeat(128)
      );

      expect(result.relayRequestId).toBe('tx-mock-123');
      expect(result.transactionHash).toBe('0x' + 'a'.repeat(64));
      expect(result.status).toBe('pending');

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockApiUrl}/relay`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Api-Key': mockApiKey,
            'X-Api-Secret': mockApiSecret,
          }),
        })
      );
    });

    it('options를 전달할 수 있어야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          hash: '0x' + 'a'.repeat(64),
          status: 'pending',
        }),
      });

      await defenderService.submitGaslessTransaction(
        'payment-123',
        ('0x' + 'a'.repeat(40)) as `0x${string}`,
        '0x' + 'b'.repeat(128),
        {
          gasLimit: '500000',
          speed: 'fast',
          value: '1000000000000000000',
        }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockApiUrl}/relay`,
        expect.objectContaining({
          body: JSON.stringify({
            to: '0x' + 'a'.repeat(40),
            data: '0x' + 'b'.repeat(128),
            value: '1000000000000000000',
            gasLimit: '500000',
            speed: 'fast',
          }),
        })
      );
    });

    it('누락된 결제 ID로 요청 시 에러를 던져야 함', async () => {
      await expect(
        defenderService.submitGaslessTransaction(
          '',
          ('0x' + 'a'.repeat(40)) as `0x${string}`,
          '0x' + 'b'.repeat(128)
        )
      ).rejects.toThrow('필수 파라미터가 누락되었습니다');
    });

    it('누락된 대상 주소로 요청 시 에러를 던져야 함', async () => {
      await expect(
        defenderService.submitGaslessTransaction(
          'payment-123',
          '' as `0x${string}`,
          '0x' + 'b'.repeat(128)
        )
      ).rejects.toThrow('필수 파라미터가 누락되었습니다');
    });

    it('잘못된 형식의 거래 데이터로 요청 시 에러를 던져야 함', async () => {
      await expect(
        defenderService.submitGaslessTransaction(
          'payment-123',
          ('0x' + 'a'.repeat(40)) as `0x${string}`,
          'invalid-data'
        )
      ).rejects.toThrow('잘못된 트랜잭션 데이터 형식입니다');
    });

    it('insufficient funds 에러를 적절하게 처리해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ message: 'insufficient funds' }),
      });

      await expect(
        defenderService.submitGaslessTransaction(
          'payment-123',
          ('0x' + 'a'.repeat(40)) as `0x${string}`,
          '0x' + 'b'.repeat(128)
        )
      ).rejects.toThrow('릴레이어 잔액이 부족합니다');
    });

    it('인증 에러를 적절하게 처리해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'unauthorized' }),
      });

      await expect(
        defenderService.submitGaslessTransaction(
          'payment-123',
          ('0x' + 'a'.repeat(40)) as `0x${string}`,
          '0x' + 'b'.repeat(128)
        )
      ).rejects.toThrow('Defender API 인증에 실패했습니다');
    });
  });

  describe('getRelayStatus', () => {
    it('유효한 릴레이 요청 ID로 상태를 조회해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          hash: '0x' + 'a'.repeat(64),
          status: 'mined',
        }),
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');

      expect(result.relayRequestId).toBe('tx-mock-123');
      expect(result.status).toBe('mined');
      expect(result.transactionHash).toBe('0x' + 'a'.repeat(64));
    });

    it('빈 릴레이 요청 ID로 조회 시 에러를 던져야 함', async () => {
      await expect(defenderService.getRelayStatus('')).rejects.toThrow(
        '릴레이 요청 ID는 필수입니다'
      );
    });

    it('트랜잭션을 찾을 수 없는 경우를 적절하게 처리해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(defenderService.getRelayStatus('unknown-tx')).rejects.toThrow(
        '릴레이 요청을 찾을 수 없습니다'
      );
    });
  });

  describe('cancelRelayTransaction', () => {
    it('mined 상태의 트랜잭션은 취소할 수 없어야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          status: 'mined',
        }),
      });

      const result = await defenderService.cancelRelayTransaction('tx-mock-123');
      expect(result).toBe(false);
    });

    it('failed 상태의 트랜잭션은 true를 반환해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          status: 'failed',
        }),
      });

      const result = await defenderService.cancelRelayTransaction('tx-mock-123');
      expect(result).toBe(true);
    });

    it('빈 릴레이 요청 ID로 취소 시 에러를 던져야 함', async () => {
      await expect(defenderService.cancelRelayTransaction('')).rejects.toThrow(
        '릴레이 요청 ID는 필수입니다'
      );
    });
  });

  describe('waitForTransaction', () => {
    it('트랜잭션이 완료될 때까지 대기해야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          hash: '0x' + 'a'.repeat(64),
          status: 'mined',
        }),
      });

      const result = await defenderService.waitForTransaction('tx-mock-123', {
        timeoutMs: 5000,
        pollIntervalMs: 100,
      });

      expect(result.status).toBe('mined');
    });

    it('타임아웃 시 에러를 던져야 함', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          status: 'pending',
        }),
      });

      await expect(
        defenderService.waitForTransaction('tx-mock-123', {
          timeoutMs: 300,
          pollIntervalMs: 100,
        })
      ).rejects.toThrow('트랜잭션 완료 대기 시간이 초과되었습니다');
    });
  });

  describe('validateTransactionData', () => {
    it('유효한 거래 데이터는 true를 반환해야 함', () => {
      expect(defenderService.validateTransactionData('0x' + 'a'.repeat(128))).toBe(true);
    });

    it('0x로 시작하지 않는 데이터는 false를 반환해야 함', () => {
      expect(defenderService.validateTransactionData('invalid-data')).toBe(false);
    });

    it('홀수 길이의 데이터는 false를 반환해야 함', () => {
      expect(defenderService.validateTransactionData('0xabc')).toBe(false);
    });

    it('0x만 있는 데이터는 false를 반환해야 함', () => {
      expect(defenderService.validateTransactionData('0x')).toBe(false);
    });

    it('빈 거래 데이터는 false를 반환해야 함', () => {
      expect(defenderService.validateTransactionData('')).toBe(false);
    });
  });

  describe('estimateGasFee', () => {
    it('가스 리미트로 가스 비용을 추정해야 함', async () => {
      const gasFee = await defenderService.estimateGasFee('200000');

      expect(gasFee).toBeDefined();
      expect(Number(gasFee)).toBeGreaterThan(0);
    });
  });

  describe('getRelayerAddress', () => {
    it('저장된 릴레이어 주소를 반환해야 함', () => {
      const address = defenderService.getRelayerAddress();
      expect(address).toBe(mockRelayerAddress);
    });
  });

  describe('checkRelayerHealth', () => {
    it('릴레이어가 정상이면 healthy를 반환해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          address: mockRelayerAddress,
          balance: '1000000000000000000',
        }),
      });

      const result = await defenderService.checkRelayerHealth();

      expect(result.healthy).toBe(true);
      expect(result.message).toContain('릴레이어 연결 성공');
    });

    it('릴레이어 헬스 체크 실패를 적절하게 처리해야 함', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'));

      const result = await defenderService.checkRelayerHealth();
      expect(result.healthy).toBe(false);
      expect(result.message).toBe('릴레이어 연결에 실패했습니다');
    });
  });

  describe('status mapping', () => {
    it('sent 상태를 pending으로 매핑해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          status: 'sent',
        }),
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('pending');
    });

    it('submitted 상태를 pending으로 매핑해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          status: 'submitted',
        }),
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('pending');
    });

    it('confirmed 상태를 올바르게 매핑해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          status: 'confirmed',
        }),
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('confirmed');
    });

    it('failed 상태를 올바르게 매핑해야 함', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          transactionId: 'tx-mock-123',
          status: 'failed',
        }),
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('failed');
    });
  });
});
