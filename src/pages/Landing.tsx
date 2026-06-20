import { Link } from "react-router-dom";
import { ArrowRight, DollarSign, BarChart3 } from "lucide-react";
import FaucetBanner from "@/components/FaucetBanner";
import { usePoolData } from "@/hooks/usePoolData";
import { useVaultData } from "@/hooks/useVaultData";
import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

const Landing = () => {
  const pool = usePoolData();
  const usdcVault = useVaultData("USDC");
  const eurcVault = useVaultData("EURC");
  const totalTvl = pool.totalLiquidity + usdcVault.totalAssets + eurcVault.totalAssets;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const { data: stats } = useQuery({
    queryKey: ["protocol-stats"],
    queryFn: async () => {
      if (!isSupabaseConfigured) return null;
      const { data } = await supabase.from("protocol_stats").select("*").eq("id", 1).single();
      return data;
    },
    enabled: isSupabaseConfigured,
    refetchInterval: 10000,
  });

  const totalVolume = stats?.total_volume_usd ?? 0;

  return (
    <div className="page-fade-in">
      <FaucetBanner />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="container relative py-28 md:py-40 text-center">
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight uppercase leading-none mb-6">
            <span className="text-foreground whitespace-nowrap">Stable</span>
            <span className="text-primary whitespace-nowrap">Swap</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-lg mx-auto mb-10 leading-relaxed">
            Curve-style StableSwap AMM optimised for USDC/EURC pairs with minimal slippage on Arc Network.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/dashboard" className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 text-sm font-semibold tracking-wider uppercase hover:bg-primary/90 transition-colors w-full sm:w-auto justify-center">
              Launch App <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/docs" className="inline-flex items-center gap-2 border border-border text-foreground px-6 py-3 text-sm font-semibold tracking-wider uppercase hover:border-primary/40 hover:text-primary transition-colors w-full sm:w-auto justify-center">
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="container py-20">
        <div className="grid md:grid-cols-2 gap-4 mb-16">
          <Link to="/swap" className="group relative overflow-hidden border border-border gradient-teal p-10 transition-all hover:border-primary/30 glow-teal text-center md:text-left">
            <p className="text-xs text-primary tracking-widest uppercase mb-4">01 / SWAP</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 uppercase tracking-tight">Swap Stablecoins</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto md:mx-0 leading-relaxed">Near-zero slippage swaps between USDC and EURC with {pool.feePercent}% fees.</p>
            <span className="inline-flex items-center gap-2 text-primary text-xs font-semibold tracking-wider uppercase group-hover:gap-3 transition-all">Start Swapping <ArrowRight className="h-3.5 w-3.5" /></span>
          </Link>
          <Link to="/yield" className="group relative overflow-hidden border border-border gradient-purple p-10 transition-all hover:border-secondary/30 glow-purple text-center md:text-left">
            <p className="text-xs text-secondary tracking-widest uppercase mb-4">02 / YIELD</p>
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3 uppercase tracking-tight">Earn Yield</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto md:mx-0 leading-relaxed">ERC-4626 vaults with auto-compounding strategies. Deposit and earn.</p>
            <span className="inline-flex items-center gap-2 text-secondary text-xs font-semibold tracking-wider uppercase group-hover:gap-3 transition-all">View Vaults <ArrowRight className="h-3.5 w-3.5" /></span>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-background p-5 sm:p-6 text-center sm:text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary/10 mx-auto sm:mx-0"><DollarSign className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground tracking-wider">TVL</p>
              <p className="text-lg sm:text-xl font-bold font-mono tabular-nums break-all">${fmt(totalTvl)}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 bg-background p-5 sm:p-6 text-center sm:text-left">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary/10 mx-auto sm:mx-0"><BarChart3 className="h-5 w-5 text-primary" /></div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground tracking-wider">TOTAL VOLUME</p>
              <p className="text-lg sm:text-xl font-bold font-mono tabular-nums break-all">${fmt(totalVolume)}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
