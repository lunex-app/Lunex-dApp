import { useCallback, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import {
  UnifiedBalanceKit,
  type SpendResult,
  type DepositResult,
  type EstimateSpendResult,
} from "@circle-fin/unified-balance-kit";
import { toast } from "sonner";
import { BRIDGE_CHAINS, type BridgeChainKey } from "../config/bridgeConfig";
import { humanizeError } from "@/lib/errors";

type GatewayStatus = "idle" | "depositing" | "estimating" | "spending" | "complete" | "failed";
export type GatewayTransferMode = "instant" | "manual";

// Class API. Telemetry disabled — keeps the dApp from POSTing to Circle's
// analytics endpoint on every op.
const gatewayKit = new UnifiedBalanceKit({ disableAnalytics: true, disableErrorReporting: true });

export function useGateway() {
  // Gateway burn-intents are signed via the connected EOA's viem adapter and the
  // deposit is an on-chain tx — driven through the active wagmi connector
  // (RainbowKit: injected or WalletConnect/mobile), NOT window.ethereum, so it
  // works for mobile WalletConnect sessions too. (Circle smart accounts are
  // Arc-only and can't drive the multi-chain adapter here.)
  const { address, connector } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState<GatewayStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastDeposit, setLastDeposit] = useState<DepositResult | null>(null);
  const [lastSpend, setLastSpend] = useState<SpendResult | null>(null);
  const [lastEstimate, setLastEstimate] = useState<EstimateSpendResult | null>(null);
  const [lastSpendMode, setLastSpendMode] = useState<GatewayTransferMode>("instant");
  const [gatewayBalance, setGatewayBalance] = useState<number | null>(null);
  const [gatewayPending, setGatewayPending] = useState<number>(0);

  const createAdapter = useCallback(async () => {
    // EIP-1193 provider from the active wagmi connector (works for injected and
    // WalletConnect alike); fall back to window.ethereum for plain injected.
    const provider =
      (await connector?.getProvider?.().catch(() => undefined)) ?? (window as { ethereum?: unknown }).ethereum;
    if (!provider) throw new Error("Connect a wallet to use Gateway.");

    return createViemAdapterFromProvider({ provider } as any);
  }, [connector]);

  const ensureChain = useCallback(
    async (chainKey: BridgeChainKey) => {
      const chain = BRIDGE_CHAINS[chainKey];
      await switchChainAsync({ chainId: chain.chainId });
    },
    [switchChainAsync]
  );

  /**
   * Read the unified Gateway balance (USDC already deposited into the Gateway
   * Wallet contracts and available to mint elsewhere) across all bridge chains.
   */
  const refreshGatewayBalance = useCallback(async () => {
    if (!address) {
      setGatewayBalance(null);
      return null;
    }
    try {
      const chains = Object.values(BRIDGE_CHAINS).map((c) => c.circleName);
      const res = await gatewayKit.getBalances({
        token: "USDC",
        sources: { address, chains },
        includePending: true,
        networkType: "testnet",
      });
      // The kit returns totalConfirmedBalance / totalPendingBalance (strings),
      // with a per-account `breakdown`. Confirmed is what's spendable now.

      const anyRes = res as any;
      let total = Number(anyRes?.totalConfirmedBalance ?? NaN);
      if (!Number.isFinite(total)) {
        // Fall back to summing the per-chain confirmed breakdown.
        const items: { confirmedBalance?: string }[] =
          anyRes?.breakdown?.flatMap((a: { breakdown?: unknown[] }) => a.breakdown ?? []) ?? [];
        total = items.reduce((sum, b) => sum + Number(b?.confirmedBalance ?? 0), 0);
      }
      const pending = Number(anyRes?.totalPendingBalance ?? 0);
      setGatewayPending(Number.isFinite(pending) ? pending : 0);
      setGatewayBalance(Number.isFinite(total) ? total : 0);
      return total;
    } catch {
      setGatewayBalance(null);
      setGatewayPending(0);
      return null;
    }
  }, [address]);

  /** Build the SpendParams shared by estimate and spend. */
  const buildSpendParams = useCallback(
     
    (adapter: any, fromChain: BridgeChainKey, toChain: BridgeChainKey, amount: string, mode: GatewayTransferMode): any => {
      const from = BRIDGE_CHAINS[fromChain];
      const to = BRIDGE_CHAINS[toChain];
      return {
        token: "USDC" as const,
        amountIn: amount,
        from: {
          adapter,
          // Pull exactly from the chosen source chain (matches the UI selector).
          allocations: { amount, chain: from.circleName },
        },
        to:
          mode === "instant"
            ? {
                // Forwarding Service mints on the destination — no adapter needed.
                chain: to.circleName,
                recipientAddress: address as string,
                useForwarder: true,
              }
            : {
                // Manual mint — the user's wallet signs the destination mint tx.
                adapter,
                chain: to.circleName,
                recipientAddress: address as string,
                useForwarder: false,
              },
      };
    },
    [address]
  );

  const deposit = useCallback(
    async (chainKey: BridgeChainKey, amount: string) => {
      if (!address) throw new Error("Connect a wallet first");
      setStatus("depositing");
      setError(null);
      setLastDeposit(null);
      try {
        // Deposit is an on-chain approve+transfer to the Gateway Wallet, so the
        // wallet must be on the source chain.
        await ensureChain(chainKey);
        const adapter = await createAdapter();
        const result = await gatewayKit.deposit({
          from: { adapter, chain: BRIDGE_CHAINS[chainKey].circleName },
          amount,
          token: "USDC",
        });
        setLastDeposit(result);
        setStatus("complete");
        toast.success("Gateway deposit complete", {
          description: `${amount} USDC deposited on ${BRIDGE_CHAINS[chainKey].label}`,
        });
        refreshGatewayBalance();
        return result;
      } catch (err: unknown) {
        const message = humanizeError(err as never, "Gateway deposit failed. Please try again.");
        setError(message);
        setStatus("failed");
        toast.error("Gateway deposit failed", { description: message });
        throw err;
      }
    },
    [address, createAdapter, ensureChain, refreshGatewayBalance]
  );

  const estimateSpend = useCallback(
    async (fromChain: BridgeChainKey, toChain: BridgeChainKey, amount: string, mode: GatewayTransferMode = "instant") => {
      if (!address) throw new Error("Connect a wallet first");
      setStatus("estimating");
      setError(null);
      setLastEstimate(null);
      try {
        const adapter = await createAdapter();
        const result = await gatewayKit.estimateSpend(buildSpendParams(adapter, fromChain, toChain, amount, mode));
        setLastEstimate(result);
        setStatus("idle");
        return result;
      } catch (err: unknown) {
        const message = (err as Error)?.message || "Gateway estimate failed";
        setError(humanizeGatewayError(message, mode));
        setStatus("failed");
        throw err;
      }
    },
    [address, createAdapter, buildSpendParams]
  );

  const spend = useCallback(
    async (fromChain: BridgeChainKey, toChain: BridgeChainKey, amount: string, mode: GatewayTransferMode = "instant") => {
      if (!address) throw new Error("Connect a wallet first");
      setStatus("spending");
      setError(null);
      setLastSpend(null);
      setLastSpendMode(mode);
      try {
        // Spend draws from the CONFIRMED Gateway balance. A just-made deposit is
        // pending until the source chain finalises, so guide the user instead of
        // letting the transfer fail opaquely.
        const confirmed = await refreshGatewayBalance();
        if (confirmed != null && Number(confirmed) + 1e-9 < Number(amount)) {
          throw new Error(
            `Only ${Number(confirmed).toFixed(2)} USDC is confirmed in your Gateway balance. ` +
              `Recent deposits stay pending until the source chain finalises — wait for it to confirm, deposit more, or lower the amount.`,
          );
        }
        // Burn-intent signing is chain-agnostic (EIP-712). Only the MANUAL mint
        // is an on-chain tx, so switch to the destination chain for that path.
        // Instant (forwarder) mode needs no chain switch at all.
        if (mode === "manual") await ensureChain(toChain);
        const adapter = await createAdapter();
        const result = await gatewayKit.spend(buildSpendParams(adapter, fromChain, toChain, amount, mode));
        setLastSpend(result);
        setStatus("complete");
        toast.success("Gateway transfer complete", {
          description: `${amount} USDC minted on ${BRIDGE_CHAINS[toChain].label}`,
        });
        refreshGatewayBalance();
        return result;
      } catch (err: unknown) {
        // Surface the raw error to the console for debugging; show a friendly one.
        console.error("Gateway spend error:", err);
        const message = humanizeGatewayError((err as Error)?.message || "Gateway transfer failed", mode);
        setError(message);
        setStatus("failed");
        toast.error("Gateway transfer failed", { description: message.slice(0, 200) });
        throw err;
      }
    },
    [address, createAdapter, ensureChain, buildSpendParams, refreshGatewayBalance]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setLastDeposit(null);
    setLastSpend(null);
    setLastEstimate(null);
  }, []);

  return {
    status,
    error,
    lastDeposit,
    lastSpend,
    lastEstimate,
    lastSpendMode,
    gatewayBalance,
    gatewayPending,
    refreshGatewayBalance,
    deposit,
    estimateSpend,
    spend,
    reset,
  };
}

