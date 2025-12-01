"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useWalletClient,
  useChainId,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, keccak256, toHex, type Address } from "viem";
import { getTokenForChain } from "@/lib/wagmi";
import { DEMO_MERCHANT_ADDRESS } from "@/lib/constants";
import { getPaymentStatus, checkout } from "@/lib/api";
import type { CheckoutResponse } from "@/lib/api";

// ERC20 ABI with view functions for balance/allowance queries
const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

const PAYMENT_GATEWAY_ABI = [
  {
    type: "function",
    name: "pay",
    inputs: [
      { name: "paymentId", type: "bytes32" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "merchant", type: "address" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
}

interface PaymentModalProps {
  product: Product;
  onClose: () => void;
  onSuccess?: (txHash: string) => void;
}

type PaymentStatus =
  | "idle"
  | "approving"
  | "approved"
  | "paying"
  | "success"
  | "error";

type GasMode = "direct" | "gasless";

export function PaymentModal({
  product,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const chainId = useChainId();

  const [gasMode, setGasMode] = useState<GasMode>("direct");
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pendingTxHash, setPendingTxHash] = useState<Address | undefined>(
    undefined
  );
  const [approveTxHash, setApproveTxHash] = useState<Address | undefined>(
    undefined
  );
  const [currentPaymentId, setCurrentPaymentId] = useState<string | null>(null);
  // ⚠️ SECURITY: serverConfig contains server-verified price (not from client)
  const [serverConfig, setServerConfig] = useState<CheckoutResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // ⚠️ SECURITY: Use server-verified amount and decimals, NOT product.price from client
  // The amount is set after checkout API returns server-verified price and decimals
  const decimals = serverConfig?.decimals ?? 18; // Default to 18 if not yet loaded
  const amount = serverConfig ? parseUnits(serverConfig.amount, decimals) : parseUnits(product.price, decimals);
  const token = getTokenForChain(chainId);

  // Load server configuration on mount
  // ⚠️ SECURITY: Only productId is sent, NOT amount, NOT chainId!
  // Server looks up price and chainId from product config
  useEffect(() => {
    const loadServerConfig = async () => {
      if (!address) return;

      setIsLoadingConfig(true);
      setConfigError(null);

      try {
        // ⚠️ SECURITY: Call checkout with productId only
        // Server will look up price and chainId from product config
        const response = await checkout({
          productId: product.id,  // ✅ Only productId sent
          // ❌ amount is NOT sent - server looks it up!
          // ❌ chainId is NOT sent - server looks it up!
        });

        if (response.success && response.data) {
          setServerConfig(response.data);
        } else {
          setConfigError(response.message || "Failed to load server configuration");
        }
      } catch (err) {
        setConfigError(err instanceof Error ? err.message : "Failed to load server configuration");
      } finally {
        setIsLoadingConfig(false);
      }
    };

    loadServerConfig();
  }, [address, product.id]);  // ✅ Depend on product.id only

  // Read token balance using wagmi hook (MetaMask handles RPC)
  const { data: balance, isLoading: balanceLoading } = useReadContract({
    address: token?.address as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!token,
    },
  });

  // Read token allowance using wagmi hook (MetaMask handles RPC)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token?.address as Address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && serverConfig ? [address, serverConfig.gatewayAddress as Address] : undefined,
    query: {
      enabled: !!address && !!token && !!serverConfig,
    },
  });

  // Wait for APPROVE transaction confirmation using wagmi hook
  // (Only for approve TX - payment TX is verified via server API)
  const { isLoading: approveTxLoading, isSuccess: approveTxSuccess } =
    useWaitForTransactionReceipt({
      hash: approveTxHash,
    });

  // Poll server for payment status (Contract = Source of Truth)
  const pollPaymentStatus = useCallback(async (paymentId: string): Promise<void> => {
    const maxAttempts = 30;
    const interval = 2000; // 2 seconds

    for (let i = 0; i < maxAttempts; i++) {
      const response = await getPaymentStatus(paymentId);

      if (response.success && response.data) {
        if (response.data.status === 'completed' || response.data.status === 'confirmed') {
          return;
        }
        if (response.data.status === 'failed') {
          throw new Error('Payment failed on server');
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Payment confirmation timeout');
  }, []);

  // Handle APPROVE transaction success
  useEffect(() => {
    if (approveTxSuccess && approveTxHash && status === "approving") {
      refetchAllowance();
      setStatus("approved");
      setApproveTxHash(undefined);
    }
  }, [approveTxSuccess, approveTxHash, status, refetchAllowance]);

  // Update status based on allowance
  useEffect(() => {
    if (allowance !== undefined && allowance >= amount && status === "idle") {
      setStatus("approved");
    }
  }, [allowance, amount, status]);

  // Generate unique payment ID
  const generatePaymentId = () => {
    const orderId = `${product.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return keccak256(toHex(orderId));
  };

  // Handle token approval
  const handleApprove = async () => {
    if (!walletClient || !address || !token || !serverConfig) return;

    try {
      setStatus("approving");
      setError(null);

      const hash = await walletClient.writeContract({
        address: token.address as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [serverConfig.gatewayAddress as Address, amount],
      });

      setApproveTxHash(hash);
    } catch (err: unknown) {
      console.error("Approval error:", err);
      const message = err instanceof Error ? err.message : "Approval failed";
      setError(message);
      setStatus("error");
    }
  };

  // Handle direct payment
  const handleDirectPayment = async () => {
    if (!walletClient || !address || !token || !serverConfig) return;

    try {
      setStatus("paying");
      setError(null);

      const paymentId = generatePaymentId();
      setCurrentPaymentId(paymentId);

      // 1. Send payment TX to Contract
      const hash = await walletClient.writeContract({
        address: serverConfig.gatewayAddress as Address,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: "pay",
        args: [
          paymentId,
          token.address as Address,
          amount,
          DEMO_MERCHANT_ADDRESS as Address,
        ],
      });

      setPendingTxHash(hash);

      // 2. Poll server for payment confirmation (Contract = Source of Truth)
      // Server queries contract.processedPayments[paymentId] to verify
      await pollPaymentStatus(paymentId);

      // 3. Payment confirmed by server
      setStatus("success");
      if (onSuccess) {
        onSuccess(hash);
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: unknown) {
      console.error("Payment error:", err);
      const message = err instanceof Error ? err.message : "Payment failed";
      setError(message);
      setStatus("error");
    }
  };

  // Handle gasless payment (meta-transaction)
  const handleGaslessPayment = async () => {
    // TODO: Implement meta-transaction flow
    // This requires:
    // 1. Get nonce from forwarder
    // 2. Create EIP-712 typed data
    // 3. Request signature from user
    // 4. Submit to OZ Defender relay
    setError("Gasless payments coming soon! Use direct payment for now.");
  };

  const handlePayment = () => {
    if (gasMode === "direct") {
      handleDirectPayment();
    } else {
      handleGaslessPayment();
    }
  };

  const currentBalance = balance ?? BigInt(0);
  const currentAllowance = allowance ?? BigInt(0);
  const hasInsufficientBalance = currentBalance < amount;
  const needsApproval = currentAllowance < amount;
  const isLoading = balanceLoading || approveTxLoading || isLoadingConfig;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Checkout</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Order summary */}
          <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4">
            <h3 className="font-medium mb-2">Order Summary</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {product.name}
              </span>
              <span className="font-semibold">
                {product.price} {token?.symbol || "TOKEN"}
              </span>
            </div>
          </div>

          {/* Balance info */}
          <div className="text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Your {token?.symbol || "TOKEN"} Balance:</span>
              <span className={hasInsufficientBalance ? "text-red-500" : ""}>
                {formatUnits(currentBalance, decimals)} {token?.symbol || "TOKEN"}
              </span>
            </div>
            {hasInsufficientBalance && (
              <p className="text-red-500 text-xs mt-1">Insufficient balance</p>
            )}
          </div>

          {/* Gas mode selector */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setGasMode("direct")}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  gasMode === "direct"
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="font-medium text-sm">Direct</div>
                <div className="text-xs text-gray-500">You pay gas</div>
              </button>
              <button
                onClick={() => setGasMode("gasless")}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  gasMode === "gasless"
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-900/20"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="font-medium text-sm">Gasless</div>
                <div className="text-xs text-gray-500">Just sign</div>
              </button>
            </div>
          </div>

          {/* Error message */}
          {(error || configError) && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {error || configError}
            </div>
          )}

          {/* Success message */}
          {status === "success" && pendingTxHash && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Payment successful!
              </p>
              <a
                href={`https://amoy.polygonscan.com/tx/${pendingTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 hover:underline"
              >
                View on PolygonScan →
              </a>
            </div>
          )}

          {/* Action buttons */}
          {status !== "success" && (
            <div className="space-y-3">
              {/* Approval button */}
              {needsApproval && gasMode === "direct" && (
                <button
                  onClick={handleApprove}
                  disabled={
                    status === "approving" ||
                    isLoading ||
                    hasInsufficientBalance
                  }
                  className="w-full py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {status === "approving"
                    ? "Approving..."
                    : `Approve ${product.price} ${token?.symbol || "TOKEN"}`}
                </button>
              )}

              {/* Payment button */}
              <button
                onClick={handlePayment}
                disabled={
                  hasInsufficientBalance ||
                  (needsApproval && gasMode === "direct") ||
                  status === "paying" ||
                  isLoading
                }
                className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {status === "paying"
                  ? "Processing..."
                  : `Pay ${product.price} ${token?.symbol || "TOKEN"}`}
              </button>
            </div>
          )}

          {/* Close button on success */}
          {status === "success" && (
            <button
              onClick={onClose}
              className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
