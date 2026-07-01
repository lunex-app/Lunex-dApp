import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type UTCTimestamp,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TradingViewChartProps {
  fromSymbol: string;
  toSymbol: string;
  height?: number;
}

type Candle = CandlestickData<UTCTimestamp>;
type Bar    = HistogramData<UTCTimestamp>;
type IntervalKey = "1h" | "4h" | "1d";

interface HoverInfo {
  open: number; high: number; low: number; close: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const UP_COLOR   = "#26a69a";
const DOWN_COLOR = "#ef5350";
const BG_COLOR   = "#0d0d0d";
const GRID_COLOR = "rgba(255, 255, 255, 0.05)";
const TEXT_COLOR = "#9598a1";
const BORDER_CLR = "rgba(255, 255, 255, 0.08)";

const INTERVALS = [
  { label: "1H", key: "1h" as IntervalKey, binance: "1h",  days: 7   },
  { label: "4H", key: "4h" as IntervalKey, binance: "4h",  days: 30  },
  { label: "1D", key: "1d" as IntervalKey, binance: "1d",  days: 180 },
] as const;

// ─── Data sources ─────────────────────────────────────────────────────────────

function getSource(from: string, to: string) {
  const pair = `${from}-${to}`.toUpperCase();
  return pair === "USDC-USDT" || pair === "USDT-USDC"
    ? { source: "binance" as const, symbol: "USDCUSDT" }
    : { source: "coingecko" as const, symbol: "euro-coin" };
}

async function loadBinance(
  symbol: string, interval: string, days: number
): Promise<{ candles: Candle[]; bars: Bar[] }> {
  const limit = Math.min(1000, days * (interval === "1h" ? 24 : interval === "4h" ? 6 : 1));
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
  );
  if (!res.ok) throw new Error("Binance error");
  const rows: [number, string, string, string, string, string][] = await res.json();
  return {
    candles: rows.map(([t, o, h, l, c]) => ({
      time:  Math.floor(t / 1000) as UTCTimestamp,
      open:  parseFloat(o),
      high:  parseFloat(h),
      low:   parseFloat(l),
      close: parseFloat(c),
    })),
    bars: rows.map(([t, o, , , c, v]) => ({
      time:  Math.floor(t / 1000) as UTCTimestamp,
      value: parseFloat(v),
      color: parseFloat(c) >= parseFloat(o)
        ? "rgba(38,166,154,0.45)"
        : "rgba(239,83,80,0.45)",
    })),
  };
}

