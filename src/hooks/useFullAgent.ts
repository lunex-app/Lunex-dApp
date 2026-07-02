/**
 * useFullAgent - all Lunex protocol actions in one hook, exposed for the
 * Autopilot chat agent to call autonomously.
 */
import { useCallback, useRef } from "react";
import { parseUnits, formatUnits, createPublicClient, http } from "viem";
import { useWallet } from "@/context/WalletProvider";
import { useTx } from "./useTx";
import { useBridge } from "@/features/bridge/hooks/useBridge";
import { useSendToken } from "./useSendToken";
import { usePoolData } from "./usePoolData";
import { useVaultData } from "./useVaultData";
import { useTokenBalance } from "./useTokenBalance";
import { estimatePoolApy, useDynamicApy } from "./useApy";
import { stableSwapAbi, vaultAbi, erc20Abi, lunexUsdtAbi } from "@/config/abis";
import { CONTRACTS, TOKENS, arcTestnet } from "@/config/wagmi";
import { applySlippage } from "@/lib/slippage";
import { run, type Write } from "@/lib/circleTx";
import type { BridgeChainKey } from "@/features/bridge/config/bridgeConfig";

// ── Result types ──────────────────────────────────────────────────────────────

export interface ActionResult {
  ok: boolean;
  txHash?: string;
  detail?: string;
  error?: string;
}

export type TokenSymbol = "USDC" | "EURC" | "USDT";

// ── Pool routing (mirrors useSwap.ts) ────────────────────────────────────────

const POOL_ROUTES: [string, string, `0x${string}`][] = [
  ["USDC", "EURC", CONTRACTS.LUNEX_SWAP_POOL],
  ["USDC", "USDT", CONTRACTS.POOL_USDC_USDT],
  ["EURC", "USDT", CONTRACTS.POOL_EURC_USDT],
];

type PoolKey = "USDC/EURC" | "USDC/USDT" | "EURC/USDT";

const POOL_INFO: Record<PoolKey, { pool: `0x${string}`; lp: `0x${string}`; coins: [TokenSymbol, TokenSymbol] }> = {
  "USDC/EURC": { pool: CONTRACTS.LUNEX_SWAP_POOL, lp: CONTRACTS.LUNEX_LP,     coins: ["USDC", "EURC"] },
  "USDC/USDT": { pool: CONTRACTS.POOL_USDC_USDT,  lp: CONTRACTS.LP_USDC_USDT, coins: ["USDC", "USDT"] },
  "EURC/USDT": { pool: CONTRACTS.POOL_EURC_USDT,  lp: CONTRACTS.LP_EURC_USDT, coins: ["EURC", "USDT"] },
};

function resolvePool(from: string, to: string): { pool: `0x${string}`; i: bigint; j: bigint } {
  for (const [coin0, coin1, pool] of POOL_ROUTES) {
    if ((from === coin0 && to === coin1) || (from === coin1 && to === coin0)) {
      return { pool, i: from === coin0 ? 0n : 1n, j: to === coin0 ? 0n : 1n };
    }
  }
  return { pool: CONTRACTS.LUNEX_SWAP_POOL, i: 0n, j: 1n };
}

