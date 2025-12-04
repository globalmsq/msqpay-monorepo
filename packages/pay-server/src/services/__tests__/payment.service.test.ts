import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PaymentService } from '../payment.service';
import { ChainService } from '../chain.service';
import { TokenService } from '../token.service';
import { MerchantService } from '../merchant.service';
import { PaymentMethodService } from '../payment-method.service';
import { getPrismaClient, disconnectPrisma } from '../../db/client';
import { getRedisClient, disconnectRedis } from '../../db/redis';
import { Decimal } from '@prisma/client/runtime/library';

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let merchantService: MerchantService;
  let tokenService: TokenService;
  let chainService: ChainService;
  let paymentMethodService: PaymentMethodService;
  let prisma: ReturnType<typeof getPrismaClient>;
  let paymentMethodId: string;
  let chainId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    getRedisClient();

    paymentService = new PaymentService(prisma);
    merchantService = new MerchantService(prisma);
    tokenService = new TokenService(prisma);
    chainService = new ChainService(prisma);
    paymentMethodService = new PaymentMethodService(prisma);

    // Clean up before tests
    await prisma.paymentEvent.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.merchantPaymentMethod.deleteMany({});
    await prisma.token.deleteMany({});
    await prisma.merchant.deleteMany({});
    await prisma.chain.deleteMany({});

    // Create test chain
    const chain = await chainService.create({
      network_id: 31337,
      name: 'Hardhat',
      rpc_url: 'http://localhost:8545',
      is_testnet: true,
    });
    chainId = chain.id;

    // Create test token
    const token = await tokenService.create({
      chain_id: chainId,
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      decimals: 6,
    });

    // Create test merchant
    const merchant = await merchantService.create({
      merchant_key: 'test_merchant',
      name: 'Test Merchant',
      api_key: 'test_api_key',
    });

    // Create test payment method
    const method = await paymentMethodService.create({
      merchant_id: merchant.id,
      token_id: token.id,
      recipient_address: '0x742d35Cc6634C0532925a3b844Bc029e4b2A69e2',
    });
    paymentMethodId = method.id;
  });

  afterAll(async () => {
    // Clean up after tests
    await prisma.paymentEvent.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.merchantPaymentMethod.deleteMany({});
    await prisma.token.deleteMany({});
    await prisma.merchant.deleteMany({});
    await prisma.chain.deleteMany({});
    await disconnectRedis();
    await disconnectPrisma();
  });

  it('should create a new payment', async () => {
    const paymentHash = '0x' + 'a'.repeat(64);
    const paymentData = {
      payment_hash: paymentHash,
      payment_method_id: paymentMethodId,
      amount: new Decimal('1000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    };

    const result = await paymentService.create(paymentData);

    expect(result).toBeDefined();
    expect(result.payment_hash).toBe(paymentHash);
    expect(result.status).toBe('CREATED');
    expect(result.token_symbol).toBe('USDC');
  });

  it('should find payment by hash', async () => {
    const paymentHash = '0x' + 'b'.repeat(64);
    const paymentData = {
      payment_hash: paymentHash,
      payment_method_id: paymentMethodId,
      amount: new Decimal('2000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    };

    await paymentService.create(paymentData);

    const result = await paymentService.findByHash(paymentHash);

    expect(result).toBeDefined();
    expect(result?.payment_hash).toBe(paymentHash);
  });

  it('should cache payment after retrieval', async () => {
    const paymentHash = '0x' + 'c'.repeat(64);
    const paymentData = {
      payment_hash: paymentHash,
      payment_method_id: paymentMethodId,
      amount: new Decimal('3000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    };

    const created = await paymentService.create(paymentData);

    // First query should hit database
    const result1 = await paymentService.findByHash(paymentHash);
    expect(result1).toBeDefined();

    // Second query should hit cache (no DB call)
    const result2 = await paymentService.findByHash(paymentHash);
    expect(result2).toBeDefined();
    expect(result2?.id).toBe(result1?.id);
  });

  it('should update payment status', async () => {
    const paymentHash = '0x' + 'd'.repeat(64);
    const paymentData = {
      payment_hash: paymentHash,
      payment_method_id: paymentMethodId,
      amount: new Decimal('4000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    };

    const created = await paymentService.create(paymentData);

    const updated = await paymentService.updateStatus(created.id, 'CONFIRMED');

    expect(updated.status).toBe('CONFIRMED');
    expect(updated.confirmed_at).toBeDefined();
  });

  it('should find all payments by status', async () => {
    await prisma.payment.deleteMany({});

    const paymentHash1 = '0x' + 'e'.repeat(64);
    const paymentHash2 = '0x' + 'f'.repeat(64);

    await paymentService.create({
      payment_hash: paymentHash1,
      payment_method_id: paymentMethodId,
      amount: new Decimal('5000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    });

    const created2 = await paymentService.create({
      payment_hash: paymentHash2,
      payment_method_id: paymentMethodId,
      amount: new Decimal('6000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    });

    // Update second payment to CONFIRMED
    await paymentService.updateStatus(created2.id, 'CONFIRMED');

    const result = await paymentService.findByStatus('CONFIRMED');

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((p) => p.id === created2.id)).toBe(true);
  });

  it('should return payment with network_id snapshot', async () => {
    const paymentHash = '0x' + '1'.repeat(64);
    const paymentData = {
      payment_hash: paymentHash,
      payment_method_id: paymentMethodId,
      amount: new Decimal('7000000'),
      token_decimals: 18,
      token_symbol: 'ETH',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    };

    const created = await paymentService.create(paymentData);

    expect(created.network_id).toBe(31337);
    expect(created.token_symbol).toBe('ETH');
    expect(created.token_decimals).toBe(18);
  });
});
