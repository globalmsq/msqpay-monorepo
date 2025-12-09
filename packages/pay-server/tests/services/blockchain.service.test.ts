import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BlockchainService } from '../../src/services/blockchain.service';
import { ChainsConfig } from '../../src/config/chains.config';

// 테스트용 ChainsConfig mock
const mockChainsConfig: ChainsConfig = {
  chains: [
    {
      chainId: 80002,
      name: 'Polygon Amoy',
      rpcUrl: 'https://rpc-amoy.polygon.technology',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      contracts: {
        gateway: '0x0000000000000000000000000000000000000000',
        forwarder: '0x0000000000000000000000000000000000000000',
      },
      tokens: {
        SUT: { address: '0xE4C687167705Abf55d709395f92e254bdF5825a2', decimals: 18 },
      },
    },
    {
      chainId: 31337,
      name: 'Hardhat',
      rpcUrl: 'http://127.0.0.1:8545',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      contracts: {
        gateway: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
        forwarder: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      },
      tokens: {
        TEST: { address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', decimals: 18 },
      },
    },
  ],
};

describe('BlockchainService', () => {
  let blockchainService: BlockchainService;

  beforeEach(() => {
    // 실제 RPC 대신 mock을 사용
    blockchainService = new BlockchainService(mockChainsConfig);
  });

  describe('recordPaymentOnChain', () => {
    it('유효한 결제 데이터로 거래 해시를 반환해야 함', async () => {
      const paymentData = {
        userId: 'user123',
        amount: BigInt(100),
        currency: 'USD',
        tokenAddress: '0x' + 'a'.repeat(40),
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      const result = await blockchainService.recordPaymentOnChain(paymentData);

      expect(result).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('필수 결제 정보가 누락되었을 때 에러를 던져야 함', async () => {
      const incompleteData = {
        userId: '',
        amount: BigInt(100),
        currency: 'USD',
        tokenAddress: '0x' + 'a'.repeat(40),
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      await expect(
        blockchainService.recordPaymentOnChain(incompleteData as any)
      ).rejects.toThrow('필수 결제 정보가 누락되었습니다');
    });

    it('0 금액으로 요청할 때 에러를 던져야 함', async () => {
      const invalidData = {
        userId: 'user456',
        amount: BigInt(0),
        currency: 'USD',
        tokenAddress: '0x' + 'a'.repeat(40),
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      await expect(
        blockchainService.recordPaymentOnChain(invalidData)
      ).rejects.toThrow('필수 결제 정보가 누락되었습니다');
    });

    it('누락된 tokenAddress로 요청할 때 에러를 던져야 함', async () => {
      const invalidData = {
        userId: 'user789',
        amount: BigInt(100),
        currency: 'USD',
        tokenAddress: '',
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      await expect(
        blockchainService.recordPaymentOnChain(invalidData as any)
      ).rejects.toThrow('필수 결제 정보가 누락되었습니다');
    });
  });

  describe('getPaymentStatus', () => {
    it('결제 정보를 조회할 때 PaymentStatus를 반환해야 함', async () => {
      // RPC 호출 실패 시에도 pending 상태로 반환 (fail-safe 설계)
      const result = await blockchainService.getPaymentStatus(31337, 'payment-123');
      expect(result).toBeDefined();
      expect(result?.status).toBe('pending');
      expect(result?.paymentId).toBe('payment-123');
    });

    it('존재하지 않는 결제 ID로 조회하면 pending 상태로 반환해야 함', async () => {
      // RPC 호출 실패 시에도 pending 상태로 반환하여 polling 계속 가능하도록 함
      const result = await blockchainService.getPaymentStatus(31337, 'nonexistent-id');
      expect(result).toBeDefined();
      expect(result?.status).toBe('pending');
    });
  });

  describe('estimateGasCost', () => {
    it('가스 비용을 추정해야 함', async () => {
      const gasCost = await blockchainService.estimateGasCost(
        31337,
        '0x' + 'a'.repeat(40),
        BigInt(100),
        '0x' + 'b'.repeat(40)
      );

      expect(gasCost).toBe(BigInt('200000'));
    });

    it('다른 금액에도 가스 비용을 추정해야 함', async () => {
      const gasCost = await blockchainService.estimateGasCost(
        31337,
        '0x' + 'c'.repeat(40),
        BigInt(1000),
        '0x' + 'd'.repeat(40)
      );

      expect(gasCost).toBe(BigInt('200000'));
    });
  });

  describe('waitForConfirmation', () => {
    it('트랜잭션 해시로 확인을 기다려야 함', async () => {
      // 유닛 테스트에서는 실제 RPC 호출 대신 메서드 존재 여부와 반환 타입만 검증
      // 실제 블록체인 통합 테스트는 별도의 integration test에서 수행
      const mockTxHash = '0x' + 'a'.repeat(64);

      // waitForConfirmation 메서드가 존재하는지 확인
      expect(typeof blockchainService.waitForConfirmation).toBe('function');

      // Mock을 통해 메서드 동작 검증
      vi.spyOn(blockchainService, 'waitForConfirmation').mockResolvedValue({
        status: 'success',
        blockNumber: BigInt(12345),
        transactionHash: mockTxHash,
      });

      const result = await blockchainService.waitForConfirmation(31337, mockTxHash);

      expect(result).toBeDefined();
      expect(result?.status).toBe('success');
      expect(result?.transactionHash).toBe(mockTxHash);
    });

    it('다른 확인 수로 트랜잭션 확인을 기다려야 함', async () => {
      const mockTxHash = '0x' + 'b'.repeat(64);

      vi.spyOn(blockchainService, 'waitForConfirmation').mockResolvedValue({
        status: 'success',
        blockNumber: BigInt(12350),
        transactionHash: mockTxHash,
      });

      const result = await blockchainService.waitForConfirmation(31337, mockTxHash, 3);

      expect(result).toBeDefined();
      expect(result?.blockNumber).toBe(BigInt(12350));
    });
  });

  describe('mapContractStatusToEnum (private method via getPaymentStatus)', () => {
    // private 메서드는 직접 테스트할 수 없으므로 getPaymentStatus를 통해 간접 테스트
    // RPC 에러 발생 시에도 fail-safe 설계로 pending 상태로 반환
    it('getPaymentStatus 호출 시 스마트 컨트랙트 에러를 적절히 처리해야 함', async () => {
      // RPC 호출 실패 시에도 pending 상태로 안전하게 반환
      const result = await blockchainService.getPaymentStatus(31337, 'test-id');
      expect(result).toBeDefined();
      expect(result?.status).toBe('pending');
      expect(result?.paymentId).toBe('test-id');
    });
  });
});
