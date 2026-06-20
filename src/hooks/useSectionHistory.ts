import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/context/WalletProvider";
import { CONTRACTS } from "@/config/wagmi";
import {
  ARC_TOPICS,
  STABLE_DECIMALS,
  addressTopic,
  fetchAllLogs,
  logTime,
  logWord,
  type ExplorerLog,
} from "@/lib/arcLogs";

export interface SectionTx {
  txHash: string;
  type: string;
  timestamp: number;
  data: Record<string, string>;
}

/**
 * Per-wallet transaction history read LIVE ON-CHAIN from Lunex contract events on
 * Arc (no localStorage). Each section filters the relevant contract's events by
 * the connected wallet (indexed actor = topic1) and maps them to display rows.
 */

const fmt = (raw: bigint) =>
  (Number(raw) / STABLE_DECIMALS).toLocaleString(undefined, { maximumFractionDigits: 4 });

const userFilter = (addr: string) => `&topic1=${addressTopic(addr)}&topic0_1_opr=and`;

function mapSwap(l: ExplorerLog): SectionTx {
  const soldId = logWord(l.data, 0);
  const boughtId = logWord(l.data, 2);
  return {
    txHash: l.transactionHash,
    type: "swap",
    timestamp: logTime(l) * 1000,
    data: {
      sold: soldId === 0n ? "USDC" : "EURC",
      bought: boughtId === 0n ? "USDC" : "EURC",
      amountIn: fmt(logWord(l.data, 1)),
      amountOut: fmt(logWord(l.data, 3)),
    },
  };
}

function mapAdd(l: ExplorerLog): SectionTx {
  return {
    txHash: l.transactionHash,
    type: "add_liquidity",
    timestamp: logTime(l) * 1000,
    data: { action: "Add", usdcAmount: fmt(logWord(l.data, 0)), eurcAmount: fmt(logWord(l.data, 1)), lpTokens: "—" },
  };
}

function mapVault(l: ExplorerLog, token: "USDC" | "EURC", kind: "deposit" | "withdraw"): SectionTx {
  return {
    txHash: l.transactionHash,
    type: kind === "deposit" ? "vault_deposit" : "vault_withdraw",
    timestamp: logTime(l) * 1000,
    data: { action: kind === "deposit" ? "Deposit" : "Withdraw", token, amount: fmt(logWord(l.data, 0)), shares: fmt(logWord(l.data, 1)) },
  };
}

async function fetchSection(section: string, addr: string): Promise<SectionTx[]> {
  const f = userFilter(addr);
  if (section === "swap") {
    const logs = await fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL, ARC_TOPICS.tokenExchange, undefined, undefined, f);
    return logs.map(mapSwap);
  }
  if (section === "pool") {
    const logs = await fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL, ARC_TOPICS.addLiquidity, undefined, undefined, f);
    return logs.map(mapAdd);
  }
  if (section === "yield") {
    const [ud, uw, ed, ew] = await Promise.all([
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC, ARC_TOPICS.deposit, undefined, undefined, f),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC, ARC_TOPICS.withdraw, undefined, undefined, f),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC, ARC_TOPICS.deposit, undefined, undefined, f),
      fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC, ARC_TOPICS.withdraw, undefined, undefined, f),
    ]);
    return [
      ...ud.map((l) => mapVault(l, "USDC", "deposit")),
      ...uw.map((l) => mapVault(l, "USDC", "withdraw")),
      ...ed.map((l) => mapVault(l, "EURC", "deposit")),
      ...ew.map((l) => mapVault(l, "EURC", "withdraw")),
    ];
  }
  return [];
}

// Short-lived per-(wallet, section) cache so navigation/mounts don't refetch.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: SectionTx[] }>();

export function useSectionHistory(section: string) {
  const { address } = useWallet();
  const [txs, setTxs] = useState<SectionTx[]>([]);

  const fetchTxs = useCallback(
    async (force = false) => {
      if (!address) {
        setTxs([]);
        return;
      }
      const key = `${address.toLowerCase()}:${section}`;
      const hit = cache.get(key);
      if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) {
        setTxs(hit.data);
        return;
      }
      try {
        const rows = (await fetchSection(section, address)).sort((a, b) => b.timestamp - a.timestamp).slice(0, 20);
        cache.set(key, { at: Date.now(), data: rows });
        setTxs(rows);
      } catch {
        if (hit) setTxs(hit.data); // keep last-good on a transient failure
      }
    },
    [address, section],
  );

  useEffect(() => {
    fetchTxs();
  }, [fetchTxs]);

  // A new tx lands on-chain a few seconds after confirmation — refetch then.
  const addTx = useCallback(
    async (_tx: Omit<SectionTx, "timestamp">) => {
      setTimeout(() => fetchTxs(true), 4000);
    },
    [fetchTxs],
  );

  return { transactions: txs, addTx, refetch: () => fetchTxs(true) };
}
