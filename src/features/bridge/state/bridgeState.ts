import type { BridgeChainKey } from "../config/bridgeConfig";

export type BridgeStatus =
  | "idle"
  | "approving"
  | "burning"
  | "waiting_attestation"
  | "minting"
  | "complete"
  | "failed";

export interface BridgeTransaction {
  id: string;
  fromChain: BridgeChainKey;
  toChain: BridgeChainKey;
  tokenSymbol?: "USDC" | "EURC";
  amount: string;
  gasTopUpAmount?: string;
  gasTopUpStatus?: "not_requested" | "requested" | "relayer_pending" | "unsupported" | "completed" | "failed";
  status: BridgeStatus;
  burnTxHash?: string;
  messageBytes?: string;
  messageHash?: string;
  attestation?: string;
  mintTxHash?: string;
  amountIn?: string;
  amountOut?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "lunex_bridge_transactions";

export function loadBridgeTransactions(): BridgeTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBridgeTransaction(tx: BridgeTransaction) {
  const all = loadBridgeTransactions();
  const idx = all.findIndex((t) => t.id === tx.id);
  if (idx >= 0) all[idx] = tx;
  else all.unshift(tx);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 20)));
}

export function getPendingBridgeTransactions(): BridgeTransaction[] {
  return loadBridgeTransactions().filter(
    (tx) => tx.status === "waiting_attestation" || tx.status === "burning"
  );
}
