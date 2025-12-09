import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMocks } from '../../db/__mocks__/client';

// Mock the client module
vi.mock('../../db/client', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
  disconnectPrisma: vi.fn(),
}));

// Mock Redis client
vi.mock('../../db/redis', () => ({
  getRedisClient: vi.fn(() => null),
  disconnectRedis: vi.fn(),
}));

import { RelayService } from '../relay.service';

describe('RelayService', () => {
  let relayService: RelayService;
  const paymentId = 1;

  beforeEach(() => {
    resetPrismaMocks();
    relayService = new RelayService(mockPrisma);
  });

  it('should create a new relay request', async () => {
    const relayData = {
      relay_ref: 'relay_001',
      payment_id: paymentId,
    };

    const mockResult = {
      id: 1,
      ...relayData,
      status: 'QUEUED',
      tx_hash: null,
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
      submitted_at: null,
      confirmed_at: null,
    };

    mockPrisma.relayRequest.create.mockResolvedValue(mockResult);

    const result = await relayService.create(relayData);

    expect(result).toBeDefined();
    expect(result.relay_ref).toBe('relay_001');
    expect(result.payment_id).toBe(paymentId);
    expect(result.status).toBe('QUEUED');
    expect(mockPrisma.relayRequest.create).toHaveBeenCalledOnce();
  });

  it('should find relay request by relay_ref', async () => {
    const mockRelay = {
      id: 2,
      relay_ref: 'relay_002',
      payment_id: paymentId,
      status: 'QUEUED',
      tx_hash: null,
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
      submitted_at: null,
      confirmed_at: null,
    };

    mockPrisma.relayRequest.findUnique.mockResolvedValue(mockRelay);

    const result = await relayService.findByRelayRef('relay_002');

    expect(result).toBeDefined();
    expect(result?.relay_ref).toBe('relay_002');
    expect(mockPrisma.relayRequest.findUnique).toHaveBeenCalledOnce();
  });

  it('should find relay request by ID', async () => {
    const mockRelay = {
      id: 3,
      relay_ref: 'relay_003',
      payment_id: paymentId,
      status: 'QUEUED',
      tx_hash: null,
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
      submitted_at: null,
      confirmed_at: null,
    };

    mockPrisma.relayRequest.findUnique.mockResolvedValue(mockRelay);

    const result = await relayService.findById(3);

    expect(result).toBeDefined();
    expect(result?.id).toBe(3);
    expect(mockPrisma.relayRequest.findUnique).toHaveBeenCalledOnce();
  });

  it('should find all relay requests for payment', async () => {
    const mockRelays = [
      {
        id: 4,
        relay_ref: 'relay_payment_001',
        payment_id: paymentId,
        status: 'QUEUED',
        tx_hash: null,
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
        submitted_at: null,
        confirmed_at: null,
      },
      {
        id: 5,
        relay_ref: 'relay_payment_002',
        payment_id: paymentId,
        status: 'QUEUED',
        tx_hash: null,
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
        submitted_at: null,
        confirmed_at: null,
      },
    ];

    mockPrisma.relayRequest.findMany.mockResolvedValue(mockRelays);

    const result = await relayService.findByPaymentId(paymentId);

    expect(result.length).toBe(2);
    expect(result[0].relay_ref).toBe('relay_payment_001');
    expect(result[1].relay_ref).toBe('relay_payment_002');
    expect(mockPrisma.relayRequest.findMany).toHaveBeenCalledOnce();
  });

  it('should update relay request status', async () => {
    const mockUpdated = {
      id: 6,
      relay_ref: 'relay_update_001',
      payment_id: paymentId,
      status: 'SUBMITTED',
      tx_hash: null,
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
      submitted_at: new Date(),
      confirmed_at: null,
    };

    mockPrisma.relayRequest.update.mockResolvedValue(mockUpdated);

    const updated = await relayService.updateStatus(6, 'SUBMITTED');

    expect(updated.status).toBe('SUBMITTED');
    expect(updated.submitted_at).toBeDefined();
    expect(mockPrisma.relayRequest.update).toHaveBeenCalledOnce();
  });

  it('should update relay request with tx_hash', async () => {
    const txHash = '0x' + 'b'.repeat(64);
    const mockUpdated = {
      id: 7,
      relay_ref: 'relay_tx_001',
      payment_id: paymentId,
      status: 'QUEUED',
      tx_hash: txHash,
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
      submitted_at: null,
      confirmed_at: null,
    };

    mockPrisma.relayRequest.update.mockResolvedValue(mockUpdated);

    const updated = await relayService.setTxHash(7, txHash);

    expect(updated.tx_hash).toBe(txHash);
    expect(mockPrisma.relayRequest.update).toHaveBeenCalledOnce();
  });

  it('should update relay request to CONFIRMED status', async () => {
    const mockConfirmed = {
      id: 8,
      relay_ref: 'relay_confirm_001',
      payment_id: paymentId,
      status: 'CONFIRMED',
      tx_hash: null,
      error_message: null,
      created_at: new Date(),
      updated_at: new Date(),
      submitted_at: null,
      confirmed_at: new Date(),
    };

    mockPrisma.relayRequest.update.mockResolvedValue(mockConfirmed);

    const confirmed = await relayService.updateStatus(8, 'CONFIRMED');

    expect(confirmed.status).toBe('CONFIRMED');
    expect(confirmed.confirmed_at).toBeDefined();
    expect(mockPrisma.relayRequest.update).toHaveBeenCalledOnce();
  });

  it('should set error message on relay request', async () => {
    const mockUpdated = {
      id: 9,
      relay_ref: 'relay_error_001',
      payment_id: paymentId,
      status: 'QUEUED',
      tx_hash: null,
      error_message: 'Insufficient gas',
      created_at: new Date(),
      updated_at: new Date(),
      submitted_at: null,
      confirmed_at: null,
    };

    mockPrisma.relayRequest.update.mockResolvedValue(mockUpdated);

    const updated = await relayService.setErrorMessage(9, 'Insufficient gas');

    expect(updated.error_message).toBe('Insufficient gas');
    expect(mockPrisma.relayRequest.update).toHaveBeenCalledOnce();
  });

  it('should find relay requests by status', async () => {
    const mockRelays = [
      {
        id: 10,
        relay_ref: 'relay_status_002',
        payment_id: paymentId,
        status: 'SUBMITTED',
        tx_hash: null,
        error_message: null,
        created_at: new Date(),
        updated_at: new Date(),
        submitted_at: new Date(),
        confirmed_at: null,
      },
    ];

    mockPrisma.relayRequest.findMany.mockResolvedValue(mockRelays);

    const result = await relayService.findByStatus('SUBMITTED');

    expect(result.length).toBe(1);
    expect(result[0].status).toBe('SUBMITTED');
    expect(mockPrisma.relayRequest.findMany).toHaveBeenCalledOnce();
  });

  it('should return null for non-existent relay request', async () => {
    mockPrisma.relayRequest.findUnique.mockResolvedValue(null);

    const result = await relayService.findByRelayRef('non_existent_relay');
    expect(result).toBeNull();
  });
});
