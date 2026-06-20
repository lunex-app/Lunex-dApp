import { Plus, Minus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletProvider";
import { usePoolData } from "@/hooks/usePoolData";
import { SectionHistory } from "@/components/SectionHistory";
import { useSectionHistory } from "@/hooks/useSectionHistory";
import EmptyState from "@/components/EmptyState";
import BackButton from "@/components/BackButton";
import { Link } from "react-router-dom";
import { estimatePoolApy, formatApy } from "@/hooks/useApy";

const POOL_COLUMNS = [
  { key: "action", label: "Action" },
  { key: "usdcAmount", label: "USDC" },
  { key: "eurcAmount", label: "EURC" },
  { key: "lpTokens", label: "LP Tokens" },
];

const PoolOverview = () => {
  const { isConnected } = useWallet();
  const pool = usePoolData();
  const history = useSectionHistory("pool");
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasPoolPosition = pool.lpBalanceRaw > 0n;
  const userUsdcValue = pool.lpTotalSupply > 0 ? (pool.lpBalance / pool.lpTotalSupply) * pool.usdcReserve : 0;
  const userEurcValue = pool.lpTotalSupply > 0 ? (pool.lpBalance / pool.lpTotalSupply) * pool.eurcReserve : 0;
  const userPositionValue = userUsdcValue + userEurcValue;
  const depositedValue = history.transactions.reduce((sum, tx) => {
    if (tx.type !== "add_liquidity") return sum;
    return sum + Number(tx.data.usdcAmount || 0) + Number(tx.data.eurcAmount || 0);
  }, 0);
  const withdrawnValue = history.transactions.reduce((sum, tx) => {
    if (tx.type !== "remove_liquidity") return sum;
    return sum + Number(tx.data.usdcAmount || 0) + Number(tx.data.eurcAmount || 0);
  }, 0);
  const netContributed = Math.max(0, depositedValue - withdrawnValue);
  const reinvestedFees = Math.max(0, userPositionValue - netContributed);
  const poolApy = estimatePoolApy(pool.totalLiquidity, 0, pool.feePercent);

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <div className="mb-10">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">Liquidity Positions</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Manage your StableSwap LP units and accrued fees</p>
      </div>

      {isConnected && (
         <div className="mb-12">
            {!pool.isLpBalanceLoading && hasPoolPosition ? (
               <div className="border border-border bg-card rounded-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-border bg-muted/30 flex justify-between items-center">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Your Active Position</span>
                     <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[8px] font-bold tracking-widest uppercase">Fee accrual tracked</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
                     <div className="p-6">
                        <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">LP Units</p>
                        <p className="text-xl font-bold font-mono">{pool.lpBalance.toFixed(4)}</p>
                     </div>
                     <div className="p-6">
                        <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Share Value</p>
                        <p className="text-xl font-bold font-mono">${fmt(userUsdcValue + userEurcValue)}</p>
                        <p className="text-[8px] text-muted-foreground font-mono mt-1">{fmt(userUsdcValue)} USDC + {fmt(userEurcValue)} EURC</p>
                     </div>
                     <div className="p-6">
                        <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Pool Share</p>
                        <p className="text-xl font-bold font-mono">{pool.poolShare.toFixed(4)}%</p>
                     </div>
                     <div className="p-6 bg-primary/5">
                        <p className="text-[8px] text-primary font-bold uppercase tracking-widest mb-1">Reinvested Fees</p>
                        <p className="text-sm font-bold font-mono text-green-500">${fmt(reinvestedFees)}</p>
                        <p className="text-[8px] text-muted-foreground font-mono mt-1">Added back to LP value</p>
                     </div>
                  </div>
               </div>
            ) : !pool.isLpBalanceLoading ? (
               <div className="border border-border bg-card rounded-sm"><EmptyState variant="pool" title="No active pool position" description="Provide liquidity to the USDC/EURC pair to earn protocol fees automatically." action={<Link to="/pool/add"><Button size="sm" className="gap-2 bg-primary text-primary-foreground font-bold tracking-widest uppercase text-[10px]"><Plus className="h-3 w-3" /> Add Liquidity</Button></Link>} /></div>
            ) : (
               <div className="h-40 flex items-center justify-center border border-border bg-card rounded-sm"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            )}
         </div>
      )}

      {/* Pool Stats */}
      <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase mb-6 text-muted-foreground border-b border-border pb-4">USDC / EURC Protocol Pool</h3>
      <div className="grid lg:grid-cols-3 gap-8">
         <div className="lg:col-span-2 space-y-4">
            <div className="border border-border bg-card rounded-sm p-8">
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                     <div className="flex -space-x-2">
                        <div className="h-8 w-8 rounded-full bg-primary border-2 border-card flex items-center justify-center text-[10px] font-bold">U</div>
                        <div className="h-8 w-8 rounded-full bg-secondary border-2 border-card flex items-center justify-center text-[10px] font-bold">E</div>
                     </div>
                     <div>
                        <h2 className="text-xl font-bold">USDC-EURC</h2>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">StableSwap · Fee {pool.feePercent}%</p>
                     </div>
                  </div>
                  <div className="flex gap-2">
                     <Link to="/pool/add"><Button size="sm" className="bg-primary text-primary-foreground font-bold tracking-widest uppercase text-[10px] px-6">Add</Button></Link>
                     <Link to="/pool/remove"><Button variant="outline" size="sm" className="border-border font-bold tracking-widest uppercase text-[10px] px-6">Remove</Button></Link>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-px bg-border border border-border">
                  {[
                     { label: "USDC RESERVES", value: fmt(pool.usdcReserve) },
                     { label: "EURC RESERVES", value: fmt(pool.eurcReserve) },
                     { label: "TOTAL LIQUIDITY", value: `$${fmt(pool.totalLiquidity)}` },
                     { label: "EST. POOL APY", value: formatApy(poolApy) },
                  ].map((stat) => (
                     <div key={stat.label} className="p-6 bg-background">
                        <p className="text-[8px] text-muted-foreground font-bold mb-1 tracking-widest uppercase">{stat.label}</p>
                        <p className="text-lg font-bold font-mono">{stat.value}</p>
                     </div>
                  ))}
               </div>
            </div>
         </div>

         <div className="space-y-4">
            <div className="border border-border bg-card rounded-sm p-6">
               <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4 border-b border-border pb-2">Pool History</h4>
               <SectionHistory transactions={history.transactions} columns={POOL_COLUMNS} section="pool" />
            </div>
         </div>
      </div>
    </div>
  );
};

export default PoolOverview;
