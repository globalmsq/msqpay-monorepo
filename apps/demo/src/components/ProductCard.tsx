"use client";

import { useState } from "react";
import { PaymentModal } from "./PaymentModal";

/**
 * 상품 인터페이스
 * 체인/토큰 정보는 상점 설정에서 관리 (products.ts 참조)
 */
interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  image?: string;
}

interface ProductCardProps {
  product: Product;
  tokenSymbol: string;
  disabled?: boolean;
  onPaymentSuccess?: (txHash: string) => void;
}

/**
 * 상품 카드 컴포넌트
 *
 * 가격 표시:
 * - 상품 가격은 상점 토큰 단위로 표시
 * - 실제 토큰 심볼은 checkout 시점에 서버에서 제공
 * - 여기서는 단순히 숫자만 표시 (단위 없음)
 */
export function ProductCard({ product, tokenSymbol, disabled, onPaymentSuccess }: ProductCardProps) {
  const [showPayment, setShowPayment] = useState(false);

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-shadow">
        {/* Product image placeholder */}
        <div className="h-48 bg-gradient-to-br from-primary-100 to-primary-200 dark:from-primary-900 dark:to-primary-800 flex items-center justify-center">
          <span className="text-6xl">
            {product.id === "product-1" && "🎨"}
            {product.id === "product-2" && "⭐"}
            {product.id === "product-3" && "🎮"}
            {product.id === "product-4" && "🖼️"}
          </span>
        </div>

        {/* Product info */}
        <div className="p-4">
          <h3 className="font-semibold text-lg mb-1">{product.name}</h3>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
            {product.description}
          </p>

          <div className="flex justify-between items-center">
            <div className="text-xl font-bold text-primary-600">
              {product.price} {tokenSymbol}
            </div>
            <button
              onClick={() => setShowPayment(true)}
              disabled={disabled}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Buy Now
            </button>
          </div>
        </div>
      </div>

      {/* Payment modal */}
      {showPayment && (
        <PaymentModal
          product={product}
          onClose={() => setShowPayment(false)}
          onSuccess={onPaymentSuccess}
        />
      )}
    </>
  );
}
