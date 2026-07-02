import { useRef, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  ArrowLeftRight,
  ArrowDown,
  Sprout,
  Fingerprint,
  Repeat,
  Zap,
  BarChart2,
  ChevronRight,
  Shield,
  Menu,
  X,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { fetchProtocolAnalytics, getCachedAnalytics } from "@/lib/onchainAnalytics";
import { usePoolData } from "@/hooks/usePoolData";
import usdcLogo from "@/assets/tokens/usdc.png";
import eurcLogo from "@/assets/tokens/eurc.png";
import usdtLogo from "@/assets/tokens/usdt.png";

// ── Constants ────────────────────────────────────────────────────────────────

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ── Reusable utilities ───────────────────────────────────────────────────────

function useCountUp(target: number, isInView: boolean) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!isInView || target === 0) return;
    const DURATION = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION, 1);
      setVal(Math.round(target * easeOutCubic(t)));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, isInView]);
  return val;
}

function FadeUp({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.15 });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.65, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function CountStat({ label, value, prefix = "$", suffix = "" }: { label: string; value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true });
  const count = useCountUp(value, isInView);
  return (
    <div ref={ref} className="flex flex-col items-center sm:items-start justify-center px-8 py-7 text-center sm:text-left">
      <p className="text-2xl md:text-3xl font-bold font-mono tabular-nums text-foreground">
        {prefix}{fmtCompact(count)}{suffix}
      </p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-[0.22em] mt-1.5">{label}</p>
    </div>
  );
}

// ── Animated swap widget ─────────────────────────────────────────────────────

type TokenSymbol = "USDC" | "EURC" | "USDT";
type SwapPhase = "show" | "clicking" | "wallet" | "success" | "exit";

interface Scenario { from: TokenSymbol; to: TokenSymbol; amount: number }

const TOKEN_LOGOS: Record<TokenSymbol, string> = { USDC: usdcLogo, EURC: eurcLogo, USDT: usdtLogo };

const SCENARIOS: Scenario[] = [
  { from: "USDC", to: "EURC",  amount: 1000  },
  { from: "EURC", to: "USDT",  amount: 500   },
  { from: "USDT", to: "USDC",  amount: 2500  },
  { from: "USDC", to: "USDT",  amount: 750   },
  { from: "EURC", to: "USDC",  amount: 1500  },
  { from: "USDT", to: "EURC",  amount: 300   },
];

const BASE_RATES: Record<string, number> = {
  "USDC-EURC": 0.9247, "EURC-USDC": 1.0814,
  "USDC-USDT": 0.9998, "USDT-USDC": 1.0002,
  "EURC-USDT": 0.9245, "USDT-EURC": 1.0817,
};

