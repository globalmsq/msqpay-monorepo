import { FastifyInstance } from 'fastify';
import { RelayExecutionSchema } from '../../schemas/payment.schema';
import { DefenderService } from '../../services/defender.service';

export interface ExecuteRelayRequest {
  paymentId: string;
  transactionData: string;
  gasEstimate: number;
}

export async function executeRelayRoute(
  app: FastifyInstance,
  defenderService: DefenderService
) {
  app.post<{ Params: { id: string }; Body: ExecuteRelayRequest }>(
    '/payments/:id/relay',
    async (request, reply) => {
      try {
        const { id } = request.params;

        if (!id || typeof id !== 'string') {
          return reply.code(400).send({
            code: 'INVALID_REQUEST',
            message: '결제 ID는 필수입니다',
          });
        }

        // 입력 검증
        let validatedData;
        try {
          validatedData = RelayExecutionSchema.parse(request.body);
        } catch (error) {
          if (error instanceof Error && error.name === 'ZodError') {
            return reply.code(400).send({
              code: 'VALIDATION_ERROR',
              message: '입력 검증 실패',
              details: (error as { errors?: unknown[] }).errors,
            });
          }
          throw error;
        }

        // 거래 데이터 검증
        if (!defenderService.validateTransactionData(validatedData.transactionData)) {
          return reply.code(400).send({
            code: 'INVALID_TRANSACTION_DATA',
            message: '유효하지 않은 거래 데이터 형식입니다',
          });
        }

        // 가스 비용 검증
        if (validatedData.gasEstimate <= 0) {
          return reply.code(400).send({
            code: 'INVALID_GAS_ESTIMATE',
            message: '가스 추정치는 양수여야 합니다',
          });
        }

        // 릴레이 실행
        const result = await defenderService.submitGaslessTransaction(
          id,
          defenderService.getRelayerAddress(),
          validatedData.transactionData
        );

        return reply.code(200).send({
          success: true,
          relayRequestId: result.relayRequestId,
          transactionHash: result.transactionHash,
          status: result.status,
          message: '릴레이 거래가 실행되었습니다',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '릴레이 거래를 실행할 수 없습니다';
        return reply.code(500).send({
          code: 'INTERNAL_ERROR',
          message,
        });
      }
    }
  );
}
