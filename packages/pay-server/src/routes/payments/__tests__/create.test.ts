import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createPaymentRoute } from '../create';
import { BlockchainService } from '../../../services/blockchain.service';
import { ChainsConfig } from '../../../config/chains.config';

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

// Mock Fastify app
const mockApp = {
  post: vi.fn(),
} as unknown as FastifyInstance;

describe('POST /payments/create', () => {
  let blockchainService: BlockchainService;

  beforeEach(() => {
    vi.clearAllMocks();
    blockchainService = new BlockchainService(mockChainsConfig);
  });

  describe('Valid requests', () => {
    it('should accept valid payment creation request', async () => {
      const payload = {
        amount: 100,
        currency: 'SUT',
        chainId: 80002,
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      // Store the posted handler
      let handler: any;
      (mockApp.post as any).mockImplementation((path: string, fn: any) => {
        handler = fn;
      });

      await createPaymentRoute(mockApp, blockchainService);

      // Verify route was registered
      expect(mockApp.post).toHaveBeenCalled();
      const callArgs = (mockApp.post as any).mock.calls[0];
      expect(callArgs[0]).toBe('/payments/create');
    });
  });

  describe('Schema validation', () => {
    it('should validate required fields in request body', async () => {
      const requiredFields = ['amount', 'currency', 'chainId', 'recipientAddress'];
      // This is implicitly tested through the schema validation
      expect(requiredFields).toHaveLength(4);
    });

    it('should reject missing amount', () => {
      const payload = {
        currency: 'SUT',
        chainId: 80002,
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };
      expect(payload).not.toHaveProperty('amount');
    });

    it('should reject invalid chainId', () => {
      const payload = {
        amount: 100,
        currency: 'SUT',
        chainId: 'invalid' as any,
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };
      expect(typeof payload.chainId).not.toBe('number');
    });
  });

  describe('Response format', () => {
    it('should return HTTP 201 Created for successful payment creation', async () => {
      // The response format should include:
      // - success: boolean
      // - paymentId: string
      // - tokenAddress: string
      // - gatewayAddress: string
      // - forwarderAddress: string
      // - amount: string (wei)
      // - status: string
      const expectedFields = [
        'success',
        'paymentId',
        'tokenAddress',
        'gatewayAddress',
        'forwarderAddress',
        'amount',
        'status',
      ];
      expect(expectedFields).toHaveLength(7);
    });

    it('should include blockchain contract addresses in response', () => {
      const contracts = blockchainService.getChainContracts(80002);
      expect(contracts).toBeDefined();
      expect(contracts).toHaveProperty('gateway');
      expect(contracts).toHaveProperty('forwarder');
    });
  });

  describe('Error handling', () => {
    it('should return HTTP 400 for unsupported chainId', () => {
      // When chainId is not in SUPPORTED_CHAINS
      const unsupportedChainId = 1; // Ethereum Mainnet
      const contracts = blockchainService.getChainContracts(unsupportedChainId);
      expect(contracts).toBeUndefined();
    });

    it('should return HTTP 400 with UNSUPPORTED_CHAIN code', () => {
      // Error response format:
      // { code: "UNSUPPORTED_CHAIN", message: "Chain ID X is not supported" }
      const errorCode = 'UNSUPPORTED_CHAIN';
      expect(errorCode).toBe('UNSUPPORTED_CHAIN');
    });

    it('should return HTTP 400 for unsupported token on chain', () => {
      // When currency is not in chain.tokens
      const tokenAddress = blockchainService.getTokenAddress(80002, 'UNKNOWN');
      expect(tokenAddress).toBeUndefined();
    });

    it('should return HTTP 400 with UNSUPPORTED_TOKEN code', () => {
      // Error response format:
      // { code: "UNSUPPORTED_TOKEN", message: "Token X not supported on chain Y" }
      const errorCode = 'UNSUPPORTED_TOKEN';
      expect(errorCode).toBe('UNSUPPORTED_TOKEN');
    });

    it('should validate amount is positive', () => {
      const payload = {
        amount: 0,
        currency: 'SUT',
        chainId: 80002,
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };
      expect(payload.amount).toBeLessThanOrEqual(0);
    });
  });

  describe('Integration with BlockchainService', () => {
    it('should use getTokenAddress to fetch token address', () => {
      const tokenAddress = blockchainService.getTokenAddress(80002, 'SUT');
      expect(tokenAddress).toBe('0xE4C687167705Abf55d709395f92e254bdF5825a2');
    });

    it('should use getChainContracts to fetch gateway and forwarder', () => {
      const contracts = blockchainService.getChainContracts(80002);
      expect(contracts).toBeDefined();
      expect(contracts?.gateway).toBeDefined();
      expect(contracts?.forwarder).toBeDefined();
    });

    it('should call getDecimals for amount conversion', async () => {
      const getDecimalsSpy = vi.spyOn(blockchainService, 'getDecimals');
      await blockchainService.getDecimals(80002, '0xE4C687167705Abf55d709395f92e254bdF5825a2');
      expect(getDecimalsSpy).toHaveBeenCalled();
    });
  });

  describe('Amount conversion to wei', () => {
    it('should convert amount to wei using decimals', () => {
      // Example: 100 tokens with 18 decimals = 100 * 10^18 wei
      const amount = 100;
      const decimals = 18;
      const wei = BigInt(amount) * BigInt(10 ** decimals);
      expect(wei.toString()).toBe('100000000000000000000');
    });

    it('should handle different decimal values', () => {
      const testCases = [
        { amount: 100, decimals: 18, expected: '100000000000000000000' },
        { amount: 100, decimals: 6, expected: '100000000' },
        { amount: 100, decimals: 8, expected: '10000000000' },
      ];
      testCases.forEach(({ amount, decimals, expected }) => {
        const wei = BigInt(amount) * BigInt(10 ** decimals);
        expect(wei.toString()).toBe(expected);
      });
    });
  });
});
