import { FastifyInstance } from 'fastify';
import { BlockchainService } from '../../services/blockchain.service';
import { PaymentService } from '../../services/payment.service';

export async function getPaymentStatusRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService,
  paymentService: PaymentService
) {
  app.get<{
    Params: { id: string };
  }>('/payments/:id/status', async (request, reply) => {
    try {
      const { id } = request.params;

      if (!id || typeof id !== 'string') {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: '결제 ID는 필수입니다',
        });
      }

      // Lookup payment by hash from database
      const paymentData = await paymentService.findByHash(id);

      if (!paymentData) {
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: '결제 정보를 찾을 수 없습니다',
        });
      }

      // Get chain ID from database snapshot
      const chainIdNum = paymentData.network_id;

      // Check if chain is supported
      if (!blockchainService.isChainSupported(chainIdNum)) {
        return reply.code(400).send({
          code: 'UNSUPPORTED_CHAIN',
          message: 'Unsupported chain',
        });
      }

      const paymentStatus = await blockchainService.getPaymentStatus(chainIdNum, id);

      if (!paymentStatus) {
        return reply.code(404).send({
          code: 'NOT_FOUND',
          message: '결제 정보를 찾을 수 없습니다',
        });
      }

      // Sync DB status with on-chain status
      // If on-chain payment is completed but DB still shows CREATED/PENDING, update DB
      let finalStatus = paymentData.status;
      if (
        paymentStatus.status === 'completed' &&
        ['CREATED', 'PENDING'].includes(paymentData.status)
      ) {
        await paymentService.updateStatusByHash(
          paymentData.payment_hash,
          'CONFIRMED',
          paymentStatus.transactionHash
        );
        finalStatus = 'CONFIRMED';
      }

      return reply.code(200).send({
        success: true,
        data: {
          ...paymentStatus,
          payment_hash: paymentData.payment_hash,
          network_id: paymentData.network_id,
          token_symbol: paymentData.token_symbol,
          status: finalStatus,
        },
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
