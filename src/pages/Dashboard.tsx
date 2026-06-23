import { useWallet } from "@/context/WalletProvider";
import { useTokenBalances } from "@/hooks/useTokenBalance";
import { usePoolData } from "@/hooks/usePoolData";
import { useVaultData } from "@/hooks/useVaultData";
import { Wallet } from "lucide-react";
import { useSectionHistory } from "@/hooks/useSectionHistory";
import { SectionHistory } from "@/components/SectionHistory";
import EmptyState from "@/components/EmptyState";
import BackButton from "@/components/BackButton";
import { Loader2 } from "lucide-react";
// import { NotifyPanel } from "@/components/NotifyPanel"; // disabled for this release

const ACTIVITY_COLUMNS = [
  { key: "action", label: "Action" },
  { key: "detail", label: "Detail" },
];

const Dashboard = () => {
  const { isConnected } = useWallet();
  const balances = useTokenBalances();
  const pool = usePoolData();
  const usdcVault = useVaultData("USDC");
  const eurcVault = useVaultData("EURC");

  const swapHistory = useSectionHistory("swap");
  const poolHistory = useSectionHistory("pool");
  const yieldHistory = useSectionHistory("yield");

  const recentActivity = [...swapHistory.transactions, ...poolHistory.transactions, ...yieldHistory.transactions]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)
    .map(tx => ({ ...tx, data: { ...tx.data, action: tx.type.replace("_", " ").toUpperCase(), detail: Object.entries(tx.data).filter(([k]) => k !== "action").map(([k, v]) => `${k}: ${v}`).join(", ") } }));

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasPoolPosition = pool.lpBalanceRaw > 0n;
  const userUsdcValue = pool.lpTotalSupply > 0 ? (pool.lpBalance / pool.lpTotalSupply) * pool.usdcReserve : 0;
  const userEurcValue = pool.lpTotalSupply > 0 ? (pool.lpBalance / pool.lpTotalSupply) * pool.eurcReserve : 0;

  if (!isConnected) {
    return (
      <div className="container max-w-4xl mx-auto py-16">
        <BackButton />
        <h1 className="text-3xl font-bold uppercase tracking-tight mb-8">Dashboard</h1>
        <div className="border border-border bg-card"><EmptyState variant="deposits" title="Wallet not connected" description="Connect your wallet to view your positions and balances." /></div>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
      <div className="mb-10">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">Portfolio Overview</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Consolidated view of your protocol assets and performance</p>
      </div>

      <div className="space-y-8">
         <div className="space-y-8">
            {/* Asset Allocation */}
            <section className="border border-border bg-card rounded-sm overflow-hidden shadow-sm">
               <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                     <Wallet className="h-4 w-4 text-primary" />
                     <span className="text-[10px] font-bold uppercase tracking-widest">Protocol Balances</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-muted-foreground font-mono">Net Worth: ${fmt((balances.USDC.balance?.formatted ? parseFloat(balances.USDC.balance.formatted) : 0) + (balances.EURC.balance?.formatted ? parseFloat(balances.EURC.balance.formatted) : 0) + userUsdcValue + userEurcValue + usdcVault.userDeposited + eurcVault.userDeposited)}</span>
                  </div>
               </div>
               <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border">
                  {[
                     { label: "USDC Wallet", val: balances.USDC.formatted, sub: "Available" },
                     { label: "EURC Wallet", val: balances.EURC.formatted, sub: "Available" },
                     { label: "LP Units", val: pool.lpBalance.toFixed(4), sub: "Staked" },
                     { label: "Yield Assets", val: `$${fmt(usdcVault.userDeposited + eurcVault.userDeposited)}`, sub: "Compounding" },
                  ].map((item, i) => (
                     <div key={i} className="p-6">
                        <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">{item.label}</p>
                        <p className="text-lg font-bold font-mono">{item.val}</p>
                        <p className="text-[8px] text-muted-foreground font-bold uppercase mt-1 tracking-tighter">{item.sub}</p>
                     </div>
                  ))}
               </div>
            </section>

            {/* Detailed Positions */}
            <div className="grid md:grid-cols-2 gap-8">
               <section className="border border-border bg-card rounded-sm shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-border">
                     <h3 className="text-[10px] font-bold uppercase tracking-widest">Liquidity Provisioning</h3>
                  </div>
                  <div className="p-6">
                     {hasPoolPosition ? (
                        <div className="space-y-4">
                           <div className="flex justify-between items-end">
                              <div>
                                 <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest">Current Value</p>
                                 <p className="text-2xl font-bold font-mono text-primary">${fmt(userUsdcValue + userEurcValue)}</p>
                              </div>
                              <div className="text-right">
                                 <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest">Pool Share</p>
                                 <p className="text-sm font-bold font-mono">{pool.poolShare.toFixed(4)}%</p>
                              </div>
                           </div>
                           <div className="p-4 bg-muted/20 border border-border rounded-sm">
                              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-2">Reserve Balance</p>
                              <div className="flex justify-between text-[10px] font-mono">
                                 <span>{fmt(userUsdcValue)} USDC</span>
                                 <span>{fmt(userEurcValue)} EURC</span>
                              </div>
                           </div>
                        </div>
                     ) : <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest text-center py-8">No Active Position</p>}
                  </div>
               </section>

               <section className="border border-border bg-card rounded-sm shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-border">
                     <h3 className="text-[10px] font-bold uppercase tracking-widest">Yield Management</h3>
                  </div>
                  <div className="p-6">
                     {usdcVault.userShares > 0 || eurcVault.userShares > 0 ? (
                        <div className="space-y-4">
                           {usdcVault.userShares > 0 && (
                              <div className="flex justify-between items-center bg-muted/20 p-4 border border-border rounded-sm">
                                 <div>
                                    <p className="text-[10px] font-bold">LUNE-USDC</p>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase mt-1">Share-price tracked</p>
                                 </div>
                                 <div className="text-right">
                                    <p className="text-sm font-bold font-mono">${fmt(usdcVault.userDeposited)}</p>
                                    <p className="text-[8px] text-muted-foreground font-mono">{usdcVault.userShares.toFixed(4)} Shares</p>
                                 </div>
                              </div>
                           )}
                           {eurcVault.userShares > 0 && (
                              <div className="flex justify-between items-center bg-muted/20 p-4 border border-border rounded-sm">
                                 <div>
                                    <p className="text-[10px] font-bold">LUNE-EURC</p>
                                    <p className="text-[8px] text-muted-foreground font-bold uppercase mt-1">Share-price tracked</p>
                                 </div>
                                 <div className="text-right">
                                    <p className="text-sm font-bold font-mono">€{fmt(eurcVault.userDeposited)}</p>
                                    <p className="text-[8px] text-muted-foreground font-mono">{eurcVault.userShares.toFixed(4)} Shares</p>
                                 </div>
                              </div>
                           )}
                        </div>
                     ) : <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest text-center py-8">No Yield Active</p>}
                  </div>
               </section>
            </div>

            {/* Activity Table */}
            <section className="border border-border bg-card rounded-sm shadow-sm overflow-hidden">
               <div className="px-6 py-4 border-b border-border">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest">Protocol Activity</h3>
               </div>
               <SectionHistory transactions={recentActivity} columns={ACTIVITY_COLUMNS} section="all" />
            </section>

            {/* Lunex Notify panel disabled for this release. */}
            {/* <NotifyPanel /> */}
         </div>
      </div>
    </div>
  );
};

export default Dashboard;
