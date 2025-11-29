"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { useAccount, useChainId } from "wagmi";
import { formatUnits } from "viem";
import { getTokenForChain } from "@/lib/wagmi";
import { getPaymentHistory, PaymentHistoryItem } from "@/lib/api";
import { truncateAddress, truncateHash, formatTimestamp } from "@/lib/utils";

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

  const token = getTokenForChain(chainId);

  // Fetch payments from Payment API
  const fetchPayments = async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const response = await getPaymentHistory(address);

      if (response.success && response.data) {
        setPayments(response.data);
      } else {
        setError(response.message || "Failed to fetch payments");
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch payments");
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
          <div className="space-y-3">
            {payments.map((payment) => (
              <div
                key={payment.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-3"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <span className="font-semibold">
                      {formatUnits(BigInt(payment.amount), 18)} {token?.symbol || "TOKEN"}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatTimestamp(payment.timestamp)}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <div>To: {truncateAddress(payment.merchant)}</div>
                  <div className="text-xs">
                    Payment ID: {truncateHash(payment.paymentId)}
                  </div>
                </div>
                {getExplorerUrl(payment.transactionHash) ? (
                  <a
                    href={getExplorerUrl(payment.transactionHash)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary-600 hover:underline"
                  >
                    View Transaction →
                  </a>
                ) : (
                  <span className="text-xs text-gray-400">
                    Tx: {truncateAddress(payment.transactionHash)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
