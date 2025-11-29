import { FastifyInstance } from 'fastify';
import { BlockchainService } from '../../services/blockchain.service';

export async function getTransactionStatusRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService
) {
  app.get<{
    Params: { txHash: string };
  }>('/transactions/:txHash/status', async (request, reply) => {
    try {
      const { txHash } = request.params;

      // 트랜잭션 해시 검증
      if (!txHash || !txHash.startsWith('0x') || txHash.length !== 66) {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: '유효한 트랜잭션 해시 형식이 아닙니다',
        });
      }

      const status = await blockchainService.getTransactionStatus(txHash);

      return reply.code(200).send({
        success: true,
        data: status,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '트랜잭션 상태를 조회할 수 없습니다';
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message,
      });
    }
  });
}
