import { useCallback, useEffect } from "react";
import { parseUnits } from "viem";
import { vaultAbi, erc20Abi } from "@/config/abis";
import { CONTRACTS, TOKENS, getExplorerTxUrl } from "@/config/wagmi";
import { useApproveToken } from "./useApproveToken";
import { useVolumeTracker } from "./useVolumeTracker";
import { useWallet } from "@/context/WalletProvider";
import { useTx } from "./useTx";
import type { Write } from "@/lib/circleTx";
import { toast } from "sonner";

export function useVaultDeposit(tokenSymbol: "USDC" | "EURC" | "USDT", amount: string) {
  const { address, isConnected } = useWallet();
  const token = TOKENS[tokenSymbol];
  const vaultAddress = tokenSymbol === "USDC" ? CONTRACTS.LUNE_VAULT_USDC : tokenSymbol === "USDT" ? CONTRACTS.LUNE_VAULT_USDT : CONTRACTS.LUNE_VAULT_EURC;
  const approval = useApproveToken(token.address, vaultAddress, token.decimals);
  const { recordVolume } = useVolumeTracker();
  const tx = useTx();

  useEffect(() => {
    if (tx.isConfirmed) {
      toast.success("Deposit successful!", {
        description: `Deposited ${amount} ${tokenSymbol}`,
        ...(tx.txHash && tx.txHash !== "0x"
          ? { action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(tx.txHash!), "_blank") } }
          : {}),
      });
      const amountUsd = parseFloat(amount || "0");
      if (amountUsd > 0) {
        recordVolume({ txHash: tx.txHash || "0x", eventType: "vault_deposit", amountUsd, contract: vaultAddress });
      }
      approval.refetchAllowance();
    }
     
  }, [tx.isConfirmed, tx.txHash]);

  useEffect(() => { if (tx.error) toast.error("Deposit failed", { description: tx.error.message.slice(0, 120) }); }, [tx.error]);

  const execute = useCallback(() => {
    if (!isConnected || !address || !amount) return;
    const assets = parseUnits(amount, token.decimals);
    const writes: Write[] = [];
    if (approval.needsApproval(amount)) {
      writes.push({ address: token.address, abi: erc20Abi, functionName: "approve", args: [vaultAddress, assets] });
    }
    writes.push({ address: vaultAddress, abi: vaultAbi, functionName: "deposit", args: [assets, address] });
    tx.execute(writes);
  }, [isConnected, address, amount, token, vaultAddress, approval, tx]);

  const resetAll = useCallback(() => { tx.reset(); approval.resetApprove(); }, [tx, approval.resetApprove]);

  return {
    execute, isConfirmed: tx.isConfirmed, error: tx.error, resetAll,
    isApprovePending: false, approveTxHash: undefined as string | undefined,
    isApproveConfirming: false, approveError: null as Error | null,
    isActionPending: tx.isPending, actionTxHash: tx.txHash, isActionConfirming: false,
    isApproving: false,
    isBusy: tx.isPending,
    isApproved: !approval.needsApproval(amount),
    isAllowanceLoading: approval.isAllowanceLoading,
  };
}

export function useVaultWithdraw(tokenSymbol: "USDC" | "EURC" | "USDT", sharesRaw: bigint) {
  const { address, isConnected } = useWallet();
  const vaultAddress = tokenSymbol === "USDC" ? CONTRACTS.LUNE_VAULT_USDC : tokenSymbol === "USDT" ? CONTRACTS.LUNE_VAULT_USDT : CONTRACTS.LUNE_VAULT_EURC;
  const { recordVolume } = useVolumeTracker();
  const tx = useTx();

  useEffect(() => {
    if (tx.isConfirmed) {
      toast.success("Withdrawal successful!", {
        description: "Redeemed vault shares",
        ...(tx.txHash && tx.txHash !== "0x"
          ? { action: { label: "View on ArcScan →", onClick: () => window.open(getExplorerTxUrl(tx.txHash!), "_blank") } }
          : {}),
      });
      recordVolume({ txHash: tx.txHash || "0x", eventType: "vault_withdraw", amountUsd: 0, contract: vaultAddress });
    }
     
  }, [tx.isConfirmed, tx.txHash]);

  useEffect(() => {
    if (tx.error) toast.error("Withdrawal failed", { description: tx.error.message.slice(0, 120) });
  }, [tx.error]);

  const execute = useCallback(() => {
    if (!isConnected || !address || sharesRaw <= 0n) return;
    tx.execute([
      { address: vaultAddress, abi: vaultAbi, functionName: "redeem", args: [sharesRaw, address, address] },
    ]);
  }, [isConnected, address, sharesRaw, vaultAddress, tx]);

  return {
    execute,
    isConfirmed: tx.isConfirmed,
    error: tx.error,
    resetAll: tx.reset,
    isApprovePending: false,
    approveTxHash: undefined as string | undefined,
    isApproveConfirming: false,
    approveError: null as Error | null,
    isActionPending: tx.isPending,
    actionTxHash: tx.txHash,
    isActionConfirming: false,
    isApproving: false,
    isBusy: tx.isPending,
    isApproved: true,
    isAllowanceLoading: false,
  };
}
