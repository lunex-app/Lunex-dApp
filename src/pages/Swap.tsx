import { useState, useEffect, useMemo } from "react";
import { ArrowDown, Settings, Loader2, X, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useWallet } from "@/context/WalletProvider";
import { CONTRACTS, TOKEN_INDEX, TOKENS, arcTestnet } from "@/config/wagmi";
import { useTokenBalances } from "@/hooks/useTokenBalance";
import { useSwap } from "@/hooks/useSwap";
import { TokenSelector } from "@/components/TokenSelector";
import { TransactionModal, computeTxStage } from "@/components/TransactionModal";
import { hasInsufficientTokenBalance, parseTokenAmount } from "@/lib/tokenAmounts";
import { useUnifiedBalance } from "@/features/bridge/hooks/useUnifiedBalance";
import { applySlippage, MAX_SLIPPAGE_PERCENT, parseSlippageBps, parseSlippagePercent } from "@/lib/slippage";
import { createId, protocolStorage, type LimitOrder } from "@/lib/localProtocol";
import { recordPointEvent } from "@/lib/points";
import { lunexLimitOrderKeeperAbi } from "@/config/abis";
import { useApproveToken } from "@/hooks/useApproveToken";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errors";
import { parseEventLogs } from "viem";
import { useLivePrices } from "@/hooks/useLivePrices";
import TradingViewChart from "@/components/TradingViewChart";
import { cn } from "@/lib/utils";

// ── Token logos (same source as TokenIcon) ─────────────────────────────────
const TOKEN_LOGOS: Record<string, string> = {
  USDC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  EURC: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1aBaEA1f7C830bD89Acc67eC4af516284b1bC33c/logo.png",
  USDT: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
};

const tokenList = Object.values(TOKENS);
const slippageOptions = ["0.1", "0.5", "1.0"];

// ─────────────────────────────────────────────────────────────────────────────

