import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { arcTestnet } from "@/config/wagmi";

export interface Transaction {
  hash: string;
  type: "swap" | "add_liquidity" | "remove_liquidity" | "deposit" | "withdraw" | "approve";
  description: string;
  timestamp: number;
  status: "pending" | "confirmed" | "failed";
}

export const getExplorerTxUrl = (hash: string) =>
  `${arcTestnet.blockExplorers.default.url}/tx/${hash}`;

export const getExplorerAddressUrl = (address: string) =>
  `${arcTestnet.blockExplorers.default.url}/address/${address}`;

const storageKeyFor = (wallet: string) => `lunex:${wallet.toLowerCase()}:transactions`;

function loadLocalTransactions(wallet: string): Transaction[] {
  try {
    const raw = localStorage.getItem(storageKeyFor(wallet));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalTransactions(wallet: string, txs: Transaction[]) {
  localStorage.setItem(storageKeyFor(wallet), JSON.stringify(txs.slice(0, 50)));
}

export const useTransactionHistory = () => {
  const { address } = useAccount();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const fetchTxs = useCallback(async () => {
    if (!address) { setTransactions([]); return; }
    setTransactions(loadLocalTransactions(address));
  }, [address]);

  useEffect(() => { fetchTxs(); }, [fetchTxs]);

  const addTransaction = useCallback(async (tx: Omit<Transaction, "timestamp" | "status">) => {
    if (!address) return;
    const newTx: Transaction = { ...tx, timestamp: Date.now(), status: "pending" };
    setTransactions((prev) => {
      const next = [newTx, ...prev.filter((existing) => existing.hash.toLowerCase() !== tx.hash.toLowerCase())].slice(0, 50);
      saveLocalTransactions(address, next);
      return next;
    });
  }, [address]);

  const updateTransaction = useCallback(async (hash: string, status: Transaction["status"]) => {
    if (!address) return;
    setTransactions((prev) => {
      const next = prev.map((tx) => (tx.hash.toLowerCase() === hash.toLowerCase() ? { ...tx, status } : tx));
      saveLocalTransactions(address, next);
      return next;
    });
  }, [address]);

  const clearHistory = useCallback(async () => {
    if (!address) return;
    setTransactions([]);
    localStorage.removeItem(storageKeyFor(address));
  }, [address]);

  return { transactions, addTransaction, updateTransaction, clearHistory };
};
