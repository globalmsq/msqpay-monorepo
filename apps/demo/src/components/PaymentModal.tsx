"use client";

import { useState, useEffect, useCallback } from "react";
import {
  useAccount,
  useWalletClient,
  useReadContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, encodeFunctionData, maxUint256, type Address } from "viem";
import { getPaymentStatus, checkout, submitGaslessPayment, waitForRelayTransaction } from "@/lib/api";
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

// ERC2771Forwarder ABI - only nonces function needed for gasless payments
const FORWARDER_ABI = [
  {
    type: "function",
    name: "nonces",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
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

// Inline CopyButton component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

export function PaymentModal({
  product,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

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
  const [relayRequestId, setRelayRequestId] = useState<string | null>(null);
  // ⚠️ SECURITY: serverConfig contains server-verified price (not from client)
  const [serverConfig, setServerConfig] = useState<CheckoutResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState<boolean>(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // ⚠️ SECURITY: Use server-verified totalAmount, decimals, tokenAddress, and tokenSymbol
  // All values are set after checkout API returns server-verified data
  const decimals = serverConfig?.decimals ?? 18; // Default to 18 if not yet loaded
  const amount = serverConfig ? parseUnits(serverConfig.totalAmount, decimals) : parseUnits(product.price, decimals);
  // Token address and symbol from server (no more client-side lookup)
  const tokenAddress = serverConfig?.tokenAddress as Address | undefined;
  const tokenSymbol = serverConfig?.tokenSymbol ?? "TOKEN";

  // Load server configuration on mount
  // ⚠️ SECURITY: Only productId is sent, NOT amount, NOT chainId!
  // Server looks up price and chainId from product config
  useEffect(() => {
    const loadServerConfig = async () => {
      if (!address) return;

      setIsLoadingConfig(true);
      setConfigError(null);

      try {
        // ⚠️ SECURITY: Call checkout with products array only
        // Server will look up prices and chainId from product config
        const response = await checkout({
          products: [{ productId: product.id, quantity: 1 }],  // ✅ Only products array sent
          // ❌ amount is NOT sent - server calculates it!
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
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!tokenAddress,
    },
  });

  // Read token allowance using wagmi hook (MetaMask handles RPC)
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && serverConfig ? [address, serverConfig.gatewayAddress as Address] : undefined,
    query: {
      enabled: !!address && !!tokenAddress && !!serverConfig,
    },
  });

  // Refetch allowance when modal opens (after serverConfig loads)
  // This ensures we have fresh allowance data, not stale cache
  useEffect(() => {
    if (serverConfig && address && tokenAddress) {
      refetchAllowance();
    }
  }, [serverConfig, address, tokenAddress, refetchAllowance]);

  // Read user's nonce from Forwarder contract for gasless payments (MetaMask handles RPC)
  const { data: forwarderNonce, refetch: refetchNonce } = useReadContract({
    address: serverConfig?.forwarderAddress as Address,
    abi: FORWARDER_ABI,
    functionName: "nonces",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address && !!serverConfig?.forwarderAddress,
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
    if (!serverConfig) {
      throw new Error('Server configuration not loaded');
    }

    const maxAttempts = 30;
    const interval = 2000; // 2 seconds

    for (let i = 0; i < maxAttempts; i++) {
      const response = await getPaymentStatus(paymentId);

      if (response.success && response.data) {
        if (response.data.status === 'CONFIRMED' || response.data.status === 'completed') {
          return;
        }
        if (response.data.status === 'FAILED' || response.data.status === 'failed') {
          throw new Error('Payment failed on server');
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error('Payment confirmation timeout');
  }, [serverConfig]);

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

  // paymentId는 이제 결제 서버에서 생성됨
  // serverConfig.paymentId를 사용

  // Handle token approval
  const handleApprove = async () => {
    if (!walletClient || !address || !tokenAddress || !serverConfig) return;

    try {
      setStatus("approving");
      setError(null);

      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [serverConfig.gatewayAddress as Address, maxUint256],
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
    if (!walletClient || !address || !tokenAddress || !serverConfig) return;

    try {
      setStatus("paying");
      setError(null);

      // paymentId는 결제 서버에서 생성된 값 사용
      const paymentId = serverConfig.paymentId as `0x${string}`;
      setCurrentPaymentId(paymentId);

      // 1. Send payment TX to Contract
      const hash = await walletClient.writeContract({
        address: serverConfig.gatewayAddress as Address,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: "pay",
        args: [
          paymentId,
          tokenAddress,
          amount,
          serverConfig.recipientAddress as Address,
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
      // Don't auto-close - let user view details and close manually
    } catch (err: unknown) {
      console.error("Payment error:", err);
      const message = err instanceof Error ? err.message : "Payment failed";
      setError(message);
      setStatus("error");
    }
  };

  // Handle gasless payment (meta-transaction)
  const handleGaslessPayment = async () => {
    if (!walletClient || !address || !tokenAddress || !serverConfig) return;

    try {
      setStatus("paying");
      setError(null);

      // Refetch nonce to ensure we have the latest value
      const { data: freshNonce } = await refetchNonce();
      if (freshNonce === undefined) {
        throw new Error('Failed to fetch nonce from Forwarder contract');
      }
      const nonce = freshNonce;

      // paymentId는 결제 서버에서 생성된 값 사용
      const paymentId = serverConfig.paymentId as `0x${string}`;
      setCurrentPaymentId(paymentId);

      // 1. Encode the PaymentGateway.pay() function call
      const payCallData = encodeFunctionData({
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'pay',
        args: [
          paymentId,
          tokenAddress,
          amount,
          serverConfig.recipientAddress as Address,
        ],
      });

      // 2. Create EIP-712 typed data for gasless payment forward request
      // OZ ERC2771Forwarder expects: ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint48 deadline,bytes data)
      const domain = {
        name: 'MSQPayForwarder',  // Must match deployed contract name
        version: '1',
        chainId: BigInt(serverConfig.chainId),
        verifyingContract: serverConfig.forwarderAddress as Address,
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint48' },  // uint48 per OZ spec
          { name: 'data', type: 'bytes' },
        ],
      };

      // deadline: 10 minutes from now (as uint48)
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      const forwardMessage = {
        from: address,
        to: serverConfig.gatewayAddress as Address,
        value: BigInt(0),
        gas: BigInt(300000), // Estimated gas for payment
        nonce,
        deadline,
        data: payCallData,  // Encoded pay() function call
      };

      // 3. Request EIP-712 signature from user
      const signature = await walletClient.signTypedData({
        domain,
        types,
        primaryType: 'ForwardRequest',
        message: forwardMessage,
      });

      // 4. Create ForwardRequest with signature for relay
      const forwardRequest = {
        from: address,
        to: serverConfig.gatewayAddress,
        value: '0',
        gas: '300000',
        deadline: deadline.toString(),
        data: payCallData,
        signature,
      };

      // 5. Submit to OZ Defender relay via our gasless API
      const submitResponse = await submitGaslessPayment(
        paymentId,
        serverConfig.forwarderAddress,
        forwardRequest
      );

      if (!submitResponse.success || !submitResponse.data) {
        throw new Error(submitResponse.message || 'Failed to submit gasless payment');
      }

      setRelayRequestId(submitResponse.data.relayRequestId);

      // 6. Wait for relay transaction to be mined
      const relayResult = await waitForRelayTransaction(submitResponse.data.relayRequestId);

      if (relayResult.status === 'failed') {
        throw new Error('Gasless payment relay failed');
      }

      // 7. Verify payment via server (Contract = Source of Truth)
      // Server queries contract.processedPayments[paymentId] or PaymentProcessed event
      await pollPaymentStatus(paymentId);

      // 8. Payment confirmed by server
      setPendingTxHash(relayResult.transactionHash as Address | undefined);
      setStatus("success");

      if (onSuccess && relayResult.transactionHash) {
        onSuccess(relayResult.transactionHash);
      }
      // Don't auto-close - let user view details and close manually
    } catch (err: unknown) {
      console.error("Gasless payment error:", err);
      const message = err instanceof Error ? err.message : "Gasless payment failed";
      setError(message);
      setStatus("error");
    }
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
                {product.price} {tokenSymbol}
              </span>
            </div>
          </div>

          {/* Balance info */}
          <div className="text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Your {tokenSymbol} Balance:</span>
              <span className={hasInsufficientBalance ? "text-red-500" : ""}>
                {formatUnits(currentBalance, decimals)} {tokenSymbol}
              </span>
            </div>
            {hasInsufficientBalance && (
              <p className="text-red-500 text-xs mt-1">Insufficient balance</p>
            )}
          </div>

          {/* Gas mode selector - hide on success */}
          {status !== "success" && (
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
          )}

          {/* Error message */}
          {(error || configError) && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
              {error || configError}
            </div>
          )}

          {/* Success message with payment details */}
          {status === "success" && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-700 dark:text-green-300 font-semibold">
                  Payment Successful!
                </p>
              </div>

              {/* Payment Details */}
              <div className="space-y-2 text-xs">
                {/* Payment Type Badge */}
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 dark:text-gray-400">Payment Type:</span>
                  <span className={`px-2 py-0.5 rounded-full font-medium ${
                    gasMode === "gasless"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}>
                    {gasMode === "gasless" ? "Gasless (Meta-TX)" : "Direct"}
                  </span>
                </div>

                {/* Amount */}
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Amount:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {serverConfig?.totalAmount} {tokenSymbol}
                  </span>
                </div>

                {/* Payment ID */}
                {currentPaymentId && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Payment ID:</span>
                    <span className="flex items-center">
                      <span className="font-mono text-gray-900 dark:text-gray-100" title={currentPaymentId}>
                        {currentPaymentId.slice(0, 10)}...{currentPaymentId.slice(-8)}
                      </span>
                      <CopyButton text={currentPaymentId} />
                    </span>
                  </div>
                )}

                {/* Transaction Hash */}
                {pendingTxHash && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">TX Hash:</span>
                    <span className="flex items-center">
                      <span className="font-mono text-gray-900 dark:text-gray-100" title={pendingTxHash}>
                        {pendingTxHash.slice(0, 10)}...{pendingTxHash.slice(-8)}
                      </span>
                      <CopyButton text={pendingTxHash} />
                    </span>
                  </div>
                )}

                {/* Relay Request ID (Gasless only) */}
                {gasMode === "gasless" && relayRequestId && (
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 dark:text-gray-400">Relay ID:</span>
                    <span className="flex items-center">
                      <span className="font-mono text-gray-900 dark:text-gray-100" title={relayRequestId}>
                        {relayRequestId.slice(0, 10)}...{relayRequestId.slice(-8)}
                      </span>
                      <CopyButton text={relayRequestId} />
                    </span>
                  </div>
                )}

                {/* Gas Info */}
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Gas Paid By:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {gasMode === "gasless" ? "Relayer (Free for you)" : "You"}
                  </span>
                </div>

                {/* Chain Info */}
                {serverConfig?.chainId && (
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Network:</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Chain ID: {serverConfig.chainId}
                    </span>
                  </div>
                )}
              </div>

              {/* View on Explorer Link */}
              {pendingTxHash && (
                <a
                  href={serverConfig?.chainId === 31337
                    ? `#`
                    : `https://amoy.polygonscan.com/tx/${pendingTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-primary-600 hover:underline pt-2 border-t border-green-200 dark:border-green-800"
                >
                  {serverConfig?.chainId === 31337 ? "Local Network (No Explorer)" : "View on Explorer →"}
                </a>
              )}
            </div>
          )}

          {/* Action buttons */}
          {status !== "success" && (
            <div className="space-y-3">
              {/* Approval button - required for both direct and gasless modes */}
              {needsApproval && (
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
                    : `Approve ${tokenSymbol}`}
                </button>
              )}

              {/* Payment button */}
              <button
                onClick={handlePayment}
                disabled={
                  hasInsufficientBalance ||
                  needsApproval ||
                  status === "paying" ||
                  isLoading
                }
                className="w-full py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {status === "paying"
                  ? "Processing..."
                  : `Pay ${product.price} ${tokenSymbol}`}
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
