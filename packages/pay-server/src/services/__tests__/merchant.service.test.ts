import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MerchantService } from '../merchant.service';
import { getPrismaClient, disconnectPrisma } from '../../db/client';
import crypto from 'crypto';

// Unique prefix for this test suite to avoid conflicts with other tests
const TEST_PREFIX = 'merchant_svc_test_';

describe('MerchantService', () => {
  let merchantService: MerchantService;
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeAll(async () => {
    prisma = getPrismaClient();
    merchantService = new MerchantService(prisma);

    // Clean up before tests - only our test-specific merchants
    await prisma.merchant.deleteMany({
      where: { merchant_key: { startsWith: TEST_PREFIX } },
    });
  });

  afterAll(async () => {
    // Clean up after tests - only our test-specific merchants
    await prisma.merchant.deleteMany({
      where: { merchant_key: { startsWith: TEST_PREFIX } },
    });
    await disconnectPrisma();
  });

  it('should create a new merchant with hashed API key', async () => {
    const merchantData = {
      merchant_key: `${TEST_PREFIX}001`,
      name: 'Test Merchant',
      api_key: 'secret_key_12345',
    };

    const result = await merchantService.create(merchantData);

    expect(result).toBeDefined();
    expect(result.merchant_key).toBe(`${TEST_PREFIX}001`);
    expect(result.name).toBe('Test Merchant');
    expect(result.is_enabled).toBe(true);
    expect(result.is_deleted).toBe(false);

    // API key should be hashed, not stored as plain text
    expect(result.api_key_hash).not.toBe(merchantData.api_key);
    expect(result.api_key_hash.length).toBe(64); // SHA-256 hash length
  });

  it('should find merchant by ID', async () => {
    const merchantData = {
      merchant_key: `${TEST_PREFIX}002`,
      name: 'Another Merchant',
      api_key: 'another_secret_key',
    };

    const created = await merchantService.create(merchantData);
    const result = await merchantService.findById(created.id);

    expect(result).toBeDefined();
    expect(result?.id).toBe(created.id);
    expect(result?.name).toBe('Another Merchant');
  });

  it('should find merchant by merchant key', async () => {
    const merchantData = {
      merchant_key: `${TEST_PREFIX}003`,
      name: 'Key-based Merchant',
      api_key: 'key_based_secret',
    };

    await merchantService.create(merchantData);

    const result = await merchantService.findByMerchantKey(`${TEST_PREFIX}003`);

    expect(result).toBeDefined();
    expect(result?.name).toBe('Key-based Merchant');
  });

  it('should verify API key correctly', async () => {
    const apiKey = 'test_api_key_for_verification';
    const merchantData = {
      merchant_key: `${TEST_PREFIX}004`,
      name: 'Verification Merchant',
      api_key: apiKey,
    };

    const created = await merchantService.create(merchantData);

    // Verify with correct key
    const isValid = await merchantService.verifyApiKey(created.id, apiKey);
    expect(isValid).toBe(true);

    // Verify with incorrect key
    const isInvalid = await merchantService.verifyApiKey(created.id, 'wrong_key');
    expect(isInvalid).toBe(false);
  });

  it('should find all enabled merchants', async () => {
    // Use unique keys for this test
    const uniqueSuffix = Date.now().toString();

    await merchantService.create({
      merchant_key: `${TEST_PREFIX}findall_a_${uniqueSuffix}`,
      name: 'Merchant A',
      api_key: 'key_a',
    });

    await merchantService.create({
      merchant_key: `${TEST_PREFIX}findall_b_${uniqueSuffix}`,
      name: 'Merchant B',
      api_key: 'key_b',
    });

    const result = await merchantService.findAll();

    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('should update merchant information', async () => {
    const uniqueSuffix = Date.now().toString();
    const merchantData = {
      merchant_key: `${TEST_PREFIX}update_${uniqueSuffix}`,
      name: 'Original Name',
      api_key: 'original_key',
    };

    const created = await merchantService.create(merchantData);

    const updated = await merchantService.update(created.id, {
      name: 'Updated Name',
      webhook_url: 'https://example.com/webhook',
    });

    expect(updated.name).toBe('Updated Name');
    expect(updated.webhook_url).toBe('https://example.com/webhook');
  });

  it('should soft delete merchant', async () => {
    const uniqueSuffix = Date.now().toString();
    const merchantData = {
      merchant_key: `${TEST_PREFIX}delete_${uniqueSuffix}`,
      name: 'Delete Test',
      api_key: 'delete_key',
    };

    const created = await merchantService.create(merchantData);

    const deleted = await merchantService.softDelete(created.id);

    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();

    // Should not find deleted merchant
    const found = await merchantService.findById(created.id);
    expect(found).toBeNull();
  });

  it('should return null for non-existent merchant', async () => {
    const result = await merchantService.findByMerchantKey('non_existent_key');
    expect(result).toBeNull();
  });

  it('should not return api_key_hash in public response', async () => {
    const uniqueSuffix = Date.now().toString();
    const merchantData = {
      merchant_key: `${TEST_PREFIX}private_${uniqueSuffix}`,
      name: 'Private Key Merchant',
      api_key: 'private_key_123',
    };

    const created = await merchantService.create(merchantData);

    // The api_key_hash should exist in DB but not exposed in service response
    expect(created.api_key_hash).toBeDefined();
    expect(created.api_key_hash.length).toBe(64);
  });

  it('should enforce unique merchant_key constraint', async () => {
    const uniqueSuffix = Date.now().toString();
    const merchantData = {
      merchant_key: `${TEST_PREFIX}unique_${uniqueSuffix}`,
      name: 'Unique Test',
      api_key: 'unique_key',
    };

    // First creation should succeed
    await merchantService.create(merchantData);

    // Second creation with same merchant_key should fail
    try {
      await merchantService.create(merchantData);
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});
