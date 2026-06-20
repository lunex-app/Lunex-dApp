import { useState, useEffect, useMemo } from "react";
import { ArrowDownUp, Settings, Loader2, Clock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useWallet } from "@/context/WalletProvider";
import { CONTRACTS, TOKEN_INDEX, TOKENS, arcTestnet } from "@/config/wagmi";
import { useTokenBalances } from "@/hooks/useTokenBalance";
import { useSwap } from "@/hooks/useSwap";
import { TokenSelector } from "@/components/TokenSelector";
import { TransactionModal, computeTxStage } from "@/components/TransactionModal";
import { SectionHistory } from "@/components/SectionHistory";
import { useSectionHistory } from "@/hooks/useSectionHistory";
import BackButton from "@/components/BackButton";
import { hasInsufficientTokenBalance, parseTokenAmount } from "@/lib/tokenAmounts";
import { useUnifiedBalance } from "@/features/bridge/hooks/useUnifiedBalance";
import { Wallet } from "lucide-react";
import { applySlippage, MAX_SLIPPAGE_PERCENT, parseSlippageBps, parseSlippagePercent } from "@/lib/slippage";
import { createId, protocolStorage, type LimitOrder } from "@/lib/localProtocol";
import { recordPointEvent } from "@/lib/points";
import { lunexLimitOrderKeeperAbi } from "@/config/abis";
import { useApproveToken } from "@/hooks/useApproveToken";
import { toast } from "sonner";
import { humanizeError } from "@/lib/errors";
import { parseEventLogs } from "viem";

const tokenList = Object.values(TOKENS);
const slippageOptions = ["0.1", "0.5", "1.0"];
const SWAP_COLUMNS = [
  { key: "sold", label: "Sold" },
  { key: "bought", label: "Bought" },
  { key: "amountIn", label: "Amount In" },
  { key: "amountOut", label: "Amount Out" },
];

