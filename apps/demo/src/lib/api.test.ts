/**
 * API Client Tests
 * Test suite for payment API client functions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createPayment,
  CreatePaymentRequest,
  ApiErrorCode,
} from './api';

// Mock fetch globally
global.fetch = vi.fn();

describe('createPayment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create a payment with valid request parameters', async () => {
    const mockResponse = {
      success: true,
      paymentId: 'payment-123',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      gatewayAddress: '0x0987654321098765432109876543210987654321',
      forwarderAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      amount: '1000000000000000000',
      status: 'pending',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    });

    const request: CreatePaymentRequest = {
      chainId: 80002,
      amount: '100',
      merchantId: 'merchant-123',
    };

    const result = await createPayment(request);

    expect(result.success).toBe(true);
    expect(result.data?.paymentId).toBe('payment-123');
    expect(result.data?.tokenAddress).toBe(mockResponse.tokenAddress);
    expect(result.data?.gatewayAddress).toBe(mockResponse.gatewayAddress);
  });

  it('should return VALIDATION_ERROR for invalid chainId (-1)', async () => {
    const request: CreatePaymentRequest = {
      chainId: -1,
      amount: '100',
      merchantId: 'merchant-123',
    };

    const result = await createPayment(request);

    expect(result.success).toBe(false);
    expect(result.code).toBe(ApiErrorCode.VALIDATION_ERROR);
  });

  it('should return VALIDATION_ERROR for negative amount', async () => {
    const request: CreatePaymentRequest = {
      chainId: 80002,
      amount: '-100',
      merchantId: 'merchant-123',
    };

    const result = await createPayment(request);

    expect(result.success).toBe(false);
    expect(result.code).toBe(ApiErrorCode.VALIDATION_ERROR);
  });

  it('should return VALIDATION_ERROR for empty merchantId', async () => {
    const request: CreatePaymentRequest = {
      chainId: 80002,
      amount: '100',
      merchantId: '',
    };

    const result = await createPayment(request);

    expect(result.success).toBe(false);
    expect(result.code).toBe(ApiErrorCode.VALIDATION_ERROR);
  });

  it('should retry on 5xx errors and succeed after 2 failures', async () => {
    const mockResponse = {
      success: true,
      paymentId: 'payment-123',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      gatewayAddress: '0x0987654321098765432109876543210987654321',
      forwarderAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      amount: '1000000000000000000',
      status: 'pending',
    };

    // Mock: first 500, second 500, third success
    (global.fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

    const request: CreatePaymentRequest = {
      chainId: 80002,
      amount: '100',
      merchantId: 'merchant-123',
    };

    const result = await createPayment(request);

    expect(result.success).toBe(true);
    expect(result.data?.paymentId).toBe('payment-123');
    // Should have called fetch 3 times (2 failures + 1 success)
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should return error after 3 consecutive 5xx errors', async () => {
    // Mock: three 500 errors
    (global.fetch as any)
      .mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Server error' }),
      });

    const request: CreatePaymentRequest = {
      chainId: 80002,
      amount: '100',
      merchantId: 'merchant-123',
    };

    const result = await createPayment(request);

    expect(result.success).toBe(false);
    expect(result.code).toBe(ApiErrorCode.SERVER_ERROR);
    // Should have called fetch 3 times (max retries)
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('should not retry on 4xx errors and return immediately', async () => {
    const mockErrorResponse = {
      message: 'Bad request',
      code: 'INVALID_REQUEST',
    };

    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => mockErrorResponse,
    });

    const request: CreatePaymentRequest = {
      chainId: 80002,
      amount: '100',
      merchantId: 'merchant-123',
    };

    const result = await createPayment(request);

    expect(result.success).toBe(false);
    expect(result.code).toBe(ApiErrorCode.CLIENT_ERROR);
    // Should have called fetch only once (no retry for 4xx)
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
