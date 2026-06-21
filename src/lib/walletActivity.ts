/**
 * Look up any wallet's Lunex activity, read live on-chain from Arc contract
 * events. Powers the wallet-search box on the dashboards.
 */
import { CONTRACTS, TOKENS } from "@/config/wagmi";
import { LUNEX_TREASURY } from "@/features/bridge/config/bridgeConfig";
import {
  ARC_TOPICS,
  BRIDGE_FEE_RATE,
  STABLE_DECIMALS,
  addressTopic,
  fetchAllLogs,
  logTime,
  logWord,
  type ExplorerLog,
} from "@/lib/arcLogs";

export interface WalletActivityRow {
  ts: number; // unix seconds
  kind: "swap" | "liquidity" | "vault" | "bridge";
  action: string;
  detail: string;
  txHash: string;
}

export interface WalletActivity {
  address: string;
  swapVolumeUsd: number;
  liquidityVolumeUsd: number;
  vaultVolumeUsd: number;
  bridgeVolumeUsd: number;
  totalVolumeUsd: number;
  swapCount: number;
  liquidityCount: number;
  vaultTxCount: number;
  bridgeCount: number;
  txCount: number;
  firstActive: number | null;
  lastActive: number | null;
  history: WalletActivityRow[];
}

const usd = (raw: bigint) => Number(raw) / STABLE_DECIMALS;
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function isAddress(s: string): s is `0x${string}` {
  return /^0x[0-9a-fA-F]{40}$/.test(s.trim());
}

export async function fetchWalletActivity(addressRaw: string): Promise<WalletActivity> {
  const address = addressRaw.trim().toLowerCase();
  const actor = `&topic1=${addressTopic(address)}&topic0_1_opr=and`;
  const asBridger =
    `&topic1=${addressTopic(address)}&topic2=${addressTopic(LUNEX_TREASURY)}` +
    `&topic0_1_opr=and&topic0_2_opr=and&topic1_2_opr=and`;

  const [swaps, adds, ud, uw, ed, ew, fees] = await Promise.all([
    fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL, ARC_TOPICS.tokenExchange, undefined, undefined, actor),
    fetchAllLogs(CONTRACTS.LUNEX_SWAP_POOL, ARC_TOPICS.addLiquidity, undefined, undefined, actor),
    fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC, ARC_TOPICS.deposit, undefined, undefined, actor),
    fetchAllLogs(CONTRACTS.LUNE_VAULT_USDC, ARC_TOPICS.withdraw, undefined, undefined, actor),
    fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC, ARC_TOPICS.deposit, undefined, undefined, actor),
    fetchAllLogs(CONTRACTS.LUNE_VAULT_EURC, ARC_TOPICS.withdraw, undefined, undefined, actor),
    fetchAllLogs(TOKENS.USDC.address, ARC_TOPICS.transfer, undefined, undefined, asBridger),
  ]);

  const history: WalletActivityRow[] = [];
  let swapVolumeUsd = 0;
  for (const l of swaps) {
    const soldId = logWord(l.data, 0);
    const tokensSold = logWord(l.data, 1);
    const tokensBought = logWord(l.data, 3);
    const usdcLeg = soldId === 0n ? tokensSold : tokensBought;
    swapVolumeUsd += usd(usdcLeg);
    history.push({
      ts: logTime(l),
      kind: "swap",
      action: "Swap",
      detail: `${fmt(usd(tokensSold))} ${soldId === 0n ? "USDC" : "EURC"} → ${fmt(usd(tokensBought))} ${soldId === 0n ? "EURC" : "USDC"}`,
      txHash: l.transactionHash,
    });
  }

  let liquidityVolumeUsd = 0;
  for (const l of adds) {
    const a0 = usd(logWord(l.data, 0));
    const a1 = usd(logWord(l.data, 1));
    liquidityVolumeUsd += a0 + a1;
    history.push({ ts: logTime(l), kind: "liquidity", action: "Add Liquidity", detail: `${fmt(a0)} USDC + ${fmt(a1)} EURC`, txHash: l.transactionHash });
  }

  const vaultLogs: { l: ExplorerLog; token: string; kind: "Deposit" | "Withdraw" }[] = [
    ...ud.map((l) => ({ l, token: "USDC", kind: "Deposit" as const })),
    ...uw.map((l) => ({ l, token: "USDC", kind: "Withdraw" as const })),
    ...ed.map((l) => ({ l, token: "EURC", kind: "Deposit" as const })),
    ...ew.map((l) => ({ l, token: "EURC", kind: "Withdraw" as const })),
  ];
  let vaultVolumeUsd = 0;
  for (const { l, token, kind } of vaultLogs) {
    const amt = usd(logWord(l.data, 0));
    vaultVolumeUsd += amt;
    history.push({ ts: logTime(l), kind: "vault", action: `Vault ${kind}`, detail: `${fmt(amt)} ${token}`, txHash: l.transactionHash });
  }

  let bridgeFeesUsd = 0;
  for (const l of fees) {
    const fee = usd(logWord(l.data, 0));
    bridgeFeesUsd += fee;
    history.push({ ts: logTime(l), kind: "bridge", action: "Bridge", detail: `${fmt(fee / BRIDGE_FEE_RATE)} USDC via CCTP`, txHash: l.transactionHash });
  }
  const bridgeVolumeUsd = bridgeFeesUsd / BRIDGE_FEE_RATE;

  history.sort((a, b) => b.ts - a.ts);
  const times = history.map((h) => h.ts).filter((t) => t > 0);

  return {
    address,
    swapVolumeUsd,
    liquidityVolumeUsd,
    vaultVolumeUsd,
    bridgeVolumeUsd,
    totalVolumeUsd: swapVolumeUsd + liquidityVolumeUsd + vaultVolumeUsd + bridgeVolumeUsd,
    swapCount: swaps.length,
    liquidityCount: adds.length,
    vaultTxCount: vaultLogs.length,
    bridgeCount: fees.length,
    txCount: swaps.length + adds.length + vaultLogs.length + fees.length,
    firstActive: times.length ? Math.min(...times) : null,
    lastActive: times.length ? Math.max(...times) : null,
    history: history.slice(0, 50),
  };
}
