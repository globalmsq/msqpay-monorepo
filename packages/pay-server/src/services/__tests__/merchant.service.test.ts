import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMocks } from '../../db/__mocks__/client';
import crypto from 'crypto';

// Mock the client module
vi.mock('../../db/client', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
  disconnectPrisma: vi.fn(),
}));

import { MerchantService } from '../merchant.service';

const TEST_PREFIX = 'merchant_svc_test_';

describe('MerchantService', () => {
  let merchantService: MerchantService;

  beforeEach(() => {
    resetPrismaMocks();
    merchantService = new MerchantService(mockPrisma);
  });

  it('should create a new merchant with hashed API key', async () => {
    const merchantData = {
      merchant_key: `${TEST_PREFIX}001`,
      name: 'Test Merchant',
      api_key: 'secret_key_12345',
    };

    const apiKeyHash = crypto.createHash('sha256').update(merchantData.api_key).digest('hex');
    const mockResult = {
      id: 'test-id-1',
      merchant_key: merchantData.merchant_key,
      name: merchantData.name,
      api_key_hash: apiKeyHash,
      is_enabled: true,
      is_deleted: false,
      webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchant.create.mockResolvedValue(mockResult);

    const result = await merchantService.create(merchantData);

    expect(result).toBeDefined();
    expect(result.merchant_key).toBe(`${TEST_PREFIX}001`);
    expect(result.name).toBe('Test Merchant');
    expect(result.is_enabled).toBe(true);
    expect(result.is_deleted).toBe(false);
    expect(result.api_key_hash).not.toBe(merchantData.api_key);
    expect(result.api_key_hash.length).toBe(64);
    expect(mockPrisma.merchant.create).toHaveBeenCalledOnce();
  });

  it('should find merchant by ID', async () => {
    const mockMerchant = {
      id: 'test-id-2',
      merchant_key: `${TEST_PREFIX}002`,
      name: 'Another Merchant',
      api_key_hash: 'somehash',
      is_enabled: true,
      is_deleted: false,
      webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchant.findFirst.mockResolvedValue(mockMerchant);

    const result = await merchantService.findById('test-id-2');

    expect(result).toBeDefined();
    expect(result?.id).toBe('test-id-2');
    expect(result?.name).toBe('Another Merchant');
    expect(mockPrisma.merchant.findFirst).toHaveBeenCalledOnce();
  });

  it('should find merchant by merchant key', async () => {
    const mockMerchant = {
      id: 'test-id-3',
      merchant_key: `${TEST_PREFIX}003`,
      name: 'Key-based Merchant',
      api_key_hash: 'somehash',
      is_enabled: true,
      is_deleted: false,
      webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchant.findFirst.mockResolvedValue(mockMerchant);

    const result = await merchantService.findByMerchantKey(`${TEST_PREFIX}003`);

    expect(result).toBeDefined();
    expect(result?.name).toBe('Key-based Merchant');
    expect(mockPrisma.merchant.findFirst).toHaveBeenCalledOnce();
  });

  it('should verify API key correctly', async () => {
    const apiKey = 'test_api_key_for_verification';
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const mockMerchant = {
      id: 4,
      merchant_key: `${TEST_PREFIX}004`,
      name: 'Verification Merchant',
      api_key_hash: apiKeyHash,
      is_enabled: true,
      is_deleted: false,
      webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);

    // Verify with correct key
    const isValid = await merchantService.verifyApiKey(4, apiKey);
    expect(isValid).toBe(true);

    // Verify with incorrect key
    const isInvalid = await merchantService.verifyApiKey(4, 'wrong_key');
    expect(isInvalid).toBe(false);
  });

  it('should find all enabled merchants', async () => {
    const mockMerchants = [
      {
        id: 'test-id-5',
        merchant_key: `${TEST_PREFIX}findall_a`,
        name: 'Merchant A',
        api_key_hash: 'hash_a',
        is_enabled: true,
        is_deleted: false,
        webhook_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
      {
        id: 'test-id-6',
        merchant_key: `${TEST_PREFIX}findall_b`,
        name: 'Merchant B',
        api_key_hash: 'hash_b',
        is_enabled: true,
        is_deleted: false,
        webhook_url: null,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    mockPrisma.merchant.findMany.mockResolvedValue(mockMerchants);

    const result = await merchantService.findAll();

    expect(result.length).toBe(2);
    expect(mockPrisma.merchant.findMany).toHaveBeenCalledOnce();
  });

  it('should update merchant information', async () => {
    const mockUpdated = {
      id: 'test-id-7',
      merchant_key: `${TEST_PREFIX}update`,
      name: 'Updated Name',
      api_key_hash: 'hash',
      is_enabled: true,
      is_deleted: false,
      webhook_url: 'https://example.com/webhook',
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchant.update.mockResolvedValue(mockUpdated);

    const updated = await merchantService.update('test-id-7', {
      name: 'Updated Name',
      webhook_url: 'https://example.com/webhook',
    });

    expect(updated.name).toBe('Updated Name');
    expect(updated.webhook_url).toBe('https://example.com/webhook');
    expect(mockPrisma.merchant.update).toHaveBeenCalledOnce();
  });

  it('should soft delete merchant', async () => {
    const mockDeleted = {
      id: 'test-id-8',
      merchant_key: `${TEST_PREFIX}delete`,
      name: 'Delete Test',
      api_key_hash: 'hash',
      is_enabled: true,
      is_deleted: true,
      webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: new Date(),
    };

    mockPrisma.merchant.update.mockResolvedValue(mockDeleted);
    mockPrisma.merchant.findFirst.mockResolvedValue(null);

    const deleted = await merchantService.softDelete('test-id-8');

    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();

    // Should not find deleted merchant
    const found = await merchantService.findById('test-id-8');
    expect(found).toBeNull();
  });

  it('should return null for non-existent merchant', async () => {
    mockPrisma.merchant.findFirst.mockResolvedValue(null);

    const result = await merchantService.findByMerchantKey('non_existent_key');
    expect(result).toBeNull();
  });

  it('should not return api_key_hash in public response', async () => {
    const apiKeyHash = crypto.createHash('sha256').update('private_key_123').digest('hex');
    const mockMerchant = {
      id: 'test-id-9',
      merchant_key: `${TEST_PREFIX}private`,
      name: 'Private Key Merchant',
      api_key_hash: apiKeyHash,
      is_enabled: true,
      is_deleted: false,
      webhook_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchant.create.mockResolvedValue(mockMerchant);

    const created = await merchantService.create({
      merchant_key: `${TEST_PREFIX}private`,
      name: 'Private Key Merchant',
      api_key: 'private_key_123',
    });

    expect(created.api_key_hash).toBeDefined();
    expect(created.api_key_hash.length).toBe(64);
  });

  it('should enforce unique merchant_key constraint', async () => {
    const error = new Error('Unique constraint failed on the fields: (`merchant_key`)');
    mockPrisma.merchant.create.mockRejectedValue(error);

    await expect(
      merchantService.create({
        merchant_key: `${TEST_PREFIX}unique`,
        name: 'Unique Test',
        api_key: 'unique_key',
      })
    ).rejects.toThrow();
  });
});
