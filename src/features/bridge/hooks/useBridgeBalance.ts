import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { BRIDGE_CHAINS, ERC20_APPROVE_ABI, type BridgeChainKey } from "../config/bridgeConfig";

export function useBridgeBalance(chainKey: BridgeChainKey) {
  const { address } = useAccount();
  const chain = BRIDGE_CHAINS[chainKey];

  const { data: rawBalance, isLoading } = useReadContract({
    address: chain.usdc,
    abi: ERC20_APPROVE_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: chain.chainId,
    query: { enabled: !!address, refetchInterval: 10000 },
  });

  const balance = rawBalance as bigint | undefined;
  const formatted =
    balance !== undefined
      ? parseFloat(formatUnits(balance, chain.usdcDecimals)).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "0.00";

  return { balance, formatted, decimals: chain.usdcDecimals, isLoading };
}
