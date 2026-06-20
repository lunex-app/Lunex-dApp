import { useCallback, useEffect } from "react";
import { useReadContract } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { stableSwapAbi, erc20Abi } from "@/config/abis";
import { CONTRACTS, TOKENS, arcTestnet, getExplorerTxUrl } from "@/config/wagmi";
import { useApproveToken } from "./useApproveToken";
import { useVolumeTracker } from "./useVolumeTracker";
import { useWallet } from "@/context/WalletProvider";
import { useTx } from "./useTx";
import type { Write } from "@/lib/circleTx";
import { toast } from "sonner";
import { applySlippage, parseSlippageBps } from "@/lib/slippage";
import { recordPointEvent } from "@/lib/points";

export function useAddLiquidity(usdcAmount: string, eurcAmount: string, slippage = "0.5") {
  const { address, isConnected } = useWallet();
  const usdcParsed = (() => { try { return usdcAmount ? parseUnits(usdcAmount, 6) : 0n; } catch { return 0n; } })();
  const eurcParsed = (() => { try { return eurcAmount ? parseUnits(eurcAmount, 6) : 0n; } catch { return 0n; } })();

  const { data: lpPreviewRaw } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "calc_token_amount",
    args: [[usdcParsed, eurcParsed] as [bigint, bigint], true],
    chainId: arcTestnet.id, query: { enabled: usdcParsed > 0n || eurcParsed > 0n },
  });
  const lpPreview = lpPreviewRaw ? parseFloat(formatUnits(lpPreviewRaw as bigint, 18)) : 0;
  const slippageBps = parseSlippageBps(slippage);
  const isSlippageValid = slippageBps !== null;

  const usdcApproval = useApproveToken(TOKENS.USDC.address, CONTRACTS.LUNEX_SWAP_POOL, 6);
  const eurcApproval = useApproveToken(TOKENS.EURC.address, CONTRACTS.LUNEX_SWAP_POOL, 6);
  const { recordVolume } = useVolumeTracker();
  const tx = useTx();

  useEffect(() => {
    if (tx.isConfirmed) {
      toast.success("Liquidity added!", {
        description: `Added ${usdcAmount} USDC + ${eurcAmount} EURC`,
        ...(tx.txHash && tx.txHash !== "0x"
          ? { action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(tx.txHash!), "_blank") } }
          : {}),
      });
      const amountUsd = parseFloat(usdcAmount || "0") + parseFloat(eurcAmount || "0");
      if (amountUsd > 0) {
        recordVolume({ txHash: tx.txHash || "0x", eventType: "add_liquidity", amountUsd, contract: CONTRACTS.LUNEX_SWAP_POOL });
        recordPointEvent({
          wallet: address,
          action: "liquidity",
          volumeUsd: amountUsd,
          txHash: tx.txHash,
          description: `Added ${usdcAmount || "0"} USDC and ${eurcAmount || "0"} EURC liquidity`,
        });
      }
      usdcApproval.refetchAllowance();
      eurcApproval.refetchAllowance();
    }
     
  }, [tx.isConfirmed, tx.txHash]);

  useEffect(() => { if (tx.error) toast.error("Add liquidity failed", { description: tx.error.message.slice(0, 120) }); }, [tx.error]);

  const execute = useCallback(() => {
    if (!isConnected || !address) return;
    if (!isSlippageValid) {
      toast.error("Invalid slippage", { description: "Use a value from 0% to 5%." });
      return;
    }
    if (!lpPreviewRaw || (lpPreviewRaw as bigint) <= 0n) {
      toast.error("Quote unavailable", { description: "Wait for an LP quote before adding liquidity." });
      return;
    }
    const minMintAmount = applySlippage(lpPreviewRaw as bigint, slippageBps);
    const writes: Write[] = [];
    if (usdcAmount && usdcApproval.needsApproval(usdcAmount)) {
      writes.push({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, usdcParsed] });
    }
    if (eurcAmount && eurcApproval.needsApproval(eurcAmount)) {
      writes.push({ address: TOKENS.EURC.address, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, eurcParsed] });
    }
    writes.push({
      address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "add_liquidity",
      args: [[usdcParsed, eurcParsed] as [bigint, bigint], minMintAmount],
    });
    tx.execute(writes);
  }, [isConnected, address, usdcAmount, eurcAmount, usdcParsed, eurcParsed, usdcApproval, eurcApproval, tx, isSlippageValid, slippageBps, lpPreviewRaw]);

  const resetAll = useCallback(() => { tx.reset(); usdcApproval.resetApprove(); eurcApproval.resetApprove(); }, [tx, usdcApproval.resetApprove, eurcApproval.resetApprove]);

  return {
    execute, lpPreview, isConfirmed: tx.isConfirmed, error: tx.error, resetAll, isSlippageValid,
    usdcApprovePending: false, usdcApproveTxHash: undefined as string | undefined,
    usdcApproveConfirming: false, usdcApproveError: null as Error | null,
    eurcApprovePending: false, eurcApproveTxHash: undefined as string | undefined,
    eurcApproveConfirming: false, eurcApproveError: null as Error | null,
    isActionPending: tx.isPending, actionTxHash: tx.txHash, isActionConfirming: false,
    isApproving: false,
    isBusy: tx.isPending,
    isApproved: !usdcApproval.needsApproval(usdcAmount) && !eurcApproval.needsApproval(eurcAmount),
    isAllowanceLoading: usdcApproval.isAllowanceLoading || eurcApproval.isAllowanceLoading,
  };
}

