import { useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { vaultAbi } from "@/config/abis";
import { CONTRACTS, arcTestnet } from "@/config/wagmi";
import { useWallet } from "@/context/WalletProvider";

export function useVaultData(tokenSymbol: "USDC" | "EURC" | "USDT") {
  const { address } = useWallet();
  const vaultAddress =
    tokenSymbol === "USDC" ? CONTRACTS.LUNE_VAULT_USDC :
    tokenSymbol === "EURC" ? CONTRACTS.LUNE_VAULT_EURC :
    CONTRACTS.LUNE_VAULT_USDT;

  const { data: totalAssetsRaw, refetch: refetchAssets } = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "totalAssets",
    chainId: arcTestnet.id,
    query: { refetchInterval: 3000, refetchOnWindowFocus: true },
  });

  const { data: sharePriceRaw, refetch: refetchSharePrice } = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "sharePrice",
    chainId: arcTestnet.id,
    query: { refetchInterval: 3000, refetchOnWindowFocus: true },
  });

  const {
    data: userSharesRaw,
    refetch: refetchShares,
    isLoading: isUserSharesLoading,
  } = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 3000, refetchOnWindowFocus: true },
  });

  const {
    data: userAssetsRaw,
    refetch: refetchUserAssets,
    isLoading: isUserAssetsLoading,
  } = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "convertToAssets",
    args: userSharesRaw !== undefined ? [userSharesRaw as bigint] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address && userSharesRaw !== undefined, refetchInterval: 3000, refetchOnWindowFocus: true },
  });

  const userSharesRawBigInt = (userSharesRaw as bigint | undefined) ?? 0n;
  const userAssetsRawBigInt = (userAssetsRaw as bigint | undefined) ?? 0n;
  const totalAssets = totalAssetsRaw ? parseFloat(formatUnits(totalAssetsRaw as bigint, 6)) : 0;
  const sharePrice = sharePriceRaw && (sharePriceRaw as bigint) > 0n ? parseFloat(formatUnits(sharePriceRaw as bigint, 18)) : 1.0;
  const userShares = userSharesRaw ? parseFloat(formatUnits(userSharesRaw as bigint, 18)) : 0;
  const userDeposited = userAssetsRaw ? parseFloat(formatUnits(userAssetsRaw as bigint, 6)) : 0;

  const refetchAll = () => {
    refetchAssets();
    refetchSharePrice();
    refetchShares();
    refetchUserAssets();
  };

  return {
    totalAssets,
    sharePrice,
    userShares,
    userDeposited,
    userAssetsRaw: userAssetsRawBigInt,
    userSharesRaw: userSharesRawBigInt,
    isUserSharesLoading,
    isUserAssetsLoading,
    refetchAll,
  };
}
