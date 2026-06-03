import { useCallback, useEffect, useRef } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { vaultAbi } from "@/config/abis";
import { CONTRACTS, TOKENS, arcTestnet, getExplorerTxUrl } from "@/config/wagmi";
import { useApproveToken } from "./useApproveToken";
import { useVolumeTracker } from "./useVolumeTracker";
import { toast } from "sonner";
import { recordPointEvent } from "@/lib/points";

export function useVaultDeposit(tokenSymbol: "USDC" | "EURC", amount: string) {
  const { address, isConnected } = useAccount();
  const token = TOKENS[tokenSymbol];
  const vaultAddress = tokenSymbol === "USDC" ? CONTRACTS.LUNE_VAULT_USDC : CONTRACTS.LUNE_VAULT_EURC;
  const approval = useApproveToken(token.address, vaultAddress, token.decimals);
  const { recordVolume } = useVolumeTracker();

  const { writeContract, data: txHash, isPending: isActionPending, error, reset } = useWriteContract();
  const { isLoading: isActionConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed && txHash) {
      toast.success("Deposit successful!", {
        description: `Deposited ${amount} ${tokenSymbol}`,
        action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(txHash), "_blank") },
      });
      const amountUsd = parseFloat(amount || "0");
      if (amountUsd > 0) {
        recordVolume({ txHash, eventType: "vault_deposit", amountUsd, contract: vaultAddress });
        recordPointEvent({
          wallet: address,
          action: "vault",
          volumeUsd: amountUsd,
          txHash,
          description: `Deposited ${amount} ${tokenSymbol} into ${tokenSymbol} vault`,
        });
      }
    }
  }, [isConfirmed, txHash]);

  useEffect(() => { if (error) toast.error("Deposit failed", { description: error.message.slice(0, 120) }); }, [error]);

  const execute = useCallback(() => {
    if (!isConnected || !address || !amount) return;
    if (approval.needsApproval(amount)) { approval.requestApproval(amount); return; }
    writeContract({
      address: vaultAddress, abi: vaultAbi, functionName: "deposit",
      args: [parseUnits(amount, token.decimals), address], chain: arcTestnet, account: address,
    });
  }, [isConnected, address, amount, token, vaultAddress, approval, writeContract]);

  const resetAll = useCallback(() => { reset(); approval.resetApprove(); }, [reset, approval.resetApprove]);

  const lastApprovedTx = useRef<string | null>(null);
  useEffect(() => {
    if (approval.isApproved && approval.approveTxHash && lastApprovedTx.current !== approval.approveTxHash) {
      lastApprovedTx.current = approval.approveTxHash;
      setTimeout(() => {
        if (!isActionPending && !isActionConfirming) execute();
      }, 500);
    }
  }, [approval.isApproved, approval.approveTxHash, execute, isActionPending, isActionConfirming]);

  return {
    execute, isConfirmed, error, resetAll,
    isApprovePending: approval.isApprovePending, approveTxHash: approval.approveTxHash,
    isApproveConfirming: approval.isApproveConfirming, approveError: approval.approveError,
    isActionPending, actionTxHash: txHash, isActionConfirming,
    isApproving: approval.isApproving,
    isBusy: approval.isApproving || isActionPending || isActionConfirming,
    isApproved: approval.isApproved,
    isAllowanceLoading: approval.isAllowanceLoading,
  };
}

export function useVaultWithdraw(tokenSymbol: "USDC" | "EURC", sharesRaw: bigint) {
  const { address, isConnected } = useAccount();
  const vaultAddress = tokenSymbol === "USDC" ? CONTRACTS.LUNE_VAULT_USDC : CONTRACTS.LUNE_VAULT_EURC;
  const { recordVolume } = useVolumeTracker();

  const { writeContract, data: txHash, isPending: isActionPending, error, reset } = useWriteContract();
  const { isLoading: isActionConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isConfirmed && txHash) {
      toast.success("Withdrawal successful!", {
        description: "Redeemed vault shares",
        action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(txHash), "_blank") },
      });
      recordVolume({ txHash, eventType: "vault_withdraw", amountUsd: 0, contract: vaultAddress });
      recordPointEvent({
        wallet: address,
        action: "vault",
        volumeUsd: 0,
        txHash,
        description: `Withdrew ${tokenSymbol} vault shares`,
      });
    }
  }, [isConfirmed, txHash]);

  useEffect(() => {
    if (error) toast.error("Withdrawal failed", { description: error.message.slice(0, 120) });
  }, [error]);

  const execute = useCallback(() => {
    if (!isConnected || !address || sharesRaw <= 0n) return;
    writeContract({
      address: vaultAddress,
      abi: vaultAbi,
      functionName: "redeem",
      args: [sharesRaw, address, address],
      chain: arcTestnet,
      account: address,
    });
  }, [isConnected, address, sharesRaw, vaultAddress, writeContract]);

  return {
    execute,
    isConfirmed,
    error,
    resetAll: reset,
    isApprovePending: false,
    approveTxHash: undefined as string | undefined,
    isApproveConfirming: false,
    approveError: null as Error | null,
    isActionPending,
    actionTxHash: txHash,
    isActionConfirming,
    isApproving: false,
    isBusy: isActionPending || isActionConfirming,
  };
}
