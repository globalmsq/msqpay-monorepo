"use client";

import { useState, useRef, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useChainId } from "wagmi";
import { ProductCard } from "@/components/ProductCard";
import { PaymentHistory, PaymentHistoryRef } from "@/components/PaymentHistory";
import { Toast } from "@/components/Toast";
import { DEFAULT_TOKEN_SYMBOL, TOKENS } from "@/lib/wagmi";
import { PAYMENT_HISTORY_REFRESH_DELAY } from "@/lib/constants";
import { PRODUCTS } from "@/lib/products";

export default function Home() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const tokenSymbol = DEFAULT_TOKEN_SYMBOL[chainId] || "TOKEN";
  const tokenAddress = TOKENS[chainId]?.[tokenSymbol];
  const isLocalhost = chainId === 31337;

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // PaymentHistory ref for refresh
  const paymentHistoryRef = useRef<PaymentHistoryRef>(null);

  // Handle payment success
  const handlePaymentSuccess = useCallback((txHash: string) => {
    setToast({ message: "Payment successful!", type: "success" });
    // Refresh payment history after a short delay to allow blockchain to update
    setTimeout(() => {
      paymentHistoryRef.current?.refresh();
    }, PAYMENT_HISTORY_REFRESH_DELAY);
  }, []);

  return (
    <main className="min-h-screen p-8">
      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Header */}
      <header className="flex justify-between items-center mb-12">
        <div>
          <h1 className="text-3xl font-bold text-primary-600">MSQ Pay Demo</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Blockchain Payment Gateway - {isLocalhost ? "Localhost (Hardhat)" : "Polygon Amoy Testnet"}
          </p>
        </div>
        <ConnectButton />
      </header>

      {/* Main content */}
      <div className="max-w-7xl mx-auto">
        {/* Info banner */}
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-8">
          <h2 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
            How it works
          </h2>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>
              • <strong>Direct Payment:</strong> You pay gas fees with {isLocalhost ? "ETH" : "MATIC"}
            </li>
            <li>
              • <strong>Gasless Payment:</strong> Service covers gas - just sign!
            </li>
            <li>
              • <strong>Token:</strong> {tokenSymbol} ({isLocalhost ? "Test Token on Localhost" : "Test Token on Polygon Amoy"})
            </li>
          </ul>
        </div>

        {/* Products grid */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Products</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {PRODUCTS.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                disabled={!isConnected}
                onPaymentSuccess={handlePaymentSuccess}
              />
            ))}
          </div>
        </section>

        {/* Payment history */}
        {isConnected && (
          <section>
            <h2 className="text-2xl font-semibold mb-6">Your Payment History</h2>
            <PaymentHistory ref={paymentHistoryRef} />
          </section>
        )}

        {/* Not connected message */}
        {!isConnected && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Connect your wallet to start making payments
            </p>
            <ConnectButton />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="mt-16 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>MSQ Pay Demo - {isLocalhost ? "Localhost (Hardhat)" : "Polygon Amoy Testnet"}</p>
        <p className="mt-1">
          {tokenSymbol} Token:{" "}
          {isLocalhost ? (
            <span className="text-primary-600">{tokenAddress}</span>
          ) : (
            <a
              href={`https://amoy.polygonscan.com/address/${tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:underline"
            >
              {tokenAddress?.slice(0, 6)}...{tokenAddress?.slice(-4)}
            </a>
          )}
        </p>
      </footer>
    </main>
  );
}
