import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { createPaymentRoute } from '../../../src/routes/payments/create';
import { BlockchainService } from '../../../src/services/blockchain.service';

describe('POST /payments/create', () => {
  let app: FastifyInstance;
  let blockchainService: BlockchainService;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cors);

    // Mock BlockchainService
    blockchainService = {
      recordPaymentOnChain: vi.fn().mockResolvedValue('0x' + 'a'.repeat(64)),
      getPaymentStatus: vi.fn(),
      waitForConfirmation: vi.fn(),
      estimateGasCost: vi.fn(),
    } as any;

    // 실제 라우트 등록
    await createPaymentRoute(app, blockchainService);
  });

  describe('정상 케이스', () => {
    it('유효한 결제 요청을 받으면 201 상태 코드와 함께 결제 ID를 반환해야 함', async () => {
      const validPayment = {
        userId: 'user123',
        amount: 100,
        currency: 'USD',
        tokenAddress: '0x' + 'a'.repeat(40),
        recipientAddress: '0x' + 'b'.repeat(40),
        description: '테스트 결제',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: validPayment,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.paymentId).toBeDefined();
      expect(body.transactionHash).toBeDefined();
      expect(body.status).toBe('pending');
    });

    it('선택적 필드 없이 최소 필수 정보만으로 결제를 생성할 수 있어야 함', async () => {
      const minimalPayment = {
        userId: 'user456',
        amount: 50,
        currency: 'KRW',
        tokenAddress: '0x' + 'c'.repeat(40),
        recipientAddress: '0x' + 'd'.repeat(40),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: minimalPayment,
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });

  describe('경계 케이스', () => {
    it('금액이 0일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        userId: 'user789',
        amount: 0,
        currency: 'USD',
        tokenAddress: '0x' + 'a'.repeat(40),
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('유효하지 않은 토큰 주소일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        userId: 'user101',
        amount: 100,
        currency: 'USD',
        tokenAddress: 'invalid-address',
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('음수 금액일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        userId: 'user202',
        amount: -50,
        currency: 'EUR',
        tokenAddress: '0x' + 'a'.repeat(40),
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('예외 케이스', () => {
    it('필수 필드가 누락되었을 때 400 상태 코드를 반환해야 함', async () => {
      const incompletePayment = {
        userId: 'user303',
        amount: 100,
        // tokenAddress 누락
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: incompletePayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('빈 userId일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidPayment = {
        userId: '',
        amount: 100,
        currency: 'USD',
        tokenAddress: '0x' + 'a'.repeat(40),
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: invalidPayment,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('블록체인 서비스 오류 발생 시 500 상태 코드를 반환해야 함', async () => {
      blockchainService.recordPaymentOnChain = vi
        .fn()
        .mockRejectedValueOnce(new Error('블록체인 연결 오류'));

      const validPayment = {
        userId: 'user404',
        amount: 100,
        currency: 'USD',
        tokenAddress: '0x' + 'a'.repeat(40),
        recipientAddress: '0x' + 'b'.repeat(40),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/create',
        payload: validPayment,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INTERNAL_ERROR');
    });
  });
});
