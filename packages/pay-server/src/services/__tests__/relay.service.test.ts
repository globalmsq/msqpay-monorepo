import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { RelayService } from '../relay.service';
import { PaymentService } from '../payment.service';
import { ChainService } from '../chain.service';
import { TokenService } from '../token.service';
import { MerchantService } from '../merchant.service';
import { PaymentMethodService } from '../payment-method.service';
import { getPrismaClient, disconnectPrisma } from '../../db/client';
import { getRedisClient, disconnectRedis } from '../../db/redis';
import { Decimal } from '@prisma/client/runtime/library';

describe('RelayService', () => {
  let relayService: RelayService;
  let paymentService: PaymentService;
  let merchantService: MerchantService;
  let tokenService: TokenService;
  let chainService: ChainService;
  let paymentMethodService: PaymentMethodService;
  let prisma: ReturnType<typeof getPrismaClient>;
  let paymentId: string;

  beforeAll(async () => {
    prisma = getPrismaClient();
    getRedisClient();

    relayService = new RelayService(prisma);
    paymentService = new PaymentService(prisma);
    merchantService = new MerchantService(prisma);
    tokenService = new TokenService(prisma);
    chainService = new ChainService(prisma);
    paymentMethodService = new PaymentMethodService(prisma);

    // Clean up before tests
    await prisma.relayRequest.deleteMany({});
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

    // Create test token
    const token = await tokenService.create({
      chain_id: chain.id,
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

    // Create test payment
    const payment = await paymentService.create({
      payment_hash: '0x' + 'a'.repeat(64),
      payment_method_id: method.id,
      amount: new Decimal('1000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    });
    paymentId = payment.id;
  });

  afterAll(async () => {
    // Clean up after tests
    await prisma.relayRequest.deleteMany({});
    await prisma.paymentEvent.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.merchantPaymentMethod.deleteMany({});
    await prisma.token.deleteMany({});
    await prisma.merchant.deleteMany({});
    await prisma.chain.deleteMany({});
    await disconnectRedis();
    await disconnectPrisma();
  });

  it('should create a new relay request', async () => {
    const relayData = {
      relay_ref: 'relay_001',
      payment_id: paymentId,
    };

    const result = await relayService.create(relayData);

    expect(result).toBeDefined();
    expect(result.relay_ref).toBe('relay_001');
    expect(result.payment_id).toBe(paymentId);
    expect(result.status).toBe('QUEUED');
  });

  it('should find relay request by relay_ref', async () => {
    const relayData = {
      relay_ref: 'relay_002',
      payment_id: paymentId,
    };

    await relayService.create(relayData);

    const result = await relayService.findByRelayRef('relay_002');

    expect(result).toBeDefined();
    expect(result?.relay_ref).toBe('relay_002');
  });

  it('should find relay request by ID', async () => {
    const relayData = {
      relay_ref: 'relay_003',
      payment_id: paymentId,
    };

    const created = await relayService.create(relayData);
    const result = await relayService.findById(created.id);

    expect(result).toBeDefined();
    expect(result?.id).toBe(created.id);
  });

  it('should find all relay requests for payment', async () => {
    await prisma.relayRequest.deleteMany({});

    const relay1 = await relayService.create({
      relay_ref: 'relay_payment_001',
      payment_id: paymentId,
    });

    const relay2 = await relayService.create({
      relay_ref: 'relay_payment_002',
      payment_id: paymentId,
    });

    const result = await relayService.findByPaymentId(paymentId);

    expect(result.length).toBeGreaterThanOrEqual(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain(relay1.id);
    expect(ids).toContain(relay2.id);
  });

  it('should update relay request status', async () => {
    const relayData = {
      relay_ref: 'relay_update_001',
      payment_id: paymentId,
    };

    const created = await relayService.create(relayData);

    const updated = await relayService.updateStatus(created.id, 'SUBMITTED');

    expect(updated.status).toBe('SUBMITTED');
    expect(updated.submitted_at).toBeDefined();
  });

  it('should update relay request with tx_hash', async () => {
    const relayData = {
      relay_ref: 'relay_tx_001',
      payment_id: paymentId,
    };

    const created = await relayService.create(relayData);

    const txHash = '0x' + 'b'.repeat(64);
    const updated = await relayService.setTxHash(created.id, txHash);

    expect(updated.tx_hash).toBe(txHash);
  });

  it('should update relay request to CONFIRMED status', async () => {
    const relayData = {
      relay_ref: 'relay_confirm_001',
      payment_id: paymentId,
    };

    const created = await relayService.create(relayData);

    const confirmed = await relayService.updateStatus(created.id, 'CONFIRMED');

    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmed_at).toBeDefined();
  });

  it('should set error message on relay request', async () => {
    const relayData = {
      relay_ref: 'relay_error_001',
      payment_id: paymentId,
    };

    const created = await relayService.create(relayData);

    const updated = await relayService.setErrorMessage(created.id, 'Insufficient gas');

    expect(updated.error_message).toBe('Insufficient gas');
  });

  it('should find relay requests by status', async () => {
    await prisma.relayRequest.deleteMany({});

    const relay1 = await relayService.create({
      relay_ref: 'relay_status_001',
      payment_id: paymentId,
    });

    const relay2 = await relayService.create({
      relay_ref: 'relay_status_002',
      payment_id: paymentId,
    });

    // Update relay2 to SUBMITTED
    await relayService.updateStatus(relay2.id, 'SUBMITTED');

    const result = await relayService.findByStatus('SUBMITTED');

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.some((r) => r.id === relay2.id)).toBe(true);
  });

  it('should return null for non-existent relay request', async () => {
    const result = await relayService.findByRelayRef('non_existent_relay');
    expect(result).toBeNull();
  });
});
