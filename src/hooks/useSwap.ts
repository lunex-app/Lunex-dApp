import { useCallback, useEffect, useRef } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { stableSwapAbi } from "@/config/abis";
import { CONTRACTS, TOKEN_INDEX, TOKENS, arcTestnet, getExplorerTxUrl } from "@/config/wagmi";
import { useApproveToken } from "./useApproveToken";
import { useVolumeTracker } from "./useVolumeTracker";
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
  const { address, isConnected } = useAccount();
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

  const { writeContract, data: swapTxHash, isPending: isSwapPending, error: swapError, reset: resetSwap } = useWriteContract();
  const { isLoading: isSwapConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: swapTxHash, timeout: 60_000 });

  useEffect(() => {
    if (isConfirmed && swapTxHash) {
      toast.success("Swap successful!", {
        description: `Swapped ${amount} ${fromSymbol} → ${toSymbol}`,
        action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(swapTxHash), "_blank") },
      });
      const amountUsd = parseFloat(amount || "0");
      if (amountUsd > 0) {
        recordVolume({ txHash: swapTxHash, eventType: "swap", amountUsd, contract: CONTRACTS.LUNEX_SWAP_POOL });
        recordPointEvent({
          wallet: address,
          action: "swap",
          volumeUsd: amountUsd,
          txHash: swapTxHash,
          description: `Swapped ${amount} ${fromSymbol} to ${toSymbol}`,
        });
      }
    }
  }, [isConfirmed, swapTxHash]);

  useEffect(() => {
    if (swapError) toast.error("Transaction failed", { description: swapError.message.slice(0, 120) });
  }, [swapError]);

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
    if (approval.needsApproval(amount)) { approval.requestApproval(amount); return; }
    const minDy = applySlippage(dyRaw as bigint, slippageBps);
    writeContract({
      address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "exchange",
      args: [i, j, parsedInput, minDy], chain: arcTestnet, account: address,
    });
  }, [isConnected, address, amount, parsedInput, dyRaw, slippageBps, isSlippageValid, i, j, approval, writeContract]);

  const resetAll = useCallback(() => { resetSwap(); approval.resetApprove(); }, [resetSwap, approval.resetApprove]);

  const lastApprovedTx = useRef<string | null>(null);
  useEffect(() => {
    if (approval.isApproved && approval.approveTxHash && lastApprovedTx.current !== approval.approveTxHash) {
      lastApprovedTx.current = approval.approveTxHash;
      setTimeout(() => {
        if (!isSwapPending && !isSwapConfirming) executeSwap();
      }, 2000);
    }
  }, [approval.isApproved, approval.approveTxHash, executeSwap, isSwapPending, isSwapConfirming]);

  return {
    executeSwap,
    isApprovePending: approval.isApprovePending,
    approveTxHash: approval.approveTxHash,
    isApproveConfirming: approval.isApproveConfirming,
    approveError: approval.approveError,
    isSwapPending, swapTxHash, isSwapConfirming,
    isApproving: approval.isApproving,
    isBusy: approval.isApproving || isSwapPending || isSwapConfirming,
    isConfirmed, swapError,
    needsApproval: approval.needsApproval(amount),
    outputAmount, spotRate, priceImpact, resetAll,
    isSlippageValid,
    isApproved: approval.isApproved,
    isAllowanceLoading: approval.isAllowanceLoading,
  };
}
