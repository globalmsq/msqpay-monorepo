import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RelayService, RelayServiceConfig } from '../src/services/relay.service';

// Mock viem
vi.mock('viem', () => {
  const mockSendTransaction = vi.fn().mockResolvedValue('0x' + 'a'.repeat(64));
  const mockWaitForTransactionReceipt = vi.fn().mockResolvedValue({ status: 'success' });
  const mockGetBalance = vi.fn().mockResolvedValue(BigInt('1000000000000000000'));
  const mockReadContract = vi.fn().mockResolvedValue(BigInt(0));

  return {
    createWalletClient: vi.fn(() => ({
      sendTransaction: mockSendTransaction,
    })),
    createPublicClient: vi.fn(() => ({
      waitForTransactionReceipt: mockWaitForTransactionReceipt,
      getBalance: mockGetBalance,
      readContract: mockReadContract,
    })),
    http: vi.fn(),
  };
});

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn(() => ({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  })),
}));

vi.mock('viem/chains', () => ({
  hardhat: { id: 31337, name: 'Hardhat' },
}));

describe('RelayService', () => {
  let relayService: RelayService;
  const config: RelayServiceConfig = {
    relayerPrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    rpcUrl: 'http://localhost:8545',
    chainId: 31337,
    forwarderAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    relayService = new RelayService(config);
  });

  describe('constructor', () => {
    it('유효한 설정으로 인스턴스를 생성해야 함', () => {
      expect(relayService).toBeDefined();
    });

    it('잘못된 private key로 생성 시 에러를 던져야 함', () => {
      expect(() => {
        new RelayService({
          ...config,
          relayerPrivateKey: 'invalid' as `0x${string}`,
        });
      }).toThrow();
    });

    it('빈 RPC URL로 생성 시 에러를 던져야 함', () => {
      expect(() => {
        new RelayService({
          ...config,
          rpcUrl: '',
        });
      }).toThrow('rpcUrl is required');
    });

    it('잘못된 chainId로 생성 시 에러를 던져야 함', () => {
      expect(() => {
        new RelayService({
          ...config,
          chainId: 0,
        });
      }).toThrow('chainId must be positive');
    });
  });

  describe('submitTransaction', () => {
    it('트랜잭션을 제출하고 레코드를 반환해야 함', async () => {
      const result = await relayService.submitTransaction({
        to: '0x' + 'a'.repeat(40) as `0x${string}`,
        data: '0x' + 'b'.repeat(64) as `0x${string}`,
      });

      expect(result.transactionId).toContain('mock_tx_');
      // 트랜잭션이 성공적으로 제출되면 'sent' 또는 모니터링 후 'mined' 상태
      expect(['sent', 'mined', 'confirmed']).toContain(result.status);
      expect(result.hash).toBeDefined();
    });

    it('value와 gasLimit 옵션을 받아들여야 함', async () => {
      const result = await relayService.submitTransaction({
        to: '0x' + 'a'.repeat(40) as `0x${string}`,
        data: '0x' + 'b'.repeat(64) as `0x${string}`,
        value: '1000000000000000000',
        gasLimit: '500000',
      });

      expect(result.transactionId).toBeDefined();
      expect(result.value).toBe('1000000000000000000');
      expect(result.gasLimit).toBe('500000');
    });
  });

  describe('getTransaction', () => {
    it('존재하는 트랜잭션을 조회해야 함', async () => {
      const submitted = await relayService.submitTransaction({
        to: '0x' + 'a'.repeat(40) as `0x${string}`,
        data: '0x' + 'b'.repeat(64) as `0x${string}`,
      });

      const result = await relayService.getTransaction(submitted.transactionId);
      expect(result.transactionId).toBe(submitted.transactionId);
    });

    it('존재하지 않는 트랜잭션 조회 시 에러를 던져야 함', async () => {
      await expect(relayService.getTransaction('non-existent')).rejects.toThrow(
        'Transaction not found: non-existent'
      );
    });
  });

  describe('getRelayerInfo', () => {
    it('릴레이어 주소와 잔액을 반환해야 함', async () => {
      const info = await relayService.getRelayerInfo();

      expect(info.address).toBeDefined();
      expect(info.balance).toBeDefined();
    });
  });

  describe('getNonce', () => {
    it('주어진 주소의 nonce를 반환해야 함', async () => {
      const nonce = await relayService.getNonce('0x' + 'a'.repeat(40) as `0x${string}`);

      expect(typeof nonce).toBe('bigint');
    });
  });
});