async function loadCoinGecko(
  id: string, days: number
): Promise<{ candles: Candle[]; bars: Bar[] }> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`
  );
  if (!res.ok) throw new Error("CoinGecko error");
  const rows: [number, number, number, number, number][] = await res.json();
  return {
    candles: rows.map(([t, o, h, l, c]) => ({
      time: Math.floor(t / 1000) as UTCTimestamp,
      open: o, high: h, low: l, close: c,
    })),
    bars: [], // CoinGecko OHLC endpoint doesn't provide volume
  };
}

// ─── Chart chart options ───────────────────────────────────────────────────────

function makeChartOptions(width: number, height: number) {
  return {
    width,
    height,
    layout: {
      background: { type: ColorType.Solid, color: BG_COLOR },
      textColor: TEXT_COLOR,
      fontSize: 11,
      fontFamily: "'Inter', 'Menlo', 'Consolas', sans-serif",
    },
    grid: {
      vertLines: { color: GRID_COLOR },
      horzLines: { color: GRID_COLOR },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: {
      borderColor: BORDER_CLR,
    },
    leftPriceScale: { visible: false },
    timeScale: {
      borderColor: BORDER_CLR,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      barSpacing: 8,
    },
    handleScroll: true,
    handleScale: true,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TradingViewChart({ fromSymbol, toSymbol, height = 360 }: TradingViewChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  const candleRef    = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef       = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [interval, setInterval] = useState<IntervalKey>("1h");
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [lastCandle, setLastCandle] = useState<Candle | null>(null);
  const [hover, setHover]       = useState<HoverInfo | null>(null);

  const { source, symbol } = getSource(fromSymbol, toSymbol);
  const cfg = INTERVALS.find(i => i.key === interval)!;

  // ── Create chart once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;
    const chart = createChart(el, makeChartOptions(el.clientWidth, el.clientHeight));
    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:      UP_COLOR,
      downColor:    DOWN_COLOR,
      borderVisible: false,
      wickUpColor:   UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });
    candleRef.current = candleSeries;

    // Volume histogram (same pane, invisible price scale at bottom)
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: "volume" },
      priceScaleId: "vol",
    }, 0);
    volRef.current = volSeries;
    chart.priceScale("vol", 0).applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
      visible: false,
    });

    // Crosshair → update OHLC display
    chart.subscribeCrosshairMove((param) => {
      if (!candleRef.current) return;
      const bar = param.seriesData.get(candleRef.current);
      if (bar && "open" in bar) {
        setHover({ open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      } else {
        setHover(null);
      }
    });

    // Auto-resize
    const ro = new ResizeObserver(() => {
      if (chartRef.current && containerRef.current) {
        chartRef.current.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      candleRef.current = null;
      volRef.current    = null;
    };
  }, []);

  // ── Load data when pair / interval changes ────────────────────────────────────
  const load = useCallback(async () => {
    if (!candleRef.current || !volRef.current) return;
    try {
      setError(null);
      setLoading(true);
      const { candles, bars } = source === "binance"
        ? await loadBinance(symbol, cfg.binance, cfg.days)
        : await loadCoinGecko(symbol, cfg.days);

      candleRef.current.setData(candles);
      volRef.current.setData(bars);
      chartRef.current?.timeScale().fitContent();
      setLastCandle(candles.at(-1) ?? null);
    } catch {
      setError("Failed to load chart data");
    } finally {
      setLoading(false);
    }
  }, [source, symbol, cfg]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  // ── Derived header values ─────────────────────────────────────────────────────
  const display  = hover ?? (lastCandle
    ? { open: lastCandle.open, high: lastCandle.high, low: lastCandle.low, close: lastCandle.close }
    : null);
  const isUp     = display ? display.close >= display.open : true;
  const changeClr = isUp ? "#26a69a" : "#ef5350";
  const srcLabel  = source === "binance" ? "Binance" : "CoinGecko";
  const prec      = source === "coingecko" ? 5 : 6;

  // Header height + footer height — chart area fills the rest
  const HEADER_H = 48;
  const FOOTER_H = 28;
  const CHART_H  = Math.max(height - HEADER_H - FOOTER_H, 120);

  return (
    <div
      style={{ height, background: BG_COLOR }}
      className="w-full rounded-xl overflow-hidden flex flex-col border border-border"
    >
      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div
        style={{ height: HEADER_H, borderBottom: `1px solid ${BORDER_CLR}` }}
        className="flex items-center justify-between px-3 shrink-0"
      >
        {/* Left: pair + OHLC */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-[13px]" style={{ color: "#d1d4dc" }}>
            {fromSymbol}/{toSymbol}
          </span>
          {display && (
            <span className="flex items-center gap-2 text-[11px] font-mono">
              <span style={{ color: TEXT_COLOR }}>O</span>
              <span style={{ color: changeClr }}>{display.open.toFixed(prec)}</span>
              <span style={{ color: TEXT_COLOR }}>H</span>
              <span style={{ color: changeClr }}>{display.high.toFixed(prec)}</span>
              <span style={{ color: TEXT_COLOR }}>L</span>
              <span style={{ color: changeClr }}>{display.low.toFixed(prec)}</span>
              <span style={{ color: TEXT_COLOR }}>C</span>
              <span style={{ color: changeClr }}>{display.close.toFixed(prec)}</span>
            </span>
          )}
        </div>
        {/* Right: interval selector */}
        <div className="flex items-center gap-0.5 shrink-0">
          {INTERVALS.map(i => (
            <button
              key={i.key}
              onClick={() => setInterval(i.key)}
              style={{
                padding: "3px 8px",
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
                background: interval === i.key ? "rgba(255,255,255,0.12)" : "transparent",
                color: interval === i.key ? "#d1d4dc" : TEXT_COLOR,
                border: "none",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
            >
              {i.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chart area ──────────────────────────────────────────────────────────── */}
      <div style={{ height: CHART_H, position: "relative", flex: "1 0 auto" }}>
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        {loading && (
          <div
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: TEXT_COLOR }} />
          </div>
        )}
        {error && !loading && (
          <div
            style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: TEXT_COLOR }}
          >
            {error}
          </div>
        )}
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────────── */}
      <div
        style={{ height: FOOTER_H, borderTop: `1px solid ${BORDER_CLR}`, display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <span style={{ fontSize: 10, color: TEXT_COLOR }}>
          Price data · {srcLabel}
        </span>
      </div>
    </div>
  );
}
