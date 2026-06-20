import { Link } from "react-router-dom";
import { ArrowRight, DollarSign, BarChart3, ArrowLeftRight, ShieldCheck, Zap, Sprout, Repeat, Fingerprint } from "lucide-react";
import FaucetBanner from "@/components/FaucetBanner";
import { usePoolData } from "@/hooks/usePoolData";
import { useVaultData } from "@/hooks/useVaultData";
import { useQuery } from "@tanstack/react-query";
import { fetchTotalVolumeUsd } from "@/hooks/useVolumeTracker";

const Landing = () => {
  const pool = usePoolData();
  const usdcVault = useVaultData("USDC");
  const eurcVault = useVaultData("EURC");
  const totalTvl = pool.totalLiquidity + usdcVault.totalAssets + eurcVault.totalAssets;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Volume is read live on-chain (Lunex contract events on Arc) — no Supabase gate.
  const { data: totalVolume = 0 } = useQuery({
    queryKey: ["protocol-total-volume"],
    queryFn: fetchTotalVolumeUsd,
    refetchInterval: 60000,
  });

  return (
    <div className="page-fade-in">
      <FaucetBanner />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-30" />
        <div className="container relative py-28 md:py-40 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-6">
            <span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Live on Arc Testnet · Powered by Circle
          </span>
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight uppercase leading-none mb-6">
            <span className="text-foreground whitespace-nowrap">Stable</span>
            <span className="text-primary whitespace-nowrap">Swap</span>
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-xl mx-auto mb-4 leading-relaxed">
            The stablecoin liquidity hub for the dollar-and-euro economy. Swap USDC/EURC at near-zero slippage,
            bridge across 6 chains with Circle CCTP, and earn auto-compounding yield — all gas-paid in USDC on Arc.
          </p>
          <p className="text-muted-foreground/70 text-xs md:text-sm max-w-lg mx-auto mb-10">
            No seed phrases. Sign in with a passkey or email and transact gaslessly in seconds.
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

      {/* Why Lunex */}
      <section className="container pb-20">
        <div className="text-center mb-12">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-primary mb-3">Why Lunex</p>
          <h2 className="text-2xl md:text-3xl font-bold uppercase tracking-tight">Built for stablecoins, end to end</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border">
          {[
            { icon: Repeat, title: "StableSwap AMM", body: "A Curve-style invariant tuned for the 1:1 peg — deep liquidity and minimal price impact on USDC/EURC." },
            { icon: ArrowLeftRight, title: "Native CCTP Bridge", body: "Move real USDC across 6 chains with Circle's Cross-Chain Transfer Protocol — burn-and-mint, zero wrapped risk." },
            { icon: Sprout, title: "Auto-Compounding Vaults", body: "ERC-4626 vaults that reinvest swap fees automatically. Deposit once and let yield compound." },
            { icon: Fingerprint, title: "Passwordless Wallets", body: "Circle passkey & email wallets with gasless transactions — onboard users without seed phrases or gas." },
          ].map((f) => (
            <div key={f.title} className="bg-background p-6 group hover:bg-card transition-colors">
              <div className="flex h-10 w-10 items-center justify-center bg-primary/10 mb-4"><f.icon className="h-5 w-5 text-primary" /></div>
              <h3 className="text-sm font-bold uppercase tracking-wide mb-2">{f.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>

        {/* Trust band */}
        <div className="mt-12 border border-border bg-card/40 rounded-sm p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-start gap-4 max-w-xl text-center md:text-left">
            <ShieldCheck className="hidden md:block h-8 w-8 text-primary shrink-0" />
            <div>
              <h3 className="text-base font-bold uppercase tracking-tight mb-1">Institution-grade rails</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Lunex runs on Arc, Circle's payments L1 with USDC-denominated gas and sub-second finality, and settles
                cross-chain through Circle's native CCTP. Every metric on this site is verifiable on-chain.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6 shrink-0">
            <div className="text-center">
              <Zap className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Sub-second<br />finality</p>
            </div>
            <div className="text-center">
              <DollarSign className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">USDC<br />gas</p>
            </div>
            <Link to="/stats" className="text-center group">
              <BarChart3 className="h-5 w-5 text-primary mx-auto mb-1" />
              <p className="text-[9px] font-bold uppercase tracking-widest text-primary group-hover:underline">Live<br />analytics</p>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Landing;
