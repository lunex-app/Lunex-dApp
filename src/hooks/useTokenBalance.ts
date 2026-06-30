import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { TOKENS, arcTestnet } from "@/config/wagmi";
import { erc20Abi } from "@/config/abis";
import { useWallet } from "@/context/WalletProvider";

export function useTokenBalance(tokenSymbol: "USDC" | "EURC" | "USDT") {
  const { address, isConnected } = useWallet();
  const token = TOKENS[tokenSymbol];

  const { data: rawBalance, isLoading, refetch } = useReadContract({
    address: token.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 3000, refetchOnWindowFocus: true },
  });

  const balance = rawBalance as bigint | undefined;
  const formatted = balance !== undefined
    ? parseFloat(formatUnits(balance, token.decimals)).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "0.00";

  return {
    balance: balance !== undefined ? { value: balance, decimals: token.decimals, formatted: formatUnits(balance, token.decimals) } : undefined,
    formatted,
    isLoading,
    refetch,
    isConnected,
  };
}

export function useTokenBalances() {
  const usdc = useTokenBalance("USDC");
  const eurc = useTokenBalance("EURC");
  const usdt = useTokenBalance("USDT");
  return { USDC: usdc, EURC: eurc, USDT: usdt };
}
