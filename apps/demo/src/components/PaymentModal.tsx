"use client";

import { useState, useEffect } from "react";
import { useAccount, useWalletClient, usePublicClient, useChainId } from "wagmi";
import { parseUnits, formatUnits, keccak256, toHex } from "viem";
import { getTokenForChain, getContractsForChain } from "@/lib/wagmi";
import { DEMO_MERCHANT_ADDRESS } from "@/lib/constants";

// Simplified ABI for demo
const ERC20_ABI = [
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
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
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
  | "checking"
  | "approving"
  | "approved"
  | "paying"
  | "success"
  | "error";

type GasMode = "direct" | "gasless";


export function PaymentModal({ product, onClose, onSuccess }: PaymentModalProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  const [gasMode, setGasMode] = useState<GasMode>("direct");
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint>(BigInt(0));
  const [allowance, setAllowance] = useState<bigint>(BigInt(0));

  const amount = parseUnits(product.price, 18);
  const token = getTokenForChain(chainId);
  const contracts = getContractsForChain(chainId);

  // Check balance and allowance on mount
  useEffect(() => {
    async function checkBalanceAndAllowance() {
      if (!address || !publicClient || !token || !contracts) return;

      try {
        setStatus("checking");

        const [bal, allow] = await Promise.all([
          publicClient.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          }),
          publicClient.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [address, contracts.gateway],
          }),
        ]);

        setBalance(bal as bigint);
        setAllowance(allow as bigint);
        setStatus(allow >= amount ? "approved" : "idle");
      } catch (err) {
        console.error("Error checking balance:", err);
        setStatus("idle");
      }
    }

    checkBalanceAndAllowance();
  }, [address, publicClient, amount, token, contracts]);

  // Generate unique payment ID
  const generatePaymentId = () => {
    const orderId = `${product.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return keccak256(toHex(orderId));
  };

  // Handle token approval
  const handleApprove = async () => {
    if (!walletClient || !address || !token || !contracts) return;

    try {
      setStatus("approving");
      setError(null);

      const hash = await walletClient.writeContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [contracts.gateway, amount],
      });

      // Wait for confirmation
      await publicClient?.waitForTransactionReceipt({ hash });

      setAllowance(amount);
      setStatus("approved");
    } catch (err: any) {
      console.error("Approval error:", err);
      setError(err.message || "Approval failed");
      setStatus("error");
    }
  };

  // Handle direct payment
  const handleDirectPayment = async () => {
    if (!walletClient || !address || !publicClient || !token || !contracts) return;

    try {
      setStatus("paying");
      setError(null);

      const paymentId = generatePaymentId();

      const hash = await walletClient.writeContract({
        address: contracts.gateway,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: "pay",
        args: [paymentId, token.address, amount, DEMO_MERCHANT_ADDRESS],
      });

      setTxHash(hash);

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash });

      setStatus("success");

      // Call onSuccess callback and close modal after a short delay
      if (onSuccess) {
        onSuccess(hash);
      }
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error("Payment error:", err);
      setError(err.message || "Payment failed");
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

  const hasInsufficientBalance = balance < amount;
  const needsApproval = allowance < amount;

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
              <span className="font-semibold">{product.price} {token?.symbol || "TOKEN"}</span>
            </div>
          </div>

          {/* Balance info */}
          <div className="text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Your {token?.symbol || "TOKEN"} Balance:</span>
              <span className={hasInsufficientBalance ? "text-red-500" : ""}>
                {formatUnits(balance, 18)} {token?.symbol || "TOKEN"}
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
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {/* Success message */}
          {status === "success" && txHash && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Payment successful!
              </p>
              <a
                href={`https://amoy.polygonscan.com/tx/${txHash}`}
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
                    status === "checking" ||
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
                  status === "checking"
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