const Swap = () => {
  const { address, isConnected, openConnect } = useWallet();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const balances = useTokenBalances();
  const history = useSectionHistory("swap");
  const { formattedTotal: globalBalance, isLoading: globalBalanceLoading } = useUnifiedBalance();

  const [fromToken, setFromToken] = useState(tokenList[0]);
  const [toToken, setToToken] = useState(tokenList[1]);
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [showSlippage, setShowSlippage] = useState(false);
  const [orderMode, setOrderMode] = useState<"market" | "limit">("market");
  const [targetRate, setTargetRate] = useState("");
  const [limitDirection, setLimitDirection] = useState<"above" | "below">("below");
  const [limitOrders, setLimitOrders] = useState<LimitOrder[]>(() => protocolStorage.loadLimitOrders(address));
  const [pendingLimitOrder, setPendingLimitOrder] = useState<LimitOrder | null>(null);

  const swap = useSwap({ fromSymbol: fromToken.symbol, toSymbol: toToken.symbol, amount: fromAmount, slippage });
  const limitApproval = useApproveToken(fromToken.address, CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER, fromToken.decimals);
  const { writeContract: writeLimitOrder, data: limitOrderTxHash, isPending: isLimitOrderPending, error: limitOrderError } = useWriteContract();
  const { writeContract: writeCancelOrder, data: cancelOrderTxHash, isPending: isCancelOrderPending, error: cancelOrderError } = useWriteContract();
  const { writeContract: writeExecuteOrder, data: executeOrderTxHash, isPending: isExecuteOrderPending, error: executeOrderError } = useWriteContract();
  const { isLoading: isLimitOrderConfirming, isSuccess: isLimitOrderConfirmed } = useWaitForTransactionReceipt({ hash: limitOrderTxHash, chainId: arcTestnet.id });
  const { isSuccess: isCancelOrderConfirmed } = useWaitForTransactionReceipt({ hash: cancelOrderTxHash, chainId: arcTestnet.id });
  const { isSuccess: isExecuteOrderConfirmed } = useWaitForTransactionReceipt({ hash: executeOrderTxHash, chainId: arcTestnet.id });
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);
  const [pendingExecuteId, setPendingExecuteId] = useState<string | null>(null);

  useEffect(() => {
    if (swap.isConfirmed && swap.swapTxHash) {
      history.addTx({
        txHash: swap.swapTxHash,
        type: "swap",
        data: { sold: fromToken.symbol, bought: toToken.symbol, amountIn: fromAmount, amountOut: swap.outputAmount.toFixed(2) },
      });
    }
  }, [swap.isConfirmed, swap.swapTxHash]);

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

  const toAmountFormatted = swap.outputAmount > 0 ? swap.outputAmount.toFixed(2) : "";
  const slippagePercent = parseSlippagePercent(slippage);
  const minReceived = swap.outputAmount > 0 && slippagePercent !== null
    ? (swap.outputAmount * (1 - slippagePercent / 100)).toFixed(2)
    : "0.00";

  const flipTokens = () => { setFromToken(toToken); setToToken(fromToken); setFromAmount(""); };

  const bal = balances[fromToken.symbol as keyof typeof balances];
  const parsedFromAmount = parseTokenAmount(fromAmount, fromToken.decimals);
  const hasInsufficientBalance = hasInsufficientTokenBalance(fromAmount, bal?.balance);

  const getButtonText = () => {
    if (!isConnected) return "CONNECT";
    if (!fromAmount || parsedFromAmount <= 0n) return "ENTER AN AMOUNT";
    if (!swap.isSlippageValid) return "INVALID SLIPPAGE";
    if (hasInsufficientBalance) return "INSUFFICIENT BALANCE";
    if (swap.isApproving) return "APPROVING...";
    if (swap.isBusy) return "SWAPPING...";
    if (swap.needsApproval) return `APPROVE ${fromToken.symbol}`;
    return "SWAP";
  };

  const handleClick = () => {
    if (!isConnected) { openConnect(); return; }
    if (fromAmount && parsedFromAmount > 0n && !hasInsufficientBalance) swap.executeSwap();
  };

  const impactColor = swap.priceImpact < 0.1 ? "text-green" : swap.priceImpact < 1 ? "text-yellow-400" : "text-destructive";

  useEffect(() => {
    setLimitOrders(protocolStorage.loadLimitOrders(address));
  }, [address]);

  const evaluatedOrders = useMemo(() => {
    return limitOrders.map((order) => {
      const executable = order.status === "open" && Number(order.targetRate) > 0 && (
        order.direction === "below" ? swap.spotRate <= Number(order.targetRate) : swap.spotRate >= Number(order.targetRate)
      );
      return { ...order, effectiveStatus: executable ? "executable" : order.status };
    });
  }, [limitOrders, swap.spotRate]);

  const refreshLimitOrders = () => setLimitOrders(protocolStorage.loadLimitOrders(address));

  const createLimitOrder = () => {
    if (!address || !fromAmount || parsedFromAmount <= 0n || hasInsufficientBalance || !targetRate || Number(targetRate) <= 0) return;
    if (limitApproval.needsApproval(fromAmount)) {
      limitApproval.requestApproval(fromAmount);
      return;
    }
    const slippageBps = parseSlippageBps(slippage);
    if (slippageBps === null || !swap.outputAmount) {
      toast.error("Quote unavailable", { description: "Wait for a valid quote before creating a limit order." });
      return;
    }
    const quotedOutput = parseTokenAmount(swap.outputAmount.toFixed(toToken.decimals), toToken.decimals);
    const minAmountOut = applySlippage(quotedOutput, slippageBps);
    const targetRateE18 = parseTokenAmount(targetRate, 18);
    const order: LimitOrder = {
      id: createId("limit"),
      wallet: address,
      fromToken: fromToken.symbol as "USDC" | "EURC",
      toToken: toToken.symbol as "USDC" | "EURC",
      amount: fromAmount,
      targetRate,
      direction: limitDirection,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setPendingLimitOrder(order);
    writeLimitOrder({
      address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER,
      abi: lunexLimitOrderKeeperAbi,
      functionName: "createOrder",
      args: [
        TOKEN_INDEX[fromToken.symbol],
        TOKEN_INDEX[toToken.symbol],
        fromToken.address,
        toToken.address,
        parsedFromAmount,
        minAmountOut,
        targetRateE18,
        limitDirection === "below" ? 0 : 1,
      ],
      chain: arcTestnet,
      account: address,
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
          const logs = parseEventLogs({
            abi: lunexLimitOrderKeeperAbi,
            eventName: "OrderCreated",
            logs: receipt.logs,
          });
          contractOrderId = logs[0]?.args.orderId?.toString();
        }
      } catch {
        // Keep the local record even if the wallet/RPC does not return logs.
      }

      if (cancelled) return;
      const order = { ...pendingLimitOrder, contractOrderId, createTxHash: limitOrderTxHash, status: "open" as const, updatedAt: Date.now() };
      protocolStorage.saveLimitOrder(address, order);
      recordPointEvent({
        wallet: address,
        action: "limit_order",
        volumeUsd: Number(fromAmount || 0),
        txHash: limitOrderTxHash,
        description: `Created ${fromToken.symbol}/${toToken.symbol} limit order`,
      });
      refreshLimitOrders();
      setPendingLimitOrder(null);
      toast.success("Limit order created", { description: contractOrderId ? `Onchain order #${contractOrderId}` : "The keeper contract is escrowing this order on Arc." });
    };

    persistOrder();
    return () => {
      cancelled = true;
    };
  }, [isLimitOrderConfirmed, limitOrderTxHash, pendingLimitOrder, address, fromAmount, fromToken.symbol, toToken.symbol, publicClient]);

  useEffect(() => {
    if (limitOrderError) toast.error("Limit order failed", { description: humanizeError(limitOrderError, "Limit order failed. Please try again.") });
  }, [limitOrderError]);

  useEffect(() => {
    if (cancelOrderError) toast.error("Cancel failed", { description: humanizeError(cancelOrderError, "Couldn't cancel the order. Please try again.") });
  }, [cancelOrderError]);

  useEffect(() => {
    if (executeOrderError) toast.error("Execution failed", { description: humanizeError(executeOrderError, "Order execution failed. Please try again.") });
  }, [executeOrderError]);

  useEffect(() => {
    if (!isCancelOrderConfirmed || !cancelOrderTxHash || !address || !pendingCancelId) return;
    protocolStorage.updateLimitOrder(address, pendingCancelId, { status: "cancelled", cancelTxHash: cancelOrderTxHash });
    refreshLimitOrders();
    setPendingCancelId(null);
    toast.success("Limit order cancelled");
  }, [isCancelOrderConfirmed, cancelOrderTxHash, address, pendingCancelId]);

  useEffect(() => {
    if (!isExecuteOrderConfirmed || !executeOrderTxHash || !address || !pendingExecuteId) return;
    protocolStorage.updateLimitOrder(address, pendingExecuteId, { status: "filled", executeTxHash: executeOrderTxHash });
    refreshLimitOrders();
    setPendingExecuteId(null);
    toast.success("Limit order executed");
  }, [isExecuteOrderConfirmed, executeOrderTxHash, address, pendingExecuteId]);

  const cancelLimitOrder = (id: string) => {
    if (!address) return;
    const order = limitOrders.find((item) => item.id === id);
    if (!order?.contractOrderId) {
      protocolStorage.updateLimitOrder(address, id, { status: "cancelled" });
      refreshLimitOrders();
      return;
    }
    setPendingCancelId(id);
    writeCancelOrder({
      address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER,
      abi: lunexLimitOrderKeeperAbi,
      functionName: "cancelOrder",
      args: [BigInt(order.contractOrderId)],
      chain: arcTestnet,
      account: address,
    });
  };

  const executeLimitOrder = (id: string) => {
    if (!address) return;
    const order = limitOrders.find((item) => item.id === id);
    if (!order?.contractOrderId) {
      toast.error("Missing onchain order ID", { description: "Create the order again so the keeper can execute it." });
      return;
    }
    setPendingExecuteId(id);
    writeExecuteOrder({
      address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER,
      abi: lunexLimitOrderKeeperAbi,
      functionName: "executeOrder",
      args: [BigInt(order.contractOrderId)],
      chain: arcTestnet,
      account: address,
    });
  };

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <div className="mb-8">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6">Swap Assets</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Institutional-grade StableSwap efficiency</p>
      </div>

      {isConnected && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 border border-border bg-card rounded-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">USDC Available</p>
            <p className="text-lg font-bold font-mono">{balances.USDC.formatted}</p>
          </div>
          <div className="p-4 border border-border bg-card rounded-sm">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">EURC Available</p>
            <p className="text-lg font-bold font-mono">{balances.EURC.formatted}</p>
          </div>
        </div>
      )}

      <div className="border border-border bg-card rounded-sm overflow-visible shadow-sm">
        <div className="p-6 border-b border-border flex justify-between items-center">
           {/* Market / Limit order modes are disabled for this release — normal swap only. */}
           <span className="text-[10px] font-black uppercase tracking-widest text-primary">Swap</span>
           <button onClick={() => setShowSlippage(!showSlippage)} className="text-muted-foreground hover:text-primary transition-colors">
             <Settings className="h-4 w-4" />
           </button>
        </div>

        {showSlippage && (
          <div className="p-6 bg-muted/30 border-b border-border animate-in fade-in duration-200">
            <p className="text-[10px] text-muted-foreground mb-3 font-bold uppercase tracking-widest">Slippage Tolerance</p>
            <div className="flex gap-2">
              {slippageOptions.map((opt) => (
                <button 
                  key={opt} 
                  onClick={() => setSlippage(opt)} 
                  className={`px-3 py-1.5 text-xs font-bold border transition-all ${slippage === opt ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50"}`}
                >
                  {opt}%
                </button>
              ))}
              <input 
                type="text" 
                placeholder={`0-${MAX_SLIPPAGE_PERCENT}%`} 
                className="w-full px-3 py-1.5 text-xs border border-border bg-background font-mono outline-none focus:border-primary transition-colors"
                onChange={(e) => setSlippage(e.target.value)} 
              />
            </div>
          </div>
        )}

        <div className="p-6">
          <div className="flex justify-between items-end mb-3">
             <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">From</p>
             <p className="text-[10px] text-muted-foreground font-mono">Balance: {bal?.isLoading ? "..." : bal?.formatted ?? "0.00"}</p>
          </div>
          <div className="flex items-center gap-4 bg-muted/20 p-4 border border-border rounded-sm group hover:border-primary/30 transition-colors">
            <input 
              type="number" 
              placeholder="0.00" 
              value={fromAmount} 
              onChange={(e) => setFromAmount(e.target.value)} 
              disabled={!isConnected}
              className="flex-1 bg-transparent text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground/20 font-mono disabled:opacity-50 min-w-0" 
            />
            <TokenSelector selected={fromToken} onSelect={(t) => { if (t.symbol === toToken.symbol) setToToken(fromToken); setFromToken(t); }} />
          </div>
          <div className="flex gap-2 mt-4">
            {isConnected && [25, 55, 75, 100].map((pct) => (
              <button 
                key={pct} 
                onClick={() => {
                  if (!bal?.balance) return;
                  const value = (parseFloat(bal.balance.formatted) * (pct / 100)).toFixed(fromToken.decimals === 6 ? 6 : 2);
                  setFromAmount(value);
                }} 
                className="flex-1 py-1.5 text-[10px] font-bold border border-border bg-background hover:border-primary hover:text-primary transition-all uppercase tracking-widest"
              >
                {pct === 100 ? "Max" : `${pct}%`}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-center -my-4 relative z-10">
          <button 
            onClick={flipTokens} 
            className="h-10 w-10 border border-border bg-background flex items-center justify-center text-muted-foreground hover:text-primary hover:border-primary transition-all hover:scale-110 shadow-sm"
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 pt-8">
          <div className="flex justify-between items-end mb-3">
             <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">To (Estimated)</p>
          </div>
          <div className="flex items-center gap-4 bg-muted/20 p-4 border border-border rounded-sm group hover:border-primary/30 transition-colors">
            <input 
              type="text" 
              placeholder="0.00" 
              value={toAmountFormatted} 
              readOnly 
              className="flex-1 bg-transparent text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground/20 font-mono min-w-0" 
            />
            <TokenSelector selected={toToken} onSelect={(t) => { if (t.symbol === fromToken.symbol) setFromToken(toToken); setToToken(t); }} />
          </div>
        </div>

        {fromAmount && swap.outputAmount > 0 && (
          <div className="px-6 py-4 bg-muted/10 border-t border-border space-y-3">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
              <span className="text-muted-foreground">Exchange Rate</span>
              <span className="font-mono text-foreground">1 {fromToken.symbol} = {swap.spotRate.toFixed(4)} {toToken.symbol}</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
              <span className="text-muted-foreground">Price Impact</span>
              <span className={`font-mono ${impactColor}`}>{swap.priceImpact.toFixed(4)}%</span>
            </div>
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
              <span className="text-muted-foreground">Min. Received</span>
              <span className="font-mono text-foreground">{minReceived} {toToken.symbol}</span>
            </div>
          </div>
        )}

        {orderMode === "limit" && (
          <div className="px-6 py-5 bg-muted/10 border-t border-border space-y-4">
            <div className="grid sm:grid-cols-[1fr_auto] gap-3">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Target Rate</label>
                <Input
                  type="number"
                  value={targetRate}
                  onChange={(event) => setTargetRate(event.target.value)}
                  placeholder={swap.spotRate > 0 ? swap.spotRate.toFixed(6) : "0.000000"}
                  className="h-11 font-mono"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Trigger</label>
                <div className="flex gap-px bg-border h-11">
                  {(["below", "above"] as const).map((direction) => (
                    <button
                      key={direction}
                      onClick={() => setLimitDirection(direction)}
                      className={`px-4 text-[10px] font-black uppercase tracking-widest ${limitDirection === direction ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                    >
                      {direction}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Limit orders are escrowed in the Lunex keeper contract. A keeper bot can execute them when the pool rate reaches the target.
            </p>
          </div>
        )}

        <div className="p-6 border-t border-border">
          <Button 
            className="w-full h-14 text-sm font-bold tracking-[0.2em] uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]" 
            onClick={orderMode === "market" ? handleClick : createLimitOrder} 
            disabled={
              orderMode === "market"
                ? swap.isBusy || hasInsufficientBalance || parsedFromAmount <= 0n || !swap.isSlippageValid
                : !isConnected || hasInsufficientBalance || parsedFromAmount <= 0n || !targetRate || Number(targetRate) <= 0 || limitApproval.isApproving || isLimitOrderPending || isLimitOrderConfirming
            }
          >
            {(swap.isBusy || limitApproval.isApproving || isLimitOrderPending || isLimitOrderConfirming) && <Loader2 className="h-4 w-4 animate-spin mr-3" />}
            {orderMode === "market"
              ? getButtonText()
              : limitApproval.needsApproval(fromAmount)
                ? `APPROVE ${fromToken.symbol}`
                : isLimitOrderPending || isLimitOrderConfirming
                  ? "CREATING LIMIT ORDER"
                  : "CREATE LIMIT ORDER"}
          </Button>
        </div>
      </div>

      {/* Limit orders list disabled for this release — normal swap only.
      {isConnected && evaluatedOrders.length > 0 && (
        <div className="mt-8 border border-border bg-card rounded-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase text-muted-foreground">Limit Orders</h3>
          </div>
          <div className="divide-y divide-border">
            {evaluatedOrders.slice(0, 5).map((order) => (
              <div key={order.id} className="p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-bold font-mono">{order.amount} {order.fromToken} → {order.toToken}</p>
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mt-1">
                    {order.direction} {order.targetRate} · {order.effectiveStatus}{order.createTxHash ? " · onchain" : ""}
                  </p>
                </div>
                {order.status === "open" && (
                  <div className="flex items-center gap-2">
                    {order.effectiveStatus === "executable" && (
                      <button
                        onClick={() => executeLimitOrder(order.id)}
                        disabled={isExecuteOrderPending || pendingExecuteId === order.id}
                        className="px-3 h-9 border border-primary text-[9px] font-black uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                      >
                        Execute
                      </button>
                    )}
                    <button
                      onClick={() => cancelLimitOrder(order.id)}
                      disabled={isCancelOrderPending || pendingCancelId === order.id}
                      className="p-2 text-muted-foreground hover:text-destructive disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      */}

      <div className="mt-12">
        <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase mb-6 text-muted-foreground border-b border-border pb-4">Transaction History</h3>
        <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">
          <SectionHistory transactions={history.transactions} columns={SWAP_COLUMNS} section="swap" />
        </div>
      </div>

      <TransactionModal 
        stage={txStage} 
        approveLabel={`Authorize ${fromToken.symbol} Protocol Access`}
        actionLabel={`Swap ${fromAmount} ${fromToken.symbol} for ${toToken.symbol}`}
        successSummary={`Successfully swapped for ${swap.outputAmount.toFixed(2)} ${toToken.symbol}`}
        txHash={swap.swapTxHash || swap.approveTxHash} 
        errorMessage={(swap.swapError || swap.approveError)?.message}
        onClose={handleModalClose} 
        onRetry={() => swap.resetAll()} 
      />
    </div>
  );
};

export default Swap;
