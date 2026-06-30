import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletProvider";
import { useTokenBalances } from "@/hooks/useTokenBalance";
import { useAddLiquidityPool } from "@/hooks/useLiquidity";
import { usePoolData } from "@/hooks/usePoolData";
import { TransactionModal, computeTxStage } from "@/components/TransactionModal";
import { useSectionHistory } from "@/hooks/useSectionHistory";
import BackButton from "@/components/BackButton";
import { hasInsufficientTokenBalance, parseTokenAmount } from "@/lib/tokenAmounts";
import { TokenIcon } from "@/components/TokenIcon";
import { DEFAULT_SLIPPAGE_PERCENT } from "@/lib/slippage";
import { CONTRACTS, TOKENS } from "@/config/wagmi";

const POOL_PAIRS = [
  { label: "EURC / USDC", pool: CONTRACTS.LUNEX_SWAP_POOL, coin0: TOKENS.USDC, coin1: TOKENS.EURC },
  { label: "USDT / USDC", pool: CONTRACTS.POOL_USDC_USDT,  coin0: TOKENS.USDC, coin1: TOKENS.USDT },
  { label: "USDT / EURC", pool: CONTRACTS.POOL_EURC_USDT,  coin0: TOKENS.EURC, coin1: TOKENS.USDT },
] as const;

