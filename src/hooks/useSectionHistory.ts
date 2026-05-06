import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount } from "wagmi";
import { supabase } from "@/integrations/supabase/client";

export interface SectionTx {
  txHash: string;
  type: string;
  timestamp: number;
  data: Record<string, string>;
}

export function useSectionHistory(section: string) {
  const { address } = useAccount();
  const [txs, setTxs] = useState<SectionTx[]>([]);
  const knownTxHashesRef = useRef<Set<string>>(new Set());

  const fetchTxs = useCallback(async () => {
    if (!address) {
      knownTxHashesRef.current.clear();
      setTxs([]);
      return;
    }

    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("wallet_address", address.toLowerCase())
      .eq("section", section)
      .order("created_at", { ascending: false })
      .limit(20);

    if (data) {
      const seen = new Set<string>();
      const deduped = data.filter((row) => {
        const key = row.tx_hash.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      knownTxHashesRef.current = seen;
      setTxs(
        deduped.map((r) => ({
          txHash: r.tx_hash,
          type: r.type,
          timestamp: new Date(r.created_at).getTime(),
          data: (r.data as Record<string, string>) || {},
        }))
      );
    }
  }, [address, section]);

  useEffect(() => {
    fetchTxs();
  }, [fetchTxs]);

  const addTx = useCallback(
    async (tx: Omit<SectionTx, "timestamp">) => {
      if (!address) return;

      const normalizedHash = tx.txHash.toLowerCase();
      if (knownTxHashesRef.current.has(normalizedHash)) return;

      const { data: existing } = await supabase
        .from("transactions")
        .select("id")
        .eq("wallet_address", address.toLowerCase())
        .eq("section", section)
        .in("tx_hash", [tx.txHash, normalizedHash])
        .limit(1);

      if (existing && existing.length > 0) {
        knownTxHashesRef.current.add(normalizedHash);
        return;
      }

      const now = new Date();
      const newTx: SectionTx = { ...tx, txHash: normalizedHash, timestamp: now.getTime() };
      knownTxHashesRef.current.add(normalizedHash);

      setTxs((prev) => [newTx, ...prev.filter((p) => p.txHash.toLowerCase() !== normalizedHash)].slice(0, 20));

      await supabase.from("transactions").insert({
        wallet_address: address.toLowerCase(),
        type: tx.type,
        section,
        tx_hash: normalizedHash,
        data: tx.data as any,
        created_at: now.toISOString(),
        status: "confirmed",
      });
    },
    [address, section]
  );

  return { transactions: txs, addTx, refetch: fetchTxs };
}