/** Turn Circle's raw Gateway errors into actionable guidance. */
function humanizeGatewayError(message: string, mode: GatewayTransferMode = "instant"): string {
  const m = message.toLowerCase();
  if (m.includes("insufficient") && (m.includes("maxfee") || m.includes("fee") || m.includes("balance"))) {
    return "Not enough Gateway balance to cover the amount plus Circle's forwarding fee. Deposit a little more, reduce the amount, or switch to Manual mint mode.";
  }
  if (m.includes("forwarder") || m.includes("forwarding")) {
    return "Instant (forwarder) transfer isn't available for this route right now. Switch to Manual mint mode to complete the transfer.";
  }
  if (m.includes("no deposit") || m.includes("no balance") || m.includes("not found")) {
    return "No Gateway balance found on the source chain. Deposit USDC into Gateway first, then spend it on the destination chain.";
  }
  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected the request")) {
    return "You declined the signature in your wallet. Approve the request to complete the transfer.";
  }
  // Anything else: in Instant mode the most common cause is the Forwarding
  // Service not covering this route/fee — point users to Manual mint, which
  // settles the destination mint from their own wallet.
  const fallback =
    mode === "instant"
      ? "Instant transfer couldn't be completed — Circle's Forwarding Service may not support this route yet, or your Gateway balance can't cover the amount plus the forwarding fee. Try Manual mint mode, or top up your Gateway balance."
      : "Gateway transfer failed. Please try again.";
  return humanizeError(message, fallback);
}
