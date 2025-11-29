import { FastifyInstance } from 'fastify';
import { Address } from 'viem';
import { CreatePaymentSchema } from '../../schemas/payment.schema';
import { BlockchainService } from '../../services/blockchain.service';

export interface CreatePaymentRequest {
  userId: string;
  amount: number;
  currency?: string;
  tokenAddress: string;
  recipientAddress: string;
  description?: string;
}

export async function createPaymentRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService
) {
  app.post<{ Body: CreatePaymentRequest }>('/payments/create', async (request, reply) => {
    try {
      // 입력 검증
      const validatedData = CreatePaymentSchema.parse(request.body);

      // 블록체인에 기록
      const transactionHash = await blockchainService.recordPaymentOnChain({
        userId: validatedData.userId,
        amount: BigInt(validatedData.amount),
        currency: validatedData.currency,
        tokenAddress: validatedData.tokenAddress as Address,
        recipientAddress: validatedData.recipientAddress as Address,
        description: validatedData.description,
      });

      return reply.code(201).send({
        success: true,
        paymentId: `payment-${Date.now()}`,
        transactionHash,
        status: 'pending',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return reply.code(400).send({
          code: 'VALIDATION_ERROR',
          message: '입력 검증 실패',
          details: (error as { errors?: unknown[] }).errors,
        });
      }
      const message = error instanceof Error ? error.message : '결제를 생성할 수 없습니다';
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message,
      });
    }
  });
}
