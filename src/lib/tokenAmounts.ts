import { parseUnits } from "viem";

export function parseTokenAmount(value: string, decimals: number) {
  try {
    return value.trim() ? parseUnits(value, decimals) : 0n;
  } catch {
    return 0n;
  }
}

export function hasInsufficientTokenBalance(
  value: string,
  balance?: { value: bigint; decimals: number }
) {
  if (!value.trim() || !balance) return false;
  return parseTokenAmount(value, balance.decimals) > balance.value;
}

export function hasInsufficientRawBalance(
  value: string,
  rawBalance: bigint | undefined,
  decimals: number
) {
  if (!value.trim() || rawBalance === undefined) return false;
  return parseTokenAmount(value, decimals) > rawBalance;
}