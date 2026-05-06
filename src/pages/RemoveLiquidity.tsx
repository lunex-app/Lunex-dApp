import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRemoveLiquidity } from "@/hooks/useLiquidity";
import { usePoolData } from "@/hooks/usePoolData";
import { TransactionModal, computeTxStage } from "@/components/TransactionModal";
import { useSectionHistory } from "@/hooks/useSectionHistory";
import BackButton from "@/components/BackButton";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RemoveLiquidity = () => {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const pool = usePoolData();
  const history = useSectionHistory("pool");
  const [percentage, setPercentage] = useState([100]);
  const [mode, setMode] = useState<"both" | "usdc" | "eurc">("both");

  const lpToRemoveRaw = (pool.lpBalanceRaw * BigInt(percentage[0])) / 100n;
  const lpToRemoveStr = formatUnits(lpToRemoveRaw, 18);
  const lpToRemove = parseFloat(lpToRemoveStr);
  const shareOfPool = pool.lpTotalSupply > 0 ? lpToRemove / pool.lpTotalSupply : 0;
  const usdcOut = mode === "eurc" ? 0 : pool.usdcReserve * shareOfPool * (mode === "both" ? 1 : 2);
  const eurcOut = mode === "usdc" ? 0 : pool.eurcReserve * shareOfPool * (mode === "both" ? 1 : 2);

  const liq = useRemoveLiquidity(lpToRemoveRaw, lpToRemoveStr, mode);

  useEffect(() => {
    if (liq.isConfirmed && liq.actionTxHash) {
      history.addTx({
        txHash: liq.actionTxHash,
        type: "remove_liquidity",
        data: {
          action: "Remove",
          usdcAmount: usdcOut.toFixed(2),
          eurcAmount: eurcOut.toFixed(2),
          lpTokens: lpToRemove.toFixed(4),
        },
      });
    }
  }, [liq.isConfirmed, liq.actionTxHash, history, usdcOut, eurcOut, lpToRemove]);

  useEffect(() => {
    if (liq.isConfirmed) pool.refetchAll();
  }, [liq.isConfirmed]);

  const txStage = computeTxStage({
    approveError: liq.approveError,
    actionError: liq.error,
    isConfirmed: liq.isConfirmed,
    isActionPending: liq.isActionPending,
    actionTxHash: liq.actionTxHash,
    isActionConfirming: liq.isActionConfirming,
    isApprovePending: liq.isApprovePending,
    approveTxHash: liq.approveTxHash,
    isApproveConfirming: liq.isApproveConfirming,
    isApproved: liq.isApproved, isAllowanceLoading: liq.isAllowanceLoading,
  });

  const handleModalClose = () => {
    const wasSuccess = liq.isConfirmed;
    liq.resetAll();
    if (wasSuccess) {
      setPercentage([0]);
      pool.refetchAll();
    }
  };

  const getButtonText = () => {
    if (!isConnected) return "CONNECT WALLET";
    if (pool.lpBalanceRaw <= 0n) return "NO LP TOKENS";
    if (percentage[0] === 0) return "SELECT AMOUNT";
    if (liq.isApproving) return "APPROVING LP...";
    if (liq.isBusy) return "REMOVING...";
    return "REMOVE LIQUIDITY";
  };

  const handleClick = () => {
    if (!isConnected && openConnectModal) {
      openConnectModal();
      return;
    }
    if (percentage[0] > 0 && lpToRemoveRaw > 0n) liq.execute();
  };

  return (
    <div className="container max-w-lg mx-auto py-16 px-4">
      <div className="mb-8">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">Burn Liquidity</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Convert StableSwap LP units back into underlying assets</p>
      </div>

      <div className="border border-border bg-card rounded-sm shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border bg-muted/20">
           <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Position Exit</p>
        </div>

        <div className="p-8 space-y-8">
          <div>
            <div className="flex justify-between items-end mb-4">
               <div>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Withdrawal Percentage</p>
                  <p className="text-4xl font-bold font-mono tracking-tighter mt-1">{percentage[0]}%</p>
               </div>
               <div className="text-right">
                  <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest">Available Balance</p>
                  <p className="text-xs font-bold font-mono">{pool.lpBalance.toFixed(4)} LP</p>
               </div>
            </div>
            <Slider value={percentage} onValueChange={setPercentage} max={100} step={1} className="py-4" />
            <div className="flex gap-2 mt-4">
              {[25, 55, 75, 100].map((v) => (
                <button 
                  key={v} 
                  onClick={() => setPercentage([v])} 
                  className={`flex-1 py-2 text-[10px] font-bold tracking-widest transition-colors rounded-sm border ${
                    percentage[0] === v 
                      ? "border-primary bg-primary text-primary-foreground" 
                      : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {v === 100 ? "Max" : `${v}%`}
                </button>
              ))}
            </div>
          </div>

          <div>
             <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-3">Redemption Strategy</p>
             <div className="flex gap-px bg-border border border-border">
                {([{ key: "both", label: "PROBATIONAL (BOTH)" }, { key: "usdc", label: "USDC CONCERN" }, { key: "eurc", label: "EURC CONCERN" }] as const).map(({ key, label }) => (
                  <button 
                    key={key} 
                    onClick={() => setMode(key)} 
                    className={`flex-1 py-3 text-[9px] font-bold tracking-[0.1em] transition-colors ${mode === key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
                  >
                    {label === "PROBATIONAL (BOTH)" ? "PROBATIONAL" : label}
                  </button>
                ))}
             </div>
          </div>

          <div className="p-6 bg-muted/10 border border-border rounded-sm space-y-3">
             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                <span className="text-muted-foreground">Units to Burn</span>
                <span className="font-mono text-foreground">{lpToRemove.toFixed(4)} Units</span>
             </div>
             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                <span className="text-muted-foreground">USDC Redemption</span>
                <span className="font-mono text-foreground">${fmt(usdcOut)}</span>
             </div>
             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                <span className="text-muted-foreground">EURC Redemption</span>
                <span className="font-mono text-foreground">€{fmt(eurcOut)}</span>
             </div>
          </div>

          <Button 
            className="w-full h-14 bg-primary text-primary-foreground font-bold tracking-[0.2em] uppercase text-sm shadow-sm active:scale-[0.98] transition-all" 
            onClick={handleClick} 
            disabled={liq.isBusy || lpToRemoveRaw <= 0n}
          >
            {liq.isBusy && <Loader2 className="h-4 w-4 animate-spin mr-3" />}
            {getButtonText()}
          </Button>
        </div>

        <div className="p-4 bg-muted/20 border-t border-border text-center">
           <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest">
              Standardized exit liquidity protocol enforced
           </p>
        </div>
      </div>

      <TransactionModal 
        stage={txStage} 
        approveLabel={`Authorize LP Transfer`}
        actionLabel={`Confirm Withdrawal`}
        successSummary={`Redeemed ${lpToRemove.toFixed(4)} units for underlying assets`}
        txHash={liq.actionTxHash || liq.approveTxHash} 
        errorMessage={(liq.error || liq.approveError)?.message}
        onClose={handleModalClose} 
        onRetry={() => liq.resetAll()} 
      />
    </div>
  );
};

export default RemoveLiquidity;
