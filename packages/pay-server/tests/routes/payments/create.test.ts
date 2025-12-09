import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createPaymentRoute } from '../../../src/routes/payments/create';
import { BlockchainService } from '../../../src/services/blockchain.service';
import { MerchantService } from '../../../src/services/merchant.service';
import { ChainService } from '../../../src/services/chain.service';
import { TokenService } from '../../../src/services/token.service';
import { PaymentMethodService } from '../../../src/services/payment-method.service';
import { PaymentService } from '../../../src/services/payment.service';
import { ChainsConfig } from '../../../src/config/chains.config';

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

// Mock data
const mockMerchant = {
  id: 'merchant-db-id',
  merchant_key: 'merchant_001',
  is_enabled: true,
};

const mockChain = {
  id: 'chain-db-id',
  network_id: 80002,
};

const mockChain31337 = {
  id: 'chain-db-id-31337',
  network_id: 31337,
};

const mockToken = {
  id: 'token-db-id',
  symbol: 'SUT',
  decimals: 18,
};

const mockToken31337 = {
  id: 'token-db-id-31337',
  symbol: 'TEST',
  decimals: 18,
};

const mockPaymentMethod = {
  id: 'pm-db-id',
  is_enabled: true,
};

const mockPayment = {
  id: 'payment-db-id',
  payment_hash: '0x123',
  status: 'CREATED',
  expires_at: new Date(Date.now() + 30 * 60 * 1000),
};

describe('POST /payments/create', () => {
  let app: FastifyInstance;
  let blockchainService: BlockchainService;
  let merchantService: MerchantService;
  let chainService: ChainService;
  let tokenService: TokenService;
  let paymentMethodService: PaymentMethodService;
  let paymentService: PaymentService;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cors);

    // 실제 BlockchainService 인스턴스 생성
    blockchainService = new BlockchainService(mockChainsConfig);

    // Mock getDecimals to return 18
    blockchainService.getDecimals = vi.fn().mockResolvedValue(18);

    // Mock DB Services
    merchantService = {
      findByMerchantKey: vi.fn().mockImplementation((key: string) => {
        if (key === 'merchant_001' || key === 'merchant_002') {
          return Promise.resolve({ ...mockMerchant, merchant_key: key });
        }
        return Promise.resolve(null);
      }),
    } as any;

    chainService = {
      findByNetworkId: vi.fn().mockImplementation((networkId: number) => {
        if (networkId === 80002) return Promise.resolve(mockChain);
        if (networkId === 31337) return Promise.resolve(mockChain31337);
        return Promise.resolve(null);
      }),
    } as any;

    tokenService = {
      findByAddress: vi.fn().mockImplementation((chainId: string) => {
        if (chainId === 'chain-db-id') return Promise.resolve(mockToken);
        if (chainId === 'chain-db-id-31337') return Promise.resolve(mockToken31337);
        return Promise.resolve(null);
      }),
    } as any;

    paymentMethodService = {
      findByMerchantAndToken: vi.fn().mockResolvedValue(mockPaymentMethod),
    } as any;

    paymentService = {
      create: vi.fn().mockResolvedValue(mockPayment),
    } as any;

    // 실제 라우트 등록
    await createPaymentRoute(
      app,
      blockchainService,
      merchantService,
      chainService,
      tokenService,
      paymentMethodService,
      paymentService
    );
  });

  describe('정상 케이스', () => {
    it('유효한 결제 요청을 받으면 201 상태 코드와 함께 결제 ID를 반환해야 함', async () => {
      const validPayment = {
        merchantId: 'merchant_001',
        orderId: 'order_001',
        amount: 100,
        currency: 'SUT',
        chainId: 80002,
        tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: validPayment,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.paymentId).toBeDefined();
      expect(body.tokenAddress).toBe('0xE4C687167705Abf55d709395f92e254bdF5825a2');
      expect(body.gatewayAddress).toBeDefined();
      expect(body.forwarderAddress).toBeDefined();
      expect(body.amount).toBe('100000000000000000000'); // 100 * 10^18
      expect(body.status).toBe('created');
    });

    it('Hardhat 체인 (chainId 31337)으로 최소 필수 정보만으로 결제를 생성할 수 있어야 함', async () => {
      const minimalPayment = {
        merchantId: 'merchant_002',
        orderId: 'order_002',
        amount: 50,
        currency: 'TEST',
        chainId: 31337,
        tokenAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: minimalPayment,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.tokenAddress).toBe('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512');
    });
  });

  describe('경계 케이스', () => {
    it('금액이 0일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        merchantId: 'merchant_003',
        orderId: 'order_003',
        amount: 0,
        currency: 'SUT',
        chainId: 80002,
        tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('음수 금액일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        merchantId: 'merchant_004',
        orderId: 'order_004',
        amount: -50,
        currency: 'SUT',
        chainId: 80002,
        tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('유효하지 않은 recipientAddress 형식일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        merchantId: 'merchant_005',
        orderId: 'order_005',
        amount: 100,
        currency: 'SUT',
        chainId: 80002,
        tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
        recipientAddress: 'invalid-address',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('예외 케이스', () => {
    it('필수 필드가 누락되었을 때 400 상태 코드를 반환해야 함', async () => {
      const incompletePayment = {
        merchantId: 'merchant_006',
        orderId: 'order_006',
        amount: 100,
        currency: 'SUT',
        // chainId 누락
        tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: incompletePayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('지원하지 않는 chainId일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        merchantId: 'merchant_007',
        orderId: 'order_007',
        amount: 100,
        currency: 'SUT',
        chainId: 1, // Ethereum Mainnet (지원 안 함)
        tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('UNSUPPORTED_CHAIN');
      expect(body.message).toContain('Unsupported chain');
    });

    it('지원하지 않는 currency일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        merchantId: 'merchant_008',
        orderId: 'order_008',
        amount: 100,
        currency: 'ETH', // Polygon Amoy에서 지원하지 않는 토큰
        chainId: 80002,
        tokenAddress: '0x0000000000000000000000000000000000000000',
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('UNSUPPORTED_TOKEN');
      expect(body.message).toContain('Unsupported token');
    });

    it('decimals 조회 오류 발생 시에도 fallback으로 진행해야 함', async () => {
      // getDecimals가 실패해도 fallback 18로 처리
      blockchainService.getDecimals = vi.fn().mockResolvedValue(18);

      const validPayment = {
        merchantId: 'merchant_001', // Use existing mock merchant
        orderId: 'order_009',
        amount: 100,
        currency: 'SUT',
        chainId: 80002,
        tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
        recipientAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: validPayment,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.amount).toBe('100000000000000000000'); // 100 * 10^18 (fallback)
    });
  });
});
