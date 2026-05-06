import { BarChart3, TrendingUp, Users, Activity, Globe, ArrowUpRight } from "lucide-react";
import BackButton from "@/components/BackButton";

const Stats = () => {
  const metrics = [
    { label: "Total Value Locked", value: "$12,450,000", change: "+12.5%", icon: TrendingUp },
    { label: "24h Volume", value: "$1,250,000", change: "+5.2%", icon: BarChart3 },
    { label: "Active Users", value: "1,240", change: "+2.1%", icon: Users },
    { label: "Total Swaps", value: "45,230", change: "+8.4%", icon: Activity },
  ];

  const chainData = [
    { name: "Arc Network", tvl: "$4,200,000", volume: "$450,000", share: "34%" },
    { name: "Base", tvl: "$3,500,000", volume: "$380,000", share: "28%" },
    { name: "Arbitrum", tvl: "$2,800,000", volume: "$290,000", share: "22%" },
    { name: "Ethereum", tvl: "$1,950,000", volume: "$130,000", share: "16%" },
  ];

  return (
    <div className="container max-w-6xl mx-auto py-16 px-4">
      <div className="mb-10">
        <BackButton />
        <div className="flex items-center gap-3 mt-6">
          <Globe className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight uppercase">Protocol Statistics</h1>
        </div>
        <p className="text-muted-foreground text-sm font-mono mt-2">Real-time aggregate data across the Lunex ecosystem</p>
      </div>

      {/* Hero Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {metrics.map((m, i) => (
          <div key={i} className="border border-border bg-card p-6 rounded-sm shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <m.icon className="h-5 w-5 text-primary" />
              <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{m.change}</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1">{m.label}</p>
            <p className="text-2xl font-bold font-mono tracking-tight">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Chain Breakdown */}
        <div className="lg:col-span-2 space-y-8">
          <section className="border border-border bg-card rounded-sm overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="text-[10px] font-bold uppercase tracking-widest">Multi-Chain Distribution</h3>
              <Activity className="h-3 w-3 text-muted-foreground" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Chain</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">TVL</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">24h Volume</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Market Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {chainData.map((chain, i) => (
                    <tr key={i} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-primary" />
                          <span className="text-sm font-bold">{chain.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm">{chain.tvl}</td>
                      <td className="px-6 py-4 font-mono text-sm">{chain.volume}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: chain.share }} />
                          </div>
                          <span className="text-[10px] font-mono font-bold">{chain.share}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Sidebar Insights */}
        <div className="space-y-6">
          <section className="border border-border bg-card p-6 rounded-sm shadow-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <TrendingUp className="h-24 w-24" />
             </div>
             <h4 className="text-[10px] font-bold uppercase tracking-widest mb-4">Protocol Health</h4>
             <div className="space-y-4 relative z-10">
                <div>
                   <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Fee Generation (24h)</p>
                   <p className="text-lg font-bold font-mono">$50,000</p>
                </div>
                <div>
                   <p className="text-[10px] text-muted-foreground font-bold uppercase mb-1">Average Swap Size</p>
                   <p className="text-lg font-bold font-mono">$1,008</p>
                </div>
                <div className="pt-4 border-t border-border">
                   <button className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-primary hover:opacity-80 transition-opacity">
                      View On Explorer <ArrowUpRight className="h-3 w-3" />
                   </button>
                </div>
             </div>
          </section>

          <section className="border border-border bg-primary/5 p-6 rounded-sm shadow-sm border-dashed">
             <h4 className="text-[10px] font-bold uppercase tracking-widest mb-3">Agentic Insights</h4>
             <p className="text-[11px] text-muted-foreground leading-relaxed italic">
               "The protocol is currently seeing a 15% increase in cross-chain bridge volume from Base to Arc. Liquidity depth is optimal for trades up to $250k."
             </p>
             <div className="mt-4 flex items-center gap-2">
                <div className="w-4 h-4 bg-primary/20 rounded-full flex items-center justify-center">
                   <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                </div>
                <span className="text-[8px] font-bold uppercase tracking-tighter text-primary">Live AI Analysis Active</span>
             </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Stats;
