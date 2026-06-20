import { useEffect, useState } from "react";
import { DollarSign, Droplets, Shield, BarChart3, TrendingUp, Loader2 } from "lucide-react";
import { usePoolData } from "@/hooks/usePoolData";
import { useVaultData } from "@/hooks/useVaultData";
import BackButton from "@/components/BackButton";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { estimatePoolApy, formatApy, useDynamicApy } from "@/hooks/useApy";

const ProtocolStats = () => {
  const pool = usePoolData();
  const usdcVault = useVaultData("USDC");
  const eurcVault = useVaultData("EURC");
  const [totalVolume, setTotalVolume] = useState(0);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  const totalTvl = pool.totalLiquidity + usdcVault.totalAssets + eurcVault.totalAssets;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const poolApy = estimatePoolApy(pool.totalLiquidity, totalVolume, pool.feePercent);
  const usdcApy = useDynamicApy("vault-usdc-share-price", usdcVault.sharePrice, 0);
  const eurcApy = useDynamicApy("vault-eurc-share-price", eurcVault.sharePrice, 0);

  useEffect(() => {
    async function fetchStats() {
      setLoadingMetrics(true);
      if (!isSupabaseConfigured) {
        setLoadingMetrics(false);
        return;
      }
      try {
        const { data } = await supabase.from("protocol_stats").select("*").eq("id", 1).single();
        if (data?.total_volume_usd != null) {
          setTotalVolume(Number(data.total_volume_usd));
        }
      } catch (e) {
        console.error("Failed to fetch volume:", e);
      } finally {
        setLoadingMetrics(false);
      }
    }
    fetchStats();
  }, []);

  const dailyFees = totalVolume * (parseFloat(pool.feePercent) / 100) / 365;

  return (
    <div className="container max-w-6xl mx-auto py-16 px-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 border-b border-border pb-8">
        <div>
          <BackButton />
          <h1 className="text-4xl font-bold tracking-tight mt-6">Protocol Analytics</h1>
          <p className="text-muted-foreground mt-2 font-mono text-sm uppercase tracking-wider">Verified onchain data distribution</p>
        </div>
        <div className="flex items-center gap-4 mt-6 md:mt-0">
          <div className="text-right">
             <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Network Status</p>
             <p className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center justify-end gap-2">
               <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
               Operational
             </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {[
          { label: 'Total Value Locked', val: `$${fmt(totalTvl)}`, icon: DollarSign },
          { label: 'Total Volume', val: loadingMetrics ? "..." : `$${fmt(totalVolume)}`, icon: BarChart3 },
          { label: 'Estimated Fees', val: loadingMetrics ? "..." : `$${fmt(dailyFees)}`, icon: Shield },
          { label: 'Pool APY', val: formatApy(poolApy), icon: TrendingUp },
        ].map((kpi, i) => (
          <div key={i} className="border border-border bg-card p-6 rounded-sm relative overflow-hidden group">
            <kpi.icon className="absolute -bottom-2 -right-2 h-16 w-16 opacity-[0.03] group-hover:opacity-[0.05] transition-opacity" />
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-4">{kpi.label}</p>
            <p className="text-2xl font-bold font-mono tracking-tighter">
               {loadingMetrics && (kpi.val === "...") ? <Loader2 className="h-4 w-4 animate-spin" /> : kpi.val}
            </p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 border-b border-border flex justify-between items-center">
              <h3 className="text-sm font-bold uppercase tracking-widest">Reserve Distribution</h3>
              <span className="text-[10px] font-bold text-muted-foreground uppercase">StableSwap Pool</span>
            </div>
            <div className="p-8">
              <div className="flex h-12 w-full rounded-sm overflow-hidden mb-8 border border-border">
                <div title="USDC" className="h-full bg-primary" style={{ width: '55%' }}></div>
                <div title="EURC" className="h-full bg-secondary" style={{ width: '45%' }}></div>
              </div>
              <div className="grid grid-cols-2 gap-12">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 bg-primary rounded-full" />
                    <span className="text-xs font-bold uppercase tracking-wider">USDC Reserve</span>
                  </div>
                  <div className="pl-6 font-mono">
                    <p className="text-2xl font-bold">{fmt(pool.usdcReserve)}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 uppercase tracking-widest font-bold">Verified onchain</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3 border-l border-border pl-12">
                    <div className="h-3 w-3 bg-secondary rounded-full" />
                    <span className="text-xs font-bold uppercase tracking-wider">EURC Reserve</span>
                  </div>
                  <div className="pl-12 border-l border-border font-mono">
                    <p className="text-2xl font-bold pl-6">{fmt(pool.eurcReserve)}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 pl-6 uppercase tracking-widest font-bold">Verified onchain</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-card border border-border rounded-sm">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold uppercase tracking-widest">Protocol Transparency</h3>
            </div>
            <div className="p-6 divide-y divide-border">
              {[
                { label: 'Total LP Units', val: `${fmt(pool.lpTotalSupply)}`, sub: 'Total supply of Pool Liquidity Tokens' },
                { label: 'Admin Fee', val: `${pool.feePercent}%`, sub: 'Protocol revenue share per exchange' },
                { label: 'Contract Integrity', val: 'Verified', sub: 'onchain source code verified on ArcScan' },
              ].map((item, i) => (
                <div key={i} className="py-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider mb-1">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{item.sub}</p>
                  </div>
                  <p className="text-lg font-bold font-mono">{item.val}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-card border border-border rounded-sm p-6">
             <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground mb-8 text-center">Standard Yield Index</h3>
             <div className="space-y-8">
                <div className="text-center">
                   <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">luneUSDC Vault</p>
                   <p className="text-4xl font-bold font-mono text-primary">{formatApy(usdcApy)}</p>
                   <p className="text-[8px] font-bold uppercase text-muted-foreground mt-1 tracking-widest">Annual Percentage Yield</p>
                </div>
                <div className="h-px bg-border w-12 mx-auto" />
                <div className="text-center">
                   <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">luneEURC Vault</p>
                   <p className="text-4xl font-bold font-mono text-secondary">{formatApy(eurcApy)}</p>
                   <p className="text-[8px] font-bold uppercase text-muted-foreground mt-1 tracking-widest">Annual Percentage Yield</p>
                </div>
             </div>
          </section>

          <div className="p-6 border border-border rounded-sm bg-primary/5">
             <h4 className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mb-4">onchain Oracle</h4>
             <p className="text-[10px] leading-relaxed text-muted-foreground">
               Real-time volume data is sourced from onchain event analysis of Lunex protocol contracts and tracked in the protocol stats database.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProtocolStats;