function HeroSwapCard({ feePercent }: { feePercent: string }) {
  const [idx, setIdx]   = useState(0);
  const [phase, setPhase] = useState<SwapPhase>("show");
  const [rate, setRate] = useState(BASE_RATES["USDC-EURC"]);

  const scenario = SCENARIOS[idx];
  const rateKey  = `${scenario.from}-${scenario.to}`;

  // Gently drift the rate
  useEffect(() => {
    const base = BASE_RATES[rateKey];
    setRate(base);
    const id = setInterval(() => {
      setRate((r) => {
        const delta = (Math.random() - 0.5) * 0.0008;
        return parseFloat(Math.min(base * 1.002, Math.max(base * 0.998, r + delta)).toFixed(4));
      });
    }, 2500);
    return () => clearInterval(id);
  }, [rateKey]);

  // Phase cycle: show → clicking → wallet → success → exit → next
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setPhase("clicking"), 3000));
    timers.push(setTimeout(() => setPhase("wallet"),   3350));
    timers.push(setTimeout(() => setPhase("success"),  5200));
    timers.push(setTimeout(() => setPhase("exit"),     6400));
    timers.push(setTimeout(() => {
      setIdx((i) => (i + 1) % SCENARIOS.length);
      setPhase("show");
    }, 6900));
    return () => timers.forEach(clearTimeout);
  }, [idx]);

  const output = (scenario.amount * rate).toFixed(2);
  const showOverlay = phase === "wallet" || phase === "success";

  return (
    <motion.div
      key={idx}
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: phase === "exit" ? 0 : 1, y: phase === "exit" ? -16 : 0, scale: 1 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="relative w-full max-w-[420px] mx-auto lg:mx-0"
    >
      {/* Card */}
      <div className="bg-card border border-border rounded-2xl p-5 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <span className="text-sm font-bold text-foreground">Swap</span>
          <span className="flex items-center gap-1.5 text-[10px] text-primary font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Arc Testnet
          </span>
        </div>

        {/* From */}
        <div className="bg-background rounded-xl p-4 mb-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">You pay</div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[1.75rem] font-bold text-foreground leading-none">
              {scenario.amount.toLocaleString()}.00
            </span>
            <div className="flex items-center gap-2 bg-primary/10 rounded-full pl-1 pr-3 py-1.5 shrink-0">
              <img src={TOKEN_LOGOS[scenario.from]} className="h-5 w-5" alt={scenario.from} />
              <span className="text-sm font-bold text-foreground">{scenario.from}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1.5">
            {scenario.from === "EURC" ? "≈ $" + (scenario.amount * 1.0814).toFixed(2) : `≈ $${scenario.amount.toLocaleString()}.00`}
          </div>
        </div>

        <div className="flex justify-center -my-0.5 relative z-10">
          <div className="bg-background border border-border rounded-lg p-1.5">
            <ArrowDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>

        {/* To */}
        <div className="bg-background rounded-xl p-4 mt-2 mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">You receive</div>
          <div className="flex items-center justify-between gap-3">
            <motion.span
              key={output}
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
              className="text-[1.75rem] font-bold text-primary leading-none"
            >
              {Number(output).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </motion.span>
            <div className="flex items-center gap-2 bg-primary/10 rounded-full pl-1 pr-3 py-1.5 shrink-0">
              <img src={TOKEN_LOGOS[scenario.to]} className="h-5 w-5" alt={scenario.to} />
              <span className="text-sm font-bold text-foreground">{scenario.to}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-1.5">
            {scenario.to === "EURC" ? `≈ $${(Number(output) * 1.0814).toFixed(2)}` : `≈ $${output}`}
          </div>
        </div>

        {/* Rate row */}
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-4 px-0.5">
          <span>
            1 {scenario.from} =&nbsp;
            <motion.span key={rate} className="text-foreground font-mono">
              {rate.toFixed(4)} {scenario.to}
            </motion.span>
          </span>
          <span className="text-primary font-medium">Fee {feePercent}%</span>
        </div>

        {/* Swap button */}
        <motion.div
          animate={phase === "clicking" ? { scale: 0.96, opacity: 0.85 } : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-center text-sm font-bold cursor-pointer select-none"
        >
          {phase === "show" || phase === "clicking" ? "Swap" : "Swapping..."}
        </motion.div>

        <div className="flex items-center justify-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
          <Zap className="h-3 w-3 text-primary" />
          Gasless on Arc · Sub-second finality
        </div>

        {/* Wallet confirmation overlay */}
        <AnimatePresence>
          {showOverlay && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="absolute inset-0 bg-card/96 backdrop-blur-sm rounded-2xl p-6 flex flex-col items-center justify-center"
            >
              {phase === "wallet" ? (
                <>
                  <img src="/lunex-logo.png" className="h-10 w-10 mb-3 opacity-90" alt="Lunex" />
                  <p className="text-sm font-bold text-foreground mb-0.5">Confirm Swap</p>
                  <p className="text-[10px] text-muted-foreground mb-5">Circle Smart Wallet</p>
                  <div className="w-full bg-background border border-border rounded-xl p-3 mb-5 text-center">
                    <span className="text-sm font-mono text-foreground">
                      {scenario.amount.toLocaleString()} {scenario.from}
                    </span>
                    <span className="mx-2 text-muted-foreground">→</span>
                    <span className="text-sm font-mono text-primary">
                      {Number(output).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {scenario.to}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Confirming on Arc...
                  </div>
                </>
              ) : (
                <>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="h-14 w-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mb-4"
                  >
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                  </motion.div>
                  <p className="text-sm font-bold text-foreground mb-1">Swap confirmed!</p>
                  <p className="text-xs text-muted-foreground">
                    {Number(output).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {scenario.to} received
                  </p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating chip: slippage */}
      <motion.div
        animate={{ y: [0, -9, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-5 -right-4 bg-card border border-border rounded-xl px-3.5 py-2.5 shadow-lg hidden sm:block"
      >
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Near-zero slippage</div>
        <div className="text-sm font-bold text-foreground font-mono">0.001%</div>
      </motion.div>

      {/* Floating chip: powered by */}
      <motion.div
        animate={{ y: [0, 11, 0] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        className="absolute -bottom-5 -left-4 bg-card border border-border rounded-xl px-3.5 py-2.5 shadow-lg hidden sm:block"
      >
        <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-0.5">Powered by</div>
        <div className="text-sm font-bold text-primary">Circle CCTP</div>
      </motion.div>
    </motion.div>
  );
}

// ── Swap flow visual ─────────────────────────────────────────────────────────

function SwapFlowVisual() {
  return (
    <FadeUp delay={0.1} className="flex items-center justify-center lg:justify-end">
      <div className="relative flex flex-col items-center gap-3 select-none">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="flex items-center gap-3 bg-card border border-border rounded-2xl px-6 py-4 shadow-lg"
        >
          <img src={usdcLogo} className="h-10 w-10" alt="USDC" />
          <div>
            <div className="text-xs text-muted-foreground">You send</div>
            <div className="text-xl font-bold text-foreground font-mono">1,000 USDC</div>
          </div>
        </motion.div>

        <div className="flex flex-col items-center gap-1 my-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.2, 1, 0.2], y: [0, 4, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: "easeInOut" }}
              className="h-1.5 w-1.5 rounded-full bg-primary"
            />
          ))}
        </div>

        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5">
          <ArrowLeftRight className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-primary">StableSwap AMM</span>
        </div>

        <div className="flex flex-col items-center gap-1 my-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ opacity: [0.2, 1, 0.2], y: [0, 4, 0] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.6 + i * 0.2, ease: "easeInOut" }}
              className="h-1.5 w-1.5 rounded-full bg-primary"
            />
          ))}
        </div>

        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          className="flex items-center gap-3 bg-card border border-border rounded-2xl px-6 py-4 shadow-lg"
        >
          <img src={eurcLogo} className="h-10 w-10" alt="EURC" />
          <div>
            <div className="text-xs text-muted-foreground">You receive</div>
            <div className="text-xl font-bold text-primary font-mono">924.70 EURC</div>
          </div>
        </motion.div>

        <motion.div
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-10 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2 opacity-40"
        >
          <img src={usdtLogo} className="h-6 w-6" alt="USDT" />
          <span className="text-xs text-muted-foreground">USDT</span>
        </motion.div>
      </div>
    </FadeUp>
  );
}

// ── Earn visual ──────────────────────────────────────────────────────────────

function EarnVisual({ tvl }: { tvl: number }) {
  const bars = [38, 45, 42, 60, 55, 72, 68, 85, 79, 95];
  return (
    <FadeUp delay={0.1}>
      <div className="bg-card border border-border rounded-2xl p-6 shadow-xl max-w-[420px]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <img src={usdcLogo} className="h-7 w-7" alt="USDC" />
            <div>
              <div className="text-sm font-bold text-foreground">USDC Vault</div>
              <div className="text-[10px] text-muted-foreground">ERC-4626 · Auto-compounding</div>
            </div>
          </div>
          <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 rounded-full px-2.5 py-1 uppercase tracking-wider">
            Active
          </span>
        </div>

        <div className="bg-background rounded-xl p-4 mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Deposited</div>
          <div className="text-2xl font-bold font-mono text-foreground">
            {tvl > 0 ? `$${fmtCompact(tvl)}` : "Loading..."}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Vault Growth (30d)</div>
          <div className="flex items-end gap-1 h-16">
            {bars.map((h, i) => (
              <motion.div
                key={i}
                initial={{ height: 0 }}
                animate={{ height: `${h}%` }}
                transition={{ duration: 0.6, delay: 0.05 * i, ease: EASE }}
                className="flex-1 rounded-[2px] bg-primary/25 hover:bg-primary/50 transition-colors"
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-background rounded-xl p-3">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Strategy</div>
            <div className="text-xs font-bold text-foreground">Fee reinvestment</div>
          </div>
          <div className="bg-background rounded-xl p-3">
            <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Risk</div>
            <div className="text-xs font-bold text-green-500">Stable</div>
          </div>
        </div>
      </div>
    </FadeUp>
  );
}

// ── Chain logos ──────────────────────────────────────────────────────────────

function ChainLogo({ chain }: { chain: string }) {
  if (chain === "ETH") return (
    <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0">
      <path fill="#627EEA" d="M16 2 5 17 16 13z" opacity=".6"/>
      <path fill="#627EEA" d="M16 2 27 17 16 13z"/>
      <path fill="#627EEA" d="M5 17 16 23 27 17 16 13z" opacity=".2"/>
      <path fill="#627EEA" d="M5 17 16 13l0 10z" opacity=".6"/>
      <path fill="#627EEA" d="M16 24.5 5 19 16 30z" opacity=".6"/>
      <path fill="#627EEA" d="M16 24.5 27 19 16 30z"/>
    </svg>
  );
  if (chain === "ARB") return (
    <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0">
      <circle cx="16" cy="16" r="16" fill="#213147"/>
      <path fill="#28A0F0" d="M14.6 6.5 8 18.5l2.4 4L16 13l5.6 9.5 2.4-4L17.4 6.5c-.4-.7-1.2-1.1-2-.9-.6.2-1.3.5-1.7.9z"/>
      <path fill="#96BEDC" d="M18 23l-2-3.5-2 3.5H10.3L16 32l5.7-9H18z"/>
    </svg>
  );
  if (chain === "BASE") return (
    <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0">
      <circle cx="16" cy="16" r="16" fill="#0052FF"/>
      <path fill="white" d="M16.1 25c4.9 0 8.8-4 8.8-8.9S21 7.2 16.1 7.2c-4.6 0-8.4 3.6-8.8 8.1h11.5v1.6H7.3c.4 4.5 4.2 8.1 8.8 8.1z"/>
    </svg>
  );
  if (chain === "OP") return (
    <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0">
      <circle cx="16" cy="16" r="16" fill="#FF0420"/>
      <path fill="white" d="M10.2 13.2c0-1.5.9-2.4 2.4-2.4h1.3c1.5 0 2.4.9 2.4 2.4v.5h-2v-.5c0-.4-.2-.6-.5-.6h-1.1c-.3 0-.5.2-.5.6v5.6c0 .4.2.6.5.6H14c.3 0 .5-.2.5-.6v-.5h2v.5c0 1.5-.9 2.4-2.4 2.4h-1.5c-1.5 0-2.4-.9-2.4-2.4v-5.6zm8 0c0-1.5.9-2.4 2.4-2.4h1.3c1.5 0 2.4.9 2.4 2.4v5.6c0 1.5-.9 2.4-2.4 2.4h-1.3c-1.5 0-2.4-.9-2.4-2.4v-5.6zm2 5.6c0 .4.2.6.5.6h1.1c.3 0 .5-.2.5-.6v-5.6c0-.4-.2-.6-.5-.6h-1.1c-.3 0-.5.2-.5.6v5.6z"/>
    </svg>
  );
  if (chain === "AVAX") return (
    <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0">
      <circle cx="16" cy="16" r="16" fill="#E84142"/>
      <path fill="white" d="M21.8 21.5h-3.5l-2.3-4-2.3 4H10.2l4.3-7.5-1.5-2.5L7 21.5H4.5L13 7h2.5l1.5 2.6 1.5-2.6H21L28 21.5h-2.5l-4.3-7.5-1.5 2.5 4.1 7z"/>
    </svg>
  );
  if (chain === "MATIC") return (
    <svg viewBox="0 0 32 32" className="h-5 w-5 shrink-0">
      <circle cx="16" cy="16" r="16" fill="#8247E5"/>
      <path fill="white" d="M20.5 13.3l-1.6-.9-3.3-1.9-3.3 1.9-1.6.9v3.8l1.6.9 3.3 1.9 3.3-1.9 1.6-.9v-1.9l-3.3 1.9-3.3-1.9v-1.9l3.3-1.9 3.3 1.9v1.9l1.6-.9v-1.9z"/>
    </svg>
  );
  return <div className="h-5 w-5 rounded-full bg-muted shrink-0" />;
}

// ── Bridge network visual ────────────────────────────────────────────────────

const CHAINS = ["ETH", "ARB", "BASE", "OP", "AVAX", "MATIC"];

function BridgeNetworkVisual() {
  return (
    <FadeUp delay={0.1} className="flex items-center justify-center lg:justify-end">
      <div className="relative w-full max-w-[400px]">
        <div className="grid grid-cols-3 gap-3 items-center">
          <div className="flex flex-col gap-3">
            {CHAINS.slice(0, 3).map((chain, i) => (
              <motion.div
                key={chain}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: EASE }}
                className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5"
              >
                <ChainLogo chain={chain} />
                <span className="text-xs font-bold text-foreground">{chain}</span>
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, delay: i * 0.3, ease: "easeInOut" }}
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-primary"
                />
              </motion.div>
            ))}
          </div>

          <div className="flex flex-col items-center gap-2">
            <motion.div
              animate={{ boxShadow: ["0 0 0px hsl(187 100% 45% / 0)", "0 0 24px hsl(187 100% 45% / 0.4)", "0 0 0px hsl(187 100% 45% / 0)"] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
              className="bg-primary/10 border-2 border-primary rounded-2xl px-3 py-4 text-center"
            >
              <img src="/lunex-logo.png" alt="Arc" className="h-8 w-8 mx-auto mb-1.5" />
              <div className="text-[10px] font-bold text-primary uppercase tracking-wider">Arc</div>
              <div className="text-[8px] text-muted-foreground mt-0.5">Hub</div>
            </motion.div>
          </div>

          <div className="flex flex-col gap-3">
            {CHAINS.slice(3).map((chain, i) => (
              <motion.div
                key={chain}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: EASE }}
                className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2.5"
              >
                <motion.div
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 + i * 0.3, ease: "easeInOut" }}
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                />
                <span className="text-xs font-bold text-foreground">{chain}</span>
                <ChainLogo chain={chain} />
              </motion.div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-center">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">
            Circle CCTP · Burn-and-mint security
          </span>
        </div>
      </div>
    </FadeUp>
  );
}

// ── Main Landing ─────────────────────────────────────────────────────────────

const Landing = () => {
  const pool = usePoolData();

  const initial = getCachedAnalytics();
  const { data: analytics } = useQuery({
    queryKey: ["protocol-analytics-landing"],
    queryFn: () => fetchProtocolAnalytics(),
    refetchInterval: 5 * 60_000,
    staleTime:       4 * 60_000,
    initialData:     initial ?? undefined,
  });

  const totalTvl     = analytics?.totalTvlUsd    ?? 0;
  const totalVolume  = analytics?.totalVolumeUsd  ?? 0;
  const totalUsers   = analytics?.allTimeWallets  ?? 0;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    ["Swap",      "/swap"],
    ["Earn",      "/yield"],
    ["Bridge",    "/bridge"],
    ["Analytics", "/analytics"],
    ["Docs",      "/docs"],
  ] as const;

  return (
    <div className="bg-background text-foreground overflow-x-hidden">
      {/* ── NAVBAR ── */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-background/85 border-b border-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <img src="/lunex-logo.png" alt="Lunex" className="h-9 w-9 object-contain" />
            <span className="text-base font-bold tracking-tight text-foreground">Lunex</span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {navLinks.map(([label, href]) => (
              <Link key={href} to={href} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors font-medium">
                {label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/swap" className="hidden md:inline-flex items-center gap-1.5 bg-primary text-primary-foreground text-[13px] font-bold px-5 py-2 rounded-sm hover:bg-primary/90 transition-colors">
              Launch App <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <button className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen((v) => !v)} aria-label="Toggle menu">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-5 py-4 flex flex-col gap-4">
            {navLinks.map(([label, href]) => (
              <Link key={href} to={href} className="text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMobileMenuOpen(false)}>
                {label}
              </Link>
            ))}
            <Link to="/swap" className="inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-5 py-2.5 mt-2 w-fit rounded-sm" onClick={() => setMobileMenuOpen(false)}>
              Launch App <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-[0.05]" />

        <div className="relative max-w-7xl mx-auto px-5 md:px-8 min-h-screen flex items-center">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-12 w-full py-24 lg:py-0">

            {/* LEFT: Text */}
            <div className="flex flex-col justify-center">
              <div className="overflow-hidden mb-3">
                <motion.h1
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.8, delay: 0.06, ease: EASE }}
                  className="text-[clamp(2.8rem,6vw,5.5rem)] font-bold leading-[1.0] tracking-[-0.03em] text-foreground"
                >
                  The stablecoin
                </motion.h1>
              </div>
              <div className="overflow-hidden mb-8">
                <motion.h1
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.8, delay: 0.18, ease: EASE }}
                  className="text-[clamp(2.8rem,6vw,5.5rem)] font-bold leading-[1.0] tracking-[-0.03em] text-foreground"
                >
                  exchange.
                </motion.h1>
              </div>

              <motion.p
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.65, delay: 0.4, ease: EASE }}
                className="text-base md:text-lg text-muted-foreground max-w-lg mb-9 leading-relaxed"
              >
                Swap USDC, EURC and USDT at near-zero slippage. Earn auto-compounding yield
                on your stablecoins. Bridge across 6 chains, all gasless on Arc.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.54, ease: EASE }}
                className="flex flex-wrap items-center gap-3 mb-10"
              >
                <Link to="/swap" className="group inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-7 py-3.5 rounded-sm hover:bg-primary/90 transition-all">
                  Launch App <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link to="/docs" className="inline-flex items-center gap-2 border border-border text-muted-foreground text-sm font-semibold px-7 py-3.5 rounded-sm hover:border-primary/40 hover:text-primary transition-all">
                  Read the docs
                </Link>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="flex flex-wrap items-center gap-5"
              >
                {["No seed phrases", "Sub-second finality", "Circle CCTP"].map((item) => (
                  <div key={item} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    {item}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* RIGHT: Animated swap widget */}
            <div className="flex items-center justify-center lg:justify-end">
              <HeroSwapCard feePercent={pool.feePercent} />
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS BAR (TVL / Volume / Users) ── */}
      <div className="border-y border-border bg-card/30">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <CountStat label="Total Value Locked" value={totalTvl} />
          <CountStat label="Total Volume" value={totalVolume} />
          <CountStat label="Total Users" value={totalUsers} prefix="" />
        </div>
      </div>

      {/* ── SWAP SECTION ── */}
      <section className="py-32 max-w-7xl mx-auto px-5 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <FadeUp>
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary mb-5">01 / Swap</p>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-5 leading-tight">
              Swap stablecoins at<br />near-zero slippage.
            </h2>
            <p className="text-muted-foreground leading-relaxed mb-7 max-w-md">
              A Curve-style StableSwap AMM tuned for the 1:1 peg between USDC, EURC and USDT.
              Minimal price impact, {pool.feePercent}% fees, settled in under a second on Arc.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                "USDC, EURC and USDT in a single pool",
                `${pool.feePercent}% flat fee, no hidden charges`,
                "Gasless, fees paid in USDC",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <ChevronRight className="h-4 w-4 text-primary shrink-0" />{item}
                </li>
              ))}
            </ul>
            <Link to="/swap" className="group inline-flex items-center gap-2 text-sm font-bold text-primary hover:gap-3 transition-all">
              Start swapping <ArrowRight className="h-4 w-4" />
            </Link>
          </FadeUp>
          <SwapFlowVisual />
        </div>
      </section>

      {/* ── EARN SECTION ── */}
      <section className="py-32 border-t border-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <EarnVisual tvl={analytics?.vaultTvlUsd ?? 0} />
            <FadeUp delay={0.1}>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary mb-5">02 / Earn</p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-5 leading-tight">
                Auto-compound yield<br />while you sleep.
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-7 max-w-md">
                ERC-4626 vaults reinvest swap fees back into the pool automatically.
                Deposit your stablecoins once and watch the yield compound, no manual
                harvesting or claiming required.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "ERC-4626 standard, composable with any DeFi protocol",
                  "Swap fees reinvested automatically every cycle",
                  "Withdraw anytime with no lock-up periods",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <ChevronRight className="h-4 w-4 text-primary shrink-0" />{item}
                  </li>
                ))}
              </ul>
              <Link to="/yield" className="group inline-flex items-center gap-2 text-sm font-bold text-primary hover:gap-3 transition-all">
                View vaults <ArrowRight className="h-4 w-4" />
              </Link>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── BRIDGE SECTION ── */}
      <section className="py-32 border-t border-border">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <FadeUp>
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary mb-5">03 / Bridge</p>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-5 leading-tight">
                Bridge USDC across<br />6 chains instantly.
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-7 max-w-md">
                Powered by Circle's Cross-Chain Transfer Protocol (CCTP). USDC is burned
                on the source chain and minted natively on the destination, no wrapped
                tokens, no bridge risk.
              </p>
              <ul className="space-y-3 mb-8">
                {[
                  "Burn-and-mint security, native USDC on every chain",
                  "Ethereum, Arbitrum, Base, Optimism, Avalanche, Polygon",
                  "Attestation-based, permissionless settlement",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <ChevronRight className="h-4 w-4 text-primary shrink-0" />{item}
                  </li>
                ))}
              </ul>
              <Link to="/bridge" className="group inline-flex items-center gap-2 text-sm font-bold text-primary hover:gap-3 transition-all">
                Bridge now <ArrowRight className="h-4 w-4" />
              </Link>
            </FadeUp>
            <BridgeNetworkVisual />
          </div>
        </div>
      </section>

      {/* ── INFRASTRUCTURE ── */}
      <section className="py-24 border-t border-border bg-card/20">
        <div className="max-w-7xl mx-auto px-5 md:px-8">
          <FadeUp className="mb-14">
            <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary mb-4">Infrastructure</p>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground max-w-xl">
              Built on the most trusted rails in stablecoin finance.
            </h2>
          </FadeUp>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: Repeat,       color: "text-primary",    bg: "bg-primary/8",    title: "StableSwap AMM",          body: "Curve-style invariant. Deep liquidity, minimal price impact on every swap."             },
              { icon: ArrowLeftRight,color:"text-blue-400",   bg: "bg-blue-500/8",   title: "Native CCTP Bridge",       body: "Circle's burn-and-mint protocol. Real USDC on every chain, zero wrapped risk."      },
              { icon: Sprout,       color: "text-purple-400", bg: "bg-purple-500/8", title: "Auto-Compounding Vaults",  body: "ERC-4626 vaults that reinvest fees automatically. Deposit and let yield compound."   },
              { icon: Fingerprint,  color: "text-green-400",  bg: "bg-green-500/8",  title: "Passwordless Wallets",     body: "Circle passkey and email wallets. Gasless onboarding, no seed phrases."              },
            ].map((f, i) => (
              <FadeUp key={f.title} delay={i * 0.07}>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${f.bg} mb-5`}>
                  <f.icon className={`h-5 w-5 ${f.color}`} />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </FadeUp>
            ))}
          </div>

          <FadeUp className="mt-16 pt-10 border-t border-border">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-8 flex-wrap">
                {[
                  { icon: Zap,       color: "text-primary",  bg: "bg-primary/10 border-primary/20",  label: "Arc Network",       sub: "Sub-second L1"     },
                  { icon: Shield,    color: "text-blue-400", bg: "bg-blue-500/8 border-blue-500/15", label: "Circle CCTP",       sub: "Native bridge"     },
                  { icon: BarChart2, color: "text-green-400",bg: "bg-green-500/8 border-green-500/15",label:"On-chain Analytics", sub: "Fully transparent" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    {i > 0 && <div className="h-8 w-px bg-border mr-2 hidden sm:block" />}
                    <div className={`h-8 w-8 rounded-lg border flex items-center justify-center ${item.bg}`}>
                      <item.icon className={`h-4 w-4 ${item.color}`} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-foreground">{item.label}</div>
                      <div className="text-[10px] text-muted-foreground">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/analytics" className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1.5 shrink-0">
                View live analytics <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 max-w-7xl mx-auto px-5 md:px-8">
        <FadeUp>
          <div className="relative overflow-hidden border border-border rounded-2xl bg-card/40 py-20 px-8 md:px-16">
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-primary mb-4">Get started</p>
                <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-4 leading-tight">
                  Ready to trade<br />smarter?
                </h2>
                <p className="text-muted-foreground text-base leading-relaxed max-w-sm">
                  No seed phrases. No gas headaches. Connect with a passkey, email, or browser
                  wallet and start in seconds.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-start gap-4">
                <Link to="/swap" className="group inline-flex items-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-8 py-4 rounded-sm hover:bg-primary/90 transition-all">
                  Launch Lunex <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link to="/docs" className="inline-flex items-center gap-2 border border-border text-muted-foreground text-sm font-semibold px-8 py-4 rounded-sm hover:border-primary/40 hover:text-primary transition-all">
                  Read the docs
                </Link>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border py-10">
        <div className="max-w-7xl mx-auto px-5 md:px-8 flex flex-col md:flex-row items-center md:items-center justify-between gap-6">
          <div className="flex flex-col gap-1 items-center md:items-start text-center md:text-left">
            <div className="flex items-center gap-2.5">
              <img src="/lunex-logo.png" alt="Lunex" className="h-6 w-6 object-contain opacity-50" />
              <span className="text-xs text-muted-foreground/60">Lunex · Built on Arc · Powered by Circle</span>
            </div>
            <span className="text-[10px] text-muted-foreground/40 pl-8">Built by Mirror Labs</span>
          </div>
          <div className="flex items-center justify-center gap-7 flex-wrap">
            {[["Swap","/swap"],["Earn","/yield"],["Bridge","/bridge"],["Docs","/docs"],["Analytics","/analytics"],["Faucet","/faucet"]].map(([label,href])=>(
              <Link key={href} to={href} className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors">{label}</Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
