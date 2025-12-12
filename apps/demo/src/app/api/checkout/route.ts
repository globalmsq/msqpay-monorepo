/**
 * Checkout API Route
 *
 * 결제 플로우:
 * 1. 클라이언트 → POST /api/checkout { products: [{ productId, quantity }] }
 * 2. 상점서버: orderId 생성, 상품 가격 조회, 총액 계산, 상점 설정에서 체인/토큰 조회
 * 3. 상점서버 → 결제서버: createPayment 요청
 * 4. 결제서버: paymentId 생성 (merchantId + orderId 기반)
 * 5. 상점서버 → 클라이언트: paymentId, orderId, 결제 정보 반환
 *
 * ⚠️ SECURITY:
 * - 가격은 서버 측에서 조회 (클라이언트 제공 금액 무시)
 * - 체인/토큰 정보는 상점 설정에서 조회 (클라이언트 조작 방지)
 * - paymentId는 결제 서버에서 생성 (클라이언트 생성 금지)
 */

import { NextRequest, NextResponse } from 'next/server';
import { MSQPayClient } from '@globalmsq/msqpay';
import { getProductById } from '@/lib/products';
import { getMerchantConfig, generateOrderId } from '@/lib/merchant';

// MSQ Pay SDK 클라이언트 초기화
const client = new MSQPayClient({
  environment: 'custom',
  apiKey: process.env.MSQ_PAY_API_KEY || 'demo-key',
  apiUrl: process.env.MSQPAY_API_URL || 'http://127.0.0.1:3001',
});

interface CheckoutItem {
  productId: string;
  quantity?: number;
}

interface CheckoutRequest {
  products: CheckoutItem[];
}

interface ProductInfo {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: CheckoutRequest = await request.json();
    const { products } = body;

    // 필수 필드 검증
    if (!products || !Array.isArray(products) || products.length === 0) {
      return NextResponse.json(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Missing or invalid required field: products (array)',
        },
        { status: 400 }
      );
    }

    // 상점 설정 조회 (체인, 토큰, 수령 주소)
    const merchantConfig = getMerchantConfig();

    // 상품 검증 및 총액 계산
    const productInfos: ProductInfo[] = [];
    let totalAmount = 0;

    for (const item of products) {
      const { productId, quantity = 1 } = item;

      if (!productId) {
        return NextResponse.json(
          {
            success: false,
            code: 'VALIDATION_ERROR',
            message: 'Product ID is required for each item',
          },
          { status: 400 }
        );
      }

      // 상품 조회 (서버 측 가격 검증)
      const product = getProductById(productId);
      if (!product) {
        return NextResponse.json(
          {
            success: false,
            code: 'PRODUCT_NOT_FOUND',
            message: `Product not found: ${productId}`,
          },
          { status: 404 }
        );
      }

      const unitPrice = parseFloat(product.price);
      const subtotal = unitPrice * quantity;
      totalAmount += subtotal;

      productInfos.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: product.price,
        subtotal: subtotal.toString(),
      });
    }

    // orderId 생성 (상점 서버에서 생성)
    const orderId = generateOrderId();

    // 결제 서버에 결제 생성 요청
    // paymentId는 결제 서버에서 생성됨
    // CHAIN_CONFIGS의 모든 필드를 전송 (tokenDecimals 포함)
    const payment = await client.createPayment({
      merchantId: merchantConfig.merchantId,
      orderId: orderId,
      amount: totalAmount,
      currency: merchantConfig.tokenSymbol,
      chainId: merchantConfig.chainId,
      recipientAddress: merchantConfig.recipientAddress,
      tokenAddress: merchantConfig.tokenAddress,
      tokenDecimals: merchantConfig.tokenDecimals,
    });

    // 클라이언트에 결제 정보 반환
    return NextResponse.json(
      {
        success: true,
        // 결제 서버에서 생성된 paymentId
        paymentId: payment.paymentId,
        // 상점 서버에서 생성된 orderId
        orderId: orderId,
        // 상품 정보 (배열)
        products: productInfos,
        // 결제 정보 (상점 설정 기반)
        totalAmount: totalAmount.toString(),
        chainId: merchantConfig.chainId,
        tokenSymbol: merchantConfig.tokenSymbol,
        tokenAddress: merchantConfig.tokenAddress,
        decimals: merchantConfig.tokenDecimals,
        // 결제 컨트랙트 정보 (결제 서버 응답)
        gatewayAddress: payment.gatewayAddress,
        forwarderAddress: payment.forwarderAddress,
        recipientAddress: merchantConfig.recipientAddress,
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as Record<string, unknown>)?.code || 'INTERNAL_ERROR';

    // SDK 에러 코드 처리
    if (errorCode === 'UNSUPPORTED_CHAIN' || errorCode === 'UNSUPPORTED_TOKEN') {
      return NextResponse.json(
        {
          success: false,
          code: errorCode,
          message: errorMessage,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        code: 'INTERNAL_ERROR',
        message: errorMessage,
      },
      { status: 500 }
    );
  }
}
