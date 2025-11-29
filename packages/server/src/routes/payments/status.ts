import { FastifyInstance } from 'fastify';
import { BlockchainService } from '../../services/blockchain.service';

export async function getPaymentStatusRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService
) {
  app.get<{ Params: { id: string } }>('/payments/:id/status', async (request, reply) => {
    try {
      const { id } = request.params;

      if (!id || typeof id !== 'string') {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: '결제 ID는 필수입니다',
        });
      }

      const paymentStatus = await blockchainService.getPaymentStatus(id);

      if (!paymentStatus) {
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: '결제 정보를 찾을 수 없습니다',
        });
      }

      return reply.code(200).send({
        success: true,
        data: paymentStatus,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '결제 상태를 조회할 수 없습니다';
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message,
      });
    }
  });
}
