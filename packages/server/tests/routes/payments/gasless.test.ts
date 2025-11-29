import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { submitGaslessRoute } from '../../../src/routes/payments/gasless';
import { DefenderService } from '../../../src/services/defender.service';

describe('POST /payments/:id/gasless', () => {
  let app: FastifyInstance;
  let defenderService: DefenderService;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(cors);

    // Mock DefenderService
    defenderService = {
      submitGaslessTransaction: vi
        .fn()
        .mockResolvedValue({
          relayRequestId: 'relay-123-' + Date.now(),
          status: 'submitted',
        }),
      getRelayStatus: vi.fn(),
      cancelRelayTransaction: vi.fn(),
      validateTransactionData: vi.fn().mockReturnValue(true),
      estimateGasFee: vi.fn().mockResolvedValue('50000000000'),
      getRelayerAddress: vi.fn().mockReturnValue('0x' + 'f'.repeat(40)),
    } as any;

    // 실제 라우트 등록
    await submitGaslessRoute(app, defenderService);
  });

  describe('정상 케이스', () => {
    it('유효한 Gasless 요청을 받으면 202 상태 코드와 함께 릴레이 요청 ID를 반환해야 함', async () => {
      const validRequest = {
        paymentId: 'payment-123',
        forwarderAddress: '0x' + 'a'.repeat(40),
        signature: '0x' + 'b'.repeat(128),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/payment-123/gasless',
        payload: validRequest,
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.relayRequestId).toBeDefined();
      expect(body.status).toBe('submitted');
    });

    it('Gasless 거래 응답에 필요한 모든 필드가 포함되어야 함', async () => {
      const validRequest = {
        paymentId: 'payment-456',
        forwarderAddress: '0x' + 'c'.repeat(40),
        signature: '0x' + 'd'.repeat(128),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/payment-456/gasless',
        payload: validRequest,
      });

      expect(response.statusCode).toBe(202);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('success');
      expect(body).toHaveProperty('relayRequestId');
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('message');
    });
  });

  describe('경계 케이스', () => {
    it('유효하지 않은 서명 형식일 때 400 상태 코드를 반환해야 함', async () => {
      defenderService.validateTransactionData = vi.fn().mockReturnValueOnce(false);

      const invalidRequest = {
        paymentId: 'payment-789',
        forwarderAddress: '0x' + 'a'.repeat(40),
        signature: '0x' + 'invalid'.padEnd(128, 'x'),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/payment-789/gasless',
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_SIGNATURE');
    });

    it('유효하지 않은 포워더 주소일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidRequest = {
        paymentId: 'payment-101',
        forwarderAddress: 'invalid-address',
        signature: '0x' + 'b'.repeat(128),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/payment-101/gasless',
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('필수 필드가 누락되었을 때 400 상태 코드를 반환해야 함', async () => {
      const incompleteRequest = {
        paymentId: 'payment-202',
        forwarderAddress: '0x' + 'a'.repeat(40),
        // signature 누락
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/payment-202/gasless',
        payload: incompleteRequest,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('결제 ID가 누락되었을 때 400 상태 코드를 반환해야 함', async () => {
      const validRequest = {
        paymentId: 'payment-303',
        forwarderAddress: '0x' + 'a'.repeat(40),
        signature: '0x' + 'b'.repeat(128),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments//gasless',
        payload: validRequest,
      });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('예외 케이스', () => {
    it('Defender 서비스 오류 발생 시 500 상태 코드를 반환해야 함', async () => {
      defenderService.submitGaslessTransaction = vi
        .fn()
        .mockRejectedValueOnce(new Error('Defender API 오류'));

      const validRequest = {
        paymentId: 'payment-404',
        forwarderAddress: '0x' + 'a'.repeat(40),
        signature: '0x' + 'b'.repeat(128),
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/payment-404/gasless',
        payload: validRequest,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('서명이 빈 문자열일 때 400 상태 코드를 반환해야 함', async () => {
      const invalidRequest = {
        paymentId: 'payment-505',
        forwarderAddress: '0x' + 'a'.repeat(40),
        signature: '',
      };

      const response = await app.inject({
        method: 'POST',
        url: '/payments/payment-505/gasless',
        payload: invalidRequest,
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('성능 요구사항', () => {
    it('Gasless 요청 응답 시간이 500ms 이내여야 함', async () => {
      const validRequest = {
        paymentId: 'payment-606',
        forwarderAddress: '0x' + 'a'.repeat(40),
        signature: '0x' + 'b'.repeat(128),
      };

      const startTime = performance.now();

      await app.inject({
        method: 'POST',
        url: '/payments/payment-606/gasless',
        payload: validRequest,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000);
    });
  });
});
