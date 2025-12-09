import { FastifyInstance } from 'fastify';
import { BlockchainService } from '../../services/blockchain.service';
import { PaymentService } from '../../services/payment.service';
import { RelayService } from '../../services/relay.service';

export async function getPaymentHistoryRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService,
  paymentService: PaymentService,
  relayService: RelayService
) {
  app.get<{ Querystring: { chainId: string; payer: string; limit?: string } }>(
    '/payments/history',
    async (request, reply) => {
      try {
        const { chainId, payer, limit } = request.query;

        // chainId 필수 검증
        if (!chainId) {
          return reply.code(400).send({
            code: 'INVALID_REQUEST',
            message: 'chainId는 필수입니다',
          });
        }

        const chainIdNum = Number(chainId);
        if (isNaN(chainIdNum)) {
          return reply.code(400).send({
            code: 'INVALID_REQUEST',
            message: '유효한 chainId가 아닙니다',
          });
        }

        // 체인 지원 여부 확인
        if (!blockchainService.isChainSupported(chainIdNum)) {
          return reply.code(400).send({
            code: 'UNSUPPORTED_CHAIN',
            message: 'Unsupported chain',
          });
        }

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
        const payments = await blockchainService.getPaymentHistory(chainIdNum, payer, blockRange);

        // DB에서 각 payment에 대해 relay 정보 조회하여 isGasless 설정
        const enrichedPayments = await Promise.all(
          payments.map(async (payment) => {
            try {
              // payment_hash로 DB에서 payment 조회
              const dbPayment = await paymentService.findByHash(payment.paymentId);
              if (dbPayment) {
                // relay_requests 테이블에서 해당 payment_id로 조회
                const relayRequests = await relayService.findByPaymentId(dbPayment.id);
                if (relayRequests.length > 0) {
                  return {
                    ...payment,
                    isGasless: true,
                    relayId: relayRequests[0].relay_ref,
                  };
                }
              }
              return payment;
            } catch {
              // DB 조회 실패 시 기본값 유지
              return payment;
            }
          })
        );

        return reply.code(200).send({
          success: true,
          data: enrichedPayments,
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
