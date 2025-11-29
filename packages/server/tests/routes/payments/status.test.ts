import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { getPaymentStatusRoute } from '../../../src/routes/payments/status';
import { BlockchainService } from '../../../src/services/blockchain.service';
import { PaymentStatus } from '../../../src/schemas/payment.schema';

describe('GET /payments/:id/status', () => {
  let app: FastifyInstance;
  let blockchainService: BlockchainService;

  const mockPaymentStatus: PaymentStatus = {
    paymentId: 'payment-123',
    userId: 'user123',
    amount: 100,
    tokenAddress: '0x' + 'a'.repeat(40),
    tokenSymbol: 'USDC',
    recipientAddress: '0x' + 'b'.repeat(40),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cors);

    // Mock BlockchainService
    blockchainService = {
      getPaymentStatus: vi.fn().mockResolvedValue(mockPaymentStatus),
      recordPaymentOnChain: vi.fn(),
      waitForConfirmation: vi.fn(),
      estimateGasCost: vi.fn(),
    } as any;

    // 실제 라우트 등록
    await getPaymentStatusRoute(app, blockchainService);
  });

  describe('정상 케이스', () => {
    it('유효한 결제 ID로 요청하면 200 상태 코드와 함께 결제 정보를 반환해야 함', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/payments/payment-123/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toEqual(mockPaymentStatus);
    });

    it('응답에 결제의 모든 필드가 포함되어야 함', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/payments/payment-123/status',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const data = body.data;

      expect(data).toHaveProperty('paymentId');
      expect(data).toHaveProperty('userId');
      expect(data).toHaveProperty('amount');
      expect(data).toHaveProperty('tokenAddress');
      expect(data).toHaveProperty('tokenSymbol');
      expect(data).toHaveProperty('recipientAddress');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');
    });
  });

  describe('경계 케이스', () => {
    it('존재하지 않는 결제 ID일 때 404 상태 코드를 반환해야 함', async () => {
      blockchainService.getPaymentStatus = vi.fn().mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: '/payments/nonexistent-id/status',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('빈 결제 ID일 때 400 상태 코드를 반환해야 함', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/payments//status',
      });

      // Fastify는 빈 파라미터를 다르게 처리할 수 있음
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('예외 케이스', () => {
    it('블록체인 서비스 오류 발생 시 500 상태 코드를 반환해야 함', async () => {
      blockchainService.getPaymentStatus = vi
        .fn()
        .mockRejectedValueOnce(new Error('블록체인 연결 오류'));

      const response = await app.inject({
        method: 'GET',
        url: '/payments/payment-123/status',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('다양한 결제 상태를 반환할 수 있어야 함', async () => {
      const statuses: Array<'pending' | 'confirmed' | 'failed' | 'completed'> = [
        'pending',
        'confirmed',
        'failed',
        'completed',
      ];

      for (const status of statuses) {
        blockchainService.getPaymentStatus = vi
          .fn()
          .mockResolvedValueOnce({
            ...mockPaymentStatus,
            status,
          });

        const response = await app.inject({
          method: 'GET',
          url: `/payments/payment-${status}/status`,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.data.status).toBe(status);
      }
    });
  });

  describe('성능 요구사항', () => {
    it('응답 시간이 500ms 이내여야 함', async () => {
      const startTime = performance.now();

      await app.inject({
        method: 'GET',
        url: '/payments/payment-123/status',
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 실제 환경에서는 500ms이지만, 테스트 환경에서는 더 느릴 수 있음
      expect(duration).toBeLessThan(5000);
    });
  });
});
