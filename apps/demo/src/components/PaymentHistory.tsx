"use client";

import { useState, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { useAccount, useChainId } from "wagmi";
import { formatUnits } from "viem";
import { getPaymentHistory, PaymentHistoryItem } from "@/lib/api";
import { formatTimestamp } from "@/lib/utils";

// Inline CopyButton component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="ml-1 p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors inline-flex flex-shrink-0"
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

// Address display with copy button - shows more characters
function AddressWithCopy({ address, label }: { address: string; label: string }) {
  // Show first 10 and last 8 characters for better readability
  const displayAddress = `${address.slice(0, 10)}...${address.slice(-8)}`;

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500 dark:text-gray-400 mr-2">{label}</span>
      <span className="flex items-center font-mono text-gray-700 dark:text-gray-300">
        {displayAddress}
        <CopyButton text={address} />
      </span>
    </div>
  );
}

// Ref type for parent component
export interface PaymentHistoryRef {
  refresh: () => Promise<void>;
}

export const PaymentHistory = forwardRef<PaymentHistoryRef>(function PaymentHistory(_, ref) {
  const { address } = useAccount();
  const chainId = useChainId();
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch payments from Payment API
  const fetchPayments = async () => {
    if (!address || !chainId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await getPaymentHistory(address, chainId);

      if (response.success && response.data) {
        setPayments(response.data);
      } else {
        setError(response.message || "Failed to fetch payments");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch payments";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Expose refresh method to parent via ref
  useImperativeHandle(ref, () => ({
    refresh: fetchPayments,
  }));

  // Auto-fetch on mount and when address changes
  useEffect(() => {
    if (address) {
      fetchPayments();
    }
  }, [address, chainId]);

  const getExplorerUrl = (txHash: string) => {
    if (chainId === 31337) {
      return null; // No explorer for localhost
    }
    return `https://amoy.polygonscan.com/tx/${txHash}`;
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Recent Payments</h3>
          <p className="text-xs text-gray-500">
            From Payment API
          </p>
        </div>
        <button
          onClick={fetchPayments}
          disabled={loading}
          className="px-3 py-1 text-sm bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300 rounded-lg hover:bg-primary-200 disabled:opacity-50 transition-colors"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      <div className="p-4">
        {error && (
          <div className="text-center text-red-500 py-4 text-sm">{error}</div>
        )}

        {payments.length === 0 && !loading && !error && (
          <p className="text-center text-gray-500 dark:text-gray-400 py-4">
            No payments found yet.
          </p>
        )}

        {payments.length > 0 && (
          <div className="space-y-4">
            {payments.map((payment) => (
              <div
                key={payment.paymentId}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-primary-300 dark:hover:border-primary-700 transition-colors"
              >
                {/* Header: Badge + Timestamp */}
                <div className="flex justify-between items-center mb-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    payment.isGasless
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  }`}>
                    {payment.isGasless ? "Gasless" : "Direct"}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatTimestamp(payment.timestamp)}
                  </span>
                </div>

                {/* Amount */}
                <div className="mb-3">
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {formatUnits(BigInt(payment.amount), payment.decimals || 18)} {payment.tokenSymbol || "TOKEN"}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-2 mb-3">
                  <AddressWithCopy address={payment.merchant} label="To" />
                  <AddressWithCopy address={payment.paymentId} label="Payment ID" />
                  <AddressWithCopy address={payment.transactionHash} label="TX Hash" />
                  {payment.isGasless && payment.relayId && (
                    <AddressWithCopy address={payment.relayId} label="Relay ID" />
                  )}
                </div>

                {/* Explorer link */}
                {getExplorerUrl(payment.transactionHash) && (
                  <a
                    href={getExplorerUrl(payment.transactionHash)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline"
                  >
                    View on Explorer →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
