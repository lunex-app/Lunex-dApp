import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { createPublicClient, formatUnits, http } from "viem";
import {
  createUnifiedBalanceKitContext,
  getBalances,
  type GetBalancesResult,
} from "@circle-fin/unified-balance-kit";
import {
  BRIDGE_CHAINS,
  BRIDGE_CHAIN_KEYS,
  ERC20_APPROVE_ABI,
  GATEWAY_CIRCLE_CHAINS,
} from "../config/bridgeConfig";

export function useUnifiedBalance() {
  const { address } = useAccount();
  const [gatewayBalances, setGatewayBalances] = useState<GetBalancesResult | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [isGatewayLoading, setIsGatewayLoading] = useState(false);
  const [nativeBalances, setNativeBalances] = useState<Record<string, bigint>>({});

  const context = useMemo(() => createUnifiedBalanceKitContext(), []);

  // Create contract read configurations for all supported chains (USDC and EURC)
  const contracts: any[] = [];

  BRIDGE_CHAIN_KEYS.forEach((chainKey) => {
    const chain = BRIDGE_CHAINS[chainKey];
    // USDC read
    contracts.push({
      address: chain.usdc,
      abi: ERC20_APPROVE_ABI,
      functionName: "balanceOf",
      args: address ? [address] : undefined,
      chainId: chain.chainId,
    });
    // EURC read (if supported)
    if (chain.eurc) {
      contracts.push({
        address: chain.eurc,
        abi: ERC20_APPROVE_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        chainId: chain.chainId,
      });
    }
  });

  const { data: results, isLoading, refetch } = useReadContracts({
    contracts,
    query: {
      enabled: !!address,
      refetchInterval: 15000, // Sync every 15s
      staleTime: 5000,
    },
  });

  let totalRawBalance = 0n;
  const balancesByChain: Record<string, { value: bigint; formatted: string; usdc: bigint; eurc: bigint; native: bigint; nativeFormatted: string }> = {};

  if (results && results.length > 0) {
    let resultIdx = 0;
    BRIDGE_CHAIN_KEYS.forEach((chainKey) => {
      const chain = BRIDGE_CHAINS[chainKey];
      
      const usdcResult = results[resultIdx++];
      const usdcBalance = usdcResult?.status === "success" ? (usdcResult.result as bigint) : 0n;
      
      let eurcBalance = 0n;
      if (chain.eurc) {
        const eurcResult = results[resultIdx++];
        eurcBalance = eurcResult?.status === "success" ? (eurcResult.result as bigint) : 0n;
      }
      
      const combinedBalance = usdcBalance + eurcBalance;
      const adjustedBalance = 
        chain.usdcDecimals === 6 ? combinedBalance : (combinedBalance * 1000000n) / (10n ** BigInt(chain.usdcDecimals));

      totalRawBalance += adjustedBalance;
      balancesByChain[chainKey] = {
        value: combinedBalance,
        formatted: formatUnits(combinedBalance, chain.usdcDecimals),
        usdc: usdcBalance,
        eurc: eurcBalance,
        native: nativeBalances[chainKey] ?? 0n,
        nativeFormatted: formatUnits(
          nativeBalances[chainKey] ?? 0n,
          chainKey === "arc" ? 6 : 18
        ),
      };
    });
  }

  const formattedTotal = parseFloat(formatUnits(totalRawBalance, 6)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const fetchGatewayBalances = async () => {
    if (!address) {
      setGatewayBalances(null);
      setGatewayError(null);
      return;
    }

    setIsGatewayLoading(true);
    setGatewayError(null);
    try {
      const balances = await getBalances(context, {
        token: "USDC",
        sources: {
          address,
          chains: GATEWAY_CIRCLE_CHAINS,
        },
        includePending: true,
        networkType: "testnet",
      });
      setGatewayBalances(balances);
    } catch (error: any) {
      setGatewayBalances(null);
      setGatewayError(error?.message || "Gateway balance unavailable");
    } finally {
      setIsGatewayLoading(false);
    }
  };

  const fetchNativeBalances = async () => {
    if (!address) {
      setNativeBalances({});
      return;
    }

    const entries = await Promise.all(
      BRIDGE_CHAIN_KEYS.map(async (chainKey) => {
        try {
          const chain = BRIDGE_CHAINS[chainKey];
          const client = createPublicClient({ transport: http(chain.rpcUrl) });
          const balance = await client.getBalance({ address });
          return [chainKey, balance] as const;
        } catch {
          return [chainKey, 0n] as const;
        }
      })
    );
    setNativeBalances(Object.fromEntries(entries));
  };

  useEffect(() => {
    fetchGatewayBalances();
    fetchNativeBalances();
    if (!address) return;
    const interval = setInterval(() => {
      fetchGatewayBalances();
      fetchNativeBalances();
    }, 30_000);
    return () => clearInterval(interval);
  }, [address, context]);

  const gatewayTotal = Number(gatewayBalances?.totalConfirmedBalance ?? 0);
  const gatewayPendingTotal = Number(gatewayBalances?.totalPendingBalance ?? 0);
  const gatewayByChain = BRIDGE_CHAIN_KEYS.reduce<Record<string, { confirmed: string; pending: string }>>((acc, chainKey) => {
    const chain = BRIDGE_CHAINS[chainKey];
    const entry = gatewayBalances?.breakdown
      ?.flatMap((account) => account.breakdown)
      .find((item) => item.chain === chain.circleName);
    acc[chainKey] = {
      confirmed: entry?.confirmedBalance ?? "0",
      pending: entry?.pendingBalance ?? "0",
    };
    return acc;
  }, {});

  const refetchAll = () => {
    refetch();
    fetchGatewayBalances();
    fetchNativeBalances();
  };

  return {
    totalRawBalance,
    formattedTotal,
    balancesByChain,
    gatewayBalances,
    gatewayByChain,
    gatewayTotal,
    gatewayPendingTotal,
    gatewayError,
    isGatewayLoading,
    isLoading,
    refetch: refetchAll,
  };
}