const AddLiquidity = () => {
  const { isConnected, openConnect } = useWallet();
  const balances = useTokenBalances();
  const pool = usePoolData();
  const history = useSectionHistory("pool");

  const [pairIdx, setPairIdx] = useState(0);
  const [amount0, setAmount0] = useState("");
  const [amount1, setAmount1] = useState("");

  const pair = POOL_PAIRS[pairIdx];
  const liq = useAddLiquidityPool(pair.pool, pair.coin0, pair.coin1, amount0, amount1, String(DEFAULT_SLIPPAGE_PERCENT));

  useEffect(() => { setAmount0(""); setAmount1(""); }, [pairIdx]);

  useEffect(() => {
    if (liq.isConfirmed && liq.actionTxHash) {
      history.addTx({ txHash: liq.actionTxHash, type: "add_liquidity", data: { action: "Add", [`${pair.coin0.symbol}Amount`]: amount0 || "0", [`${pair.coin1.symbol}Amount`]: amount1 || "0", lpTokens: liq.lpPreview.toFixed(4) } });
    }
  }, [liq.isConfirmed, liq.actionTxHash]);

  useEffect(() => {
    if (liq.isConfirmed) { pool.refetchAll(); }
  }, [liq.isConfirmed]);

  const txStage = computeTxStage({
    approveError: null, actionError: liq.error, isConfirmed: liq.isConfirmed,
    isActionPending: liq.isActionPending, actionTxHash: liq.actionTxHash, isActionConfirming: liq.isActionConfirming,
    isApprovePending: false, approveTxHash: undefined, isApproveConfirming: false,
    isApproved: liq.isApproved, isAllowanceLoading: liq.isAllowanceLoading,
  });

  const handleModalClose = () => {
    const wasSuccess = liq.isConfirmed;
    liq.resetAll();
    if (wasSuccess) { setAmount0(""); setAmount1(""); pool.refetchAll(); }
  };

  const sharePreview = pool.lpTotalSupply > 0 && liq.lpPreview > 0
    ? ((liq.lpPreview / (pool.lpTotalSupply + liq.lpPreview)) * 100).toFixed(4)
    : "0.00";

  const parsed0 = parseTokenAmount(amount0, pair.coin0.decimals);
  const parsed1 = parseTokenAmount(amount1, pair.coin1.decimals);
  const hasAmount = parsed0 > 0n || parsed1 > 0n;

  const bal0 = balances[pair.coin0.symbol as keyof typeof balances];
  const bal1 = balances[pair.coin1.symbol as keyof typeof balances];
  const insufficient0 = hasInsufficientTokenBalance(amount0, bal0?.balance);
  const insufficient1 = hasInsufficientTokenBalance(amount1, bal1?.balance);
  const hasInsufficientBalance = insufficient0 || insufficient1;

  const getButtonText = () => {
    if (!isConnected) return "Connect Wallet";
    if (!hasAmount) return "Enter Amounts";
    if (insufficient0) return `Insufficient ${pair.coin0.symbol}`;
    if (insufficient1) return `Insufficient ${pair.coin1.symbol}`;
    if (liq.isApproving) return "Approving…";
    if (liq.isBusy) return "Adding Liquidity…";
    return "Add Liquidity";
  };

  const handleClick = () => {
    if (!isConnected) { openConnect(); return; }
    if (hasAmount && !hasInsufficientBalance) liq.execute();
  };

  const fields = [
    { coin: pair.coin0, value: amount0, onChange: setAmount0, bal: bal0, insufficient: insufficient0 },
    { coin: pair.coin1, value: amount1, onChange: setAmount1, bal: bal1, insufficient: insufficient1 },
  ] as const;

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <div className="mb-8">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">Provision Liquidity</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Provide token pairs to earn swap fees from the protocol pool</p>
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">

        {/* Pool pair selector */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border">
          <span className="text-xs font-black uppercase tracking-widest">Select Pool</span>
        </div>
        <div className="flex gap-2 px-4 py-3 border-b border-border bg-muted/10">
          {POOL_PAIRS.map((p, i) => (
            <button
              key={p.label}
              onClick={() => setPairIdx(i)}
              className={`flex-1 py-2 text-[10px] font-bold rounded-xl border transition-colors tracking-wide uppercase
                ${pairIdx === i ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Token inputs */}
        {fields.map(({ coin, value, onChange, bal, insufficient }) => (
          <div key={coin.symbol} className="px-4 py-3 border-b border-border/50">
            <div className="flex items-center justify-between mb-1.5 px-0.5">
              <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{coin.symbol} Amount</span>
              {isConnected ? (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="font-mono">{bal?.isLoading ? "…" : (bal?.formatted ?? "0")}</span>
                  <span className="text-border">·</span>
                  <button onClick={() => { if (!bal?.balance) return; onChange((parseFloat(bal.balance.formatted) * 0.5).toFixed(6)); }} className="text-primary hover:underline font-semibold">50%</button>
                  <button onClick={() => { if (!bal?.balance) return; onChange(bal.balance.formatted); }} className="text-primary hover:underline font-semibold">MAX</button>
                </div>
              ) : <span className="text-[10px] text-muted-foreground/50">—</span>}
            </div>
            <div className={`rounded-xl bg-muted/40 px-3 py-2 hover:bg-muted/50 transition-colors ${insufficient ? "ring-1 ring-destructive/50" : ""}`}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="0"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  disabled={!isConnected}
                  className="flex-1 min-w-0 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/20 disabled:opacity-40 leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <div className="flex items-center gap-1.5 bg-background rounded-full border border-border px-2.5 py-1.5 shrink-0">
                  <TokenIcon symbol={coin.symbol} size="sm" />
                  <span className="text-xs font-bold">{coin.symbol}</span>
                </div>
              </div>
              {insufficient && <p className="text-[10px] text-destructive mt-1">Insufficient {coin.symbol}</p>}
            </div>
          </div>
        ))}

        {/* LP Preview */}
        <div className="mx-4 my-3 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-muted-foreground">LP Units Preview</span>
            <span className="text-[10px] font-mono text-foreground">{liq.lpPreview.toFixed(4)}</span>
          </div>
          <div className="flex justify-between items-center mt-1.5">
            <span className="text-[10px] text-muted-foreground">Pool Share</span>
            <span className="text-[10px] font-mono text-foreground">{sharePreview}%</span>
          </div>
        </div>

        {/* CTA */}
        <div className="px-4 pb-4">
          <Button
            className="w-full h-10 rounded-full text-xs font-black tracking-widest uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
            onClick={handleClick}
            disabled={liq.isBusy || !hasAmount || hasInsufficientBalance}
          >
            {liq.isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
            {getButtonText()}
          </Button>
        </div>

        <div className="px-4 pb-3 text-center">
          <p className="text-[9px] text-primary/60 font-bold uppercase tracking-widest">LP units automatically accrue swap fees</p>
        </div>
      </div>

      <TransactionModal
        stage={txStage}
        approveLabel={`Authorize ${pair.coin0.symbol} / ${pair.coin1.symbol}`}
        actionLabel={`Add ${pair.coin0.symbol} / ${pair.coin1.symbol} Liquidity`}
        successSummary={`Minted ${liq.lpPreview.toFixed(4)} LP units`}
        txHash={liq.actionTxHash}
        errorMessage={liq.error?.message}
        onClose={handleModalClose}
        onRetry={() => liq.resetAll()}
      />
    </div>
  );
};

export default AddLiquidity;
