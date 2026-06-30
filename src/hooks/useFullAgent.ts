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
import { stableSwapAbi, vaultAbi, erc20Abi } from "@/config/abis";
import { CONTRACTS, TOKENS, TOKEN_INDEX, arcTestnet } from "@/config/wagmi";
import { applySlippage } from "@/lib/slippage";
import type { Write } from "@/lib/circleTx";
import type { BridgeChainKey } from "@/features/bridge/config/bridgeConfig";

// ── Result types ──────────────────────────────────────────────────────────────

export interface ActionResult {
  ok: boolean;
  txHash?: string;
  detail?: string;  // human-readable extra info (e.g. "swapped 100 USDC → 99.87 EURC")
  error?: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFullAgent() {
  const { address, isConnected, signer } = useWallet();
  const tx = useTx();
  const bridge = useBridge();
  const { send: sendToken, isPending: isSendPending } = useSendToken();

  // ── Live position data ────────────────────────────────────────────────────
  const pool = usePoolData();
  const vaultUsdc = useVaultData("USDC");
  const vaultEurc = useVaultData("EURC");
  const usdcBalance = useTokenBalance("USDC");
  const eurcBalance = useTokenBalance("EURC");

  // ── Yield metrics ─────────────────────────────────────────────────────────
  const poolApr = estimatePoolApy(pool.totalLiquidity, pool.totalLiquidity * 0.3, pool.feePercent);
  const vaultUsdcApy = useDynamicApy("vault-USDC", vaultUsdc.sharePrice, 4.0);
  const vaultEurcApy = useDynamicApy("vault-EURC", vaultEurc.sharePrice, 4.0);

  // Stable singleton - creating publicClient inside the hook body would make a new instance every render
  const publicClient = useRef(createPublicClient({ chain: arcTestnet, transport: http() })).current;

  // ── Swap ─────────────────────────────────────────────────────────────────

  const performSwap = useCallback(
    async (fromSymbol: "USDC" | "EURC", toSymbol: "USDC" | "EURC", amount: string): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const fromToken = TOKENS[fromSymbol];
        const toToken = TOKENS[toSymbol];
        const parsedAmount = parseUnits(amount, fromToken.decimals);
        const i = BigInt(TOKEN_INDEX[fromSymbol]);
        const j = BigInt(TOKEN_INDEX[toSymbol]);

        const dyRaw = await publicClient.readContract({
          address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi,
          functionName: "get_dy", args: [i, j, parsedAmount],
        }) as bigint;

        if (!dyRaw || dyRaw <= 0n) return { ok: false, error: "No liquidity available for this swap." };
        const minDy = applySlippage(dyRaw, 50n); // 0.5% slippage
        const expectedOut = Number(formatUnits(dyRaw, toToken.decimals)).toFixed(4);

        const writes: Write[] = [
          { address: fromToken.address, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, parsedAmount] },
          { address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "exchange", args: [i, j, parsedAmount, minDy] },
        ];
        const hash = await tx.execute(writes);
        return { ok: true, txHash: hash ?? undefined, detail: `Swapped ${amount} ${fromSymbol} → ${expectedOut} ${toSymbol}` };
      } catch (e: any) {
        return { ok: false, error: e?.message?.slice(0, 160) ?? "Swap failed." };
      }
    },
    [address, isConnected, tx, publicClient],
  );

  // ── Add Liquidity ─────────────────────────────────────────────────────────

  const addLiquidity = useCallback(
    async (usdcAmount: string, eurcAmount: string): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const usdcParsed = usdcAmount && parseFloat(usdcAmount) > 0 ? parseUnits(usdcAmount, 6) : 0n;
        const eurcParsed = eurcAmount && parseFloat(eurcAmount) > 0 ? parseUnits(eurcAmount, 6) : 0n;
        if (usdcParsed === 0n && eurcParsed === 0n) return { ok: false, error: "Specify an amount to add." };

        const lpPreview = await publicClient.readContract({
          address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi,
          functionName: "calc_token_amount", args: [[usdcParsed, eurcParsed] as [bigint, bigint], true],
        }) as bigint;
        const minMint = applySlippage(lpPreview, 50n);

        const writes: Write[] = [];
        if (usdcParsed > 0n) writes.push({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, usdcParsed] });
        if (eurcParsed > 0n) writes.push({ address: TOKENS.EURC.address, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, eurcParsed] });
        writes.push({ address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "add_liquidity", args: [[usdcParsed, eurcParsed] as [bigint, bigint], minMint] });

        const hash = await tx.execute(writes);
        const parts = [usdcParsed > 0n && `${usdcAmount} USDC`, eurcParsed > 0n && `${eurcAmount} EURC`].filter(Boolean).join(" + ");
        return { ok: true, txHash: hash ?? undefined, detail: `Added ${parts} to pool. Est. ${formatUnits(lpPreview, 18).slice(0, 8)} LP.` };
      } catch (e: any) {
        return { ok: false, error: e?.message?.slice(0, 160) ?? "Add liquidity failed." };
      }
    },
    [address, isConnected, tx, publicClient],
  );

  // ── Remove Liquidity ──────────────────────────────────────────────────────

  const removeLiquidity = useCallback(
    async (mode: "both" | "usdc" | "eurc", percentOfBalance: number = 100): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const totalLp = pool.lpBalanceRaw;
        if (totalLp <= 0n) return { ok: false, error: "No LP tokens in your wallet." };

        const pct = Math.min(100, Math.max(1, percentOfBalance));
        const lpAmount = (totalLp * BigInt(Math.round(pct * 100))) / 10000n;

        const writes: Write[] = [
          { address: CONTRACTS.LUNEX_LP, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, lpAmount] },
        ];

        if (mode === "both") {
          writes.push({ address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "remove_liquidity", args: [lpAmount, [0n, 0n] as [bigint, bigint]] });
        } else {
          const coinIdx = BigInt(mode === "usdc" ? 0 : 1);
          writes.push({ address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "remove_liquidity_one_coin", args: [lpAmount, coinIdx, 0n] });
        }

        const hash = await tx.execute(writes);
        return {
          ok: true, txHash: hash ?? undefined,
          detail: `Removed ${pct < 100 ? pct + "% of" : "all"} LP${mode !== "both" ? ` as ${mode.toUpperCase()}` : ""}.`,
        };
      } catch (e: any) {
        return { ok: false, error: e?.message?.slice(0, 160) ?? "Remove liquidity failed." };
      }
    },
    [address, isConnected, tx, pool.lpBalanceRaw],
  );

  // ── Vault Deposit ─────────────────────────────────────────────────────────

  const vaultDeposit = useCallback(
    async (token: "USDC" | "EURC", rawAmount: bigint): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      if (rawAmount <= 0n) return { ok: false, error: "No balance to deposit." };
      try {
        const t = TOKENS[token];
        const vaultAddr = token === "USDC" ? CONTRACTS.LUNE_VAULT_USDC : CONTRACTS.LUNE_VAULT_EURC;
        const hash = await tx.execute([
          { address: t.address, abi: erc20Abi, functionName: "approve", args: [vaultAddr, rawAmount] },
          { address: vaultAddr, abi: vaultAbi, functionName: "deposit", args: [rawAmount, address] },
        ]);
        const human = formatUnits(rawAmount, t.decimals);
        return { ok: true, txHash: hash ?? undefined, detail: `Deposited ${parseFloat(human).toFixed(4)} ${token} into lune${token} vault.` };
      } catch (e: any) {
        return { ok: false, error: e?.message?.slice(0, 160) ?? "Vault deposit failed." };
      }
    },
    [address, isConnected, tx],
  );

  // ── Vault Withdraw ────────────────────────────────────────────────────────

  const vaultWithdraw = useCallback(
    async (token: "USDC" | "EURC", sharesRaw?: bigint): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const vaultData = token === "USDC" ? vaultUsdc : vaultEurc;
        const vaultAddr = token === "USDC" ? CONTRACTS.LUNE_VAULT_USDC : CONTRACTS.LUNE_VAULT_EURC;
        const shares = sharesRaw ?? vaultData.userSharesRaw;
        if (!shares || shares <= 0n) return { ok: false, error: `No ${token} shares in vault.` };
        const hash = await tx.execute([
          { address: vaultAddr, abi: vaultAbi, functionName: "redeem", args: [shares, address, address] },
        ]);
        const redeemed = formatUnits(vaultData.userAssetsRaw, 6);
        return { ok: true, txHash: hash ?? undefined, detail: `Withdrew ~${parseFloat(redeemed).toFixed(4)} ${token} from vault.` };
      } catch (e: any) {
        return { ok: false, error: e?.message?.slice(0, 160) ?? "Vault withdrawal failed." };
      }
    },
    [address, isConnected, tx, vaultUsdc, vaultEurc],
  );

  // ── Send Token ────────────────────────────────────────────────────────────

  const send = useCallback(
    async (token: "USDC" | "EURC", toAddress: string, amount: string): Promise<ActionResult> => {
      if (!address || !isConnected) return { ok: false, error: "Wallet not connected." };
      try {
        const hash = await sendToken({ fromKind: "eoa", token, chainKey: "arc", to: toAddress, amount });
        return { ok: true, txHash: hash ?? undefined, detail: `Sent ${amount} ${token} to ${toAddress.slice(0, 6)}…${toAddress.slice(-4)}.` };
      } catch (e: any) {
        return { ok: false, error: e?.message?.slice(0, 160) ?? "Send failed." };
      }
    },
    [address, isConnected, sendToken],
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
      } catch (e: any) {
        return { ok: false, error: e?.message?.slice(0, 160) ?? "Bridge failed." };
      }
    },
    [address, isConnected, bridge],
  );

  // ── Context summary (for chat responses) ─────────────────────────────────

  const getContext = useCallback(() => ({
    usdcBalance: usdcBalance.balance ? parseFloat(usdcBalance.balance.formatted) : 0,
    eurcBalance: eurcBalance.balance ? parseFloat(eurcBalance.balance.formatted) : 0,
    usdcBalanceRaw: usdcBalance.balance?.value ?? 0n,
    eurcBalanceRaw: eurcBalance.balance?.value ?? 0n,
    lpBalance: pool.lpBalance,
    lpBalanceRaw: pool.lpBalanceRaw,
    vaultUsdcDeposited: vaultUsdc.userDeposited,
    vaultUsdcSharesRaw: vaultUsdc.userSharesRaw,
    vaultEurcDeposited: vaultEurc.userDeposited,
    vaultEurcSharesRaw: vaultEurc.userSharesRaw,
    poolApr,
    vaultUsdcApy,
    vaultEurcApy,
    totalLiquidity: pool.totalLiquidity,
    bridgeStatus: bridge.status,
    bridgeError: bridge.error,
    bridgeTx: bridge.bridgeTx,
  }), [usdcBalance, eurcBalance, pool, vaultUsdc, vaultEurc, poolApr, vaultUsdcApy, vaultEurcApy, bridge]);

  return {
    // Data
    pool, vaultUsdc, vaultEurc, usdcBalance, eurcBalance,
    poolApr, vaultUsdcApy, vaultEurcApy,
    // Actions
    performSwap,
    addLiquidity,
    removeLiquidity,
    vaultDeposit,
    vaultWithdraw,
    send,
    startBridge,
    getContext,
    // Raw state
    tx,
    bridge,
    isBusy: tx.isPending || isSendPending || !["idle", "complete", "failed"].includes(bridge.status),
  };
}
