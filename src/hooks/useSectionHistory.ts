import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@/context/WalletProvider";

export interface SectionTx {
  txHash: string;
  type: string;
  timestamp: number;
  data: Record<string, string>;
}

const storageKeyFor = (wallet: string, section: string) =>
  `lunex:${wallet.toLowerCase()}:history:${section}`;

function loadLocalHistory(wallet: string, section: string): SectionTx[] {
  try {
    const raw = localStorage.getItem(storageKeyFor(wallet, section));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(wallet: string, section: string, txs: SectionTx[]) {
  localStorage.setItem(storageKeyFor(wallet, section), JSON.stringify(txs.slice(0, 20)));
}

export function useSectionHistory(section: string) {
  const { address } = useWallet();
  const [txs, setTxs] = useState<SectionTx[]>([]);
  const knownTxHashesRef = useRef<Set<string>>(new Set());

  const fetchTxs = useCallback(async () => {
    if (!address) {
      knownTxHashesRef.current.clear();
      setTxs([]);
      return;
    }

    const localTxs = loadLocalHistory(address, section);
    knownTxHashesRef.current = new Set(localTxs.map((tx) => tx.txHash.toLowerCase()));
    setTxs(localTxs);
  }, [address, section]);

  useEffect(() => {
    fetchTxs();
  }, [fetchTxs]);

  const addTx = useCallback(
    async (tx: Omit<SectionTx, "timestamp">) => {
      if (!address) return;

      const normalizedHash = tx.txHash.toLowerCase();
      if (knownTxHashesRef.current.has(normalizedHash)) return;

      const newTx: SectionTx = { ...tx, txHash: normalizedHash, timestamp: Date.now() };
      knownTxHashesRef.current.add(normalizedHash);

      setTxs((prev) => {
        const next = [newTx, ...prev.filter((p) => p.txHash.toLowerCase() !== normalizedHash)].slice(0, 20);
        saveLocalHistory(address, section, next);
        return next;
      });
    },
    [address, section]
  );

  return { transactions: txs, addTx, refetch: fetchTxs };
}
