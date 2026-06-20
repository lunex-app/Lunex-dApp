import type { Address } from "viem";

export type PointAction = "swap" | "liquidity" | "vault" | "bridge" | "sdk" | "pay" | "stream" | "limit_order";

export interface PointEvent {
  id: string;
  wallet: string;
  action: PointAction;
  points: number;
  volumeUsd: number;
  txHash?: string;
  createdAt: number;
  description: string;
}

const STORAGE_PREFIX = "lunex:points:";

const ACTION_MULTIPLIER: Record<PointAction, number> = {
  swap: 5,
  liquidity: 10,
  vault: 8,
  bridge: 7,
  sdk: 20,
  pay: 6,
  stream: 6,
  limit_order: 4,
};

const storageKey = (wallet: string) => `${STORAGE_PREFIX}${wallet.toLowerCase()}`;

export function calculatePoints(action: PointAction, volumeUsd: number) {
  const base = ACTION_MULTIPLIER[action];
  return Math.max(base, Math.floor(volumeUsd * base));
}

export function loadPointEvents(wallet?: string | null): PointEvent[] {
  if (!wallet) return [];
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordPointEvent(params: {
  wallet?: Address | string | null;
  action: PointAction;
  volumeUsd?: number;
  txHash?: string;
  description: string;
}) {
  if (!params.wallet) return null;
  const normalized = params.wallet.toLowerCase();
  const volumeUsd = params.volumeUsd ?? 0;
  const event: PointEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    wallet: normalized,
    action: params.action,
    points: calculatePoints(params.action, volumeUsd),
    volumeUsd,
    txHash: params.txHash,
    createdAt: Date.now(),
    description: params.description,
  };
  const next = [event, ...loadPointEvents(normalized)].slice(0, 100);
  // Must never throw: callers invoke this on the success path of on-chain txs
  // (e.g. inside useBridge's try block). A storage failure (Safari Private Mode,
  // quota exceeded) must not flip a confirmed tx to "failed".
  try {
    localStorage.setItem(storageKey(normalized), JSON.stringify(next));
    window.dispatchEvent(new Event("lunex_points_updated"));
  } catch {
    return null;
  }
  return event;
}

export function getPointSummary(wallet?: string | null) {
  const events = loadPointEvents(wallet);
  return {
    events,
    totalPoints: events.reduce((sum, event) => sum + event.points, 0),
    totalVolume: events.reduce((sum, event) => sum + event.volumeUsd, 0),
    interactions: events.length,
  };
}
