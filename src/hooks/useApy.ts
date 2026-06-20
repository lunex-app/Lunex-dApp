import { useEffect, useMemo, useState } from "react";

interface Snapshot {
  value: number;
  timestamp: number;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

function loadSnapshot(key: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSnapshot(key: string, snapshot: Snapshot) {
  localStorage.setItem(key, JSON.stringify(snapshot));
}

function annualize(previous: Snapshot | null, currentValue: number, fallback: number) {
  if (!previous || previous.value <= 0 || currentValue <= 0) return fallback;
  const elapsed = Date.now() - previous.timestamp;
  if (elapsed < 60_000) return fallback;
  const growth = currentValue / previous.value - 1;
  const periodsPerYear = (365 * DAY_MS) / elapsed;
  const apy = (Math.pow(1 + growth, periodsPerYear) - 1) * 100;
  if (!Number.isFinite(apy) || Math.abs(apy) > 1000) return fallback;
  return Math.max(0, apy);
}

export function useDynamicApy(metricKey: string, currentValue: number, fallback = 0) {
  const storageKey = `lunex:apy:${metricKey}`;
  const [previous, setPrevious] = useState<Snapshot | null>(() => loadSnapshot(storageKey));

  useEffect(() => {
    if (currentValue <= 0) return;
    const existing = loadSnapshot(storageKey);
    if (!existing || Date.now() - existing.timestamp > DAY_MS) {
      const next = { value: currentValue, timestamp: Date.now() };
      saveSnapshot(storageKey, next);
      setPrevious(next);
    }
  }, [currentValue, storageKey]);

  return useMemo(() => annualize(previous, currentValue, fallback), [previous, currentValue, fallback]);
}

export function estimatePoolApy(totalLiquidity: number, totalVolume: number, feePercent: string) {
  const fee = Number(feePercent) / 100;
  if (!totalLiquidity || !Number.isFinite(fee)) return 0;
  const dailyVolumeEstimate = totalVolume > 0 ? totalVolume / 30 : totalLiquidity * 0.05;
  return (dailyVolumeEstimate * fee * 365 / totalLiquidity) * 100;
}

export function formatApy(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0.00%";
  return `${value.toFixed(value >= 100 ? 1 : 2)}%`;
}
