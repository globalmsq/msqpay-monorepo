import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { DefenderService } from '../../src/services/defender.service';

// Create mock functions that we can control
const mockSendTransaction = vi.fn();
const mockGetTransaction = vi.fn();
const mockGetRelayer = vi.fn();

// Mock the Defender SDK
vi.mock('@openzeppelin/defender-sdk', () => {
  return {
    Defender: vi.fn().mockImplementation(() => ({
      relaySigner: {
        sendTransaction: mockSendTransaction,
        getTransaction: mockGetTransaction,
        getRelayer: mockGetRelayer,
      },
    })),
  };
});

describe('DefenderService', () => {
  let defenderService: DefenderService;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Set up default mock responses
    mockSendTransaction.mockResolvedValue({
      transactionId: 'tx-mock-123',
      hash: '0x' + 'a'.repeat(64),
      status: 'pending',
    });

    mockGetTransaction.mockResolvedValue({
      transactionId: 'tx-mock-123',
      hash: '0x' + 'a'.repeat(64),
      status: 'mined',
    });

    mockGetRelayer.mockResolvedValue({
      relayerId: 'relay-1',
      name: 'Test Relayer',
      address: '0x' + 'f'.repeat(40),
      network: 'polygon-amoy',
      paused: false,
      createdAt: new Date().toISOString(),
      pendingTxCost: '0',
      minBalance: '1000000000000000000',
      policies: {},
    });

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

      expect(result.relayRequestId).toBe('tx-mock-123');
      expect(result.transactionHash).toBe('0x' + 'a'.repeat(64));
      expect(result.status).toBe('pending');
    });

    it('options를 전달할 수 있어야 함', async () => {
      const result = await defenderService.submitGaslessTransaction(
        'payment-123',
        '0x' + 'a'.repeat(40),
        '0x' + 'b'.repeat(128),
        {
          gasLimit: '500000',
          speed: 'fast',
          value: '1000000000000000000',
        }
      );

      expect(result.relayRequestId).toBeDefined();
      expect(mockSendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          gasLimit: '500000',
          speed: 'fast',
          value: '1000000000000000000',
        })
      );
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

    it('잘못된 형식의 거래 데이터로 요청 시 에러를 던져야 함', async () => {
      await expect(
        defenderService.submitGaslessTransaction('payment-123', '0x' + 'a'.repeat(40), 'invalid-data')
      ).rejects.toThrow('잘못된 트랜잭션 데이터 형식입니다');
    });

    it('insufficient funds 에러를 적절하게 처리해야 함', async () => {
      mockSendTransaction.mockRejectedValueOnce(new Error('insufficient funds'));

      await expect(
        defenderService.submitGaslessTransaction('payment-123', '0x' + 'a'.repeat(40), '0x' + 'b'.repeat(128))
      ).rejects.toThrow('릴레이어 잔액이 부족합니다');
    });

    it('nonce 에러를 적절하게 처리해야 함', async () => {
      mockSendTransaction.mockRejectedValueOnce(new Error('nonce too low'));

      await expect(
        defenderService.submitGaslessTransaction('payment-123', '0x' + 'a'.repeat(40), '0x' + 'b'.repeat(128))
      ).rejects.toThrow('트랜잭션 nonce 충돌이 발생했습니다');
    });

    it('인증 에러를 적절하게 처리해야 함', async () => {
      mockSendTransaction.mockRejectedValueOnce(new Error('unauthorized'));

      await expect(
        defenderService.submitGaslessTransaction('payment-123', '0x' + 'a'.repeat(40), '0x' + 'b'.repeat(128))
      ).rejects.toThrow('Defender API 인증에 실패했습니다');
    });

    it('일반 에러를 적절하게 처리해야 함', async () => {
      mockSendTransaction.mockRejectedValueOnce(new Error('unknown error'));

      await expect(
        defenderService.submitGaslessTransaction('payment-123', '0x' + 'a'.repeat(40), '0x' + 'b'.repeat(128))
      ).rejects.toThrow('Gasless 거래를 제출할 수 없습니다');
    });
  });

  describe('getRelayStatus', () => {
    it('유효한 릴레이 요청 ID로 상태를 조회해야 함', async () => {
      const result = await defenderService.getRelayStatus('tx-mock-123');

      expect(result.relayRequestId).toBe('tx-mock-123');
      expect(result.status).toBe('mined');
      expect(result.transactionHash).toBe('0x' + 'a'.repeat(64));
    });

    it('빈 릴레이 요청 ID로 조회 시 에러를 던져야 함', async () => {
      await expect(defenderService.getRelayStatus('')).rejects.toThrow('릴레이 요청 ID는 필수입니다');
    });

    it('트랜잭션을 찾을 수 없는 경우를 적절하게 처리해야 함', async () => {
      mockGetTransaction.mockRejectedValueOnce(new Error('not found'));

      await expect(defenderService.getRelayStatus('unknown-tx')).rejects.toThrow(
        '릴레이 요청을 찾을 수 없습니다'
      );
    });

    it('일반 에러를 적절하게 처리해야 함', async () => {
      mockGetTransaction.mockRejectedValueOnce(new Error('network error'));

      await expect(defenderService.getRelayStatus('tx-123')).rejects.toThrow(
        '릴레이 상태를 조회할 수 없습니다'
      );
    });
  });

  describe('cancelRelayTransaction', () => {
    it('mined 상태의 트랜잭션은 취소할 수 없어야 함', async () => {
      // Mock returns 'mined' status
      const result = await defenderService.cancelRelayTransaction('tx-mock-123');
      expect(result).toBe(false);
    });

    it('confirmed 상태의 트랜잭션은 취소할 수 없어야 함', async () => {
      mockGetTransaction.mockResolvedValueOnce({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'confirmed',
      });

      const result = await defenderService.cancelRelayTransaction('tx-mock-123');
      expect(result).toBe(false);
    });

    it('failed 상태의 트랜잭션은 true를 반환해야 함', async () => {
      mockGetTransaction.mockResolvedValueOnce({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'failed',
      });

      const result = await defenderService.cancelRelayTransaction('tx-mock-123');
      expect(result).toBe(true);
    });

    it('pending 상태의 트랜잭션은 취소 불가 (SDK 미지원)', async () => {
      mockGetTransaction.mockResolvedValueOnce({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'pending',
      });

      const result = await defenderService.cancelRelayTransaction('tx-mock-123');
      expect(result).toBe(false);
    });

    it('빈 릴레이 요청 ID로 취소 시 에러를 던져야 함', async () => {
      await expect(defenderService.cancelRelayTransaction('')).rejects.toThrow(
        '릴레이 요청 ID는 필수입니다'
      );
    });
  });

  describe('waitForTransaction', () => {
    it('트랜잭션이 완료될 때까지 대기해야 함', async () => {
      const result = await defenderService.waitForTransaction('tx-mock-123', {
        timeoutMs: 5000,
        pollIntervalMs: 100,
      });

      expect(result.status).toBe('mined');
    });

    it('confirmed 상태에서도 완료되어야 함', async () => {
      mockGetTransaction.mockResolvedValue({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'confirmed',
      });

      const result = await defenderService.waitForTransaction('tx-mock-123', {
        timeoutMs: 5000,
        pollIntervalMs: 100,
      });

      expect(result.status).toBe('confirmed');
    });

    it('failed 상태에서도 완료되어야 함', async () => {
      mockGetTransaction.mockResolvedValue({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'failed',
      });

      const result = await defenderService.waitForTransaction('tx-mock-123', {
        timeoutMs: 5000,
        pollIntervalMs: 100,
      });

      expect(result.status).toBe('failed');
    });

    it('타임아웃 시 에러를 던져야 함', async () => {
      mockGetTransaction.mockResolvedValue({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'pending', // Never reaches final state
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

    it('비-16진수 문자가 포함된 데이터는 false를 반환해야 함', () => {
      const invalid = defenderService.validateTransactionData('0xghij');

      expect(invalid).toBe(false);
    });

    it('대소문자 혼합된 유효한 데이터는 true를 반환해야 함', () => {
      const valid = defenderService.validateTransactionData('0xAbCdEf1234567890');

      expect(valid).toBe(true);
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

  describe('checkRelayerHealth', () => {
    it('릴레이어가 정상이면 healthy를 반환해야 함', async () => {
      const result = await defenderService.checkRelayerHealth();

      expect(result.healthy).toBe(true);
      expect(result.message).toContain('릴레이어 연결 성공');
    });

    it('릴레이어 헬스 체크 실패를 적절하게 처리해야 함', async () => {
      mockGetRelayer.mockRejectedValueOnce(new Error('network error'));

      const result = await defenderService.checkRelayerHealth();
      expect(result.healthy).toBe(false);
      expect(result.message).toBe('릴레이어 연결에 실패했습니다');
    });

    it('RelayerGroup 응답을 올바르게 처리해야 함', async () => {
      mockGetRelayer.mockResolvedValueOnce({
        relayerGroupId: 'group-1',
        name: 'Test Group',
        relayers: [
          { relayerId: 'relay-1', address: '0x' + '1'.repeat(40) },
          { relayerId: 'relay-2', address: '0x' + '2'.repeat(40) },
        ],
      });

      const result = await defenderService.checkRelayerHealth();
      expect(result.healthy).toBe(true);
      expect(result.message).toContain('0x' + '1'.repeat(40));
    });

    it('빈 relayers 배열 처리', async () => {
      mockGetRelayer.mockResolvedValueOnce({
        relayerGroupId: 'group-1',
        name: 'Test Group',
        relayers: [],
      });

      const result = await defenderService.checkRelayerHealth();
      expect(result.healthy).toBe(true);
      expect(result.message).toContain('unknown');
    });
  });

  describe('status mapping', () => {
    it('pending 상태를 올바르게 매핑해야 함', async () => {
      const result = await defenderService.submitGaslessTransaction(
        'payment-123',
        '0x' + 'a'.repeat(40),
        '0x' + 'b'.repeat(128)
      );

      expect(result.status).toBe('pending');
    });

    it('mined 상태를 올바르게 매핑해야 함', async () => {
      const result = await defenderService.getRelayStatus('tx-mock-123');

      expect(result.status).toBe('mined');
    });

    it('sent 상태를 pending으로 매핑해야 함', async () => {
      mockGetTransaction.mockResolvedValueOnce({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'sent',
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('pending');
    });

    it('submitted 상태를 pending으로 매핑해야 함', async () => {
      mockGetTransaction.mockResolvedValueOnce({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'submitted',
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('pending');
    });

    it('inmempool 상태를 pending으로 매핑해야 함', async () => {
      mockGetTransaction.mockResolvedValueOnce({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'inmempool',
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('pending');
    });

    it('confirmed 상태를 올바르게 매핑해야 함', async () => {
      mockGetTransaction.mockResolvedValueOnce({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'confirmed',
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('confirmed');
    });

    it('failed 상태를 올바르게 매핑해야 함', async () => {
      mockGetTransaction.mockResolvedValueOnce({
        transactionId: 'tx-mock-123',
        hash: '0x' + 'a'.repeat(64),
        status: 'failed',
      });

      const result = await defenderService.getRelayStatus('tx-mock-123');
      expect(result.status).toBe('failed');
    });
  });
});
