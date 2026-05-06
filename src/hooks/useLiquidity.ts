import { useCallback, useEffect, useRef } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { stableSwapAbi } from "@/config/abis";
import { CONTRACTS, TOKENS, arcTestnet, getExplorerTxUrl } from "@/config/wagmi";
import { useApproveToken } from "./useApproveToken";
import { useVolumeTracker } from "./useVolumeTracker";
import { toast } from "sonner";

export function useAddLiquidity(usdcAmount: string, eurcAmount: string) {
  const { address, isConnected } = useAccount();
  const usdcParsed = (() => { try { return usdcAmount ? parseUnits(usdcAmount, 6) : 0n; } catch { return 0n; } })();
  const eurcParsed = (() => { try { return eurcAmount ? parseUnits(eurcAmount, 6) : 0n; } catch { return 0n; } })();

  const { data: lpPreviewRaw } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "calc_token_amount",
    args: [[usdcParsed, eurcParsed] as [bigint, bigint], true],
    chainId: arcTestnet.id, query: { enabled: usdcParsed > 0n || eurcParsed > 0n },
  });
  const lpPreview = lpPreviewRaw ? parseFloat(formatUnits(lpPreviewRaw as bigint, 18)) : 0;

  const usdcApproval = useApproveToken(TOKENS.USDC.address, CONTRACTS.LUNEX_SWAP_POOL, 6);
  const eurcApproval = useApproveToken(TOKENS.EURC.address, CONTRACTS.LUNEX_SWAP_POOL, 6);
  const { recordVolume } = useVolumeTracker();

  const { writeContract, data: txHash, isPending: isActionPending, error, reset } = useWriteContract();
  const { isLoading: isActionConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed && txHash) {
      toast.success("Liquidity added!", {
        description: `Added ${usdcAmount} USDC + ${eurcAmount} EURC`,
        action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(txHash), "_blank") },
      });
      const amountUsd = parseFloat(usdcAmount || "0") + parseFloat(eurcAmount || "0");
      if (amountUsd > 0) {
        recordVolume({ txHash, eventType: "add_liquidity", amountUsd, contract: CONTRACTS.LUNEX_SWAP_POOL });
      }
    }
  }, [isConfirmed, txHash]);

  useEffect(() => { if (error) toast.error("Add liquidity failed", { description: error.message.slice(0, 120) }); }, [error]);

  const execute = useCallback(() => {
    if (!isConnected || !address) return;
    if (usdcAmount && usdcApproval.needsApproval(usdcAmount)) { usdcApproval.requestApproval(usdcAmount); return; }
    if (eurcAmount && eurcApproval.needsApproval(eurcAmount)) { eurcApproval.requestApproval(eurcAmount); return; }
    writeContract({
      address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "add_liquidity",
      args: [[usdcParsed, eurcParsed] as [bigint, bigint], 0n], chain: arcTestnet, account: address,
    });
  }, [isConnected, address, usdcAmount, eurcAmount, usdcParsed, eurcParsed, usdcApproval, eurcApproval, writeContract]);

  const resetAll = useCallback(() => { reset(); usdcApproval.resetApprove(); eurcApproval.resetApprove(); }, [reset, usdcApproval.resetApprove, eurcApproval.resetApprove]);

  const lastApprovedTx = useRef<string | null>(null);
  useEffect(() => {
    const latestTx = usdcApproval.approveTxHash || eurcApproval.approveTxHash;
    const isReady = usdcApproval.isApproved || eurcApproval.isApproved;
    if (isReady && latestTx && lastApprovedTx.current !== latestTx) {
      lastApprovedTx.current = latestTx;
      setTimeout(() => {
        if (!isActionPending && !isActionConfirming) execute();
      }, 500);
    }
  }, [usdcApproval.isApproved, eurcApproval.isApproved, usdcApproval.approveTxHash, eurcApproval.approveTxHash, execute, isActionPending, isActionConfirming]);

  return {
    execute, lpPreview, isConfirmed, error, resetAll,
    usdcApprovePending: usdcApproval.isApprovePending, usdcApproveTxHash: usdcApproval.approveTxHash,
    usdcApproveConfirming: usdcApproval.isApproveConfirming, usdcApproveError: usdcApproval.approveError,
    eurcApprovePending: eurcApproval.isApprovePending, eurcApproveTxHash: eurcApproval.approveTxHash,
    eurcApproveConfirming: eurcApproval.isApproveConfirming, eurcApproveError: eurcApproval.approveError,
    isActionPending, actionTxHash: txHash, isActionConfirming,
    isApproving: usdcApproval.isApproving || eurcApproval.isApproving,
    isBusy: usdcApproval.isApproving || eurcApproval.isApproving || isActionPending || isActionConfirming,
    isApproved: usdcApproval.isApproved || eurcApproval.isApproved,
    isAllowanceLoading: usdcApproval.isAllowanceLoading || eurcApproval.isAllowanceLoading,
  };
}

