import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PaymentMethodService } from '../payment-method.service';
import { ChainService } from '../chain.service';
import { TokenService } from '../token.service';
import { MerchantService } from '../merchant.service';
import { getPrismaClient, disconnectPrisma } from '../../db/client';

describe('PaymentMethodService', () => {
  let paymentMethodService: PaymentMethodService;
  let merchantService: MerchantService;
  let tokenService: TokenService;
  let chainService: ChainService;
  let prisma: ReturnType<typeof getPrismaClient>;
  let merchantId: number;
  let chainId: number;
  let tokenCounter = 0;
  const TEST_NETWORK_ID = 99003; // Unique network ID for this test suite

  const createUniqueToken = async () => {
    tokenCounter++;
    const token = await tokenService.create({
      chain_id: chainId,
      address: `0x${tokenCounter.toString().padStart(40, 'a')}`,
      symbol: `TKN${tokenCounter}`,
      decimals: 18,
    });
    return token.id;
  };

  beforeAll(async () => {
    prisma = getPrismaClient();
    paymentMethodService = new PaymentMethodService(prisma);
    merchantService = new MerchantService(prisma);
    tokenService = new TokenService(prisma);
    chainService = new ChainService(prisma);

    // Clean up only test-specific data - first delete existing chain if any
    const existingChain = await prisma.chain.findFirst({ where: { network_id: TEST_NETWORK_ID } });
    if (existingChain) {
      await prisma.merchantPaymentMethod.deleteMany({});
      await prisma.token.deleteMany({ where: { chain_id: existingChain.id } });
      await prisma.merchant.deleteMany({ where: { merchant_key: { startsWith: 'pm_test_' } } });
      await prisma.chain.delete({ where: { id: existingChain.id } });
    }

    // Create test merchant
    const merchant = await merchantService.create({
      merchant_key: 'pm_test_merchant',
      name: 'PM Test Merchant',
      api_key: 'pm_test_api_key',
    });
    merchantId = merchant.id;

    // Create test chain
    const chain = await chainService.create({
      network_id: TEST_NETWORK_ID,
      name: 'PMTestChain',
      rpc_url: 'http://localhost:8545',
      is_testnet: true,
    });
    chainId = chain.id;
  });

  afterAll(async () => {
    // Clean up only test-specific data
    await prisma.merchantPaymentMethod.deleteMany({});
    await prisma.token.deleteMany({ where: { chain_id: chainId } });
    await prisma.merchant.deleteMany({ where: { merchant_key: { startsWith: 'pm_test_' } } });
    await prisma.chain.deleteMany({ where: { network_id: TEST_NETWORK_ID } });
    await disconnectPrisma();
  });

  it('should create a new payment method', async () => {
    const tokenId = await createUniqueToken();
    const methodData = {
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x742d35Cc6634C0532925a3b844Bc029e4b2A69e2',
    };

    const result = await paymentMethodService.create(methodData);

    expect(result).toBeDefined();
    expect(result.merchant_id).toBe(merchantId);
    expect(result.token_id).toBe(tokenId);
    expect(result.recipient_address.toLowerCase()).toBe('0x742d35Cc6634C0532925a3b844Bc029e4b2A69e2'.toLowerCase());
    expect(result.is_enabled).toBe(true);
    expect(result.is_deleted).toBe(false);
  });

  it('should find payment method by ID', async () => {
    const tokenId = await createUniqueToken();
    const methodData = {
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
    };

    const created = await paymentMethodService.create(methodData);
    const result = await paymentMethodService.findById(created.id);

    expect(result).toBeDefined();
    expect(result?.id).toBe(created.id);
  });

  it('should find payment method by merchant and token', async () => {
    const tokenId = await createUniqueToken();
    const methodData = {
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x1234567890123456789012345678901234567890',
    };

    await paymentMethodService.create(methodData);

    const result = await paymentMethodService.findByMerchantAndToken(merchantId, tokenId);

    expect(result).toBeDefined();
    expect(result?.merchant_id).toBe(merchantId);
    expect(result?.token_id).toBe(tokenId);
  });

  it('should find all payment methods for merchant', async () => {
    await prisma.merchantPaymentMethod.deleteMany({});

    // Create a second merchant for comparison
    const merchant2 = await merchantService.create({
      merchant_key: 'pm_test_merchant_2',
      name: 'PM Test Merchant 2',
      api_key: 'pm_test_api_key_2',
    });

    const tokenId1 = await createUniqueToken();
    const tokenId2 = await createUniqueToken();

    await paymentMethodService.create({
      merchant_id: merchantId,
      token_id: tokenId1,
      recipient_address: '0x1111111111111111111111111111111111111111',
    });

    await paymentMethodService.create({
      merchant_id: merchant2.id,
      token_id: tokenId2,
      recipient_address: '0x2222222222222222222222222222222222222222',
    });

    const result = await paymentMethodService.findAllForMerchant(merchantId);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const methodIds = result.map((m) => m.merchant_id);
    expect(methodIds).toContain(merchantId);
    expect(methodIds).not.toContain(merchant2.id);
  });

  it('should update payment method', async () => {
    const tokenId = await createUniqueToken();
    const methodData = {
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x3333333333333333333333333333333333333333',
    };

    const created = await paymentMethodService.create(methodData);

    const updated = await paymentMethodService.update(created.id, {
      recipient_address: '0x4444444444444444444444444444444444444444',
    });

    expect(updated.recipient_address.toLowerCase()).toBe('0x4444444444444444444444444444444444444444'.toLowerCase());
  });

  it('should soft delete payment method', async () => {
    const tokenId = await createUniqueToken();
    const methodData = {
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x5555555555555555555555555555555555555555',
    };

    const created = await paymentMethodService.create(methodData);

    const deleted = await paymentMethodService.softDelete(created.id);

    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();
  });

  it('should return null for non-existent payment method', async () => {
    const result = await paymentMethodService.findById(999999);
    expect(result).toBeNull();
  });

  it('should exclude deleted payment methods from findAll', async () => {
    await prisma.merchantPaymentMethod.deleteMany({});

    const tokenId1 = await createUniqueToken();
    const tokenId2 = await createUniqueToken();

    const method1 = await paymentMethodService.create({
      merchant_id: merchantId,
      token_id: tokenId1,
      recipient_address: '0x6666666666666666666666666666666666666666',
    });

    const method2 = await paymentMethodService.create({
      merchant_id: merchantId,
      token_id: tokenId2,
      recipient_address: '0x7777777777777777777777777777777777777777',
    });

    await paymentMethodService.softDelete(method2.id);

    const result = await paymentMethodService.findAllForMerchant(merchantId);

    const methodIds = result.map((m) => m.id);
    expect(methodIds).toContain(method1.id);
    expect(methodIds).not.toContain(method2.id);
  });
});
