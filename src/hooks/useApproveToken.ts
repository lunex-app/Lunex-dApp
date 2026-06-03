import { useState, useCallback, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import { erc20Abi } from "@/config/abis";
import { arcTestnet } from "@/config/wagmi";
import { toast } from "sonner";

export function useApproveToken(
  tokenAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  decimals: number
) {
  const { address } = useAccount();
  const [hasApprovedThisSession, setHasApprovedThisSession] = useState(false);

  const { data: allowance, refetch: refetchAllowance, isFetching: isAllowanceLoading } = useReadContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, spenderAddress] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const {
    writeContract: approve,
    data: approveTxHash,
    isPending: isApprovePending,
    error: approveError,
    reset: resetApprove,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproved } = useWaitForTransactionReceipt({
    hash: approveTxHash,
    chainId: arcTestnet.id,
  });

  const isApproving = isApprovePending || isApproveConfirming;

  useEffect(() => {
    if (isApproved && !isApproveConfirming) {
      setHasApprovedThisSession(true);
      refetchAllowance();
    }
  }, [isApproved, isApproveConfirming, refetchAllowance]);

  useEffect(() => {
    if (approveError) {
      toast.error("Approval failed", { description: approveError.message.slice(0, 120) });
    }
  }, [approveError]);

  const needsApproval = useCallback(
    (amount: string) => {
      // Don't block when allowance is still fetching
      if (isAllowanceLoading) return false;
      // Already approved this session
      if (hasApprovedThisSession) return false;
      // No amount entered
      if (!amount) return false;
      // No allowance data yet — conservative: require approval
      if (allowance === undefined || allowance === null) return true;
      try {
        const parsedAmount = parseUnits(amount, decimals);
        return (allowance as bigint) < parsedAmount;
      } catch {
        return true;
      }
    },
    [allowance, decimals, hasApprovedThisSession, isAllowanceLoading]
  );

  const requestApproval = useCallback(
    (amount?: string, useMax = false) => {
      if (!address) return;
      const approveAmount = useMax ? maxUint256 : (amount ? parseUnits(amount, decimals) : 0n);
      if (approveAmount === 0n && !useMax) {
        toast.error("Invalid amount for approval");
        return;
      }
      approve({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [spenderAddress, approveAmount],
        chain: arcTestnet,
        account: address,
      });
    },
    [approve, tokenAddress, spenderAddress, decimals, address]
  );

  return {
    allowance,
    needsApproval,
    requestApproval,
    isApproving,
    isApprovePending,
    approveTxHash,
    isApproveConfirming,
    isApproved,
    approveError,
    refetchAllowance,
    resetApprove,
    isAllowanceLoading,
  };
}
