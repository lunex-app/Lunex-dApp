import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { arcTestnet } from "@/config/wagmi";
import { supabase } from "@/integrations/supabase/client";

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

export const useTransactionHistory = () => {
  const { address } = useAccount();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const fetchTxs = useCallback(async () => {
    if (!address) { setTransactions([]); return; }
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("wallet_address", address.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) {
      setTransactions(data.map((r) => ({
        hash: r.tx_hash,
        type: r.type as Transaction["type"],
        description: (r.data as any)?.description || "",
        timestamp: new Date(r.created_at).getTime(),
        status: r.status as Transaction["status"],
      })));
    }
  }, [address]);

  useEffect(() => { fetchTxs(); }, [fetchTxs]);

  const addTransaction = useCallback(async (tx: Omit<Transaction, "timestamp" | "status">) => {
    if (!address) return;
    const now = new Date();
    const newTx: Transaction = { ...tx, timestamp: now.getTime(), status: "pending" };
    setTransactions((prev) => [newTx, ...prev]);
    await supabase.from("transactions").insert({
      wallet_address: address.toLowerCase(),
      type: tx.type,
      section: tx.type === "swap" ? "swap" : tx.type.includes("liquidity") ? "pool" : "yield",
      tx_hash: tx.hash,
      data: { description: tx.description } as any,
      created_at: now.toISOString(),
      status: "pending",
    });
  }, [address]);

  const updateTransaction = useCallback(async (hash: string, status: Transaction["status"]) => {
    setTransactions((prev) => prev.map((tx) => (tx.hash === hash ? { ...tx, status } : tx)));
    await supabase
      .from("transactions")
      .update({ status })
      .eq("tx_hash", hash);
  }, []);

  const clearHistory = useCallback(async () => {
    if (!address) return;
    setTransactions([]);
    await supabase
      .from("transactions")
      .delete()
      .eq("wallet_address", address.toLowerCase());
  }, [address]);

  return { transactions, addTransaction, updateTransaction, clearHistory };
};
