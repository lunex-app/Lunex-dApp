import { useEffect, useRef, useId } from "react";
import { useTheme } from "next-themes";

interface TradingViewChartProps {
  fromSymbol: string;
  toSymbol: string;
  height?: number;
}

function getTVSymbol(from: string, to: string): string {
  const pair = `${from}-${to}`.toUpperCase();
  const map: Record<string, string> = {
    "EURC-USDC": "BINANCE:EURCUSDT",
    "USDC-EURC": "BINANCE:EURCUSDT",
    "EURC-USDT": "BINANCE:EURCUSDT",
    "USDT-EURC": "BINANCE:EURCUSDT",
    "USDC-USDT": "BINANCE:USDCUSDT",
    "USDT-USDC": "BINANCE:USDCUSDT",
  };
  return map[pair] ?? "BINANCE:EURCUSDT";
}

declare global {
  interface Window {
    TradingView?: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}

export default function TradingViewChart({ fromSymbol, toSymbol, height = 360 }: TradingViewChartProps) {
  const uid = useId().replace(/:/g, "");
  const containerId = `tv_chart_${uid}`;
  const { resolvedTheme } = useTheme();
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  const symbol = getTVSymbol(fromSymbol, toSymbol);
  const theme  = resolvedTheme === "light" ? "light" : "dark";

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const init = () => {
      if (!window.TradingView) return;
      container.innerHTML = "";
      new window.TradingView.widget({
        autosize:           true,
        symbol,
        interval:           "60",
        timezone:           "Etc/UTC",
        theme,
        style:              "2",   // line chart
        locale:             "en",
        container_id:       containerId,
        hide_side_toolbar:  true,
        hide_top_toolbar:   false,
        allow_symbol_change: false,
        save_image:         false,
        withdateranges:     true,
        hide_volume:        false,
      });
    };

    if (window.TradingView) {
      init();
      return () => { if (container) container.innerHTML = ""; };
    }

    const onLoad = () => init();

    if (!scriptRef.current) {
      const script = document.createElement("script");
      script.src   = "https://s3.tradingview.com/tv.js";
      script.async = true;
      script.addEventListener("load", onLoad);
      document.head.appendChild(script);
      scriptRef.current = script;
    } else {
      scriptRef.current.addEventListener("load", onLoad);
    }

    return () => {
      scriptRef.current?.removeEventListener("load", onLoad);
      if (container) container.innerHTML = "";
    };
  }, [symbol, theme, containerId]);

  return (
    <div
      id={containerId}
      style={{ height }}
      className="w-full rounded-sm overflow-hidden border border-border"
    />
  );
}
