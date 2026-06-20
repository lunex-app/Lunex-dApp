import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletProvider";
import { useTokenBalances } from "@/hooks/useTokenBalance";
import { useAddLiquidity } from "@/hooks/useLiquidity";
import { usePoolData } from "@/hooks/usePoolData";
import { TransactionModal, computeTxStage } from "@/components/TransactionModal";
import { useSectionHistory } from "@/hooks/useSectionHistory";
import BackButton from "@/components/BackButton";
import { hasInsufficientTokenBalance, parseTokenAmount } from "@/lib/tokenAmounts";
import { TokenIcon } from "@/components/TokenIcon";
import { DEFAULT_SLIPPAGE_PERCENT } from "@/lib/slippage";

const AddLiquidity = () => {
  const { isConnected, openConnect } = useWallet();
  const balances = useTokenBalances();
  const pool = usePoolData();
  const history = useSectionHistory("pool");
  const [usdcAmount, setUsdcAmount] = useState("");
  const [eurcAmount, setEurcAmount] = useState("");

  const liq = useAddLiquidity(usdcAmount, eurcAmount, String(DEFAULT_SLIPPAGE_PERCENT));

  useEffect(() => {
    if (liq.isConfirmed && liq.actionTxHash) {
      history.addTx({ txHash: liq.actionTxHash, type: "add_liquidity", data: { action: "Add", usdcAmount: usdcAmount || "0", eurcAmount: eurcAmount || "0", lpTokens: liq.lpPreview.toFixed(4) } });
    }
  }, [liq.isConfirmed, liq.actionTxHash, history, usdcAmount, eurcAmount, liq.lpPreview]);

  useEffect(() => {
    if (liq.isConfirmed) {
      balances.USDC.refetch();
      balances.EURC.refetch();
      pool.refetchAll();
    }
  }, [liq.isConfirmed]);

  const txStage = computeTxStage({
    approveError: liq.usdcApproveError || liq.eurcApproveError, actionError: liq.error, isConfirmed: liq.isConfirmed,
    isActionPending: liq.isActionPending, actionTxHash: liq.actionTxHash, isActionConfirming: liq.isActionConfirming,
    isApprovePending: liq.usdcApprovePending || liq.eurcApprovePending,
    approveTxHash: liq.usdcApproveTxHash || liq.eurcApproveTxHash,
    isApproveConfirming: liq.usdcApproveConfirming || liq.eurcApproveConfirming,
    isApproved: liq.isApproved, isAllowanceLoading: liq.isAllowanceLoading,
  });

  const handleModalClose = () => {
    const wasSuccess = liq.isConfirmed;
    liq.resetAll();
    if (wasSuccess) {
      setUsdcAmount("");
      setEurcAmount("");
      balances.USDC.refetch();
      balances.EURC.refetch();
      pool.refetchAll();
    }
  };

  const sharePreview = pool.lpTotalSupply > 0 && liq.lpPreview > 0 ? ((liq.lpPreview / (pool.lpTotalSupply + liq.lpPreview)) * 100).toFixed(4) : "0.00";
  const parsedUsdcAmount = parseTokenAmount(usdcAmount, 6);
  const parsedEurcAmount = parseTokenAmount(eurcAmount, 6);
  const hasAmount = parsedUsdcAmount > 0n || parsedEurcAmount > 0n;
  const hasInsufficientUsdc = hasInsufficientTokenBalance(usdcAmount, balances.USDC.balance);
  const hasInsufficientEurc = hasInsufficientTokenBalance(eurcAmount, balances.EURC.balance);
  const hasInsufficientBalance = hasInsufficientUsdc || hasInsufficientEurc;

  const getButtonText = () => {
    if (!isConnected) return "CONNECT";
    if (!hasAmount) return "ENTER AMOUNTS";
    if (!liq.isSlippageValid) return "INVALID SLIPPAGE";
    if (hasInsufficientUsdc) return "INSUFFICIENT USDC";
    if (hasInsufficientEurc) return "INSUFFICIENT EURC";
    if (liq.isApproving) return "APPROVING...";
    if (liq.isBusy) return "ADDING LIQUIDITY...";
    return "ADD LIQUIDITY";
  };

  const handleClick = () => {
    if (!isConnected) { openConnect(); return; }
    if (hasAmount && !hasInsufficientBalance) liq.execute();
  };

  const tokenFields = [
    { token: "USDC" as const, value: usdcAmount, onChange: setUsdcAmount },
    { token: "EURC" as const, value: eurcAmount, onChange: setEurcAmount },
  ];

  return (
    <div className="container max-w-lg mx-auto py-16 px-4">
      <div className="mb-8">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">Provision Liquidity</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Acquire StableSwap LP units by providing asset pairs</p>
      </div>

      <div className="border border-border bg-card rounded-sm shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/20">
           <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Standardized Deposit</p>
        </div>
        
        <div className="p-6 space-y-6">
          {tokenFields.map(({ token, value, onChange }) => {
            const bal = balances[token];
            return (
              <div className="space-y-3" key={token}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{token} Input</span>
                  <span className="text-[10px] text-muted-foreground font-mono">Balance: {bal.isLoading ? "..." : bal.formatted}</span>
                </div>
                <div className="flex items-center gap-4 bg-muted/20 p-4 border border-border rounded-sm group hover:border-primary/30 transition-colors">
                  <input 
                    type="number" 
                    placeholder="0.00" 
                    value={value} 
                    onChange={(e) => onChange(e.target.value)} 
                    disabled={!isConnected} 
                    className="flex-1 bg-transparent text-3xl font-bold text-foreground outline-none placeholder:text-muted-foreground/20 font-mono disabled:opacity-50 min-w-0" 
                  />
                  <div className="flex items-center gap-2 bg-background px-3 py-1.5 border border-border rounded-sm">
                     <TokenIcon symbol={token} size="sm" />
                     <span className="text-xs font-bold font-mono">{token}</span>
                  </div>
                </div>
                {isConnected && (
                  <div className="flex gap-2">
                    {[25, 55, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => {
                          if (!bal.balance) return;
                          const v = (parseFloat(bal.balance.formatted) * (pct / 100)).toFixed(6);
                          onChange(v);
                        }}
                        className="flex-1 py-1.5 text-[10px] font-bold border border-border bg-background hover:border-primary hover:text-primary transition-all uppercase tracking-widest"
                      >
                        {pct === 100 ? "Max" : `${pct}%`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <div className="p-6 bg-muted/10 border border-border rounded-sm grid grid-cols-2 gap-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <Loader2 className="h-12 w-12" />
             </div>
             <div>
                <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-[0.2em] mb-1">LP Units Out</p>
                <p className="text-xl font-bold font-mono">{liq.lpPreview.toFixed(4)}</p>
             </div>
             <div>
                <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-[0.2em] mb-1">Pool Share</p>
                <p className="text-xl font-bold font-mono">{sharePreview}%</p>
             </div>
          </div>

          <Button 
            className="w-full h-14 bg-primary text-primary-foreground font-bold tracking-[0.2em] uppercase text-sm shadow-sm active:scale-[0.98] transition-all" 
            onClick={handleClick} 
            disabled={liq.isBusy || !hasAmount || hasInsufficientBalance || !liq.isSlippageValid}
          >
            {liq.isBusy && <Loader2 className="h-4 w-4 animate-spin mr-3" />}
            {getButtonText()}
          </Button>
        </div>
        
        <div className="p-4 bg-primary/5 border-t border-border">
           <p className="text-[9px] text-center text-primary font-bold uppercase tracking-[0.25em]">
              LP units automatically accrue swap fees within the protocol pool
           </p>
        </div>
      </div>

      <TransactionModal 
        stage={txStage}
        approveLabel={liq.usdcApprovePending || liq.usdcApproveConfirming ? `Authorize USDC` : `Authorize EURC`}
        actionLabel={`Confirm Initial Provision`}
        successSummary={`Successfully minted ${liq.lpPreview.toFixed(4)} LP units`}
        txHash={liq.actionTxHash || liq.usdcApproveTxHash || liq.eurcApproveTxHash}
        errorMessage={(liq.error || liq.usdcApproveError || liq.eurcApproveError)?.message}
        onClose={handleModalClose} 
        onRetry={() => liq.resetAll()} 
      />
    </div>
  );
};

export default AddLiquidity;
