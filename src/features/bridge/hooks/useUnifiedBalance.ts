import { useAccount, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { BRIDGE_CHAINS, ERC20_APPROVE_ABI } from "../config/bridgeConfig";

export function useUnifiedBalance() {
  const { address } = useAccount();

  // Create contract read configurations for all supported chains (USDC and EURC)
  const contracts: any[] = [];
  
  Object.values(BRIDGE_CHAINS).forEach((chain) => {
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
  const balancesByChain: Record<string, { value: bigint; formatted: string }> = {};

  if (results && results.length > 0) {
    let resultIdx = 0;
    Object.keys(BRIDGE_CHAINS).forEach((chainKey) => {
      const chain = BRIDGE_CHAINS[chainKey as any];
      
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
        formatted: formatUnits(combinedBalance, chain.usdcDecimals)
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
    isLoading,
    refetch,
  };
}
