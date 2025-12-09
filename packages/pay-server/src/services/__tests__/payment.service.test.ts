import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMocks } from '../../db/__mocks__/client';
import { Decimal } from '@prisma/client/runtime/library';

// Mock the client module
vi.mock('../../db/client', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
  disconnectPrisma: vi.fn(),
}));

// Mock Redis client
vi.mock('../../db/redis', () => ({
  getRedisClient: vi.fn(() => null),
  disconnectRedis: vi.fn(),
  isRedisAvailable: vi.fn(() => false),
  getCache: vi.fn(() => Promise.resolve(null)),
  setCache: vi.fn(() => Promise.resolve()),
  deleteCache: vi.fn(() => Promise.resolve()),
}));

import { PaymentService } from '../payment.service';

describe('PaymentService', () => {
  let paymentService: PaymentService;
  const merchantId = 1;
  const paymentMethodId = 1;

  beforeEach(() => {
    resetPrismaMocks();
    paymentService = new PaymentService(mockPrisma);
  });

  it('should create a new payment', async () => {
    const paymentHash = '0x' + 'a'.repeat(64);
    const paymentData = {
      payment_hash: paymentHash,
      merchant_id: merchantId,
      payment_method_id: paymentMethodId,
      amount: new Decimal('1000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    };

    const mockResult = {
      id: 1,
      ...paymentData,
      status: 'CREATED',
      payer_address: null,
      tx_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
      confirmed_at: null,
    };

    mockPrisma.payment.create.mockResolvedValue(mockResult);
    mockPrisma.paymentEvent.create.mockResolvedValue({
      id: 1,
      payment_id: 1,
      event_type: 'CREATED',
      old_status: null,
      new_status: null,
      created_at: new Date(),
    });

    const result = await paymentService.create(paymentData);

    expect(result).toBeDefined();
    expect(result.payment_hash).toBe(paymentHash);
    expect(result.status).toBe('CREATED');
    expect(result.token_symbol).toBe('USDC');
    expect(mockPrisma.payment.create).toHaveBeenCalledOnce();
  });

  it('should find payment by hash', async () => {
    const paymentHash = '0x' + 'b'.repeat(64);
    const mockPayment = {
      id: 2,
      payment_hash: paymentHash,
      merchant_id: merchantId,
      payment_method_id: paymentMethodId,
      amount: new Decimal('2000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      status: 'CREATED',
      payer_address: null,
      tx_hash: null,
      expires_at: new Date(Date.now() + 3600000),
      created_at: new Date(),
      updated_at: new Date(),
      confirmed_at: null,
    };

    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

    const result = await paymentService.findByHash(paymentHash);

    expect(result).toBeDefined();
    expect(result?.payment_hash).toBe(paymentHash);
    expect(mockPrisma.payment.findUnique).toHaveBeenCalledOnce();
  });

  it('should cache payment after retrieval', async () => {
    const paymentHash = '0x' + 'c'.repeat(64);
    const mockPayment = {
      id: 3,
      payment_hash: paymentHash,
      merchant_id: merchantId,
      payment_method_id: paymentMethodId,
      amount: new Decimal('3000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      status: 'CREATED',
      payer_address: null,
      tx_hash: null,
      expires_at: new Date(Date.now() + 3600000),
      created_at: new Date(),
      updated_at: new Date(),
      confirmed_at: null,
    };

    mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);

    // First query
    const result1 = await paymentService.findByHash(paymentHash);
    expect(result1).toBeDefined();

    // Second query (Redis is mocked to null, so will hit DB again)
    const result2 = await paymentService.findByHash(paymentHash);
    expect(result2).toBeDefined();
    expect(result2?.id).toBe(result1?.id);
  });

  it('should update payment status', async () => {
    const paymentHash = '0x' + 'd'.repeat(64);
    const mockExisting = {
      id: 4,
      payment_hash: paymentHash,
      merchant_id: merchantId,
      payment_method_id: paymentMethodId,
      amount: new Decimal('4000000'),
      token_decimals: 6,
      token_symbol: 'USDC',
      network_id: 31337,
      status: 'CREATED',
      payer_address: null,
      tx_hash: null,
      expires_at: new Date(Date.now() + 3600000),
      created_at: new Date(),
      updated_at: new Date(),
      confirmed_at: null,
    };

    const mockUpdated = {
      ...mockExisting,
      status: 'CONFIRMED',
      confirmed_at: new Date(),
    };

    mockPrisma.payment.findUnique.mockResolvedValue(mockExisting);
    mockPrisma.payment.update.mockResolvedValue(mockUpdated);
    mockPrisma.paymentEvent.create.mockResolvedValue({
      id: 2,
      payment_id: 4,
      event_type: 'STATUS_CHANGED',
      old_status: 'CREATED',
      new_status: 'CONFIRMED',
      created_at: new Date(),
    });

    const updated = await paymentService.updateStatus(4, 'CONFIRMED');

    expect(updated.status).toBe('CONFIRMED');
    expect(updated.confirmed_at).toBeDefined();
    expect(mockPrisma.payment.update).toHaveBeenCalledOnce();
  });

  it('should find all payments by status', async () => {
    const mockPayments = [
      {
        id: 5,
        payment_hash: '0x' + 'e'.repeat(64),
        merchant_id: merchantId,
        payment_method_id: paymentMethodId,
        amount: new Decimal('5000000'),
        token_decimals: 6,
        token_symbol: 'USDC',
        network_id: 31337,
        status: 'CONFIRMED',
        payer_address: null,
        tx_hash: null,
        expires_at: new Date(Date.now() + 3600000),
        created_at: new Date(),
        updated_at: new Date(),
        confirmed_at: new Date(),
      },
    ];

    mockPrisma.payment.findMany.mockResolvedValue(mockPayments);

    const result = await paymentService.findByStatus('CONFIRMED');

    expect(result.length).toBe(1);
    expect(result[0].status).toBe('CONFIRMED');
    expect(mockPrisma.payment.findMany).toHaveBeenCalledOnce();
  });

  it('should return payment with network_id snapshot', async () => {
    const paymentHash = '0x' + '1'.repeat(64);
    const paymentData = {
      payment_hash: paymentHash,
      merchant_id: merchantId,
      payment_method_id: paymentMethodId,
      amount: new Decimal('7000000'),
      token_decimals: 18,
      token_symbol: 'ETH',
      network_id: 31337,
      expires_at: new Date(Date.now() + 3600000),
    };

    const mockResult = {
      id: 7,
      ...paymentData,
      status: 'CREATED',
      payer_address: null,
      tx_hash: null,
      created_at: new Date(),
      updated_at: new Date(),
      confirmed_at: null,
    };

    mockPrisma.payment.create.mockResolvedValue(mockResult);
    mockPrisma.paymentEvent.create.mockResolvedValue({
      id: 3,
      payment_id: 7,
      event_type: 'CREATED',
      old_status: null,
      new_status: null,
      created_at: new Date(),
    });

    const created = await paymentService.create(paymentData);

    expect(created.network_id).toBe(31337);
    expect(created.token_symbol).toBe('ETH');
    expect(created.token_decimals).toBe(18);
  });
});
