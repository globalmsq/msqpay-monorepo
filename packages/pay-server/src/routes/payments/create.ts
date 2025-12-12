import { FastifyInstance } from 'fastify';
import { parseUnits, keccak256, toHex } from 'viem';
import { Decimal } from '@prisma/client/runtime/library';
import { CreatePaymentSchema } from '../../schemas/payment.schema';
import { BlockchainService } from '../../services/blockchain.service';
import { MerchantService } from '../../services/merchant.service';
import { ChainService } from '../../services/chain.service';
import { TokenService } from '../../services/token.service';
import { PaymentMethodService } from '../../services/payment-method.service';
import { PaymentService } from '../../services/payment.service';

export interface CreatePaymentRequest {
  merchantId: string;
  orderId: string;
  amount: number;
  currency: string;
  chainId: number;
  tokenAddress: string;
  recipientAddress: string;
  tokenDecimals: number;
}

export async function createPaymentRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService,
  merchantService: MerchantService,
  chainService: ChainService,
  tokenService: TokenService,
  paymentMethodService: PaymentMethodService,
  paymentService: PaymentService
) {
  app.post<{ Body: CreatePaymentRequest }>('/payments/create', async (request, reply) => {
    try {
      // 입력 검증
      const validatedData = CreatePaymentSchema.parse(request.body);

      // 1. 체인 지원 여부 확인
      if (!blockchainService.isChainSupported(validatedData.chainId)) {
        return reply.code(400).send({
          code: 'UNSUPPORTED_CHAIN',
          message: 'Unsupported chain',
        });
      }

      // 2. 토큰 검증: 심볼 존재 + 주소 일치 확인
      const tokenAddress = validatedData.tokenAddress;
      if (!tokenAddress) {
        return reply.code(400).send({
          code: 'INVALID_REQUEST',
          message: 'tokenAddress is required',
        });
      }

      if (!blockchainService.validateToken(validatedData.chainId, validatedData.currency, tokenAddress)) {
        return reply.code(400).send({
          code: 'UNSUPPORTED_TOKEN',
          message: 'Unsupported token',
        });
      }

      // 3. 토큰 설정 가져오기 (decimals 등)
      const tokenConfig = blockchainService.getTokenConfig(validatedData.chainId, validatedData.currency);
      if (!tokenConfig) {
        return reply.code(400).send({
          code: 'UNSUPPORTED_TOKEN',
          message: 'Unsupported token',
        });
      }

      // 4. DB에서 Merchant 조회 (merchant_key로)
      const merchant = await merchantService.findByMerchantKey(validatedData.merchantId);
      if (!merchant) {
        return reply.code(404).send({
          code: 'MERCHANT_NOT_FOUND',
          message: 'Merchant not found',
        });
      }

      if (!merchant.is_enabled) {
        return reply.code(403).send({
          code: 'MERCHANT_DISABLED',
          message: 'Merchant is disabled',
        });
      }

      // 5. DB에서 Chain 조회 (network_id로)
      const chain = await chainService.findByNetworkId(validatedData.chainId);
      if (!chain) {
        return reply.code(404).send({
          code: 'CHAIN_NOT_FOUND',
          message: 'Chain not found in database',
        });
      }

      // 6. DB에서 Token 조회 (chain.id + address로)
      const token = await tokenService.findByAddress(chain.id, tokenAddress);
      if (!token) {
        return reply.code(404).send({
          code: 'TOKEN_NOT_FOUND',
          message: 'Token not found in database',
        });
      }

      // 7. DB에서 MerchantPaymentMethod 조회
      const paymentMethod = await paymentMethodService.findByMerchantAndToken(merchant.id, token.id);
      if (!paymentMethod) {
        return reply.code(404).send({
          code: 'PAYMENT_METHOD_NOT_FOUND',
          message: 'Payment method not configured for this merchant and token',
        });
      }

      if (!paymentMethod.is_enabled) {
        return reply.code(403).send({
          code: 'PAYMENT_METHOD_DISABLED',
          message: 'Payment method is disabled',
        });
      }

      // amount를 wei로 변환 (상점서버가 보낸 tokenDecimals 사용)
      const amountInWei = parseUnits(validatedData.amount.toString(), validatedData.tokenDecimals);

      // 체인 컨트랙트 정보 조회
      const contracts = blockchainService.getChainContracts(validatedData.chainId);

      // 결제 생성: merchantId + orderId + timestamp 기반 bytes32 해시 생성
      const paymentHash = keccak256(
        toHex(`${validatedData.merchantId}:${validatedData.orderId}:${Date.now()}`)
      );

      // 8. DB에 Payment 저장
      const payment = await paymentService.create({
        payment_hash: paymentHash,
        merchant_id: merchant.id,
        payment_method_id: paymentMethod.id,
        amount: new Decimal(amountInWei.toString()),
        token_decimals: token.decimals,
        token_symbol: token.symbol,
        network_id: chain.network_id,
        expires_at: new Date(Date.now() + 30 * 60 * 1000), // 30분 후 만료
      });

      return reply.code(201).send({
        success: true,
        paymentId: paymentHash,
        chainId: validatedData.chainId,
        tokenAddress: tokenConfig.address,
        gatewayAddress: contracts?.gateway,
        forwarderAddress: contracts?.forwarder,
        amount: amountInWei.toString(),
        status: payment.status.toLowerCase(),
        expiresAt: payment.expires_at.toISOString(),
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
