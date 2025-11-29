import { FastifyInstance } from 'fastify';
import { BlockchainService } from '../../services/blockchain.service';

export async function getTokenAllowanceRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService
) {
  app.get<{
    Params: { tokenAddress: string };
    Querystring: { owner: string; spender: string };
  }>('/tokens/:tokenAddress/allowance', async (request, reply) => {
    try {
      const { tokenAddress } = request.params;
      const { owner, spender } = request.query;

      // 토큰 주소 검증
      if (!tokenAddress || !tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: '유효한 토큰 주소 형식이 아닙니다',
        });
      }

      // owner 주소 검증
      if (!owner || !owner.startsWith('0x') || owner.length !== 42) {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: '유효한 owner 주소 형식이 아닙니다',
        });
      }

      // spender 주소 검증
      if (!spender || !spender.startsWith('0x') || spender.length !== 42) {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: '유효한 spender 주소 형식이 아닙니다',
        });
      }

      const allowance = await blockchainService.getTokenAllowance(tokenAddress, owner, spender);

      return reply.code(200).send({
        success: true,
        data: { allowance },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '토큰 승인액을 조회할 수 없습니다';
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message,
      });
    }
  });
}
