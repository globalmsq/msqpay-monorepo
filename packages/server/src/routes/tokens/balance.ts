import { FastifyInstance } from 'fastify';
import { BlockchainService } from '../../services/blockchain.service';

export async function getTokenBalanceRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService
) {
  app.get<{
    Params: { tokenAddress: string };
    Querystring: { address: string };
  }>('/tokens/:tokenAddress/balance', async (request, reply) => {
    try {
      const { tokenAddress } = request.params;
      const { address } = request.query;

      // 토큰 주소 검증
      if (!tokenAddress || !tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: '유효한 토큰 주소 형식이 아닙니다',
        });
      }

      // 지갑 주소 검증
      if (!address || !address.startsWith('0x') || address.length !== 42) {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: '유효한 지갑 주소 형식이 아닙니다',
        });
      }

      const balance = await blockchainService.getTokenBalance(tokenAddress, address);

      return reply.code(200).send({
        success: true,
        data: { balance },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '토큰 잔액을 조회할 수 없습니다';
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message,
      });
    }
  });
}
