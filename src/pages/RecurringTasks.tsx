import { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, CalendarClock, Clock, Zap, Loader2,
  ExternalLink, AlertCircle, ArrowDownLeft, ArrowUpRight,
  LayoutList, Info, CheckCheck, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/context/WalletProvider";
import { cn } from "@/lib/utils";
import {
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits, type Address } from "viem";
import { CONTRACTS, TOKENS, arcTestnet, getExplorerTxUrl } from "@/config/wagmi";
import { lunexStreamAbi, erc20Abi } from "@/config/abis";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const STREAM_ADDRESS = CONTRACTS.LUNEX_STREAM as Address;

const TOKEN_OPTIONS = [
  { symbol: "USDC", address: TOKENS.USDC.address as Address, decimals: 6, color: "#2775CA" },
  { symbol: "EURC", address: TOKENS.EURC.address as Address, decimals: 6, color: "#3D8FFD" },
  { symbol: "USDT", address: TOKENS.USDT.address as Address, decimals: 6, color: "#26A17B" },
];

const STREAM_TYPES = [
  {
    id: 0,
    label: "Linear",
    desc: "Tokens vest smoothly every second proportional to time elapsed.",
    icon: "📈",
  },
  {
    id: 1,
    label: "Cliff",
    desc: "All tokens unlock in one shot at the cliff date.",
    icon: "🪨",
  },
  {
    id: 2,
    label: "Vesting",
    desc: "Nothing unlocks until cliff, then linear vesting begins.",
    icon: "🔐",
  },
  {
    id: 3,
    label: "Unlock",
    desc: "Tokens are locked until the stream end date, then fully unlockable.",
    icon: "🔓",
  },
];

const FREQ_PRESETS = [
  { label: "Per second", seconds: 1 },
  { label: "Daily",      seconds: 86_400 },
  { label: "Weekly",     seconds: 604_800 },
  { label: "Monthly",    seconds: 2_592_000 },
];

const DURATION_PRESETS = [
  { label: "7d",   days: 7 },
  { label: "30d",  days: 30 },
  { label: "90d",  days: 90 },
  { label: "6mo",  days: 180 },
  { label: "1yr",  days: 365 },
];

type TabId = "incoming" | "outgoing" | "all";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtDate(ts: number) {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDuration(startTs: number, endTs: number) {
  const s = endTs - startTs;
  if (s >= 86400 * 365) return `${(s / (86400 * 365)).toFixed(1)}yr`;
  if (s >= 86400 * 30)  return `${Math.round(s / (86400 * 30))}mo`;
  if (s >= 86400)       return `${Math.round(s / 86400)}d`;
  return `${Math.round(s / 3600)}h`;
}

function fmtAmount(raw: bigint, decimals: number, digits = 2) {
  return Number(formatUnits(raw, decimals)).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function progress(startTs: number, endTs: number) {
  const now = Date.now() / 1000;
  if (now <= startTs) return 0;
  if (now >= endTs) return 100;
  return Math.round(((now - startTs) / (endTs - startTs)) * 100);
}

function tokenFor(addr: string) {
  return TOKEN_OPTIONS.find((t) => t.address.toLowerCase() === addr.toLowerCase());
}

function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StreamData {
  id: bigint;
  sender: Address;
  recipient: Address;
  token: Address;
  totalAmount: bigint;
  claimedAmount: bigint;
  startTime: number;
  endTime: number;
  cliffTime: number;
  releaseFrequency: number;
  streamType: number;
  cancelable: boolean;
  transferable: boolean;
  recipientCanClaimAnytime: boolean;
  cancelled: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// StreamCard
// ─────────────────────────────────────────────────────────────────────────────

function StreamCard({
  stream, userAddress, onClaim, onCancel, activeClaim, activeCancel,
}: {
  stream: StreamData;
  userAddress: Address;
  onClaim: (id: bigint) => void;
  onCancel: (id: bigint) => void;
  activeClaim: bigint | null;
  activeCancel: bigint | null;
}) {
  const tok = tokenFor(stream.token);
  const sym = tok?.symbol ?? "?";
  const dec = tok?.decimals ?? 6;
  const color = tok?.color ?? "#888";

  const total    = Number(formatUnits(stream.totalAmount, dec));
  const claimed  = Number(formatUnits(stream.claimedAmount, dec));
  const pct      = progress(stream.startTime, stream.endTime);
  const isOwner  = stream.sender.toLowerCase() === userAddress.toLowerCase();
  const isRecip  = stream.recipient.toLowerCase() === userAddress.toLowerCase();
  const now      = Date.now() / 1000;
  const isActive = !stream.cancelled && now < stream.endTime;
  const typeDef  = STREAM_TYPES[stream.streamType] ?? STREAM_TYPES[0];
  const freqLabel = FREQ_PRESETS.find((f) => f.seconds === stream.releaseFrequency)?.label;

  const { data: claimableRaw } = useReadContract({
    address: STREAM_ADDRESS,
    abi: lunexStreamAbi,
    functionName: "claimable",
    args: [stream.id],
    chainId: arcTestnet.id,
    query: { refetchInterval: 8_000 },
  });
  const claimable = claimableRaw ? Number(formatUnits(claimableRaw as bigint, dec)) : 0;
  const canClaimNow = isRecip && claimable > 0 && !stream.cancelled &&
    (stream.recipientCanClaimAnytime || now >= stream.endTime);

  return (
    <div className={cn(
      "border rounded-xl bg-card overflow-hidden transition-all hover:border-border/80",
      stream.cancelled ? "opacity-55 border-border/40" : "border-border",
    )}>
      {/* Top accent line */}
      <div className="h-0.5 w-full" style={{ background: stream.cancelled ? "#555" : color }} />

      <div className="p-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Token circle */}
            <div className="h-10 w-10 rounded-full border flex items-center justify-center text-sm font-black shrink-0"
              style={{ background: `${color}18`, borderColor: `${color}40`, color }}>
              {sym[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm">{typeDef.icon} {typeDef.label} Stream</span>
                <span className="text-[10px] font-mono text-muted-foreground">#{stream.id.toString()}</span>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span>{total.toLocaleString()} {sym}</span>
                <span>·</span>
                <span>{fmtDuration(stream.startTime, stream.endTime)}</span>
                {freqLabel && <><span>·</span><span>{freqLabel} releases</span></>}
              </div>
            </div>
          </div>

          {/* Status badge */}
          {stream.cancelled
            ? <Badge className="text-[9px] uppercase tracking-widest border-red-500/30 bg-red-500/10 text-red-400 shrink-0"><Ban className="h-2.5 w-2.5 mr-1" />Cancelled</Badge>
            : now >= stream.endTime
              ? <Badge className="text-[9px] uppercase tracking-widest border-blue-500/30 bg-blue-500/10 text-blue-400 shrink-0"><CheckCheck className="h-2.5 w-2.5 mr-1" />Complete</Badge>
              : <Badge className="text-[9px] uppercase tracking-widest border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shrink-0"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 mr-1.5 inline-block animate-pulse" />Active</Badge>
          }
        </div>

        {/* Direction */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {isOwner && isRecip
            ? <><ArrowUpRight className="h-3.5 w-3.5 text-amber-400" /><span>Self-stream</span></>
            : isOwner
              ? <><ArrowUpRight className="h-3.5 w-3.5 text-primary" /><span>Sending to</span><span className="font-mono text-foreground">{shortAddr(stream.recipient)}</span></>
              : <><ArrowDownLeft className="h-3.5 w-3.5 text-emerald-400" /><span>Receiving from</span><span className="font-mono text-foreground">{shortAddr(stream.sender)}</span></>
          }
          {stream.cliffTime > 0 && stream.cliffTime > now && (
            <span className="ml-auto flex items-center gap-1 text-amber-400/80">
              <Clock className="h-3 w-3" />cliff {fmtDate(stream.cliffTime)}
            </span>
          )}
        </div>

        {/* Progress bar */}
        {!stream.cancelled && (
          <div>
            <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
              <span>{fmtDate(stream.startTime)}</span>
              <span className="font-mono font-semibold text-foreground">{pct}%</span>
              <span>{fmtDate(stream.endTime)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Total</p>
            <p className="text-xs font-mono font-bold">{total.toLocaleString()}</p>
            <p className="text-[9px] text-muted-foreground">{sym}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-2.5 text-center">
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Claimed</p>
            <p className="text-xs font-mono font-bold">{claimed.toLocaleString()}</p>
            <p className="text-[9px] text-muted-foreground">{sym}</p>
          </div>
          <div className={cn("rounded-lg border p-2.5 text-center", claimable > 0 ? "border-emerald-500/40 bg-emerald-500/10" : "border-border bg-muted/20")}>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Claimable</p>
            <p className={cn("text-xs font-mono font-bold", claimable > 0 ? "text-emerald-400" : "")}>
              {claimable > 0 ? claimable.toFixed(4) : "—"}
            </p>
            <p className="text-[9px] text-muted-foreground">{sym}</p>
          </div>
        </div>

        {/* Lock notice */}
        {isRecip && !stream.recipientCanClaimAnytime && isActive && claimable === 0 && (
          <p className="text-[10px] text-amber-400/80 flex items-center gap-1.5 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
            <Clock className="h-3 w-3 shrink-0" />
            Tokens unlock at stream completion · {fmtDate(stream.endTime)}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-0.5">
          {canClaimNow && (
            <Button
              size="sm"
              onClick={() => onClaim(stream.id)}
              disabled={activeClaim === stream.id}
              className="gap-1.5 font-black uppercase tracking-wider text-[10px] h-8"
            >
              {activeClaim === stream.id
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Zap className="h-3 w-3" />}
              Claim {claimable.toFixed(4)} {sym}
            </Button>
          )}
          {isRecip && !stream.recipientCanClaimAnytime && !isActive && claimable > 0 && (
            <Button
              size="sm"
              onClick={() => onClaim(stream.id)}
              disabled={activeClaim === stream.id}
              className="gap-1.5 font-black uppercase tracking-wider text-[10px] h-8"
            >
              {activeClaim === stream.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
              Claim {claimable.toFixed(4)} {sym}
            </Button>
          )}
          {isOwner && stream.cancelable && isActive && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(stream.id)}
              disabled={activeCancel === stream.id}
              className="gap-1.5 font-black uppercase tracking-wider text-[10px] h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {activeCancel === stream.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Cancel Stream
            </Button>
          )}
          <a
            href={`https://testnet.arcscan.app/address/${STREAM_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            title="View on ArcScan"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreateStreamModal
// ─────────────────────────────────────────────────────────────────────────────

function CreateStreamModal({
  onClose,
  userAddress,
  onCreated,
}: {
  onClose: () => void;
  userAddress: Address;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<"form" | "approve" | "create">("form");
  const [recipient, setRecipient] = useState<string>(userAddress);
  const [token, setToken] = useState(TOKEN_OPTIONS[0]);
  const [amount, setAmount] = useState("");
  const [durationDays, setDurationDays] = useState(30);
  const [freqSeconds, setFreqSeconds] = useState(86_400);
  const [streamTypeId, setStreamTypeId] = useState(0);
  const [hasCliff, setHasCliff] = useState(false);
  const [cliffDays, setCliffDays] = useState(7);
  const [cancelable, setCancelable] = useState(true);
  const [claimAnytime, setClaimAnytime] = useState(true);

  const isValidAddr = /^0x[0-9a-fA-F]{40}$/.test(recipient);
  const isValid = amount && Number(amount) > 0 && isValidAddr;

  const totalRaw = isValid ? parseUnits(amount, token.decimals) : 0n;
  const nowSec   = Math.floor(Date.now() / 1000);
  const startTime = BigInt(nowSec + 60) as unknown as bigint;
  const endTime   = BigInt(nowSec + durationDays * 86_400) as unknown as bigint;
  const cliffTime = hasCliff
    ? (BigInt(nowSec + cliffDays * 86_400) as unknown as bigint)
    : (BigInt(0) as unknown as bigint);

  // Approve
  const { writeContract: doApprove, data: approveTx, isPending: approving } = useWriteContract();
  const { isLoading: approveWaiting, isSuccess: approved } = useWaitForTransactionReceipt({ hash: approveTx });

  // Create
  const { writeContract: doCreate, data: createTx, isPending: creating } = useWriteContract();
  const { isLoading: createWaiting, isSuccess: created } = useWaitForTransactionReceipt({ hash: createTx });

  useEffect(() => { if (approved && step === "approve") setStep("create"); }, [approved, step]);
  useEffect(() => {
    if (created) {
      toast.success("Stream created onchain!");
      onCreated();
      onClose();
    }
  }, [created]);

  const handleApprove = () => {
    setStep("approve");
    doApprove({
      address: token.address,
      abi: erc20Abi,
      functionName: "approve",
      args: [STREAM_ADDRESS, totalRaw],
      chainId: arcTestnet.id,
    });
  };

  const handleCreate = () => {
    doCreate({
      address: STREAM_ADDRESS,
      abi: lunexStreamAbi,
      functionName: "createStream",
      args: [
        recipient as Address,
        token.address,
        totalRaw,
        startTime,
        endTime,
        cliffTime,
        BigInt(freqSeconds) as unknown as bigint,
        streamTypeId,
        cancelable,
        false,
        claimAnytime,
      ],
      chainId: arcTestnet.id,
    });
  };

  const isBusy = approving || approveWaiting || creating || createWaiting;
  const perRelease = amount && Number(amount) > 0 && durationDays > 0
    ? (Number(amount) / (durationDays * 86_400 / freqSeconds)).toFixed(4)
    : "—";

  const stepNum = step === "form" ? 1 : step === "approve" ? 2 : 3;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-lg border border-border bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold">Create LunexStream</h2>
            <p className="text-[11px] text-muted-foreground">Onchain token streaming · approve → create</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mr-6">
            {[1,2,3].map((s) => (
              <div key={s} className={cn("h-1.5 w-6 rounded-full transition-colors", stepNum >= s ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none ml-2">×</button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Token selector */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Token to stream</p>
            <div className="flex gap-2">
              {TOKEN_OPTIONS.map((t) => (
                <button
                  key={t.symbol}
                  onClick={() => setToken(t)}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg border text-xs font-bold transition-colors",
                    token.symbol === t.symbol
                      ? "text-white border-transparent"
                      : "border-border text-muted-foreground hover:border-primary/40 bg-transparent",
                  )}
                  style={token.symbol === t.symbol ? { background: t.color, borderColor: t.color } : {}}
                >
                  {t.symbol}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total amount</p>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                className="w-full px-4 py-3 pr-16 text-lg font-mono border border-border bg-background rounded-xl outline-none focus:border-primary transition-colors"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">{token.symbol}</span>
            </div>
          </div>

          {/* Recipient */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recipient</p>
              <button
                onClick={() => setRecipient(userAddress)}
                className="text-[10px] text-primary hover:underline"
              >
                Use my wallet
              </button>
            </div>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="0x…"
              className={cn(
                "w-full px-4 py-2.5 text-xs font-mono border rounded-xl outline-none transition-colors bg-background",
                !isValidAddr && recipient.length > 0 ? "border-red-500/50 focus:border-red-500" : "border-border focus:border-primary",
              )}
            />
            {recipient.toLowerCase() === userAddress.toLowerCase() && (
              <p className="text-[10px] text-muted-foreground">Self-stream — you are both sender and recipient</p>
            )}
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Duration</p>
            <div className="flex gap-2">
              {DURATION_PRESETS.map((d) => (
                <button
                  key={d.days}
                  onClick={() => setDurationDays(d.days)}
                  className={cn(
                    "flex-1 py-2 rounded-lg border text-[11px] font-bold transition-colors",
                    durationDays === d.days
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Release frequency */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Release frequency</p>
            <div className="grid grid-cols-4 gap-2">
              {FREQ_PRESETS.map((f) => (
                <button
                  key={f.seconds}
                  onClick={() => setFreqSeconds(f.seconds)}
                  className={cn(
                    "py-2 rounded-lg border text-[11px] font-bold transition-colors",
                    freqSeconds === f.seconds
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:border-primary/40",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {amount && Number(amount) > 0 && (
              <p className="text-[10px] text-muted-foreground">
                ~{perRelease} {token.symbol} per release
              </p>
            )}
          </div>

          {/* Stream type */}
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Stream type</p>
            <div className="grid grid-cols-2 gap-2">
              {STREAM_TYPES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setStreamTypeId(t.id)}
                  className={cn(
                    "p-3 rounded-xl border text-left transition-colors",
                    streamTypeId === t.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <p className="text-sm mb-0.5">{t.icon} <span className="font-bold text-xs">{t.label}</span></p>
                  <p className="text-[10px] text-muted-foreground leading-snug">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Cliff (optional) */}
          {(streamTypeId === 2) && (
            <div className="space-y-3 border border-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold">Cliff period</p>
                  <p className="text-[10px] text-muted-foreground">Nothing vests until the cliff date</p>
                </div>
                <button
                  onClick={() => setHasCliff(!hasCliff)}
                  className={cn("relative h-5 w-9 rounded-full border transition-colors", hasCliff ? "bg-primary border-primary" : "bg-muted border-border")}
                >
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", hasCliff ? "translate-x-4" : "translate-x-0")} />
                </button>
              </div>
              {hasCliff && (
                <div className="flex gap-2">
                  {[7, 14, 30, 90].map((d) => (
                    <button
                      key={d}
                      onClick={() => setCliffDays(d)}
                      className={cn("flex-1 py-1.5 rounded-lg border text-[11px] font-bold transition-colors", cliffDays === d ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground")}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Options */}
          <div className="space-y-2 border border-border rounded-xl overflow-hidden divide-y divide-border">
            {/* Cancelable */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold">Cancelable by sender</p>
                <p className="text-[10px] text-muted-foreground">Unstreamed tokens returned to sender on cancel</p>
              </div>
              <button
                onClick={() => setCancelable(!cancelable)}
                className={cn("relative h-5 w-9 rounded-full border shrink-0 transition-colors", cancelable ? "bg-primary border-primary" : "bg-muted border-border")}
              >
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", cancelable ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
            {/* Recipient can claim anytime */}
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-xs font-semibold">Recipient can claim anytime</p>
                <p className="text-[10px] text-muted-foreground">If off, tokens locked until stream ends</p>
              </div>
              <button
                onClick={() => setClaimAnytime(!claimAnytime)}
                className={cn("relative h-5 w-9 rounded-full border shrink-0 transition-colors", claimAnytime ? "bg-primary border-primary" : "bg-muted border-border")}
              >
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", claimAnytime ? "translate-x-4" : "translate-x-0")} />
              </button>
            </div>
          </div>

          {/* Summary */}
          {isValid && (
            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2 text-xs">
              <p className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Summary</p>
              {[
                ["Token locked", `${Number(amount).toLocaleString()} ${token.symbol}`],
                ["Duration", `${durationDays} days`],
                ["Release", `${perRelease} ${token.symbol} / ${FREQ_PRESETS.find(f=>f.seconds===freqSeconds)?.label ?? ""}`],
                ["Type", STREAM_TYPES[streamTypeId].label],
                ["Cancelable", cancelable ? "Yes" : "No"],
                ["Claim anytime", claimAnytime ? "Yes" : "Locked until end"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono font-semibold">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-6 pt-4 border-t border-border shrink-0 space-y-3">
          {step === "form" && (
            <Button className="w-full font-black uppercase tracking-widest text-sm h-11" onClick={handleApprove} disabled={!isValid || isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Step 1: Approve {token.symbol}
            </Button>
          )}
          {step === "approve" && !approved && (
            <Button className="w-full font-black uppercase tracking-widest text-sm h-11" disabled>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Approving…
            </Button>
          )}
          {step === "create" && (
            <Button className="w-full font-black uppercase tracking-widest text-sm h-11" onClick={handleCreate} disabled={isBusy}>
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
              Step 2: Create Stream
            </Button>
          )}
          {(approveTx || createTx) && (
            <a
              href={getExplorerTxUrl((createTx ?? approveTx)!)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              View on ArcScan
            </a>
          )}
          <Button variant="outline" className="w-full" onClick={onClose} disabled={isBusy}>
            {isBusy ? "Processing…" : "Cancel"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function RecurringTasks() {
  const { address, isConnected, openConnect } = useWallet();
  const [showModal, setShowModal] = useState(false);
  const [tab, setTab] = useState<TabId>("all");
  const [claimingId, setClaimingId] = useState<bigint | null>(null);
  const [cancellingId, setCancellingId] = useState<bigint | null>(null);

  // ── Read stream count ──────────────────────────────────────────────────────
  const { data: nextIdRaw, refetch: refetchCount } = useReadContract({
    address: STREAM_ADDRESS,
    abi: lunexStreamAbi,
    functionName: "nextStreamId",
    chainId: arcTestnet.id,
    query: { refetchInterval: 20_000 },
  });
  const totalStreams = nextIdRaw ? Number(nextIdRaw as bigint) : 0;

  // ── Fetch last 100 streams ─────────────────────────────────────────────────
  const streamIds = Array.from(
    { length: Math.min(totalStreams, 100) },
    (_, i) => BigInt(totalStreams - i),
  );

  const { data: streamResults, refetch: refetchStreams } = useReadContracts({
    contracts: streamIds.map((id) => ({
      address: STREAM_ADDRESS,
      abi: lunexStreamAbi,
      functionName: "streams" as const,
      args: [id] as [bigint],
      chainId: arcTestnet.id,
    })),
    query: { enabled: streamIds.length > 0, refetchInterval: 20_000 },
  });

  // ── Parse streams involving current wallet ────────────────────────────────
  const myStreams: StreamData[] = [];
  if (streamResults && address) {
    streamResults.forEach((r, i) => {
      if (r.status !== "success" || !r.result) return;
      const d = r.result as readonly unknown[];
      const [
        sender, recipient, token, totalAmount, claimedAmount,
        startTime, endTime, cliffTime, releaseFrequency,
        streamType, cancelable, transferable, recipientCanClaimAnytime, cancelled,
      ] = d as [Address, Address, Address, bigint, bigint, bigint, bigint, bigint, bigint, number, boolean, boolean, boolean, boolean];
      if (
        sender.toLowerCase() !== address.toLowerCase() &&
        recipient.toLowerCase() !== address.toLowerCase()
      ) return;
      myStreams.push({
        id: streamIds[i],
        sender, recipient, token, totalAmount, claimedAmount,
        startTime: Number(startTime),
        endTime: Number(endTime),
        cliffTime: Number(cliffTime),
        releaseFrequency: Number(releaseFrequency),
        streamType, cancelable, transferable, recipientCanClaimAnytime, cancelled,
      });
    });
  }

  const incomingStreams = myStreams.filter(
    (s) => s.recipient.toLowerCase() === address?.toLowerCase() && s.sender.toLowerCase() !== address?.toLowerCase(),
  );
  const outgoingStreams = myStreams.filter(
    (s) => s.sender.toLowerCase() === address?.toLowerCase(),
  );
  const visibleStreams =
    tab === "incoming" ? incomingStreams :
    tab === "outgoing" ? outgoingStreams :
    myStreams;

  // ── Claim ─────────────────────────────────────────────────────────────────
  const { writeContract: writeClaim, data: claimTx, isPending: claimPending } = useWriteContract();
  const { isSuccess: claimSuccess } = useWaitForTransactionReceipt({ hash: claimTx });
  useEffect(() => {
    if (claimSuccess) { toast.success("Tokens claimed!"); setClaimingId(null); refetchStreams(); }
  }, [claimSuccess]);

  // ── Cancel ────────────────────────────────────────────────────────────────
  const { writeContract: writeCancel, data: cancelTx, isPending: cancelPending } = useWriteContract();
  const { isSuccess: cancelSuccess } = useWaitForTransactionReceipt({ hash: cancelTx });
  useEffect(() => {
    if (cancelSuccess) { toast.success("Stream cancelled, tokens refunded."); setCancellingId(null); refetchStreams(); }
  }, [cancelSuccess]);

  const handleClaim = useCallback((id: bigint) => {
    setClaimingId(id);
    writeClaim({ address: STREAM_ADDRESS, abi: lunexStreamAbi, functionName: "claim", args: [id], chainId: arcTestnet.id });
  }, [writeClaim]);

  const handleCancel = useCallback((id: bigint) => {
    setCancellingId(id);
    writeCancel({ address: STREAM_ADDRESS, abi: lunexStreamAbi, functionName: "cancel", args: [id], chainId: arcTestnet.id });
  }, [writeCancel]);

  const refetch = useCallback(() => { refetchCount(); refetchStreams(); }, [refetchCount, refetchStreams]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activeCount = myStreams.filter((s) => !s.cancelled && Date.now() / 1000 < s.endTime).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="container max-w-3xl mx-auto px-4 py-10">

      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <CalendarClock className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-black uppercase tracking-tight">Recurring · LunexStream</h1>
            </div>
            <p className="text-[11px] text-muted-foreground font-mono">
              Contract{" "}
              <a
                href={`https://testnet.arcscan.app/address/${STREAM_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                {shortAddr(STREAM_ADDRESS)} <ExternalLink className="h-2.5 w-2.5" />
              </a>
              {" · "}Arc Testnet
            </p>
          </div>
          <Button
            onClick={() => { if (!isConnected) { openConnect(); return; } setShowModal(true); }}
            className="gap-2 font-black uppercase tracking-widest text-[11px] h-9"
          >
            <Plus className="h-4 w-4" /> New Stream
          </Button>
        </div>

        {/* Explainer */}
        <div className="mt-4 rounded-xl border border-border bg-card p-4 flex gap-3">
          <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <span className="text-foreground font-semibold">LunexStream</span> is an onchain token streaming contract.
            When you create a stream, the full token amount is locked in the contract and released to the recipient over time
            — fully onchain, no trusted third party. Streams can be linear, cliff-based, vesting, or unlock-at-end.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Total Onchain",   value: totalStreams,          icon: <LayoutList className="h-4 w-4 text-muted-foreground" /> },
          { label: "My Active",       value: activeCount,           icon: <CalendarClock className="h-4 w-4 text-emerald-400" /> },
          { label: "Incoming",        value: incomingStreams.length, icon: <ArrowDownLeft className="h-4 w-4 text-primary" /> },
        ].map(({ label, value, icon }) => (
          <div key={label} className="border border-border bg-card rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">{icon}
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
            </div>
            <p className="text-3xl font-black font-mono">{value}</p>
          </div>
        ))}
      </div>

      {!isConnected ? (
        <div className="border border-border bg-card rounded-xl p-14 text-center space-y-3">
          <CalendarClock className="h-9 w-9 text-muted-foreground mx-auto" />
          <p className="font-bold">Connect your wallet</p>
          <p className="text-xs text-muted-foreground">See and manage your onchain token streams</p>
          <Button onClick={openConnect} size="sm">Connect Wallet</Button>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 mb-6 border border-border bg-card rounded-xl p-1">
            {(["all", "incoming", "outgoing"] as TabId[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors",
                  tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "all" && `All (${myStreams.length})`}
                {t === "incoming" && `Incoming (${incomingStreams.length})`}
                {t === "outgoing" && `Outgoing (${outgoingStreams.length})`}
              </button>
            ))}
          </div>

          {/* Streams */}
          {!streamResults && streamIds.length > 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : visibleStreams.length === 0 ? (
            <div className="border border-border bg-card rounded-xl p-14 text-center space-y-3">
              <Clock className="h-9 w-9 text-muted-foreground mx-auto" />
              <p className="font-bold">No streams yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Create a recurring stream to send tokens to yourself or others on a fixed schedule — fully onchain via LunexStream.
              </p>
              <Button onClick={() => setShowModal(true)} size="sm" className="gap-2 font-black uppercase tracking-widest text-[11px]">
                <Plus className="h-3.5 w-3.5" /> Create First Stream
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleStreams.map((s) => (
                <StreamCard
                  key={s.id.toString()}
                  stream={s}
                  userAddress={address!}
                  onClaim={handleClaim}
                  onCancel={handleCancel}
                  activeClaim={claimingId}
                  activeCancel={cancellingId}
                />
              ))}
            </div>
          )}

          {/* Info footer */}
          <div className="mt-8 rounded-xl border border-border bg-muted/10 p-4 text-[11px] text-muted-foreground space-y-1">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400" /> Stream types explained
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 pt-1">
              {STREAM_TYPES.map((t) => (
                <p key={t.id}><span className="font-semibold text-foreground">{t.icon} {t.label}:</span> {t.desc}</p>
              ))}
            </div>
          </div>
        </>
      )}

      {showModal && address && (
        <CreateStreamModal
          onClose={() => setShowModal(false)}
          userAddress={address}
          onCreated={refetch}
        />
      )}
    </div>
  );
}
