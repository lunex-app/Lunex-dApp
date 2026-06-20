import { useCallback, useEffect } from "react";
import { useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { stableSwapAbi, erc20Abi } from "@/config/abis";
import { CONTRACTS, TOKEN_INDEX, TOKENS, arcTestnet, getExplorerTxUrl } from "@/config/wagmi";
import { useApproveToken } from "./useApproveToken";
import { useVolumeTracker } from "./useVolumeTracker";
import { useWallet } from "@/context/WalletProvider";
import { useTx } from "./useTx";
import type { Write } from "@/lib/circleTx";
import { toast } from "sonner";
import { applySlippage, parseSlippageBps } from "@/lib/slippage";
import { recordPointEvent } from "@/lib/points";

interface UseSwapParams {
  fromSymbol: string;
  toSymbol: string;
  amount: string;
  slippage: string;
}

export function useSwap({ fromSymbol, toSymbol, amount, slippage }: UseSwapParams) {
  const { address, isConnected } = useWallet();
  const fromToken = TOKENS[fromSymbol as keyof typeof TOKENS];
  const toToken = TOKENS[toSymbol as keyof typeof TOKENS];

  const parsedInput = (() => {
    try { return amount ? parseUnits(amount, fromToken.decimals) : 0n; } catch { return 0n; }
  })();

  const i = BigInt(TOKEN_INDEX[fromSymbol] ?? 0);
  const j = BigInt(TOKEN_INDEX[toSymbol] ?? 1);

  const { data: dyRaw } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "get_dy",
    args: [i, j, parsedInput], chainId: arcTestnet.id,
    query: { enabled: parsedInput > 0n, refetchInterval: 5000 },
  });

  const { data: spotRateRaw } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "get_dy",
    args: [i, j, parseUnits("1", fromToken.decimals)], chainId: arcTestnet.id,
    query: { refetchInterval: 5000 },
  });

  const outputAmount = dyRaw ? parseFloat(formatUnits(dyRaw as bigint, toToken.decimals)) : 0;
  const spotRate = spotRateRaw ? parseFloat(formatUnits(spotRateRaw as bigint, toToken.decimals)) : 0;
  const swapRate = parsedInput > 0n && outputAmount > 0 ? outputAmount / parseFloat(amount || "1") : 0;
  const priceImpact = spotRate > 0 && swapRate > 0 ? ((spotRate - swapRate) / spotRate) * 100 : 0;
  const slippageBps = parseSlippageBps(slippage);
  const isSlippageValid = slippageBps !== null;

  const approval = useApproveToken(fromToken.address, CONTRACTS.LUNEX_SWAP_POOL, fromToken.decimals);
  const { recordVolume } = useVolumeTracker();
  const tx = useTx();

  useEffect(() => {
    if (tx.isConfirmed) {
      toast.success("Swap successful!", {
        description: `Swapped ${amount} ${fromSymbol} → ${toSymbol}`,
        ...(tx.txHash && tx.txHash !== "0x"
          ? { action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(tx.txHash!), "_blank") } }
          : {}),
      });
      const amountUsd = parseFloat(amount || "0");
      if (amountUsd > 0) {
        recordVolume({ txHash: tx.txHash || "0x", eventType: "swap", amountUsd, contract: CONTRACTS.LUNEX_SWAP_POOL });
        recordPointEvent({
          wallet: address,
          action: "swap",
          volumeUsd: amountUsd,
          txHash: tx.txHash,
          description: `Swapped ${amount} ${fromSymbol} to ${toSymbol}`,
        });
      }
      approval.refetchAllowance();
    }
     
  }, [tx.isConfirmed, tx.txHash]);

  useEffect(() => {
    if (tx.error) toast.error("Transaction failed", { description: tx.error.message.slice(0, 120) });
  }, [tx.error]);

  const executeSwap = useCallback(() => {
    if (!isConnected || !address || !amount) return;
    if (!isSlippageValid) {
      toast.error("Invalid slippage", { description: "Use a value from 0% to 5%." });
      return;
    }
    if (!dyRaw || (dyRaw as bigint) <= 0n) {
      toast.error("Quote unavailable", { description: "Wait for a valid quote before swapping." });
      return;
    }
    const minDy = applySlippage(dyRaw as bigint, slippageBps);
    const writes: Write[] = [];
    if (approval.needsApproval(amount)) {
      writes.push({ address: fromToken.address, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, parsedInput] });
    }
    writes.push({ address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "exchange", args: [i, j, parsedInput, minDy] });
    tx.execute(writes);
  }, [isConnected, address, amount, parsedInput, dyRaw, slippageBps, isSlippageValid, i, j, approval, fromToken.address, tx]);

  const resetAll = useCallback(() => { tx.reset(); approval.resetApprove(); }, [tx, approval.resetApprove]);

  return {
    executeSwap,
    isApprovePending: false,
    approveTxHash: undefined as string | undefined,
    isApproveConfirming: false,
    approveError: null as Error | null,
    isSwapPending: tx.isPending,
    swapTxHash: tx.txHash,
    isSwapConfirming: false,
    isApproving: false,
    isBusy: tx.isPending,
    isConfirmed: tx.isConfirmed,
    swapError: tx.error,
    needsApproval: approval.needsApproval(amount),
    outputAmount, spotRate, priceImpact, resetAll,
    isSlippageValid,
    isApproved: !approval.needsApproval(amount),
    isAllowanceLoading: approval.isAllowanceLoading,
  };
}
