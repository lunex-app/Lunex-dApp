import { useState, useCallback, useEffect, useRef } from "react";
import { formatUnits } from "viem";
import { useReadContract } from "wagmi";
import { usePoolData } from "./usePoolData";
import { useVaultData } from "./useVaultData";
import { useWallet } from "@/context/WalletProvider";
import { useTx } from "./useTx";
import { estimatePoolApy, useDynamicApy } from "./useApy";
import { erc20Abi } from "@/config/abis";
import { CONTRACTS, TOKENS, arcTestnet } from "@/config/wagmi";
import { callAgentExecute } from "@/lib/agentExecute";

export type AgentDecision = "rebalance_to_vault" | "rebalance_to_pool" | "hold";

export interface AgentLogEntry {
  id: string;
  timestamp: number;
  decision: AgentDecision;
  poolApr: number;
  vaultApy: number;
  reasoning: string;
  executed: boolean;
  txHash?: string;
}

export interface AutopilotConfig {
  active: boolean;
  thresholdPct: number;
  autoExecute: boolean;
}

const CHECK_INTERVAL_MS = 30_000;

export function useAutopilotAgent() {
  const { address, isConnected } = useWallet();
  const pool = usePoolData();
  const vault = useVaultData("USDC");
  const tx = useTx();

  const [config, setConfig] = useState<AutopilotConfig>({
    active: false,
    thresholdPct: 1.5,
    autoExecute: false,
  });
  const [log, setLog] = useState<AgentLogEntry[]>([]);
  const [lastDecision, setLastDecision] = useState<AgentDecision>("hold");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const isRunningRef = useRef(false);

  // Wallet USDC balance - needed for step-2 actions after LP removal or vault redemption
  const { data: walletUsdcRaw, refetch: refetchWalletUsdc } = useReadContract({
    address: TOKENS.USDC.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const walletUsdc = walletUsdcRaw ? parseFloat(formatUnits(walletUsdcRaw as bigint, 6)) : 0;
  const walletUsdcRawBigInt = (walletUsdcRaw as bigint | undefined) ?? 0n;

  // Pool APR: approximate 30-day volume as 30% of TVL (conservative testnet estimate)
  const poolApr = estimatePoolApy(pool.totalLiquidity, pool.totalLiquidity * 0.3, pool.feePercent);

  // Vault APY from sharePrice growth (annualized via localStorage snapshot, fallback 4%)
  const vaultApy = useDynamicApy("vault-USDC", vault.sharePrice, 4.0);

  const appendLog = useCallback((entry: Omit<AgentLogEntry, "id">) => {
    const id = `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setLog((prev) => [{ id, ...entry }, ...prev].slice(0, 100));
  }, []);

  const evaluate = useCallback((): { decision: AgentDecision; reasoning: string } => {
    const diff = vaultApy - poolApr;
    if (diff > config.thresholdPct) {
      return {
        decision: "rebalance_to_vault",
        reasoning: `Vault APY ${vaultApy.toFixed(2)}% exceeds Pool APR ${poolApr.toFixed(2)}% by ${diff.toFixed(2)}% (threshold: ${config.thresholdPct}%). Moving liquidity → vault.`,
      };
    }
    if (-diff > config.thresholdPct) {
      return {
        decision: "rebalance_to_pool",
        reasoning: `Pool APR ${poolApr.toFixed(2)}% exceeds Vault APY ${vaultApy.toFixed(2)}% by ${(-diff).toFixed(2)}% (threshold: ${config.thresholdPct}%). Moving vault → pool.`,
      };
    }
    return {
      decision: "hold",
      reasoning: `Spread is ${Math.abs(diff).toFixed(2)}% - below the ${config.thresholdPct}% threshold. Current allocation is near-optimal.`,
    };
  }, [vaultApy, poolApr, config.thresholdPct]);

  // Execute rebalance via the AgentExecutor contract (no wallet popup — signed by agent hot wallet).
  const executeStep = useCallback(async (): Promise<{ executed: boolean; txHash?: string }> => {
    if (!address || !isConnected) return { executed: false };
    const { decision } = evaluate();
    if (decision === "hold") return { executed: false };

    const action = decision === "rebalance_to_vault" ? "rebalanceToVault" : "rebalanceToPool";
    setIsExecuting(true);
    try {
      const { txHash } = await callAgentExecute(action, address);
      refetchWalletUsdc();
      return { executed: true, txHash };
    } catch {
      return { executed: false };
    } finally {
      setIsExecuting(false);
    }
  }, [address, isConnected, evaluate, refetchWalletUsdc]);

  // Tick: evaluate → log → optionally execute
  const executeStepRef = useRef(executeStep);
  executeStepRef.current = executeStep;
  const evaluateRef = useRef(evaluate);
  evaluateRef.current = evaluate;
  const poolAprRef = useRef(poolApr);
  poolAprRef.current = poolApr;
  const vaultApyRef = useRef(vaultApy);
  vaultApyRef.current = vaultApy;

  const tick = useCallback(async (autoExec: boolean) => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    try {
      const { decision, reasoning } = evaluateRef.current();
      setLastDecision(decision);

      let executed = false;
      let txHash: string | undefined;

      if (autoExec && decision !== "hold") {
        const result = await executeStepRef.current();
        executed = result.executed;
        txHash = result.txHash;
      }

      appendLog({
        timestamp: Date.now(),
        decision,
        poolApr: poolAprRef.current,
        vaultApy: vaultApyRef.current,
        reasoning,
        executed,
        txHash,
      });
    } finally {
      isRunningRef.current = false;
    }
  }, [appendLog]);

  const tickRef = useRef(tick);
  tickRef.current = tick;
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    if (!config.active) {
      setStartedAt(null);
      return;
    }
    setStartedAt(Date.now());
    tickRef.current(configRef.current.autoExecute);
    const id = setInterval(() => tickRef.current(configRef.current.autoExecute), CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [config.active]);

  const updateConfig = useCallback((updates: Partial<AutopilotConfig>) => {
    setConfig((prev) => ({ ...prev, ...updates }));
  }, []);

  const runOnce = useCallback(() => tick(config.autoExecute), [tick, config.autoExecute]);

  return {
    config,
    updateConfig,
    log,
    clearLog: () => setLog([]),
    lastDecision,
    poolApr,
    vaultApy,
    pool,
    vault,
    walletUsdc,
    executeStep,
    runOnce,
    startedAt,
    isExecuting,
  };
}
