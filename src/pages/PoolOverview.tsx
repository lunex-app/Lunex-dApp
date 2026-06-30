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

const POOL_PAIRS = [
  { id: "USDC/EURC", a: "USDC", b: "EURC", aColor: "bg-[#2775CA]", bColor: "bg-[#3D8FFD]", badge: "Live" },
  { id: "USDC/USDT", a: "USDC", b: "USDT", aColor: "bg-[#2775CA]", bColor: "bg-[#26A17B]", badge: "New" },
  { id: "EURC/USDT", a: "EURC", b: "USDT", aColor: "bg-[#3D8FFD]", bColor: "bg-[#26A17B]", badge: "New" },
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
               <div className="border border-border bg-card rounded-sm"><EmptyState variant="pool" title="No active pool position" description="Provide liquidity to earn protocol fees automatically." action={<Link to="/pool/add"><Button size="sm" className="gap-2 bg-primary text-primary-foreground font-bold tracking-widest uppercase text-[10px]"><Plus className="h-3 w-3" /> Add Liquidity</Button></Link>} /></div>
            ) : (
               <div className="h-40 flex items-center justify-center border border-border bg-card rounded-sm"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            )}
         </div>
      )}

      {/* Primary pool stats */}
      <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase mb-6 text-muted-foreground border-b border-border pb-4">USDC / EURC Protocol Pool</h3>
      <div className="space-y-6 mb-12">
         <div className="border border-border bg-card rounded-sm p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
               <div className="flex items-center gap-3">
                  <div className="flex -space-x-2">
                     <div className="h-8 w-8 rounded-full bg-[#2775CA] border-2 border-card flex items-center justify-center text-[10px] font-bold text-white">U</div>
                     <div className="h-8 w-8 rounded-full bg-[#3D8FFD] border-2 border-card flex items-center justify-center text-[10px] font-bold text-white">E</div>
                  </div>
                  <div>
                     <h2 className="text-xl font-bold">USDC-EURC</h2>
                     <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">StableSwap · Fee {pool.feePercent}%</p>
                  </div>
               </div>
               <div className="flex gap-2 shrink-0">
                  <Link to="/pool/add"><Button size="sm" className="bg-primary text-primary-foreground font-bold tracking-widest uppercase text-[10px] px-6">Add</Button></Link>
                  <Link to="/pool/remove"><Button variant="outline" size="sm" className="border-border font-bold tracking-widest uppercase text-[10px] px-6">Remove</Button></Link>
               </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border">
               {[
                  { label: "USDC RESERVES", value: fmt(pool.usdcReserve) },
                  { label: "EURC RESERVES", value: fmt(pool.eurcReserve) },
                  { label: "TOTAL LIQUIDITY", value: `$${fmt(pool.totalLiquidity)}` },
                  { label: "EST. POOL APY", value: formatApy(poolApy) },
               ].map((stat) => (
                  <div key={stat.label} className="p-4 bg-background">
                     <p className="text-[8px] text-muted-foreground font-bold mb-1 tracking-widest uppercase">{stat.label}</p>
                     <p className="text-base font-bold font-mono truncate">{stat.value}</p>
                  </div>
               ))}
            </div>
         </div>

         <div className="border border-border bg-card rounded-sm p-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4 border-b border-border pb-2">Pool History</h4>
            <SectionHistory transactions={history.transactions} columns={POOL_COLUMNS} section="pool" />
         </div>
      </div>

      {/* USDT pools */}
      <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase mb-6 text-muted-foreground border-b border-border pb-4">USDT Pools</h3>
      <div className="grid md:grid-cols-2 gap-6 mb-12">
        {POOL_PAIRS.filter(p => p.id !== "USDC/EURC").map((pair) => (
          <div key={pair.id} className="border border-border bg-card rounded-sm p-6 hover:border-primary/40 transition-colors group relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 opacity-[0.03] rotate-45 transform translate-x-8 -translate-y-8 bg-primary transition-all group-hover:opacity-[0.06]" />
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  <div className={`h-8 w-8 rounded-full ${pair.aColor} border-2 border-card flex items-center justify-center text-[10px] font-bold text-white`}>{pair.a[0]}</div>
                  <div className={`h-8 w-8 rounded-full ${pair.bColor} border-2 border-card flex items-center justify-center text-[10px] font-bold text-white`}>{pair.b[0]}</div>
                </div>
                <div>
                  <h2 className="text-base font-bold">{pair.id}</h2>
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">StableSwap · 0.04% Fee</p>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[9px] font-bold tracking-widest uppercase">{pair.badge}</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border border border-border mb-5">
              <div className="p-4 bg-background">
                <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Reserves</p>
                <p className="text-sm font-bold font-mono text-muted-foreground/50">Awaiting LP</p>
              </div>
              <div className="p-4 bg-background">
                <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">TVL</p>
                <p className="text-sm font-bold font-mono text-muted-foreground/50">$0.00</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link to="/pool/add" className="flex-1"><Button size="sm" className="w-full bg-primary text-primary-foreground font-bold tracking-widest uppercase text-[10px]">Add</Button></Link>
              <Link to="/pool/remove" className="flex-1"><Button variant="outline" size="sm" className="w-full border-border font-bold tracking-widest uppercase text-[10px]">Remove</Button></Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PoolOverview;
