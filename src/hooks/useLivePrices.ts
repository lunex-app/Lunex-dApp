import { useState, useEffect, useRef } from "react";

export interface TokenPriceData {
  price: number;
  change24h: number | null;
}

export interface LivePrices {
  USDC: TokenPriceData;
  EURC: TokenPriceData;
  USDT: TokenPriceData;
  loading: boolean;
  lastUpdated: Date | null;
}

const POLL_INTERVAL_MS = 60_000;

// CoinGecko free API — includes 24h change
const CG_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,euro-coin,tether&vs_currencies=usd&include_24hr_change=true";

// Fallback for EURC only (EUR/USD spot, no 24h)
const EUR_USD_API = "https://open.er-api.com/v6/latest/EUR";

interface CgResponse {
  "usd-coin"?: { usd?: number; usd_24h_change?: number };
  "euro-coin"?: { usd?: number; usd_24h_change?: number };
  tether?:      { usd?: number; usd_24h_change?: number };
}

interface Cache {
  USDC: TokenPriceData;
  EURC: TokenPriceData;
  USDT: TokenPriceData;
  ts: number;
}

let cache: Cache | null = null;

async function fetchPrices(): Promise<Cache | null> {
  const now = Date.now();
  if (cache && now - cache.ts < POLL_INTERVAL_MS) return cache;

  try {
    const res = await fetch(CG_URL, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data: CgResponse = await res.json();
      const usdcPrice  = data["usd-coin"]?.usd       ?? 1.00;
      const eurcPrice  = data["euro-coin"]?.usd       ?? null;
      const usdtPrice  = data["tether"]?.usd          ?? 1.00;
      const usdcChg    = data["usd-coin"]?.usd_24h_change  ?? null;
      const eurcChg    = data["euro-coin"]?.usd_24h_change ?? null;
      const usdtChg    = data["tether"]?.usd_24h_change    ?? null;

      cache = {
        USDC: { price: usdcPrice, change24h: usdcChg },
        EURC: { price: eurcPrice ?? 1.00, change24h: eurcChg },
        USDT: { price: usdtPrice, change24h: usdtChg },
        ts: now,
      };
      return cache;
    }
  } catch { /* fall through to fallback */ }

  // Fallback: EUR/USD for EURC, stablecoins at 1.00
  try {
    const res = await fetch(EUR_USD_API, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      const usd = data?.rates?.USD;
      if (typeof usd === "number" && usd > 0) {
        cache = {
          USDC: { price: 1.00, change24h: cache?.USDC.change24h ?? null },
          EURC: { price: usd, change24h: cache?.EURC.change24h ?? null },
          USDT: { price: 1.00, change24h: cache?.USDT.change24h ?? null },
          ts: now,
        };
        return cache;
      }
    }
  } catch { /* network error */ }

  return cache; // return stale if available
}

export function useLivePrices(): LivePrices {
  const [data, setData] = useState<Cache | null>(cache);
  const [loading, setLoading] = useState(cache === null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setInterval>;

    const poll = async () => {
      const result = await fetchPrices();
      if (!mounted.current) return;
      if (result) {
        setData(result);
        setLastUpdated(new Date());
      }
      setLoading(false);
    };

    poll();
    timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  const fallback: TokenPriceData = { price: 1.00, change24h: null };

  return {
    USDC: data?.USDC ?? fallback,
    EURC: data?.EURC ?? fallback,
    USDT: data?.USDT ?? fallback,
    loading,
    lastUpdated,
  };
}
