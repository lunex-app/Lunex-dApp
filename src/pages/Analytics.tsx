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
import { WalletSearch } from "@/components/WalletSearch";
import { fetchProtocolAnalytics, type ProtocolAnalytics } from "@/lib/onchainAnalytics";
import { EXPLORER_URL, CONTRACTS } from "@/config/wagmi";

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
        </div>
        <div className="flex items-center gap-4 mt-6 md:mt-0">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Data Source</p>
            <p className="text-xs font-bold text-green-500 uppercase tracking-widest flex items-center justify-end gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Onchain
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

      <div className="mb-10">
        <WalletSearch />
      </div>

      {!data ? (
        <div className="flex items-center justify-center py-32 text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mr-3" /> Reading onchain activity…
        </div>
      ) : (
        <>
          {/* Headline KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10">
            <Kpi label="45-Day Volume" value={usd(data.totalVolumeUsd)} icon={BarChart3} accent sub="swaps + pool + vaults + bridge" />
            <Kpi label="Total Value Locked" value={usd(data.totalTvlUsd)} icon={DollarSign} />
            <Kpi label="Active Wallets (45d)" value={num(data.allTimeWallets)} icon={Users} />
            <Kpi label="Transactions (45d)" value={num(data.totalTxCount)} icon={Activity} />
          </div>

          {/* ===================== USERS / WALLETS (featured) ===================== */}
          <div className="border border-primary/30 bg-primary/[0.03] rounded-sm p-6 mb-10">
            <SectionTitle icon={Users}>Active Wallets</SectionTitle>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6">
              <Kpi label="Daily Active (24h)" value={num(data.dau)} icon={Users} />
              <Kpi label="Weekly Active (7d)" value={num(data.wau)} icon={Users} />
              <Kpi label="Monthly Active (30d)" value={num(data.mau)} icon={CalendarDays} />
              <Kpi label="Active Wallets (45d)" value={num(data.allTimeWallets)} icon={Users} accent />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Daily Active Wallets · Last 30 Days
            </p>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.dailyWallets ?? []} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
                {num((data.daily ?? []).reduce((s, d) => s + d.swaps, 0))} swaps ·{" "}
                {usd((data.daily ?? []).reduce((s, d) => s + d.volumeUsd, 0))}
              </span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily ?? []} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
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
              <Row label="· USDC → USDT" value={usd2(data.usdcToUsdtUsd)} />
              <Row label="· USDT → USDC" value={usd2(data.usdtToUsdcUsd)} />
              <Row label="· EURC → USDT" value={usd2(data.eurcToUsdtUsd)} />
              <Row label="· USDT → EURC" value={usd2(data.usdtToEurcUsd)} />
              <Row label="Pool Liquidity" value={usd2(data.liquidityVolumeUsd)} sub={`${num(data.liquidityCount)} events`} />
              <Row label="Vaults" value={usd2(data.vaultVolumeUsd)} sub={`${num(data.vaultTxCount)} txns`} />
              <Row label="Bridge (CCTP)" value={usd2(data.bridgeVolumeUsd)} sub={`${num(data.bridgeCount)} bridges · 0.1% fee`} />
              <Row label="Total Volume" value={usd2(data.totalVolumeUsd)} strong />
            </div>

            <div className="border border-border bg-card rounded-sm p-6">
              <SectionTitle icon={Layers}>Total Value Locked</SectionTitle>
              <Row label="All Pools" value={usd2(data.poolTvlUsd)} />
              <Row label="· USDC/EURC Pool" value={usd2(data.poolUsdc + data.poolEurc)} sub={`${num(Math.round(data.poolUsdc))} USDC · ${num(Math.round(data.poolEurc))} EURC`} />
              <Row label="· USDC/USDT Pool" value={usd2(data.pool2Usdc + data.pool2Usdt)} sub={`${num(Math.round(data.pool2Usdc))} USDC · ${num(Math.round(data.pool2Usdt))} USDT`} />
              <Row label="· EURC/USDT Pool" value={usd2(data.pool3Eurc + data.pool3Usdt)} sub={`${num(Math.round(data.pool3Eurc))} EURC · ${num(Math.round(data.pool3Usdt))} USDT`} />
              <Row label="Yield Vaults" value={usd2(data.vaultTvlUsd)} />
              <Row label="Pool APR" value={`${data.poolAprPct.toFixed(2)}%`} sub={`${data.poolFeePct}% swap fee`} />
              <Row label="Total TVL" value={usd2(data.totalTvlUsd)} strong />
            </div>
          </div>

          {/* Vault performance */}
          <div className="border border-border bg-card rounded-sm p-6 mb-10">
            <SectionTitle icon={Sprout}>Vault Performance · Auto-Compounding</SectionTitle>
            <div className="grid sm:grid-cols-3 gap-6">
              {(data.vaults ?? []).map((v) => (
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
              <SectionTitle icon={ArrowLeftRight}>Bridge · Protocol Fees</SectionTitle>
              <Row label="Lunex Bridge Volume" value={usd2(data.bridgeVolumeUsd)} strong />
              <Row label="Bridges Settled" value={num(data.bridgeCount)} />
              <Row label="Protocol Fees Collected" value={usd2(data.treasuryRevenueUsd)} strong />
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Treasury Wallet</p>
                <a
                  href={`${EXPLORER_URL}/address/${data.treasuryAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-mono text-primary hover:underline break-all"
                >
                  {data.treasuryAddress} ↗
                </a>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed mt-3">
                Lunex charges a 0.1% protocol fee on every bridge, collected in USDC by the treasury. Bridge volume is
                isolated to Lunex-routed CCTP flow (fee ÷ 0.1%). All figures are read directly from onchain treasury
                inflows.
              </p>
            </div>
            <div className="border border-border bg-card rounded-sm p-6">
              <SectionTitle icon={Droplets}>Protocol Contracts</SectionTitle>
              {([
                ["StableSwap Pool (USDC/EURC)", CONTRACTS.LUNEX_SWAP_POOL],
                ["StableSwap Pool (USDC/USDT)", CONTRACTS.POOL_USDC_USDT],
                ["StableSwap Pool (EURC/USDT)", CONTRACTS.POOL_EURC_USDT],
                ["LP Token (USDC/EURC)",        CONTRACTS.LUNEX_LP],
                ["LP Token (USDC/USDT)",        CONTRACTS.LP_USDC_USDT],
                ["LP Token (EURC/USDT)",        CONTRACTS.LP_EURC_USDT],
                ["luneUSDC Vault",              CONTRACTS.LUNE_VAULT_USDC],
                ["luneEURC Vault",              CONTRACTS.LUNE_VAULT_EURC],
                ["luneUSDT Vault",              CONTRACTS.LUNE_VAULT_USDT],
              ] as [string, string][]).map(([label, addr]) => (
                <a
                  key={addr}
                  href={`${EXPLORER_URL}/address/${addr}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between text-xs font-mono text-primary hover:underline py-2 border-b border-border last:border-0"
                >
                  <span className="text-foreground font-semibold not-italic mr-2">{label}</span>
                  <span className="text-muted-foreground truncate">{addr.slice(0, 10)}…{addr.slice(-6)} ↗</span>
                </a>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground text-center font-mono">
            Event-based metrics cover the rolling 45-day window. TVL is always live. Data read directly from Arc Testnet - no off-chain database. Last updated {updated}.
          </p>
        </>
      )}
    </div>
  );
};

export default Analytics;
