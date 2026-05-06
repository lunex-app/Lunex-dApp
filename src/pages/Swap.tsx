import { useState, useEffect } from "react";
import { ArrowDownUp, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { TOKENS } from "@/config/wagmi";
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

const tokenList = Object.values(TOKENS);
const slippageOptions = ["0.1", "0.5", "1.0"];
const SWAP_COLUMNS = [
  { key: "sold", label: "Sold" },
  { key: "bought", label: "Bought" },
  { key: "amountIn", label: "Amount In" },
  { key: "amountOut", label: "Amount Out" },
];

const Swap = () => {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const balances = useTokenBalances();
  const history = useSectionHistory("swap");
  const { formattedTotal: globalBalance, isLoading: globalBalanceLoading } = useUnifiedBalance();

  const [fromToken, setFromToken] = useState(tokenList[0]);
  const [toToken, setToToken] = useState(tokenList[1]);
  const [fromAmount, setFromAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [showSlippage, setShowSlippage] = useState(false);

  const swap = useSwap({ fromSymbol: fromToken.symbol, toSymbol: toToken.symbol, amount: fromAmount, slippage });

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
  const minReceived = swap.outputAmount > 0 ? (swap.outputAmount * (1 - parseFloat(slippage) / 100)).toFixed(2) : "0.00";

  const flipTokens = () => { setFromToken(toToken); setToToken(fromToken); setFromAmount(""); };

  const bal = balances[fromToken.symbol as keyof typeof balances];
  const parsedFromAmount = parseTokenAmount(fromAmount, fromToken.decimals);
  const hasInsufficientBalance = hasInsufficientTokenBalance(fromAmount, bal?.balance);

  const getButtonText = () => {
    if (!isConnected) return "CONNECT WALLET";
    if (!fromAmount || parsedFromAmount <= 0n) return "ENTER AN AMOUNT";
    if (hasInsufficientBalance) return "INSUFFICIENT BALANCE";
    if (swap.isApproving) return "APPROVING...";
    if (swap.isBusy) return "SWAPPING...";
    if (swap.needsApproval) return `APPROVE ${fromToken.symbol}`;
    return "SWAP";
  };

  const handleClick = () => {
    if (!isConnected && openConnectModal) { openConnectModal(); return; }
    if (fromAmount && parsedFromAmount > 0n && !hasInsufficientBalance) swap.executeSwap();
  };

  const impactColor = swap.priceImpact < 0.1 ? "text-green" : swap.priceImpact < 1 ? "text-yellow-400" : "text-destructive";

  return (
    <div className="container max-w-lg mx-auto py-16 px-4">
      <div className="mb-8">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6">Swap Assets</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Institutional-grade StableSwap efficiency</p>
      </div>

      {isConnected && (
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center justify-between px-4 py-3 bg-primary/10 border border-primary/30 rounded-sm">
            <div className="flex items-center gap-3">
               <Wallet className="h-4 w-4 text-primary" />
               <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Global Unified Balance</span>
            </div>
            {globalBalanceLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
            ) : (
              <span className="font-mono text-sm font-bold text-primary">
                {globalBalance} USDC
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border border-border bg-card rounded-sm">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">USDC Available</p>
              <p className="text-lg font-bold font-mono">{balances.USDC.formatted}</p>
            </div>
            <div className="p-4 border border-border bg-card rounded-sm">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">EURC Available</p>
              <p className="text-lg font-bold font-mono">{balances.EURC.formatted}</p>
            </div>
          </div>
        </div>
      )}

      <div className="border border-border bg-card rounded-sm overflow-visible shadow-sm">
        <div className="p-6 border-b border-border flex justify-between items-center">
           <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Market Swap</span>
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
                placeholder="Custom" 
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

        <div className="p-6 border-t border-border">
          <Button 
            className="w-full h-14 text-sm font-bold tracking-[0.2em] uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]" 
            onClick={handleClick} 
            disabled={swap.isBusy || hasInsufficientBalance || parsedFromAmount <= 0n}
          >
            {swap.isBusy && <Loader2 className="h-4 w-4 animate-spin mr-3" />}
            {getButtonText()}
          </Button>
        </div>
      </div>

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
