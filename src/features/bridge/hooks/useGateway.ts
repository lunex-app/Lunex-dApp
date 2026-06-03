import { useCallback, useState } from "react";
import { useAccount, useSwitchChain } from "wagmi";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { UnifiedBalanceKit, type SpendResult, type DepositResult, type EstimateSpendResult } from "@circle-fin/unified-balance-kit";
import { toast } from "sonner";
import { BRIDGE_CHAINS, type BridgeChainKey } from "../config/bridgeConfig";

type GatewayStatus = "idle" | "depositing" | "estimating" | "spending" | "complete" | "failed";
type GatewayTransferMode = "instant" | "manual";

const gatewayKit = new UnifiedBalanceKit();

async function getProvider() {
  const provider = (window as any).ethereum;
  if (!provider) throw new Error("No wallet provider found");
  return provider;
}

export function useGateway() {
  const { address } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const [status, setStatus] = useState<GatewayStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastDeposit, setLastDeposit] = useState<DepositResult | null>(null);
  const [lastSpend, setLastSpend] = useState<SpendResult | null>(null);
  const [lastEstimate, setLastEstimate] = useState<EstimateSpendResult | null>(null);
  const [lastSpendMode, setLastSpendMode] = useState<GatewayTransferMode>("instant");

  const createAdapter = useCallback(async () => {
    const provider = await getProvider();
    return createViemAdapterFromProvider({ provider });
  }, []);

  const ensureChain = useCallback(
    async (chainKey: BridgeChainKey) => {
      const chain = BRIDGE_CHAINS[chainKey];
      await switchChainAsync({ chainId: chain.chainId });
    },
    [switchChainAsync]
  );

  const deposit = useCallback(
    async (chainKey: BridgeChainKey, amount: string) => {
      if (!address) throw new Error("Connect wallet first");
      setStatus("depositing");
      setError(null);
      setLastDeposit(null);
      try {
        await ensureChain(chainKey);
        const adapter = await createAdapter();
        const result = await gatewayKit.deposit({
          from: { adapter, chain: BRIDGE_CHAINS[chainKey].circleName },
          amount,
          token: "USDC",
        });
        setLastDeposit(result);
        setStatus("complete");
        toast.success("Gateway deposit complete", { description: `${amount} USDC deposited on ${BRIDGE_CHAINS[chainKey].label}` });
        return result;
      } catch (err: any) {
        const message = err?.message || "Gateway deposit failed";
        setError(message);
        setStatus("failed");
        toast.error("Gateway deposit failed", { description: message.slice(0, 140) });
        throw err;
      }
    },
    [address, createAdapter, ensureChain]
  );

  const estimateSpend = useCallback(
    async (fromChain: BridgeChainKey, toChain: BridgeChainKey, amount: string, mode: GatewayTransferMode = "instant") => {
      if (!address) throw new Error("Connect wallet first");
      setStatus("estimating");
      setError(null);
      setLastEstimate(null);
      try {
        const adapter = await createAdapter();
        const result = await gatewayKit.estimateSpend({
          amount,
          token: "USDC",
          from: {
            adapter,
            allocations: { amount, chain: BRIDGE_CHAINS[fromChain].circleName },
          },
          to: {
            ...(mode === "manual" ? { adapter } : {}),
            chain: BRIDGE_CHAINS[toChain].circleName,
            recipientAddress: address,
            useForwarder: mode === "instant",
          },
        });
        setLastEstimate(result);
        setStatus("idle");
        return result;
      } catch (err: any) {
        const message = err?.message || "Gateway estimate failed";
        setError(message);
        setStatus("failed");
        throw err;
      }
    },
    [address, createAdapter]
  );

  const spend = useCallback(
    async (fromChain: BridgeChainKey, toChain: BridgeChainKey, amount: string, mode: GatewayTransferMode = "instant") => {
      if (!address) throw new Error("Connect wallet first");
      setStatus("spending");
      setError(null);
      setLastSpend(null);
      try {
        const adapter = await createAdapter();
        setLastSpendMode(mode);
        const result = await gatewayKit.spend({
          amount,
          token: "USDC",
          from: { adapter },
          to: {
            ...(mode === "manual" ? { adapter } : {}),
            chain: BRIDGE_CHAINS[toChain].circleName,
            recipientAddress: address,
            useForwarder: mode === "instant",
          },
        });
        setLastSpend(result);
        setStatus("complete");
        toast.success("Gateway transfer complete", { description: `${amount} USDC minted on ${BRIDGE_CHAINS[toChain].label}` });
        return result;
      } catch (err: any) {
        let message = err?.message || "Gateway transfer failed";
        if (message.includes("Insufficient total maxFee") || message.includes("forwarding fee")) {
          message = "Gateway instant transfer needs extra USDC headroom for the Circle forwarding fee. Try a slightly smaller amount, or switch to manual mint mode.";
        }
        setError(message);
        setStatus("failed");
        toast.error("Gateway transfer failed", { description: message.slice(0, 140) });
        throw err;
      }
    },
    [address, createAdapter]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setLastDeposit(null);
    setLastSpend(null);
    setLastEstimate(null);
  }, []);

  return { status, error, lastDeposit, lastSpend, lastEstimate, lastSpendMode, deposit, estimateSpend, spend, reset };
}
