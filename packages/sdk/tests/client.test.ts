import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MSQPayClient, MSQPayError } from '../src/index';
import type {
  CreatePaymentParams,
  GaslessParams,
  RelayParams
} from '../src/index';

// Mock fetch globally
global.fetch = vi.fn();

describe('MSQPayClient', () => {
  let client: MSQPayClient;
  const mockFetch = global.fetch as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new MSQPayClient({
      environment: 'development',
      apiKey: 'test-api-key'
    });
  });

  describe('constructor', () => {
    it('TC-007.1: should initialize with development environment', () => {
      const devClient = new MSQPayClient({
        environment: 'development',
        apiKey: 'test-key'
      });
      expect(devClient.getApiUrl()).toBe('http://localhost:3001');
    });

    it('TC-007.2: should initialize with staging environment', () => {
      const stagingClient = new MSQPayClient({
        environment: 'staging',
        apiKey: 'test-key'
      });
      expect(stagingClient.getApiUrl()).toBe('https://pay-api.staging.msq.com');
    });

    it('TC-007.3: should initialize with production environment', () => {
      const prodClient = new MSQPayClient({
        environment: 'production',
        apiKey: 'test-key'
      });
      expect(prodClient.getApiUrl()).toBe('https://pay-api.msq.com');
    });

    it('TC-007.4: should initialize with custom environment and apiUrl', () => {
      const customClient = new MSQPayClient({
        environment: 'custom',
        apiKey: 'test-key',
        apiUrl: 'https://custom.api.com'
      });
      expect(customClient.getApiUrl()).toBe('https://custom.api.com');
    });

    it('TC-007.5: should throw error when custom environment without apiUrl', () => {
      expect(() => {
        new MSQPayClient({
          environment: 'custom',
          apiKey: 'test-key'
        });
      }).toThrow('apiUrl is required when environment is "custom"');
    });
  });

  describe('setApiUrl and getApiUrl', () => {
    it('TC-008.1: should change API URL', () => {
      client.setApiUrl('https://new.api.com');
      expect(client.getApiUrl()).toBe('https://new.api.com');
    });

    it('TC-008.2: should return correct URL after multiple changes', () => {
      client.setApiUrl('https://api1.com');
      expect(client.getApiUrl()).toBe('https://api1.com');
      client.setApiUrl('https://api2.com');
      expect(client.getApiUrl()).toBe('https://api2.com');
    });
  });

  describe('createPayment', () => {
    const validParams: CreatePaymentParams = {
      userId: 'user-1',
      amount: 1000,
      currency: 'USD',
      tokenAddress: '0x1234567890123456789012345678901234567890',
      recipientAddress: '0x0987654321098765432109876543210987654321',
      description: 'Test payment'
    };

    it('TC-001: should create payment successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          paymentId: 'pay-123',
          transactionHash: '0xabc123',
          status: 'pending'
        })
      });

      const result = await client.createPayment(validParams);

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('pay-123');
      expect(result.transactionHash).toBe('0xabc123');
      expect(result.status).toBe('pending');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/payments/create',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('TC-002: should throw MSQPayError on validation failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: 'VALIDATION_ERROR',
          message: '입력 검증 실패'
        })
      });

      await expect(client.createPayment(validParams)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400
      });
    });

    it('TC-002.1: should include error details in MSQPayError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: 'INVALID_REQUEST',
          message: 'Invalid request format',
          details: { field: 'amount', error: 'must be positive' }
        })
      });

      try {
        await client.createPayment(validParams);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MSQPayError);
        expect((error as MSQPayError).details).toEqual({
          field: 'amount',
          error: 'must be positive'
        });
      }
    });

    it('TC-002.2: should handle INTERNAL_ERROR (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          code: 'INTERNAL_ERROR',
          message: '서버 내부 오류'
        })
      });

      await expect(client.createPayment(validParams)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        statusCode: 500
      });
    });
  });

  describe('getPaymentStatus', () => {
    it('TC-003: should get payment status successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: 'pay-123',
            userId: 'user-1',
            amount: 1000,
            currency: 'USD',
            tokenAddress: '0x1234567890123456789012345678901234567890',
            recipientAddress: '0x0987654321098765432109876543210987654321',
            status: 'completed',
            transactionHash: '0xabc123',
            blockNumber: 12345,
            createdAt: '2025-11-29T10:00:00Z',
            updatedAt: '2025-11-29T10:05:00Z'
          }
        })
      });

      const result = await client.getPaymentStatus('pay-123');

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('pay-123');
      expect(result.data.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/payments/pay-123/status',
        expect.objectContaining({
          method: 'GET'
        })
      );
    });

    it('TC-004: should throw MSQPayError when payment not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          code: 'NOT_FOUND',
          message: '결제 정보를 찾을 수 없습니다'
        })
      });

      await expect(client.getPaymentStatus('invalid-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404
      });
    });

    it('TC-003.1: should handle all payment status values', async () => {
      const statuses = ['pending', 'confirmed', 'failed', 'completed'] as const;

      for (const status of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 'pay-123',
              userId: 'user-1',
              amount: 1000,
              currency: 'USD',
              tokenAddress: '0x1234567890123456789012345678901234567890',
              recipientAddress: '0x0987654321098765432109876543210987654321',
              status,
              createdAt: '2025-11-29T10:00:00Z',
              updatedAt: '2025-11-29T10:05:00Z'
            }
          })
        });

        const result = await client.getPaymentStatus('pay-123');
        expect(result.data.status).toBe(status);
      }
    });
  });

  describe('submitGasless', () => {
    const validParams: GaslessParams = {
      paymentId: 'pay-123',
      forwarderAddress: '0x1234567890123456789012345678901234567890',
      signature: '0x' + 'a'.repeat(128)
    };

    it('TC-005: should submit gasless transaction successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          relayRequestId: 'relay-123',
          status: 'submitted',
          message: 'Transaction submitted'
        })
      });

      const result = await client.submitGasless(validParams);

      expect(result.success).toBe(true);
      expect(result.relayRequestId).toBe('relay-123');
      expect(result.status).toBe('submitted');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/payments/pay-123/gasless',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('TC-005.1: should handle gasless status values', async () => {
      const statuses = ['submitted', 'mined', 'failed'] as const;

      for (const status of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            relayRequestId: 'relay-123',
            status,
            message: 'Transaction ' + status
          })
        });

        const result = await client.submitGasless(validParams);
        expect(result.status).toBe(status);
      }
    });

    it('TC-005.2: should throw MSQPayError on invalid signature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: 'INVALID_SIGNATURE',
          message: '잘못된 서명 형식'
        })
      });

      await expect(client.submitGasless(validParams)).rejects.toMatchObject({
        code: 'INVALID_SIGNATURE',
        statusCode: 400
      });
    });
  });

  describe('executeRelay', () => {
    const validParams: RelayParams = {
      paymentId: 'pay-123',
      transactionData: '0x' + 'b'.repeat(256),
      gasEstimate: 100000
    };

    it('TC-006: should execute relay successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          relayRequestId: 'relay-123',
          transactionHash: '0xdef456',
          status: 'mined',
          message: 'Relay executed'
        })
      });

      const result = await client.executeRelay(validParams);

      expect(result.success).toBe(true);
      expect(result.relayRequestId).toBe('relay-123');
      expect(result.transactionHash).toBe('0xdef456');
      expect(result.status).toBe('mined');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/payments/pay-123/relay',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    it('TC-006.1: should handle relay status values', async () => {
      const statuses = ['submitted', 'mined', 'failed'] as const;

      for (const status of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            relayRequestId: 'relay-123',
            status,
            message: 'Relay ' + status
          })
        });

        const result = await client.executeRelay(validParams);
        expect(result.status).toBe(status);
      }
    });

    it('TC-006.2: should throw MSQPayError on invalid transaction data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: 'INVALID_TRANSACTION_DATA',
          message: '잘못된 트랜잭션 데이터'
        })
      });

      await expect(client.executeRelay(validParams)).rejects.toMatchObject({
        code: 'INVALID_TRANSACTION_DATA',
        statusCode: 400
      });
    });

    it('TC-006.3: should throw MSQPayError on invalid gas estimate', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: 'INVALID_GAS_ESTIMATE',
          message: '잘못된 가스 추정치'
        })
      });

      await expect(client.executeRelay(validParams)).rejects.toMatchObject({
        code: 'INVALID_GAS_ESTIMATE',
        statusCode: 400
      });
    });
  });

  describe('API Key header', () => {
    it('should include X-API-Key header in all requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: 'pay-123',
            userId: 'user-1',
            amount: 1000,
            currency: 'USD',
            tokenAddress: '0x1234567890123456789012345678901234567890',
            recipientAddress: '0x0987654321098765432109876543210987654321',
            status: 'pending',
            createdAt: '2025-11-29T10:00:00Z',
            updatedAt: '2025-11-29T10:00:00Z'
          }
        })
      });

      await client.getPaymentStatus('pay-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key'
          })
        })
      );
    });
  });

  describe('Error handling', () => {
    it('should preserve error message', async () => {
      const errorMessage = 'Custom error message';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: 'VALIDATION_ERROR',
          message: errorMessage
        })
      });

      try {
        await client.createPayment({
          userId: 'user-1',
          amount: 1000,
          tokenAddress: '0x1234567890123456789012345678901234567890',
          recipientAddress: '0x0987654321098765432109876543210987654321'
        });
      } catch (error) {
        expect((error as MSQPayError).message).toBe(errorMessage);
      }
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        client.createPayment({
          userId: 'user-1',
          amount: 1000,
          tokenAddress: '0x1234567890123456789012345678901234567890',
          recipientAddress: '0x0987654321098765432109876543210987654321'
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('Request payload', () => {
    it('should send correct payload for createPayment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          paymentId: 'pay-123',
          transactionHash: '0xabc123',
          status: 'pending'
        })
      });

      const params: CreatePaymentParams = {
        userId: 'user-1',
        amount: 1000,
        currency: 'USD',
        tokenAddress: '0x1234567890123456789012345678901234567890',
        recipientAddress: '0x0987654321098765432109876543210987654321'
      };

      await client.createPayment(params);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);

      expect(body).toEqual(params);
    });

    it('should send correct URL path for getPaymentStatus', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            id: 'pay-123',
            userId: 'user-1',
            amount: 1000,
            currency: 'USD',
            tokenAddress: '0x1234567890123456789012345678901234567890',
            recipientAddress: '0x0987654321098765432109876543210987654321',
            status: 'pending',
            createdAt: '2025-11-29T10:00:00Z',
            updatedAt: '2025-11-29T10:00:00Z'
          }
        })
      });

      await client.getPaymentStatus('pay-456');

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('/payments/pay-456/status');
    });
  });
});
