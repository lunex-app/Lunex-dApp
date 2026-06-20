import { useCallback, useEffect, useState } from "react";
import {
  DollarSign,
  BarChart3,
  Users,
  Activity,
  RefreshCw,
  ArrowLeftRight,
  Droplets,
  Sprout,
  TrendingUp,
  Layers,
  Repeat,
  CalendarDays,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import BackButton from "@/components/BackButton";
import { fetchProtocolAnalytics, type ProtocolAnalytics } from "@/lib/onchainAnalytics";
import { EXPLORER_URL } from "@/config/wagmi";

const usd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const usd2 = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString();

const chartTooltip = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 6,
  fontSize: 12,
} as const;

function Kpi({
  label,
  value,
  icon: Icon,
  accent,
  sub,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  accent?: boolean;
  sub?: string;
}) {
  return (
    <div
      className={`border bg-card p-5 sm:p-6 rounded-sm relative overflow-hidden group ${
        accent ? "border-primary/40" : "border-border"
      }`}
    >
      <Icon
        className={`absolute -bottom-2 -right-2 h-16 w-16 transition-opacity ${
          accent ? "opacity-[0.07] text-primary" : "opacity-[0.03] group-hover:opacity-[0.05]"
        }`}
      />
      <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground mb-3">{label}</p>
      <p className={`text-2xl font-bold font-mono tracking-tighter ${accent ? "text-primary" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground font-mono mt-1">{sub}</p>}
    </div>
  );
}

function Row({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span
        className={`text-xs uppercase tracking-widest ${
          strong ? "text-foreground font-black" : "text-muted-foreground font-bold"
        }`}
      >
        {label}
      </span>
      <div className="text-right">
        <span className={`text-sm font-mono ${strong ? "font-black text-primary" : "font-bold"}`}>{value}</span>
        {sub && <span className="block text-[10px] text-muted-foreground font-mono">{sub}</span>}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4" /> {children}
    </h2>
  );
}

const Analytics = () => {
  const [data, setData] = useState<ProtocolAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      setData(await fetchProtocolAnalytics(force));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updated = data ? new Date(data.generatedAt).toLocaleString() : "";

  return (
    <div className="container max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 border-b border-border pb-8">
        <div>
          <BackButton />
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-6">Lunex Protocol Analytics</h1>
          <p className="text-muted-foreground mt-2 font-mono text-xs uppercase tracking-wider">
            Live on-chain metrics · Arc Testnet · StableSwap · Vaults · CCTP Bridge
          </p>
        </div>
        <div className="flex items-center gap-4 mt-6 md:mt-0">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Data Source</p>
            <p className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center justify-end gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              On-chain
            </p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            aria-label="Refresh"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-3" /> Reading on-chain activity…
        </div>
      ) : (
        <>
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10">
            <Kpi label="Total Protocol Volume" value={usd(data.totalVolumeUsd)} icon={BarChart3} accent sub="swaps + pool + vaults + bridge" />
            <Kpi label="Total Value Locked" value={usd(data.totalTvlUsd)} icon={DollarSign} />
            <Kpi label="All-Time Wallets" value={num(data.allTimeWallets)} icon={Users} />
            <Kpi label="Total Transactions" value={num(data.totalTxCount)} icon={Activity} />
          </div>

          {/* ===================== USERS / WALLETS (featured) ===================== */}
          <div className="border border-primary/30 bg-primary/[0.03] rounded-sm p-6 mb-10">
            <SectionTitle icon={Users}>Active Wallets</SectionTitle>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
              <Kpi label="Daily Active (24h)" value={num(data.dau)} icon={Users} />
              <Kpi label="Weekly Active (7d)" value={num(data.wau)} icon={Users} />
              <Kpi label="Monthly Active (30d)" value={num(data.mau)} icon={CalendarDays} />
              <Kpi label="All-Time Wallets" value={num(data.allTimeWallets)} icon={Users} accent />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Daily Active Wallets · Last 30 Days
            </p>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailyWallets} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis tick={{ fontSize: 10 }} stroke="currentColor" className="text-muted-foreground" width={32} allowDecimals={false} />
                  <Tooltip formatter={(v: number) => [num(v), "Wallets"]} contentStyle={chartTooltip} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
                  <Bar dataKey="wallets" fill="#19E0E6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ===================== VOLUME ===================== */}
          <div className="border border-border bg-card rounded-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              <SectionTitle icon={Repeat}>Swap Volume · Last 30 Days</SectionTitle>
              <span className="text-[10px] font-mono text-muted-foreground">
                {num(data.daily.reduce((s, d) => s + d.swaps, 0))} swaps ·{" "}
                {usd(data.daily.reduce((s, d) => s + d.volumeUsd, 0))}
              </span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#19E0E6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#19E0E6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    interval="preserveStartEnd"
                    minTickGap={24}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="currentColor"
                    className="text-muted-foreground"
                    width={48}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                  />
                  <Tooltip formatter={(v: number) => [usd2(v), "Volume"]} contentStyle={chartTooltip} />
                  <Area type="monotone" dataKey="volumeUsd" stroke="#19E0E6" strokeWidth={2} fill="url(#vol)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Volume breakdown + TVL */}
          <div className="grid md:grid-cols-2 gap-6 mb-10">
            <div className="border border-border bg-card rounded-sm p-6">
              <SectionTitle icon={BarChart3}>Volume by Source</SectionTitle>
              <Row label="Swaps" value={usd2(data.swapVolumeUsd)} sub={`${num(data.swapCount)} trades`} />
              <Row label="· USDC → EURC" value={usd2(data.usdcToEurcUsd)} />
              <Row label="· EURC → USDC" value={usd2(data.eurcToUsdcUsd)} />
              <Row label="Pool Liquidity" value={usd2(data.liquidityVolumeUsd)} sub={`${num(data.liquidityCount)} events`} />
              <Row label="Vaults" value={usd2(data.vaultVolumeUsd)} sub={`${num(data.vaultTxCount)} txns`} />
              <Row label="Bridge (CCTP)" value={usd2(data.bridgeVolumeUsd)} sub={`${num(data.bridgeCount)} recent burns`} />
              <Row label="Total Volume" value={usd2(data.totalVolumeUsd)} strong />
            </div>

            <div className="border border-border bg-card rounded-sm p-6">
              <SectionTitle icon={Layers}>Total Value Locked</SectionTitle>
              <Row label="StableSwap Pool" value={usd2(data.poolTvlUsd)} />
              <Row label="· USDC reserve" value={num(Math.round(data.poolUsdc))} />
              <Row label="· EURC reserve" value={num(Math.round(data.poolEurc))} />
              <Row label="Yield Vaults" value={usd2(data.vaultTvlUsd)} />
              <Row label="Pool APR" value={`${data.poolAprPct.toFixed(2)}%`} sub={`${data.poolFeePct}% swap fee`} />
              <Row label="Total TVL" value={usd2(data.totalTvlUsd)} strong />
            </div>
          </div>

          {/* Vault performance */}
          <div className="border border-border bg-card rounded-sm p-6 mb-10">
            <SectionTitle icon={Sprout}>Vault Performance · Auto-Compounding</SectionTitle>
            <div className="grid sm:grid-cols-2 gap-6">
              {data.vaults.map((v) => (
                <div key={v.symbol} className="border border-border rounded-sm p-4 bg-muted/10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold uppercase tracking-widest">lune{v.symbol}</span>
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <Row label="Vault TVL" value={usd2(v.tvlUsd)} />
                  <Row label="Price / Share" value={v.pricePerShare.toFixed(6)} />
                  <Row label="Yield Accrued" value={`${v.yieldPct.toFixed(4)}%`} />
                </div>
              ))}
            </div>
          </div>

          {/* Bridge + contracts */}
          <div className="grid md:grid-cols-2 gap-6 mb-10">
            <div className="border border-border bg-card rounded-sm p-6">
              <SectionTitle icon={ArrowLeftRight}>Cross-Chain · Circle CCTP v2</SectionTitle>
              <Row label="Bridge Volume (recent)" value={usd2(data.bridgeVolumeUsd)} />
              <Row label="Burns (recent)" value={num(data.bridgeCount)} />
              <p className="text-[10px] text-muted-foreground leading-relaxed mt-3">
                Lunex routes cross-chain USDC via Circle's Cross-Chain Transfer Protocol. CCTP is shared Arc-wide
                infrastructure, so this samples recent on-chain burn flow; the full historical series is published in
                the Dune dashboard.
              </p>
            </div>
            <div className="border border-border bg-card rounded-sm p-6">
              <SectionTitle icon={Droplets}>Protocol Contracts</SectionTitle>
              {[
                ["StableSwap Pool", "0xC24BFc8e4b10500a72A63Bec98CCC989CbDA41d8"],
                ["luneUSDC Vault", "0x66CF9CA9D75FD62438C6E254bA35E61775EF9496"],
                ["luneEURC Vault", "0xcF2C839B12ECf6D9eEcd4607521B73fcFb7E8713"],
              ].map(([label, addr]) => (
                <a
                  key={addr}
                  href={`${EXPLORER_URL}/address/${addr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between text-xs font-mono text-primary hover:underline py-2 border-b border-border last:border-0"
                >
                  <span>{label}</span>
                  <span className="text-muted-foreground">↗</span>
                </a>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground text-center font-mono">
            All metrics decoded live from Lunex contract events + state on Arc Testnet. No off-chain database. Last
            updated {updated}.
          </p>
        </>
      )}
    </div>
  );
};

export default Analytics;