const Swap = () => {
  const { address, isConnected, openConnect } = useWallet();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const balances = useTokenBalances();
  const { formattedTotal: globalBalance } = useUnifiedBalance();

  const [fromToken, setFromToken] = useState(tokenList[0]);
  const [toToken,   setToToken]   = useState(tokenList[1]);
  const [fromAmount, setFromAmount] = useState("");
  const [slippage,   setSlippage]  = useState("0.5");
  const [showSlippage, setShowSlippage] = useState(false);
  const [orderMode] = useState<"market" | "limit">("market");
  const [targetRate, setTargetRate]         = useState("");
  const [limitDirection, setLimitDirection] = useState<"above" | "below">("below");
  const [limitOrders, setLimitOrders]       = useState<LimitOrder[]>(() => protocolStorage.loadLimitOrders(address));
  const [pendingLimitOrder, setPendingLimitOrder] = useState<LimitOrder | null>(null);

  const swap   = useSwap({ fromSymbol: fromToken.symbol, toSymbol: toToken.symbol, amount: fromAmount, slippage });
  const prices = useLivePrices();

  const limitApproval = useApproveToken(fromToken.address, CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER, fromToken.decimals);
  const { writeContract: writeLimitOrder,   data: limitOrderTxHash,   isPending: isLimitOrderPending,   error: limitOrderError   } = useWriteContract();
  const { writeContract: writeCancelOrder,  data: cancelOrderTxHash,  isPending: isCancelOrderPending,  error: cancelOrderError  } = useWriteContract();
  const { writeContract: writeExecuteOrder, data: executeOrderTxHash, isPending: isExecuteOrderPending, error: executeOrderError } = useWriteContract();
  const { isLoading: isLimitOrderConfirming, isSuccess: isLimitOrderConfirmed } = useWaitForTransactionReceipt({ hash: limitOrderTxHash,  chainId: arcTestnet.id });
  const { isSuccess: isCancelOrderConfirmed  } = useWaitForTransactionReceipt({ hash: cancelOrderTxHash,  chainId: arcTestnet.id });
  const { isSuccess: isExecuteOrderConfirmed } = useWaitForTransactionReceipt({ hash: executeOrderTxHash, chainId: arcTestnet.id });
  const [pendingCancelId,  setPendingCancelId]  = useState<string | null>(null);
  const [pendingExecuteId, setPendingExecuteId] = useState<string | null>(null);

  const txStage = computeTxStage({
    approveError: swap.approveError, actionError: swap.swapError, isConfirmed: swap.isConfirmed,
    isActionPending: swap.isSwapPending, actionTxHash: swap.swapTxHash, isActionConfirming: swap.isSwapConfirming,
    isApprovePending: swap.isApprovePending, approveTxHash: swap.approveTxHash, isApproveConfirming: swap.isApproveConfirming,
    isApproved: swap.isApproved, isAllowanceLoading: swap.isAllowanceLoading,
  });

  const handleModalClose = () => {
    const wasSuccess = swap.isConfirmed;
    swap.resetAll();
    if (wasSuccess) { setFromAmount(""); balances.USDC.refetch(); balances.EURC.refetch(); }
  };

  const toAmountFormatted = swap.outputAmount > 0 ? swap.outputAmount.toFixed(6) : "";
  const slippagePercent   = parseSlippagePercent(slippage);
  const minReceived = swap.outputAmount > 0 && slippagePercent !== null
    ? (swap.outputAmount * (1 - slippagePercent / 100)).toFixed(6)
    : "—";

  const flipTokens = () => { setFromToken(toToken); setToToken(fromToken); setFromAmount(""); };

  const bal   = balances[fromToken.symbol as keyof typeof balances];
  const toBal = balances[toToken.symbol   as keyof typeof balances];
  const parsedFromAmount       = parseTokenAmount(fromAmount, fromToken.decimals);
  const hasInsufficientBalance = hasInsufficientTokenBalance(fromAmount, bal?.balance);
  const impactColor = swap.priceImpact < 0.1 ? "text-emerald-400" : swap.priceImpact < 1 ? "text-yellow-400" : "text-destructive";

  // Fiat
  const fromPriceNum = prices.USDC.price; // default
  const toPriceNum   = prices[toToken.symbol as "USDC" | "EURC" | "USDT"]?.price ?? 1;
  const fromPriceVal = prices[fromToken.symbol as "USDC" | "EURC" | "USDT"]?.price ?? 1;
  const fromFiat = fromAmount && Number(fromAmount) > 0 ? `$${(Number(fromAmount) * fromPriceVal).toFixed(2)}` : "";
  const toFiat   = swap.outputAmount > 0 ? `$${(swap.outputAmount * toPriceNum).toFixed(2)}` : "";

  // Balances for selector modal
  const tokenBalances = {
    USDC: { formatted: isConnected ? balances.USDC.formatted : "—", isLoading: balances.USDC.isLoading },
    EURC: { formatted: isConnected ? balances.EURC.formatted : "—", isLoading: balances.EURC.isLoading },
    USDT: { formatted: isConnected ? (balances.USDT?.formatted ?? "0.00") : "—", isLoading: balances.USDT?.isLoading },
  };

  // CTA
  const getButtonText = () => {
    if (!isConnected)                          return "Connect Wallet";
    if (!fromAmount || parsedFromAmount <= 0n) return "Enter an Amount";
    if (!swap.isSlippageValid)                 return "Invalid Slippage";
    if (hasInsufficientBalance)                return "Insufficient Balance";
    if (swap.isApproving)                      return "Approving…";
    if (swap.isBusy)                           return "Swapping…";
    if (swap.needsApproval)                    return `Approve ${fromToken.symbol}`;
    return "Swap";
  };

  const handleClick = () => {
    if (!isConnected) { openConnect(); return; }
    if (fromAmount && parsedFromAmount > 0n && !hasInsufficientBalance) swap.executeSwap();
  };

  const isCtaDisabled = isConnected && (
    swap.isBusy || hasInsufficientBalance || parsedFromAmount <= 0n || !swap.isSlippageValid
  );

  // ── Limit order logic (preserved) ─────────────────────────────────────────
  useEffect(() => { setLimitOrders(protocolStorage.loadLimitOrders(address)); }, [address]);

  const evaluatedOrders = useMemo(() => limitOrders.map((order) => {
    const executable = order.status === "open" && Number(order.targetRate) > 0 && (
      order.direction === "below" ? swap.spotRate <= Number(order.targetRate) : swap.spotRate >= Number(order.targetRate)
    );
    return { ...order, effectiveStatus: executable ? "executable" : order.status };
  }), [limitOrders, swap.spotRate]);

  const refreshLimitOrders = () => setLimitOrders(protocolStorage.loadLimitOrders(address));

  const createLimitOrder = () => {
    if (!address || !fromAmount || parsedFromAmount <= 0n || hasInsufficientBalance || !targetRate || Number(targetRate) <= 0) return;
    if (limitApproval.needsApproval(fromAmount)) { limitApproval.requestApproval(fromAmount); return; }
    const slippageBps = parseSlippageBps(slippage);
    if (slippageBps === null || !swap.outputAmount) { toast.error("Quote unavailable"); return; }
    const quotedOutput = parseTokenAmount(swap.outputAmount.toFixed(toToken.decimals), toToken.decimals);
    const minAmountOut = applySlippage(quotedOutput, slippageBps);
    const targetRateE18 = parseTokenAmount(targetRate, 18);
    const order: LimitOrder = {
      id: createId("limit"), wallet: address,
      fromToken: fromToken.symbol as "USDC" | "EURC", toToken: toToken.symbol as "USDC" | "EURC",
      amount: fromAmount, targetRate, direction: limitDirection,
      status: "open", createdAt: Date.now(), updatedAt: Date.now(),
    };
    setPendingLimitOrder(order);
    writeLimitOrder({
      address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER, abi: lunexLimitOrderKeeperAbi,
      functionName: "createOrder",
      args: [TOKEN_INDEX[fromToken.symbol], TOKEN_INDEX[toToken.symbol], fromToken.address, toToken.address, parsedFromAmount, minAmountOut, targetRateE18, limitDirection === "below" ? 0 : 1],
      chain: arcTestnet, account: address,
    });
  };

  useEffect(() => {
    if (!isLimitOrderConfirmed || !limitOrderTxHash || !pendingLimitOrder || !address) return;
    let cancelled = false;
    const persistOrder = async () => {
      let contractOrderId: string | undefined;
      try {
        const receipt = await publicClient?.getTransactionReceipt({ hash: limitOrderTxHash });
        if (receipt) {
          const logs = parseEventLogs({ abi: lunexLimitOrderKeeperAbi, eventName: "OrderCreated", logs: receipt.logs });
          contractOrderId = logs[0]?.args.orderId?.toString();
        }
      } catch {}
      if (cancelled) return;
      const order = { ...pendingLimitOrder, contractOrderId, createTxHash: limitOrderTxHash, status: "open" as const, updatedAt: Date.now() };
      protocolStorage.saveLimitOrder(address, order);
      recordPointEvent({ wallet: address, action: "limit_order", volumeUsd: Number(fromAmount || 0), txHash: limitOrderTxHash, description: `Created ${fromToken.symbol}/${toToken.symbol} limit order` });
      refreshLimitOrders(); setPendingLimitOrder(null);
      toast.success("Limit order created");
    };
    persistOrder();
    return () => { cancelled = true; };
  }, [isLimitOrderConfirmed, limitOrderTxHash, pendingLimitOrder, address]);

  useEffect(() => { if (limitOrderError)  toast.error("Limit order failed",  { description: humanizeError(limitOrderError,  "Please try again.") }); }, [limitOrderError]);
  useEffect(() => { if (cancelOrderError)  toast.error("Cancel failed",       { description: humanizeError(cancelOrderError,  "Couldn't cancel.") }); }, [cancelOrderError]);
  useEffect(() => { if (executeOrderError) toast.error("Execution failed",    { description: humanizeError(executeOrderError, "Order execution failed.") }); }, [executeOrderError]);

  useEffect(() => {
    if (!isCancelOrderConfirmed || !cancelOrderTxHash || !address || !pendingCancelId) return;
    protocolStorage.updateLimitOrder(address, pendingCancelId, { status: "cancelled", cancelTxHash: cancelOrderTxHash });
    refreshLimitOrders(); setPendingCancelId(null); toast.success("Limit order cancelled");
  }, [isCancelOrderConfirmed, cancelOrderTxHash, address, pendingCancelId]);

  useEffect(() => {
    if (!isExecuteOrderConfirmed || !executeOrderTxHash || !address || !pendingExecuteId) return;
    protocolStorage.updateLimitOrder(address, pendingExecuteId, { status: "filled", executeTxHash: executeOrderTxHash });
    refreshLimitOrders(); setPendingExecuteId(null); toast.success("Limit order executed");
  }, [isExecuteOrderConfirmed, executeOrderTxHash, address, pendingExecuteId]);

  const cancelLimitOrder = (id: string) => {
    if (!address) return;
    const order = limitOrders.find((item) => item.id === id);
    if (!order?.contractOrderId) { protocolStorage.updateLimitOrder(address, id, { status: "cancelled" }); refreshLimitOrders(); return; }
    setPendingCancelId(id);
    writeCancelOrder({ address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER, abi: lunexLimitOrderKeeperAbi, functionName: "cancelOrder", args: [BigInt(order.contractOrderId)], chain: arcTestnet, account: address });
  };

  const executeLimitOrder = (id: string) => {
    if (!address) return;
    const order = limitOrders.find((item) => item.id === id);
    if (!order?.contractOrderId) { toast.error("Missing onchain order ID"); return; }
    setPendingExecuteId(id);
    writeExecuteOrder({ address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER, abi: lunexLimitOrderKeeperAbi, functionName: "executeOrder", args: [BigInt(order.contractOrderId)], chain: arcTestnet, account: address });
  };

  // Ticker items — duplicated 4× for seamless infinite loop
  const TICKER_TOKENS = ["USDC", "EURC", "USDT"] as const;
  const tickerItems = [...Array(4)].flatMap(() =>
    TICKER_TOKENS.map((sym) => ({
      sym,
      price: prices[sym].price,
      change24h: prices[sym].change24h,
    }))
  );

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="container max-w-4xl mx-auto py-8 px-4">

      {/* ── Chart with scrolling price ticker on top ───────────────────────── */}
      <div className="mb-5 border border-border rounded-xl overflow-hidden">

        {/* Scrolling ticker bar */}
        <div className="relative overflow-hidden border-b border-border bg-card h-9">
          <div className="flex items-center gap-0 animate-ticker whitespace-nowrap absolute inset-0">
            {tickerItems.map(({ sym, price, change24h }, i) => {
              const isPos = change24h !== null && change24h >= 0;
              return (
                <span key={i} className="inline-flex items-center gap-1.5 px-4 shrink-0 h-full border-r border-border/40">
                  {/* logo */}
                  <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center p-0.5 shrink-0">
                    <img src={TOKEN_LOGOS[sym]} alt={sym} className="w-full h-full object-contain rounded-full" />
                  </span>
                  <span className="text-[11px] font-bold text-foreground">{sym}</span>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {prices.loading ? "…" : `$${price.toFixed(4)}`}
                  </span>
                  {change24h !== null ? (
                    <span className={cn(
                      "text-[10px] font-mono font-semibold inline-flex items-center gap-0.5",
                      isPos ? "text-emerald-400" : "text-red-400",
                    )}>
                      {isPos ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                      {isPos ? "+" : ""}{change24h.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        {/* Chart header row: label + pair selector */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Price Chart</span>
          <select
            value={(() => {
              const pair = `${fromToken.symbol}-${toToken.symbol}`;
              const reversed = `${toToken.symbol}-${fromToken.symbol}`;
              const canonical = ["USDC-EURC", "USDC-USDT", "EURC-USDT"];
              return canonical.includes(pair) ? pair : (canonical.includes(reversed) ? reversed : "USDC-EURC");
            })()}
            onChange={(e) => {
              const [f, t] = e.target.value.split("-");
              const found   = tokenList.find((tk) => tk.symbol === f);
              const foundTo = tokenList.find((tk) => tk.symbol === t);
              if (found)   setFromToken(found);
              if (foundTo) setToToken(foundTo);
            }}
            className="text-[11px] border border-border rounded-lg px-2 py-1 bg-background text-foreground outline-none focus:border-primary cursor-pointer"
          >
            <option value="USDC-EURC">USDC / EURC</option>
            <option value="USDC-USDT">USDC / USDT</option>
            <option value="EURC-USDT">EURC / USDT</option>
          </select>
        </div>

        <TradingViewChart fromSymbol={fromToken.symbol} toSymbol={toToken.symbol} height={280} />
      </div>

      {/* ── Swap card — compact jup.ag style ──────────────────────────────── */}
      <div>
        <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">

          {/* Card header */}
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <span className="text-xs font-black uppercase tracking-widest text-foreground">Swap</span>
            <button
              onClick={() => setShowSlippage(!showSlippage)}
              className={cn(
                "h-7 w-7 flex items-center justify-center rounded-lg transition-colors",
                showSlippage ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Slippage panel */}
          {showSlippage && (
            <div className="mx-3 mb-3 rounded-xl border border-border bg-muted/30 p-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Slippage</p>
                <button onClick={() => setShowSlippage(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="flex gap-1.5">
                {slippageOptions.map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setSlippage(opt)}
                    className={cn(
                      "flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-colors",
                      slippage === opt
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/50",
                    )}
                  >
                    {opt}%
                  </button>
                ))}
                <input
                  type="text"
                  placeholder={`0–${MAX_SLIPPAGE_PERCENT}%`}
                  value={slippage}
                  onChange={(e) => setSlippage(e.target.value)}
                  className="w-16 text-center px-2 py-1.5 rounded-lg border border-border bg-background text-[10px] font-mono outline-none focus:border-primary transition-colors"
                />
              </div>
            </div>
          )}

          {/* ── FROM box ───────────────────────────────────────────────── */}
          <div className="px-3 pb-1">
            {/* Label + balance row */}
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">From</span>
              {isConnected ? (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="font-mono">{bal?.isLoading ? "…" : (bal?.formatted ?? "0")}</span>
                  <span className="text-border">·</span>
                  <button onClick={() => { if (!bal?.balance) return; setFromAmount((parseFloat(bal.balance.formatted) * 0.5).toFixed(6)); }} className="text-primary hover:underline font-semibold">50%</button>
                  <button onClick={() => { if (!bal?.balance) return; setFromAmount(bal.balance.formatted); }} className="text-primary hover:underline font-semibold">MAX</button>
                </div>
              ) : <span className="text-[10px] text-muted-foreground/50">—</span>}
            </div>

            {/* Input row */}
            <div className="rounded-xl bg-muted/40 px-3 py-2 hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-2">
                {/* Big number */}
                <input
                  type="number"
                  placeholder="0"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  disabled={!isConnected}
                  className="flex-1 min-w-0 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/20 disabled:opacity-40 leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                {/* Token pill */}
                <TokenSelector
                  selected={fromToken}
                  onSelect={(t) => { if (t.symbol === toToken.symbol) setToToken(fromToken); setFromToken(t); }}
                  disabledSymbol={toToken.symbol}
                  balances={tokenBalances}
                />
              </div>
              {/* Fiat */}
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">{fromFiat || "$0.00"}</p>
            </div>
          </div>

          {/* ── Flip button ─────────────────────────────────────────────── */}
          <div className="flex justify-center -my-3 relative z-10">
            <button
              onClick={flipTokens}
              className="h-8 w-8 rounded-full border-[3px] border-card bg-muted flex items-center justify-center text-muted-foreground hover:text-primary hover:scale-110 transition-all shadow-sm"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* ── TO box ─────────────────────────────────────────────────── */}
          <div className="px-3 pt-1 pb-3">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">To</span>
              {isConnected && toBal && (
                <span className="text-[10px] text-muted-foreground font-mono">{toBal.isLoading ? "…" : toBal.formatted}</span>
              )}
            </div>

            <div className="rounded-xl bg-muted/25 px-3 py-2">
              <div className="flex items-center gap-2">
                <p className={cn("flex-1 min-w-0 text-xl font-bold leading-none", toAmountFormatted ? "text-foreground" : "text-muted-foreground/20")}>
                  {toAmountFormatted || "0"}
                </p>
                <TokenSelector
                  selected={toToken}
                  onSelect={(t) => { if (t.symbol === fromToken.symbol) setFromToken(toToken); setToToken(t); }}
                  disabledSymbol={fromToken.symbol}
                  balances={tokenBalances}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 font-mono">{toFiat || "$0.00"}</p>
            </div>
          </div>

          {/* ── Quote details ────────────────────────────────────────────── */}
          {fromAmount && swap.outputAmount > 0 && (
            <div className="mx-3 mb-3 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5 space-y-1.5 animate-in fade-in duration-150">
              {[
                ["Rate",         `1 ${fromToken.symbol} ≈ ${swap.spotRate.toFixed(4)} ${toToken.symbol}`],
                ["Impact",       `${swap.priceImpact.toFixed(3)}%`],
                ["Min received", `${minReceived} ${toToken.symbol}`],
              ].map(([label, value], i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                  <span className={cn("text-[10px] font-mono", label === "Impact" ? impactColor : "text-foreground")}>{value}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── CTA ──────────────────────────────────────────────────────── */}
          <div className="px-3 pb-4">
            <Button
              className="w-full h-10 rounded-full text-xs font-black tracking-widest uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
              onClick={handleClick}
              disabled={isCtaDisabled}
            >
              {swap.isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
              {getButtonText()}
            </Button>
          </div>
        </div>
      </div>

      <TransactionModal
        stage={txStage}
        approveLabel={`Authorize ${fromToken.symbol} Protocol Access`}
        actionLabel={`Swap ${fromAmount} ${fromToken.symbol} for ${toToken.symbol}`}
        successSummary={`Successfully swapped for ${swap.outputAmount.toFixed(6)} ${toToken.symbol}`}
        txHash={swap.swapTxHash || swap.approveTxHash}
        errorMessage={(swap.swapError || swap.approveError)?.message}
        onClose={handleModalClose}
        onRetry={() => swap.resetAll()}
      />
    </div>
  );
};

export default Swap;
