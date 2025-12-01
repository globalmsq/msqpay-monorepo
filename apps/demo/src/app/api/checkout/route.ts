/**
 * Checkout API Route
 *
 * ⚠️ SECURITY: This route prevents amount and chain manipulation by:
 * 1. Receiving ONLY productId from client (NOT amount, NOT chainId)
 * 2. Looking up product price AND chainId from server-side constants
 * 3. Calling payment server with verified values
 *
 * Flow:
 * Client → POST /api/checkout { productId } → Server looks up price & chainId → Payment API
 */

import { NextRequest, NextResponse } from 'next/server';
import { MSQPayClient } from '@globalmsq/msqpay';
import { getProductById } from '@/lib/products';
import { DEMO_MERCHANT_ADDRESS } from '@/lib/constants';

// Initialize MSQ Pay SDK client
// Note: MSQPAY_API_URL is server-side only (no NEXT_PUBLIC_ prefix needed)
// Docker sets this to http://server:3001 for container-to-container communication
// Local dev uses 127.0.0.1 (not localhost) to avoid Node.js v17+ IPv6 resolution issues
const client = new MSQPayClient({
  environment: 'custom',
  apiKey: process.env.MSQ_PAY_API_KEY || 'demo-key',
  apiUrl: process.env.MSQPAY_API_URL || 'http://127.0.0.1:3001',
});

interface CheckoutRequest {
  productId: string;
  // ⚠️ SECURITY: chainId is NOT received from client - looked up server-side
}

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body: CheckoutRequest = await request.json();
    const { productId } = body;

    // Validate required fields
    if (!productId) {
      return NextResponse.json(
        {
          success: false,
          code: 'VALIDATION_ERROR',
          message: 'Missing required field: productId',
        },
        { status: 400 }
      );
    }

    // ⚠️ SECURITY: Look up product info from server-side constants
    // NEVER use client-provided amount or chainId!
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

    // Call SDK to create payment with SERVER-VERIFIED price, chainId, and token
    const payment = await client.createPayment({
      amount: parseFloat(product.price), // ✅ Server-side price lookup
      currency: product.token, // ✅ Server-side token lookup (e.g., 'SUT')
      chainId: product.chainId, // ✅ Server-side chainId lookup
      recipientAddress: DEMO_MERCHANT_ADDRESS,
    });

    // Return payment response with product info
    // ⚠️ SECURITY: Spread payment first, then override with server-verified values
    return NextResponse.json(
      {
        ...payment,
        success: true,
        productId: product.id,
        productName: product.name,
        amount: product.price, // ✅ Server-verified price (human-readable)
        decimals: product.decimals, // ✅ Server-verified decimals
        chainId: product.chainId, // ✅ Server-verified chainId
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorCode = (error as Record<string, unknown>)?.code || 'INTERNAL_ERROR';

    // Handle known error codes from SDK
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

    // Generic error response
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