function vaultAddr(token: TokenSymbol): `0x${string}` {
  if (token === "EURC") return CONTRACTS.LUNE_VAULT_EURC;
  if (token === "USDT") return CONTRACTS.LUNE_VAULT_USDT;
  return CONTRACTS.LUNE_VAULT_USDC;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFullAgent() {
  const { address, isConnected, signer, circle, uc } = useWallet();
  const tx = useTx();
  const bridge = useBridge();
  const { send: sendToken, isPending: isSendPending } = useSendToken();

  const pool     = usePoolData();
  const vaultUsdc = useVaultData("USDC");
  const vaultEurc = useVaultData("EURC");
  const vaultUsdt = useVaultData("USDT");
  const usdcBal   = useTokenBalance("USDC");
  const eurcBal   = useTokenBalance("EURC");
  const usdtBal   = useTokenBalance("USDT");

  const poolApr      = estimatePoolApy(pool.totalLiquidity, pool.totalLiquidity * 0.3, pool.feePercent);
  const vaultUsdcApy = useDynamicApy("vault-USDC", vaultUsdc.sharePrice, 4.0);
  const vaultEurcApy = useDynamicApy("vault-EURC", vaultEurc.sharePrice, 4.0);
  const vaultUsdtApy = useDynamicApy("vault-USDT", vaultUsdt.sharePrice, 4.0);

  const publicClient = useRef(createPublicClient({ chain: arcTestnet, transport: http() })).current;

  // ── Detect wallet kind for send ───────────────────────────────────────────

  const sendKind = circle ? "passkey" : uc ? "email" : "eoa";

  // ── Swap ─────────────────────────────────────────────────────────────────

  const performSwap = useCallback(
    async (fromSymbol: TokenSymbol, toSymbol: TokenSymbol, amount: string): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const fromToken = TOKENS[fromSymbol];
        const toToken   = TOKENS[toSymbol];
        const parsedAmount = parseUnits(amount, fromToken.decimals);
        const { pool: poolAddress, i, j } = resolvePool(fromSymbol, toSymbol);

        const dyRaw = await publicClient.readContract({
          address: poolAddress, abi: stableSwapAbi,
          functionName: "get_dy", args: [i, j, parsedAmount],
        }) as bigint;

        if (!dyRaw || dyRaw <= 0n) return { ok: false, error: "No liquidity available for this pair." };
        const minDy = applySlippage(dyRaw, 50n);
        const expectedOut = Number(formatUnits(dyRaw, toToken.decimals)).toFixed(4);

        const writes: Write[] = [
          { address: fromToken.address, abi: erc20Abi, functionName: "approve", args: [poolAddress, parsedAmount] },
          { address: poolAddress, abi: stableSwapAbi, functionName: "exchange", args: [i, j, parsedAmount, minDy] },
        ];
        const hash = await tx.execute(writes);
        return { ok: true, txHash: hash ?? undefined, detail: `Swapped ${amount} ${fromSymbol} → ${expectedOut} ${toSymbol}` };
      } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message?.slice(0, 160) ?? "Swap failed." };
      }
    },
    [address, isConnected, tx, publicClient],
  );

  // ── Add Liquidity ─────────────────────────────────────────────────────────

  const addLiquidity = useCallback(
    async (poolKey: string, tokenAmounts: Partial<Record<TokenSymbol, string>>): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const info = POOL_INFO[(poolKey as PoolKey)] ?? POOL_INFO["USDC/EURC"];
        const [coin0, coin1] = info.coins;
        const amt0 = tokenAmounts[coin0] ?? "0";
        const amt1 = tokenAmounts[coin1] ?? "0";
        const parsed0 = parseFloat(amt0) > 0 ? parseUnits(amt0, 6) : 0n;
        const parsed1 = parseFloat(amt1) > 0 ? parseUnits(amt1, 6) : 0n;
        if (parsed0 === 0n && parsed1 === 0n) return { ok: false, error: "Specify an amount to add." };

        // calc_token_amount reverts with division-by-zero on empty pools (D=0).
        // Fall back to 0 min-mint so the first deposit can still initialize the pool.
        let minMint = 0n;
        try {
          const lpPreview = await publicClient.readContract({
            address: info.pool, abi: stableSwapAbi,
            functionName: "calc_token_amount", args: [[parsed0, parsed1] as [bigint, bigint], true],
          }) as bigint;
          minMint = applySlippage(lpPreview, 50n);
        } catch {
          // Pool is empty or preview unavailable — proceed with minMint = 0
        }

        const writes: Write[] = [];
        if (parsed0 > 0n) writes.push({ address: TOKENS[coin0].address, abi: erc20Abi, functionName: "approve", args: [info.pool, parsed0] });
        if (parsed1 > 0n) writes.push({ address: TOKENS[coin1].address, abi: erc20Abi, functionName: "approve", args: [info.pool, parsed1] });
        writes.push({ address: info.pool, abi: stableSwapAbi, functionName: "add_liquidity", args: [[parsed0, parsed1] as [bigint, bigint], minMint] });

        const hash = await tx.execute(writes);
        const parts = [parsed0 > 0n && `${amt0} ${coin0}`, parsed1 > 0n && `${amt1} ${coin1}`].filter(Boolean).join(" + ");
        return { ok: true, txHash: hash ?? undefined, detail: `Added ${parts} to ${poolKey} pool.` };
      } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message?.slice(0, 160) ?? "Add liquidity failed." };
      }
    },
    [address, isConnected, tx, publicClient],
  );

  // ── Remove Liquidity ──────────────────────────────────────────────────────

  const removeLiquidity = useCallback(
    async (poolKey: string, mode: string, percentOfBalance: number = 100): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const info = POOL_INFO[(poolKey as PoolKey)] ?? POOL_INFO["USDC/EURC"];
        const [coin0] = info.coins;

        const totalLp = await publicClient.readContract({
          address: info.lp, abi: erc20Abi,
          functionName: "balanceOf", args: [address],
        }) as bigint;
        if (totalLp <= 0n) return { ok: false, error: `No LP tokens for ${poolKey} pool in your wallet.` };

        const pct = Math.min(100, Math.max(1, percentOfBalance));
        const lpAmount = (totalLp * BigInt(Math.round(pct * 100))) / 10000n;

        const writes: Write[] = [
          { address: info.lp, abi: erc20Abi, functionName: "approve", args: [info.pool, lpAmount] },
        ];

        const normalizedMode = mode.toLowerCase();
        if (normalizedMode === "both") {
          writes.push({ address: info.pool, abi: stableSwapAbi, functionName: "remove_liquidity", args: [lpAmount, [0n, 0n] as [bigint, bigint]] });
        } else {
          const coinIdx = BigInt(coin0.toLowerCase() === normalizedMode ? 0 : 1);
          writes.push({ address: info.pool, abi: stableSwapAbi, functionName: "remove_liquidity_one_coin", args: [lpAmount, coinIdx, 0n] });
        }

        const hash = await tx.execute(writes);
        return {
          ok: true, txHash: hash ?? undefined,
          detail: `Removed ${pct < 100 ? pct + "% of" : "all"} ${poolKey} LP${normalizedMode !== "both" ? ` as ${normalizedMode.toUpperCase()}` : ""}.`,
        };
      } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message?.slice(0, 160) ?? "Remove liquidity failed." };
      }
    },
    [address, isConnected, tx, publicClient],
  );

  // ── Vault Deposit ─────────────────────────────────────────────────────────

  const vaultDeposit = useCallback(
    async (token: TokenSymbol, rawAmount: bigint): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      if (rawAmount <= 0n) return { ok: false, error: "No balance to deposit." };
      try {
        const t = TOKENS[token];
        const vault = vaultAddr(token);
        const hash = await tx.execute([
          { address: t.address, abi: erc20Abi, functionName: "approve", args: [vault, rawAmount] },
          { address: vault, abi: vaultAbi, functionName: "deposit", args: [rawAmount, address] },
        ]);
        const human = formatUnits(rawAmount, t.decimals);
        return { ok: true, txHash: hash ?? undefined, detail: `Deposited ${parseFloat(human).toFixed(4)} ${token} into vault.` };
      } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message?.slice(0, 160) ?? "Vault deposit failed." };
      }
    },
    [address, isConnected, tx],
  );

  // ── Vault Withdraw ────────────────────────────────────────────────────────

  const vaultWithdraw = useCallback(
    async (token: TokenSymbol, sharesRaw?: bigint): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const vaultData = token === "USDC" ? vaultUsdc : token === "EURC" ? vaultEurc : vaultUsdt;
        const vault = vaultAddr(token);
        const shares = sharesRaw ?? vaultData.userSharesRaw;
        if (!shares || shares <= 0n) return { ok: false, error: `No ${token} shares in vault.` };
        const hash = await tx.execute([
          { address: vault, abi: vaultAbi, functionName: "redeem", args: [shares, address, address] },
        ]);
        const redeemed = formatUnits(vaultData.userAssetsRaw, 6);
        return { ok: true, txHash: hash ?? undefined, detail: `Withdrew ~${parseFloat(redeemed).toFixed(4)} ${token} from vault.` };
      } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message?.slice(0, 160) ?? "Vault withdrawal failed." };
      }
    },
    [address, isConnected, tx, vaultUsdc, vaultEurc, vaultUsdt],
  );

  // ── Send Token ────────────────────────────────────────────────────────────

  const send = useCallback(
    async (token: TokenSymbol, toAddress: string, amount: string): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const hash = await sendToken({ fromKind: sendKind, token, chainKey: "arc", to: toAddress, amount });
        return { ok: true, txHash: hash ?? undefined, detail: `Sent ${amount} ${token} to ${toAddress.slice(0, 6)}…${toAddress.slice(-4)}.` };
      } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message?.slice(0, 160) ?? "Send failed." };
      }
    },
    [address, isConnected, sendToken, sendKind],
  );

  // ── Bridge ────────────────────────────────────────────────────────────────

  const startBridge = useCallback(
    async (amount: string, fromChain: BridgeChainKey, toChain: BridgeChainKey, token: "USDC" | "EURC" = "USDC", fastPath: boolean = false): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        await bridge.startBridge(amount, fromChain, toChain, fastPath, token);
        return {
          ok: true,
          detail: `Bridge initiated: ${amount} ${token} from ${fromChain.toUpperCase()} → ${toChain.toUpperCase()}. Approve each wallet prompt, then wait for Circle attestation (~2-5 min).`,
        };
      } catch (e: unknown) {
        return { ok: false, error: (e as Error)?.message?.slice(0, 160) ?? "Bridge failed." };
      }
    },
    [address, isConnected, bridge],
  );

  // ── Faucet ────────────────────────────────────────────────────────────────

  const claimFaucet = useCallback(async (): Promise<ActionResult> => {
    if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
    try {
      const cooldown = await publicClient.readContract({
        address: TOKENS.USDT.address, abi: lunexUsdtAbi,
        functionName: "cooldownRemaining", args: [address as `0x${string}`],
      }) as bigint;
      if (cooldown > 0n) {
        const secs = Number(cooldown);
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m ${secs % 60}s`;
        return { ok: false, error: `Faucet is on cooldown — try again in ${timeStr}.` };
      }
      // Use run() directly so any wallet error throws here and is caught below,
      // rather than being swallowed by useTx's internal catch.
      const hash = await run(
        [{ address: TOKENS.USDT.address, abi: lunexUsdtAbi as never, functionName: "claim", args: [] }],
        signer,
      );
      return { ok: true, txHash: hash, detail: "Claimed **1,000 USDT** from the faucet." };
    } catch (e: unknown) {
      return { ok: false, error: (e as Error)?.message?.slice(0, 160) ?? "Faucet claim failed." };
    }
  }, [address, isConnected, signer, publicClient]);

  // ── Context summary ───────────────────────────────────────────────────────

  const getContext = useCallback(() => ({
    usdcBalance:         usdcBal.balance ? parseFloat(usdcBal.balance.formatted) : 0,
    eurcBalance:         eurcBal.balance ? parseFloat(eurcBal.balance.formatted) : 0,
    usdtBalance:         usdtBal.balance ? parseFloat(usdtBal.balance.formatted) : 0,
    usdcBalanceRaw:      usdcBal.balance?.value ?? 0n,
    eurcBalanceRaw:      eurcBal.balance?.value ?? 0n,
    usdtBalanceRaw:      usdtBal.balance?.value ?? 0n,
    lpBalance:           pool.lpBalance,
    lpBalanceRaw:        pool.lpBalanceRaw,
    vaultUsdcDeposited:  vaultUsdc.userDeposited,
    vaultUsdcSharesRaw:  vaultUsdc.userSharesRaw,
    vaultEurcDeposited:  vaultEurc.userDeposited,
    vaultEurcSharesRaw:  vaultEurc.userSharesRaw,
    vaultUsdtDeposited:  vaultUsdt.userDeposited,
    vaultUsdtSharesRaw:  vaultUsdt.userSharesRaw,
    poolApr,
    vaultUsdcApy,
    vaultEurcApy,
    vaultUsdtApy,
    totalLiquidity:      pool.totalLiquidity,
    bridgeStatus:        bridge.status,
    bridgeError:         bridge.error,
    bridgeTx:            bridge.bridgeTx,
  }), [usdcBal, eurcBal, usdtBal, pool, vaultUsdc, vaultEurc, vaultUsdt, poolApr, vaultUsdcApy, vaultEurcApy, vaultUsdtApy, bridge]);

  return {
    pool, vaultUsdc, vaultEurc, vaultUsdt,
    usdcBalance: usdcBal, eurcBalance: eurcBal, usdtBalance: usdtBal,
    poolApr, vaultUsdcApy, vaultEurcApy, vaultUsdtApy,
    performSwap,
    addLiquidity,
    removeLiquidity,
    vaultDeposit,
    vaultWithdraw,
    send,
    startBridge,
    claimFaucet,
    getContext,
    tx,
    bridge,
    isBusy: tx.isPending || isSendPending || !["idle", "complete", "failed"].includes(bridge.status),
  };
}
