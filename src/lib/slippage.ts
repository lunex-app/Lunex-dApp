export const DEFAULT_SLIPPAGE_PERCENT = 0.5;
export const MAX_SLIPPAGE_PERCENT = 5;

export function parseSlippagePercent(value: string, max = MAX_SLIPPAGE_PERCENT): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) return null;
  return parsed;
}

export function parseSlippageBps(value: string, max = MAX_SLIPPAGE_PERCENT): bigint | null {
  const parsed = parseSlippagePercent(value, max);
  if (parsed === null) return null;
  return BigInt(Math.floor(parsed * 100));
}

export function applySlippage(amount: bigint, slippageBps: bigint): bigint {
  return (amount * (10_000n - slippageBps)) / 10_000n;
}