export function useRemoveLiquidity(lpAmountRaw: bigint, lpAmountDisplay: string, mode: "both" | "usdc" | "eurc") {
  const { address, isConnected } = useAccount();
  const lpApproval = useApproveToken(CONTRACTS.LUNEX_LP, CONTRACTS.LUNEX_SWAP_POOL, 18);
  const { recordVolume } = useVolumeTracker();

  const { writeContract, data: txHash, isPending: isActionPending, error, reset } = useWriteContract();
  const { isLoading: isActionConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed && txHash) {
      toast.success("Liquidity removed!", {
        description: `Removed ${lpAmountDisplay} LP tokens`,
        action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(txHash), "_blank") },
      });
      const amountUsd = parseFloat(lpAmountDisplay || "0");
      if (amountUsd > 0) {
        recordVolume({ txHash, eventType: "remove_liquidity", amountUsd, contract: CONTRACTS.LUNEX_SWAP_POOL });
      }
    }
  }, [isConfirmed, txHash, lpAmountDisplay]);

  useEffect(() => {
    if (error) toast.error("Remove liquidity failed", { description: error.message.slice(0, 120) });
  }, [error]);

  const execute = useCallback(() => {
    if (!isConnected || !address || lpAmountRaw <= 0n) return;
    if (lpApproval.needsApproval(lpAmountDisplay)) {
      lpApproval.requestApproval(lpAmountDisplay);
      return;
    }

    if (mode === "both") {
      writeContract({
        address: CONTRACTS.LUNEX_SWAP_POOL,
        abi: stableSwapAbi,
        functionName: "remove_liquidity",
        args: [lpAmountRaw, [0n, 0n] as [bigint, bigint]],
        chain: arcTestnet,
        account: address,
      });
      return;
    }

    writeContract({
      address: CONTRACTS.LUNEX_SWAP_POOL,
      abi: stableSwapAbi,
      functionName: "remove_liquidity_one_coin",
      args: [lpAmountRaw, BigInt(mode === "usdc" ? 0 : 1), 0n],
      chain: arcTestnet,
      account: address,
    });
  }, [isConnected, address, lpAmountRaw, lpAmountDisplay, mode, lpApproval, writeContract]);

  const resetAll = useCallback(() => {
    reset();
    lpApproval.resetApprove();
  }, [reset, lpApproval.resetApprove]);

  const lastApprovedTx = useRef<string | null>(null);
  useEffect(() => {
    if (lpApproval.isApproved && lpApproval.approveTxHash && lastApprovedTx.current !== lpApproval.approveTxHash) {
      lastApprovedTx.current = lpApproval.approveTxHash;
      setTimeout(() => {
        if (!isActionPending && !isActionConfirming) execute();
      }, 500);
    }
  }, [lpApproval.isApproved, lpApproval.approveTxHash, execute, isActionPending, isActionConfirming]);

  return {
    execute,
    isConfirmed,
    error,
    resetAll,
    isApprovePending: lpApproval.isApprovePending,
    approveTxHash: lpApproval.approveTxHash,
    isApproveConfirming: lpApproval.isApproveConfirming,
    approveError: lpApproval.approveError,
    isActionPending,
    actionTxHash: txHash,
    isActionConfirming,
    isApproving: lpApproval.isApproving,
    isBusy: lpApproval.isApproving || isActionPending || isActionConfirming,
    isApproved: lpApproval.isApproved,
    isAllowanceLoading: lpApproval.isAllowanceLoading,
  };
}
