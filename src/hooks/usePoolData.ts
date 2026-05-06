import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { stableSwapAbi, erc20Abi } from "@/config/abis";
import { CONTRACTS, arcTestnet } from "@/config/wagmi";

export function usePoolData() {
  const { address } = useAccount();

  const { data: usdcReserveRaw, refetch: refetchUsdcReserve } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL,
    abi: stableSwapAbi,
    functionName: "balances",
    args: [0n],
    chainId: arcTestnet.id,
    query: { refetchInterval: 5000 },
  });

  const { data: eurcReserveRaw, refetch: refetchEurcReserve } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL,
    abi: stableSwapAbi,
    functionName: "balances",
    args: [1n],
    chainId: arcTestnet.id,
    query: { refetchInterval: 5000 },
  });

  const { data: feeRaw, refetch: refetchFee } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL,
    abi: stableSwapAbi,
    functionName: "fee",
    chainId: arcTestnet.id,
    query: { refetchInterval: 5000 },
  });

  const { data: lpTokenRaw, refetch: refetchLpToken } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL,
    abi: stableSwapAbi,
    functionName: "lpToken",
    chainId: arcTestnet.id,
    query: { refetchInterval: 5000 },
  });

  const lpTokenAddress = (lpTokenRaw as `0x${string}` | undefined) ?? CONTRACTS.LUNEX_LP;

  const { data: lpDecimalsRaw, refetch: refetchLpDecimals } = useReadContract({
    address: lpTokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
    chainId: arcTestnet.id,
    query: { enabled: !!lpTokenAddress },
  });

  const {
    data: lpBalanceRaw,
    refetch: refetchLpBalance,
    isLoading: isLpBalanceLoading,
  } = useReadContract({
    address: lpTokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: !!address, refetchInterval: 5000 },
  });

  const {
    data: lpTotalSupplyRaw,
    refetch: refetchLpSupply,
    isLoading: isLpSupplyLoading,
  } = useReadContract({
    address: lpTokenAddress,
    abi: erc20Abi,
    functionName: "totalSupply",
    chainId: arcTestnet.id,
    query: { refetchInterval: 5000 },
  });

  const lpDecimals = typeof lpDecimalsRaw === "number" ? lpDecimalsRaw : 18;
  const lpBalanceRawBigInt = (lpBalanceRaw as bigint | undefined) ?? 0n;
  const lpTotalSupplyRawBigInt = (lpTotalSupplyRaw as bigint | undefined) ?? 0n;

  const usdcReserve = usdcReserveRaw ? parseFloat(formatUnits(usdcReserveRaw as bigint, 6)) : 0;
  const eurcReserve = eurcReserveRaw ? parseFloat(formatUnits(eurcReserveRaw as bigint, 6)) : 0;
  const totalLiquidity = usdcReserve + eurcReserve;
  const fee = feeRaw ? parseFloat(formatUnits(feeRaw as bigint, 8)) : 0.04;
  const feePercent = (fee * 100).toFixed(2);
  const lpBalance = lpBalanceRaw ? parseFloat(formatUnits(lpBalanceRaw as bigint, lpDecimals)) : 0;
  const lpTotalSupply = lpTotalSupplyRaw ? parseFloat(formatUnits(lpTotalSupplyRaw as bigint, lpDecimals)) : 0;
  const poolShare = lpTotalSupply > 0 ? (lpBalance / lpTotalSupply) * 100 : 0;

  const refetchAll = () => {
    refetchUsdcReserve();
    refetchEurcReserve();
    refetchFee();
    refetchLpToken();
    refetchLpDecimals();
    refetchLpBalance();
    refetchLpSupply();
  };

  return {
    usdcReserve,
    eurcReserve,
    totalLiquidity,
    fee,
    feePercent,
    lpBalance,
    lpBalanceRaw: lpBalanceRawBigInt,
    lpTotalSupply,
    lpTotalSupplyRaw: lpTotalSupplyRawBigInt,
    poolShare,
    lpTokenAddress,
    lpDecimals,
    isLpBalanceLoading,
    isLpSupplyLoading,
    refetchAll,
  };
}