export function useRemoveLiquidity(
  lpAmountRaw: bigint,
  lpAmountDisplay: string,
  mode: "both" | "usdc" | "eurc",
  slippage = "0.5",
  expectedAmounts?: { usdcRaw: bigint; eurcRaw: bigint; oneCoinRaw: bigint }
) {
  const { address, isConnected } = useWallet();
  const lpApproval = useApproveToken(CONTRACTS.LUNEX_LP, CONTRACTS.LUNEX_SWAP_POOL, 18);
  const { recordVolume } = useVolumeTracker();
  const slippageBps = parseSlippageBps(slippage);
  const isSlippageValid = slippageBps !== null;
  const tx = useTx();

  useEffect(() => {
    if (tx.isConfirmed) {
      toast.success("Liquidity removed!", {
        description: `Removed ${lpAmountDisplay} LP tokens`,
        ...(tx.txHash && tx.txHash !== "0x"
          ? { action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(tx.txHash!), "_blank") } }
          : {}),
      });
      const amountUsd = parseFloat(lpAmountDisplay || "0");
      if (amountUsd > 0) {
        recordVolume({ txHash: tx.txHash || "0x", eventType: "remove_liquidity", amountUsd, contract: CONTRACTS.LUNEX_SWAP_POOL });
        recordPointEvent({
          wallet: address,
          action: "liquidity",
          volumeUsd: amountUsd,
          txHash: tx.txHash,
          description: `Removed ${lpAmountDisplay} LP tokens`,
        });
      }
      lpApproval.refetchAllowance();
    }
     
  }, [tx.isConfirmed, tx.txHash]);

  useEffect(() => {
    if (tx.error) toast.error("Remove liquidity failed", { description: tx.error.message.slice(0, 120) });
  }, [tx.error]);

  const execute = useCallback(() => {
    if (!isConnected || !address || lpAmountRaw <= 0n) return;
    if (!isSlippageValid) {
      toast.error("Invalid slippage", { description: "Use a value from 0% to 5%." });
      return;
    }
    const writes: Write[] = [];
    if (lpApproval.needsApproval(lpAmountDisplay)) {
      writes.push({ address: CONTRACTS.LUNEX_LP, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, lpAmountRaw] });
    }

    if (mode === "both") {
      if (!expectedAmounts || (expectedAmounts.usdcRaw <= 0n && expectedAmounts.eurcRaw <= 0n)) {
        toast.error("Quote unavailable", { description: "Wait for withdrawal quotes before removing liquidity." });
        return;
      }
      const minAmounts = [
        applySlippage(expectedAmounts.usdcRaw, slippageBps),
        applySlippage(expectedAmounts.eurcRaw, slippageBps),
      ] as [bigint, bigint];
      writes.push({
        address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "remove_liquidity",
        args: [lpAmountRaw, minAmounts],
      });
      tx.execute(writes);
      return;
    }

    if (!expectedAmounts || expectedAmounts.oneCoinRaw <= 0n) {
      toast.error("Quote unavailable", { description: "Wait for withdrawal quotes before removing liquidity." });
      return;
    }
    writes.push({
      address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "remove_liquidity_one_coin",
      args: [lpAmountRaw, BigInt(mode === "usdc" ? 0 : 1), applySlippage(expectedAmounts.oneCoinRaw, slippageBps)],
    });
    tx.execute(writes);
  }, [isConnected, address, lpAmountRaw, lpAmountDisplay, mode, lpApproval, tx, isSlippageValid, slippageBps, expectedAmounts]);

  const resetAll = useCallback(() => {
    tx.reset();
    lpApproval.resetApprove();
  }, [tx, lpApproval.resetApprove]);

  return {
    execute,
    isConfirmed: tx.isConfirmed,
    error: tx.error,
    resetAll,
    isSlippageValid,
    isApprovePending: false,
    approveTxHash: undefined as string | undefined,
    isApproveConfirming: false,
    approveError: null as Error | null,
    isActionPending: tx.isPending,
    actionTxHash: tx.txHash,
    isActionConfirming: false,
    isApproving: false,
    isBusy: tx.isPending,
    isApproved: !lpApproval.needsApproval(lpAmountDisplay),
    isAllowanceLoading: lpApproval.isAllowanceLoading,
  };
}
