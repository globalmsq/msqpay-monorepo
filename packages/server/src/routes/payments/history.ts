import { FastifyInstance } from 'fastify';
import { BlockchainService } from '../../services/blockchain.service';

export async function getPaymentHistoryRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService
) {
  app.get<{ Querystring: { payer: string; limit?: string } }>(
    '/payments/history',
    async (request, reply) => {
      try {
        const { payer, limit } = request.query;

        if (!payer || typeof payer !== 'string') {
          return reply.code(400).send({
            code: 'INVALID_REQUEST',
            message: 'payer 주소는 필수입니다',
          });
        }

        // 주소 형식 검증
        if (!payer.startsWith('0x') || payer.length !== 42) {
          return reply.code(400).send({
            code: 'INVALID_REQUEST',
            message: '유효한 지갑 주소 형식이 아닙니다',
          });
        }

        const blockRange = limit ? parseInt(limit, 10) : 1000;
        const payments = await blockchainService.getPaymentHistory(payer, blockRange);

        return reply.code(200).send({
          success: true,
          data: payments,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '결제 이력을 조회할 수 없습니다';
        return reply.code(500).send({
          code: 'INTERNAL_ERROR',
          message,
        });
      }
    }
  );
}
