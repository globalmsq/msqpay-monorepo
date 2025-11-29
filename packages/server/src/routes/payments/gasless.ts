import { FastifyInstance } from 'fastify';
import { Address } from 'viem';
import { GaslessRequestSchema } from '../../schemas/payment.schema';
import { DefenderService } from '../../services/defender.service';

export interface SubmitGaslessRequest {
  paymentId: string;
  forwarderAddress: string;
  signature: string;
}

export async function submitGaslessRoute(
  app: FastifyInstance,
  defenderService: DefenderService
) {
  app.post<{ Params: { id: string }; Body: SubmitGaslessRequest }>(
    '/payments/:id/gasless',
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
          validatedData = GaslessRequestSchema.parse(request.body);
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
        if (!defenderService.validateTransactionData(validatedData.signature)) {
          return reply.code(400).send({
            code: 'INVALID_SIGNATURE',
            message: '유효하지 않은 서명 형식입니다',
          });
        }

        // Gasless 거래 제출
        const result = await defenderService.submitGaslessTransaction(
          id,
          validatedData.forwarderAddress as Address,
          validatedData.signature
        );

        return reply.code(202).send({
          success: true,
          relayRequestId: result.relayRequestId,
          status: result.status,
          message: 'Gasless 거래가 제출되었습니다',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Gasless 거래를 제출할 수 없습니다';
        return reply.code(500).send({
          code: 'INTERNAL_ERROR',
          message,
        });
      }
    }
  );
}
