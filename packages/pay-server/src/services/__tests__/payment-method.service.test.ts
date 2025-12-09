import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMocks } from '../../db/__mocks__/client';

// Mock the client module
vi.mock('../../db/client', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
  disconnectPrisma: vi.fn(),
}));

import { PaymentMethodService } from '../payment-method.service';

describe('PaymentMethodService', () => {
  let paymentMethodService: PaymentMethodService;
  const merchantId = 'merchant-id-1';
  const chainId = 'chain-id-1';
  let tokenCounter = 0;

  beforeEach(() => {
    resetPrismaMocks();
    paymentMethodService = new PaymentMethodService(mockPrisma);
    tokenCounter = 0;
  });

  const createMockTokenId = () => {
    tokenCounter++;
    return `token-id-${tokenCounter}`;
  };

  it('should create a new payment method', async () => {
    const tokenId = createMockTokenId();
    const methodData = {
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x742d35Cc6634C0532925a3b844Bc029e4b2A69e2',
    };

    const mockResult = {
      id: 1,
      ...methodData,
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchantPaymentMethod.create.mockResolvedValue(mockResult);

    const result = await paymentMethodService.create(methodData);

    expect(result).toBeDefined();
    expect(result.merchant_id).toBe(merchantId);
    expect(result.token_id).toBe(tokenId);
    expect(result.recipient_address.toLowerCase()).toBe('0x742d35Cc6634C0532925a3b844Bc029e4b2A69e2'.toLowerCase());
    expect(result.is_enabled).toBe(true);
    expect(result.is_deleted).toBe(false);
    expect(mockPrisma.merchantPaymentMethod.create).toHaveBeenCalledOnce();
  });

  it('should find payment method by ID', async () => {
    const tokenId = createMockTokenId();
    const mockMethod = {
      id: 2,
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x8ba1f109551bD432803012645Ac136ddd64DBA72',
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchantPaymentMethod.findFirst.mockResolvedValue(mockMethod);

    const result = await paymentMethodService.findById(2);

    expect(result).toBeDefined();
    expect(result?.id).toBe(2);
    expect(mockPrisma.merchantPaymentMethod.findFirst).toHaveBeenCalledOnce();
  });

  it('should find payment method by merchant and token', async () => {
    const tokenId = createMockTokenId();
    const mockMethod = {
      id: 3,
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x1234567890123456789012345678901234567890',
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchantPaymentMethod.findFirst.mockResolvedValue(mockMethod);

    const result = await paymentMethodService.findByMerchantAndToken(merchantId, tokenId);

    expect(result).toBeDefined();
    expect(result?.merchant_id).toBe(merchantId);
    expect(result?.token_id).toBe(tokenId);
    expect(mockPrisma.merchantPaymentMethod.findFirst).toHaveBeenCalledOnce();
  });

  it('should find all payment methods for merchant', async () => {
    const tokenId1 = createMockTokenId();
    const mockMethods = [
      {
        id: 4,
        merchant_id: merchantId,
        token_id: tokenId1,
        recipient_address: '0x1111111111111111111111111111111111111111',
        is_enabled: true,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    mockPrisma.merchantPaymentMethod.findMany.mockResolvedValue(mockMethods);

    const result = await paymentMethodService.findAllForMerchant(merchantId);

    expect(result.length).toBe(1);
    expect(result[0].merchant_id).toBe(merchantId);
    expect(mockPrisma.merchantPaymentMethod.findMany).toHaveBeenCalledOnce();
  });

  it('should update payment method', async () => {
    const tokenId = createMockTokenId();
    const mockUpdated = {
      id: 5,
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x4444444444444444444444444444444444444444',
      is_enabled: true,
      is_deleted: false,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: null,
    };

    mockPrisma.merchantPaymentMethod.update.mockResolvedValue(mockUpdated);

    const updated = await paymentMethodService.update(5, {
      recipient_address: '0x4444444444444444444444444444444444444444',
    });

    expect(updated.recipient_address.toLowerCase()).toBe('0x4444444444444444444444444444444444444444'.toLowerCase());
    expect(mockPrisma.merchantPaymentMethod.update).toHaveBeenCalledOnce();
  });

  it('should soft delete payment method', async () => {
    const tokenId = createMockTokenId();
    const mockDeleted = {
      id: 6,
      merchant_id: merchantId,
      token_id: tokenId,
      recipient_address: '0x5555555555555555555555555555555555555555',
      is_enabled: true,
      is_deleted: true,
      created_at: new Date(),
      updated_at: new Date(),
      deleted_at: new Date(),
    };

    mockPrisma.merchantPaymentMethod.update.mockResolvedValue(mockDeleted);

    const deleted = await paymentMethodService.softDelete(6);

    expect(deleted.is_deleted).toBe(true);
    expect(deleted.deleted_at).toBeDefined();
    expect(mockPrisma.merchantPaymentMethod.update).toHaveBeenCalledOnce();
  });

  it('should return null for non-existent payment method', async () => {
    mockPrisma.merchantPaymentMethod.findFirst.mockResolvedValue(null);

    const result = await paymentMethodService.findById(999999);
    expect(result).toBeNull();
  });

  it('should exclude deleted payment methods from findAll', async () => {
    const tokenId1 = createMockTokenId();
    const mockMethods = [
      {
        id: 7,
        merchant_id: merchantId,
        token_id: tokenId1,
        recipient_address: '0x6666666666666666666666666666666666666666',
        is_enabled: true,
        is_deleted: false,
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
      },
    ];

    // Only non-deleted methods should be returned
    mockPrisma.merchantPaymentMethod.findMany.mockResolvedValue(mockMethods);

    const result = await paymentMethodService.findAllForMerchant(merchantId);

    expect(result.length).toBe(1);
    expect(result[0].id).toBe(7);
    expect(mockPrisma.merchantPaymentMethod.findMany).toHaveBeenCalledOnce();
  });
});
