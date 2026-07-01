/**
 * useAgentAuthorization
 *
 * Checks whether the user has completed the one-time setup that lets the
 * Lunex AI agent execute rebalances without wallet popups:
 *   1. LP token approved to AgentExecutor
 *   2. Vault USDC shares approved to AgentExecutor
 *   3. Agent hot wallet set as operator on AgentExecutor
 *
 * `authorize()` submits all three calls in a single tx batch.
 * `revoke()` removes the operator permission (single tx).
 */
import { useCallback } from "react";
import { useReadContracts } from "wagmi";
import { maxUint256 } from "viem";
import { useWallet } from "@/context/WalletProvider";
import { useTx } from "./useTx";
import { erc20Abi, vaultAbi } from "@/config/abis";
import { CONTRACTS } from "@/config/wagmi";
import { agentExecutorAbi, AGENT_EXECUTOR_ADDRESS, AGENT_WALLET_ADDRESS } from "@/config/agentExecutor";
import { arcTestnet } from "@/config/wagmi";

const HALF_MAX = maxUint256 / 2n; // threshold: treat as "unlimited approved"

export function useAgentAuthorization() {
  const { address } = useWallet();
  const tx = useTx();

  const enabled = !!address && !!AGENT_EXECUTOR_ADDRESS && !!AGENT_WALLET_ADDRESS;

  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      // 1. LP token allowance to executor
      {
        address: CONTRACTS.LUNEX_LP,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address ?? "0x0", AGENT_EXECUTOR_ADDRESS],
        chainId: arcTestnet.id,
      },
      // 2. Vault USDC share allowance to executor
      {
        address: CONTRACTS.LUNE_VAULT_USDC,
        abi: vaultAbi,
        functionName: "allowance",
        args: [address ?? "0x0", AGENT_EXECUTOR_ADDRESS],
        chainId: arcTestnet.id,
      },
      // 3. Operator flag
      {
        address: AGENT_EXECUTOR_ADDRESS,
        abi: agentExecutorAbi,
        functionName: "operators",
        args: [address ?? "0x0", AGENT_WALLET_ADDRESS],
        chainId: arcTestnet.id,
      },
    ],
    query: { enabled, refetchInterval: 8000 },
  });

  const lpAllowance     = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const vaultAllowance  = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const isOperator      = (data?.[2]?.result as boolean | undefined) ?? false;

  const lpApproved    = lpAllowance    >= HALF_MAX;
  const vaultApproved = vaultAllowance >= HALF_MAX;
  const isAuthorized  = lpApproved && vaultApproved && isOperator;

  // Not configured yet (env vars missing) — skip the whole flow
  const isConfigured = !!AGENT_EXECUTOR_ADDRESS && !!AGENT_WALLET_ADDRESS;

  const authorize = useCallback(async () => {
    if (!address || !isConfigured) return;
    await tx.execute([
      // Approve LP tokens (unlimited)
      {
        address: CONTRACTS.LUNEX_LP,
        abi: erc20Abi,
        functionName: "approve",
        args: [AGENT_EXECUTOR_ADDRESS, maxUint256],
      },
      // Approve vault shares (unlimited)
      {
        address: CONTRACTS.LUNE_VAULT_USDC,
        abi: vaultAbi,
        functionName: "approve",
        args: [AGENT_EXECUTOR_ADDRESS, maxUint256],
      },
      // Set agent wallet as operator
      {
        address: AGENT_EXECUTOR_ADDRESS,
        abi: agentExecutorAbi,
        functionName: "setOperator",
        args: [AGENT_WALLET_ADDRESS, true],
      },
    ]);
    await refetch();
  }, [address, isConfigured, tx, refetch]);

  const revoke = useCallback(async () => {
    if (!address || !isConfigured) return;
    await tx.execute([
      {
        address: AGENT_EXECUTOR_ADDRESS,
        abi: agentExecutorAbi,
        functionName: "setOperator",
        args: [AGENT_WALLET_ADDRESS, false],
      },
    ]);
    await refetch();
  }, [address, isConfigured, tx, refetch]);

  return {
    isConfigured,
    isAuthorized,
    isLoading: isLoading && enabled,
    lpApproved,
    vaultApproved,
    isOperator,
    authorize,
    revoke,
    authTx: tx,
  };
}
