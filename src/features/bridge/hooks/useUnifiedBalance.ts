import { useAccount, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { BRIDGE_CHAINS, ERC20_APPROVE_ABI } from "../config/bridgeConfig";

export function useUnifiedBalance() {
  const { address } = useAccount();

  // Create contract read configurations for all supported chains
  const contracts = Object.values(BRIDGE_CHAINS).map((chain) => ({
    address: chain.usdc,
    abi: ERC20_APPROVE_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: chain.chainId,
  }));

  const { data: results, isLoading } = useReadContracts({
    contracts,
    query: {
      enabled: !!address,
      refetchInterval: 10000,
    },
  });

  // Aggregate total raw balance and format it
  let totalRawBalance = 0n;
  const balancesByChain: Record<string, { raw: bigint; formatted: string }> = {};

  if (results) {
    Object.keys(BRIDGE_CHAINS).forEach((chainKey, index) => {
      const chain = Object.values(BRIDGE_CHAINS)[index];
      const result = results[index];
      
      const balance = result.status === "success" ? (result.result as bigint) : 0n;
      
      // Standardize to 6 decimals (USDC standard)
      const adjustedBalance = 
        chain.usdcDecimals === 6 ? balance : (balance * 1000000n) / (10n ** BigInt(chain.usdcDecimals));

      totalRawBalance += adjustedBalance;
      balancesByChain[chainKey] = {
        raw: balance,
        formatted: parseFloat(formatUnits(balance, chain.usdcDecimals)).toFixed(2)
      };
    });
  }

  const formattedTotal = parseFloat(formatUnits(totalRawBalance, 6)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    totalRawBalance,
    formattedTotal,
    balancesByChain,
    decimals: 6,
    isLoading,
  };
}
