import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2 } from "lucide-react";

interface TradingViewChartProps {
  fromSymbol: string;
  toSymbol: string;
  height?: number;
}

type Point = { t: number; price: number };
type Interval = "1h" | "4h" | "1d";

const INTERVALS: { label: string; value: Interval; param: string; days: number }[] = [
  { label: "1H", value: "1h", param: "1h",  days: 7   },
  { label: "4H", value: "4h", param: "4h",  days: 30  },
  { label: "1D", value: "1d", param: "1d",  days: 180 },
];

function getSource(from: string, to: string): { source: "binance" | "coingecko"; id: string } {
  const pair = `${from}-${to}`.toUpperCase();
  if (pair === "USDC-USDT" || pair === "USDT-USDC") {
    return { source: "binance", id: "USDCUSDT" };
  }
  // EURC is not listed on Binance — fall back to CoinGecko for EURC pairs
  return { source: "coingecko", id: "euro-coin" };
}

async function fetchBinance(symbol: string, interval: string, days: number): Promise<Point[]> {
  const limit = Math.min(1000, days * (interval === "1h" ? 24 : interval === "4h" ? 6 : 1));
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  if (!res.ok) throw new Error("Binance error");
  const rows: [number, string, string, string, string][] = await res.json();
  return rows.map(([t, , , , close]) => ({ t, price: parseFloat(close) }));
}

async function fetchCoinGecko(id: string, days: number): Promise<Point[]> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`
  );
  if (!res.ok) throw new Error("CoinGecko error");
  const json: { prices: [number, number][] } = await res.json();
  return json.prices.map(([t, price]) => ({ t, price }));
}

function fmtTick(ts: number, days: number): string {
  const d = new Date(ts);
  return days <= 7
    ? d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function TradingViewChart({ fromSymbol, toSymbol, height = 360 }: TradingViewChartProps) {
  const [chartInterval, setChartInterval] = useState<Interval>("1h");
  const [data, setData]       = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const { source, id } = getSource(fromSymbol, toSymbol);
  const cfg = INTERVALS.find(i => i.value === chartInterval)!;

  const load = useCallback(async () => {
    try {
      setError(null);
      const pts = source === "binance"
        ? await fetchBinance(id, cfg.param, cfg.days)
        : await fetchCoinGecko(id, cfg.days);
      setData(pts);
    } catch {
      setError("Failed to load chart data");
    } finally {
      setLoading(false);
    }
  }, [source, id, cfg]);

  useEffect(() => {
    setLoading(true);
    setData([]);
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const last  = data.at(-1)?.price;
  const first = data[0]?.price;
  const pct   = first && last ? ((last - first) / first) * 100 : null;
  const isUp  = pct !== null && pct >= 0;
  const color = isUp ? "#10b981" : "#f87171";
  const pairLabel = `${fromSymbol}/${toSymbol}`;
  const srcLabel  = source === "binance" ? "Binance" : "CoinGecko";

  return (
    <div style={{ height }} className="w-full bg-card border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="font-bold text-sm">{pairLabel}</span>
          {last != null && (
            <span className="font-mono text-sm font-semibold">${last.toFixed(5)}</span>
          )}
          {pct != null && (
            <span className={`text-[11px] font-mono font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
              {isUp ? "+" : ""}{pct.toFixed(3)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {INTERVALS.map(i => (
            <button
              key={i.value}
              onClick={() => setChartInterval(i.value)}
              className={`px-2.5 py-1 rounded text-[11px] font-bold transition-colors ${
                chartInterval === i.value
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            {error}
          </div>
        )}
        {!loading && !error && data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={color} stopOpacity={0}    />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                tickFormatter={(v) => fmtTick(Number(v), cfg.days)}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={90}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `$${v.toFixed(4)}`}
                width={68}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 11,
                  padding: "6px 10px",
                }}
                labelFormatter={(v) => fmtTick(Number(v), cfg.days)}
                formatter={(v: number) => [`$${v.toFixed(5)}`, pairLabel]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={color}
                strokeWidth={1.5}
                fill="url(#chartGrad)"
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-1.5 border-t border-border shrink-0">
        <p className="text-[10px] text-muted-foreground text-center">Price data · {srcLabel}</p>
      </div>
    </div>
  );
}
