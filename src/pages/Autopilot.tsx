import { useEffect, useState, useRef, useCallback } from "react";
import {
  Bot, Zap, TrendingUp, TrendingDown, Minus,
  RefreshCw, Trash2, CheckCircle, Clock,
  Send, User, LayoutDashboard, MessageSquare,
  Sparkles, ArrowLeftRight, Droplets, Sprout,
  ArrowDownToLine, Link2, AlertCircle, Loader2, ExternalLink, Wallet,
  ShieldCheck, ShieldOff, Plus, X,
} from "lucide-react";
import { formatUnits } from "viem";
import { useWallet } from "@/context/WalletProvider";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { useAutopilotAgent, type AgentLogEntry, type AgentDecision } from "@/hooks/useAutopilotAgent";
import { useAgentAuthorization } from "@/hooks/useAgentAuthorization";
import { useFullAgent, type ActionResult } from "@/hooks/useFullAgent";
import { resolveAmount } from "@/lib/agentParser";
import { callAutopilotLLM } from "@/lib/autopilotLLM";
import { BRIDGE_CHAINS } from "@/features/bridge/config/bridgeConfig";
import { AGENT_WALLET_ADDRESS } from "@/config/agentExecutor";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TxCardData {
  action: string;
  detail: string;
  txHash: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: number;
  txHash?: string;
  isStreaming?: boolean;
  status?: "ok" | "error" | "step";
  txCard?: TxCardData;
}

interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

// ── Chat session persistence ──────────────────────────────────────────────────

const STORAGE_KEY = "lunex_ai_chats";

function loadSessions(): ChatSession[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}

function saveSessions(sessions: ChatSession[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, 50))); }
  catch {}
}

function makeWelcome(): ChatMessage {
  return {
    id: "welcome",
    role: "agent",
    content: "I'm **Lunex AI**. Swap, bridge, send, deposit to vaults, manage liquidity — just tell me what you need.",
    timestamp: Date.now(),
  };
}

function chatTitle(msgs: ChatMessage[]): string {
  const first = msgs.find((m) => m.role === "user");
  if (!first) return "New chat";
  return first.content.length > 42 ? first.content.slice(0, 42) + "…" : first.content;
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60e3) return "just now";
  if (d < 3600e3) return `${Math.floor(d / 60e3)}m ago`;
  if (d < 86400e3) return `${Math.floor(d / 3600e3)}h ago`;
  if (d < 604800e3) return `${Math.floor(d / 86400e3)}d ago`;
  return new Date(ts).toLocaleDateString();
}

// ── Dashboard helpers ─────────────────────────────────────────────────────────

function decisionIcon(d: AgentDecision) {
  if (d === "rebalance_to_vault") return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (d === "rebalance_to_pool") return <TrendingDown className="h-3.5 w-3.5 text-blue-400" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}
function decisionLabel(d: AgentDecision) {
  if (d === "rebalance_to_vault") return "→ VAULT";
  if (d === "rebalance_to_pool") return "→ POOL";
  return "HOLD";
}
function decisionColor(d: AgentDecision) {
  if (d === "rebalance_to_vault") return "text-emerald-400";
  if (d === "rebalance_to_pool") return "text-blue-400";
  return "text-muted-foreground";
}
function formatUptime(startedAt: number | null) {
  if (!startedAt) return "-";
  const s = Math.floor((Date.now() - startedAt) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function LogEntry({ entry }: { entry: AgentLogEntry }) {
  const spread = Math.abs(entry.vaultApy - entry.poolApr);
  return (
    <div className="flex gap-3 py-3 border-b border-border/40 last:border-0">
      <div className="mt-0.5 shrink-0">{decisionIcon(entry.decision)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("text-[10px] font-black tracking-widest uppercase", decisionColor(entry.decision))}>{decisionLabel(entry.decision)}</span>
          {entry.executed
            ? <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-semibold"><CheckCircle className="h-2.5 w-2.5" />TX SENT</span>
            : entry.decision !== "hold"
              ? <span className="flex items-center gap-1 text-[9px] text-amber-400 font-semibold"><Clock className="h-2.5 w-2.5" />PENDING</span>
              : <span className="text-[9px] text-muted-foreground/60 font-semibold">HOLD</span>}
          <span className="ml-auto text-[9px] text-muted-foreground font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
        </div>
        <p className="text-[11px] text-foreground/80 leading-relaxed">{entry.reasoning}</p>
        <div className="flex items-center gap-3 mt-1.5 text-[9px] font-mono">
          <span className="text-blue-400">Pool {entry.poolApr.toFixed(2)}%</span>
          <span className="text-emerald-400">Vault {entry.vaultApy.toFixed(2)}%</span>
          <span className="text-muted-foreground/60">Δ {spread.toFixed(2)}%</span>
          {entry.txHash && entry.txHash !== "0x" && (
            <a href={`https://testnet.arcscan.app/tx/${entry.txHash}`} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline ml-auto">view tx ↗</a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chat UI primitives ────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm bg-muted/30 border border-border/50 px-4 py-3 mt-0.5">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}

function renderMd(content: string) {
  return content.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part.split("\n").map((line, j, arr) => <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>);
  });
}

const TX_CARD_ICONS: Record<string, React.ReactNode> = {
  swap: <ArrowLeftRight className="h-3.5 w-3.5" />,
  add_liquidity: <Droplets className="h-3.5 w-3.5" />,
  remove_liquidity: <ArrowDownToLine className="h-3.5 w-3.5" />,
  vault_deposit: <Sprout className="h-3.5 w-3.5" />,
  vault_withdraw: <Sprout className="h-3.5 w-3.5" />,
  send: <Send className="h-3.5 w-3.5" />,
  bridge: <Link2 className="h-3.5 w-3.5" />,
};
const TX_CARD_LABELS: Record<string, string> = {
  swap: "Swap", add_liquidity: "Add Liquidity", remove_liquidity: "Remove Liquidity",
  vault_deposit: "Vault Deposit", vault_withdraw: "Vault Withdraw", send: "Send", bridge: "Bridge",
};

function TxCard({ data }: { data: TxCardData }) {
  return (
    <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-emerald-400">
        <CheckCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
          {TX_CARD_ICONS[data.action] ?? null}
          {TX_CARD_LABELS[data.action] ?? data.action} Confirmed
        </span>
      </div>
      <p className="text-xs text-foreground leading-relaxed">{data.detail}</p>
      {data.txHash && data.txHash !== "0x" ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
            <span className="shrink-0 text-muted-foreground/60">Tx:</span>
            <span>{data.txHash.slice(0, 14)}…{data.txHash.slice(-8)}</span>
          </div>
          <a
            href={`https://testnet.arcscan.app/tx/${data.txHash}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 underline-offset-2 hover:underline w-fit"
          >
            <ExternalLink className="h-3 w-3" />
            View on ArcScan ↗
          </a>
        </div>
      ) : data.txHash === "0x" ? (
        <p className="text-[11px] text-muted-foreground">Submitted via email wallet — check Circle for confirmation.</p>
      ) : null}
    </div>
  );
}

function AgentMessage({ msg }: { msg: ChatMessage }) {
  const isStep = msg.status === "step";
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border mt-0.5",
        msg.status === "error" ? "bg-destructive/10 border-destructive/30" : "bg-primary/10 border-primary/20")}>
        {msg.status === "error"
          ? <AlertCircle className="h-4 w-4 text-destructive" />
          : isStep
            ? <Loader2 className="h-4 w-4 text-primary animate-spin" />
            : <Bot className="h-4 w-4 text-primary" />}
      </div>
      <div className="max-w-[82%]">
        <div className={cn("rounded-2xl rounded-tl-sm border px-4 py-3 text-sm leading-relaxed",
          msg.status === "error" ? "bg-destructive/5 border-destructive/20 text-destructive" : "bg-muted/30 border-border/50 text-foreground")}>
          {renderMd(msg.content)}
          {msg.isStreaming && <span className="inline-block w-0.5 h-4 bg-primary ml-0.5 animate-pulse align-text-bottom" />}
          {msg.txCard && <TxCard data={msg.txCard} />}
        </div>
        <p className="mt-1 ml-1 text-[10px] text-muted-foreground">{new Date(msg.timestamp).toLocaleTimeString()}</p>
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex items-start justify-end gap-3 px-4 py-3">
      <div className="max-w-[75%]">
        <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">{msg.content}</div>
        <p className="mt-1 mr-1 text-right text-[10px] text-muted-foreground">{new Date(msg.timestamp).toLocaleTimeString()}</p>
      </div>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted border border-border mt-0.5">
        <User className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

// ── History sidebar ───────────────────────────────────────────────────────────

function HistorySidebar({
  sessions,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onClose,
}: {
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Chat History</span>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors lg:hidden"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* New chat */}
      <div className="px-2.5 pt-2.5 pb-1 shrink-0">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 rounded-lg border border-dashed border-border bg-transparent px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />New chat
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto py-1 px-1.5">
        {sessions.length === 0 ? (
          <p className="text-[10px] text-muted-foreground/60 text-center py-8 px-3 leading-relaxed">
            No saved chats yet.<br />Start a conversation to save it here.
          </p>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={cn(
                "group relative flex flex-col gap-0.5 cursor-pointer px-3 py-2.5 rounded-lg mb-0.5 transition-colors",
                s.id === activeId
                  ? "bg-primary/10 border border-primary/20"
                  : "hover:bg-muted/40 border border-transparent",
              )}
            >
              <span className={cn(
                "text-[11px] font-medium leading-snug pr-5 line-clamp-2",
                s.id === activeId ? "text-foreground" : "text-muted-foreground",
              )}>
                {s.title}
              </span>
              <span className="text-[9px] text-muted-foreground/50 font-mono">{relTime(s.updatedAt)}</span>
              <button
                onClick={(e) => onDelete(s.id, e)}
                className="absolute right-2 top-2.5 hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Delete chat"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Quick-start chips ─────────────────────────────────────────────────────────

const CHIPS = [
  { label: "What's my portfolio?",       icon: <LayoutDashboard className="h-3 w-3" /> },
  { label: "Swap 10 USDC to EURC",       icon: <ArrowLeftRight className="h-3 w-3" /> },
  { label: "Swap 10 USDC to USDT",       icon: <ArrowLeftRight className="h-3 w-3" /> },
  { label: "Bridge 5 USDC to Base",      icon: <Link2 className="h-3 w-3" /> },
  { label: "Deposit 10 USDC to vault",   icon: <Sprout className="h-3 w-3" /> },
  { label: "Deposit 10 USDT to vault",   icon: <Sprout className="h-3 w-3" /> },
  { label: "Add 10 USDC to pool",        icon: <Droplets className="h-3 w-3" /> },
  { label: "Remove all liquidity",       icon: <ArrowDownToLine className="h-3 w-3" /> },
];

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "chat" | "dashboard";

export default function Autopilot() {
  const { isConnected, openConnect } = useWallet();
  const agent = useAutopilotAgent();
  const auth  = useAgentAuthorization();
  const full  = useFullAgent();

  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [, setTick] = useState(0);

  // ── Chat session state ───────────────────────────────────────────────────────
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const sessionsRef = useRef<ChatSession[]>(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);

  const [activeId, setActiveId] = useState<string>(() => {
    const s = loadSessions();
    return s.length > 0 ? s[0].id : `chat_${Date.now()}`;
  });

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const s = loadSessions();
    if (s.length > 0 && s[0].messages.length > 0) return s[0].messages;
    return [makeWelcome()];
  });

  const [showHistory, setShowHistory] = useState(false);

  // Auto-save messages → sessions whenever messages change
  useEffect(() => {
    const toSave = messages.map((m) => ({ ...m, isStreaming: false }));
    setSessions((prev) => {
      const existing = prev.find((s) => s.id === activeId);
      const updated: ChatSession = {
        id: activeId,
        title: chatTitle(messages),
        createdAt: existing?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        messages: toSave,
      };
      const next = [updated, ...prev.filter((s) => s.id !== activeId)].slice(0, 50);
      saveSessions(next);
      return next;
    });
  }, [messages, activeId]);

  // ── Session handlers ─────────────────────────────────────────────────────────
  const resetStreamState = useCallback(() => {
    setStreamId(null);
    setStreamTarget("");
    setStreamIndex(0);
    setIsTyping(false);
    isBusyRef.current = false;
  }, []);

  const newChat = useCallback(() => {
    resetStreamState();
    const id = `chat_${Date.now()}`;
    setActiveId(id);
    setMessages([makeWelcome()]);
    setShowHistory(false);
  }, [resetStreamState]);

  const selectChat = useCallback((id: string) => {
    if (id === activeId) { setShowHistory(false); return; }
    resetStreamState();
    const session = sessionsRef.current.find((s) => s.id === id);
    setActiveId(id);
    setMessages(session?.messages?.length ? session.messages : [makeWelcome()]);
    setShowHistory(false);
  }, [activeId, resetStreamState]);

  const deleteChat = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSessions(next);
      return next;
    });
    if (id === activeId) {
      const remaining = sessionsRef.current.filter((s) => s.id !== id);
      if (remaining.length > 0) {
        selectChat(remaining[0].id);
      } else {
        newChat();
      }
    }
  }, [activeId, selectChat, newChat]);

  // ── Chat state ───────────────────────────────────────────────────────────────
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Streaming state
  const [streamTarget, setStreamTarget] = useState("");
  const [streamIndex, setStreamIndex] = useState(0);
  const [streamId, setStreamId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const isBusyRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Uptime ticker
  useEffect(() => {
    if (!agent.config.active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [agent.config.active]);

  // Auto-scroll
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isTyping]);

  // Streaming engine - 6ms per char
  useEffect(() => {
    if (!streamTarget || !streamId || streamIndex >= streamTarget.length) {
      if (streamId && streamTarget.length > 0 && streamIndex >= streamTarget.length) {
        setMessages((p) => p.map((m) => m.id === streamId ? { ...m, isStreaming: false } : m));
        setStreamId(null); setStreamTarget(""); setStreamIndex(0);
      }
      return;
    }
    const t = setTimeout(() => {
      setMessages((p) => p.map((m) => m.id === streamId ? { ...m, content: streamTarget.slice(0, streamIndex + 1) } : m));
      setStreamIndex((i) => i + 1);
    }, 6);
    return () => clearTimeout(t);
  }, [streamTarget, streamIndex, streamId]);

  const startStream = useCallback((text: string, extra?: Partial<ChatMessage>): string => {
    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setMessages((p) => [...p, { id, role: "agent", content: "", timestamp: Date.now(), isStreaming: true, ...extra }]);
    setStreamId(id); setStreamTarget(text); setStreamIndex(0);
    return id;
  }, []);

  const addMessage = useCallback((content: string, extra?: Partial<ChatMessage>) => {
    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setMessages((p) => [...p, { id, role: "agent", content, timestamp: Date.now(), ...extra }]);
  }, []);

  const waitForStream = useCallback((text: string) =>
    new Promise<void>((resolve) => {
      const duration = text.length * 6 + 300;
      setTimeout(resolve, duration);
    }), []);

  // ── Action executor ──────────────────────────────────────────────────────────

  const executeAction = useCallback(async (action: string, params: Record<string, unknown>): Promise<ActionResult | null> => {
    if (!isConnected) { openConnect(); return null; }
    if (action === "respond") return null;

    const ctx = full.getContext();
    let result: ActionResult | null = null;

    const stepLabels: Record<string, string> = {
      swap: `Approving **${String(params.fromToken ?? "token")}** and confirming swap...`,
      add_liquidity: "Approving tokens and adding liquidity...",
      remove_liquidity: "Approving LP tokens and removing liquidity...",
      vault_deposit: `Approving **${String(params.token ?? "token")}** and depositing to vault...`,
      vault_withdraw: `Redeeming shares from vault...`,
      send: `Sending **${String(params.token ?? "token")}** to recipient...`,
      bridge: `Approving **${String(params.token ?? "USDC")}** and initiating bridge ${String(params.fromChain ?? "arc").toUpperCase()} → ${String(params.toChain ?? "base").toUpperCase()}...`,
    };
    if (stepLabels[action]) addMessage(stepLabels[action], { status: "step" });

    try {
      switch (action) {
        case "swap": {
          const from = (params.fromToken as "USDC" | "EURC" | "USDT") ?? "USDC";
          const to   = (params.toToken   as "USDC" | "EURC" | "USDT") ?? (from === "USDC" ? "EURC" : "USDC");
          const balRaw = from === "USDC" ? ctx.usdcBalanceRaw : from === "EURC" ? ctx.eurcBalanceRaw : ctx.usdtBalanceRaw;
          const raw = resolveAmount(params.amount as string, balRaw);
          result = await full.performSwap(from, to, formatUnits(raw, 6));
          break;
        }
        case "add_liquidity": {
          const poolKey = String(params.pool ?? "USDC/EURC");
          result = await full.addLiquidity(poolKey, {
            USDC: params.usdcAmount ? String(params.usdcAmount) : undefined,
            EURC: params.eurcAmount ? String(params.eurcAmount) : undefined,
            USDT: params.usdtAmount ? String(params.usdtAmount) : undefined,
          });
          break;
        }
        case "remove_liquidity": {
          const poolKey = String(params.pool ?? "USDC/EURC");
          result = await full.removeLiquidity(
            poolKey,
            String(params.mode ?? "both"),
            Number(params.percent ?? 100),
          );
          break;
        }
        case "vault_deposit": {
          const token  = (params.token as "USDC" | "EURC" | "USDT") ?? "USDC";
          const balRaw = token === "USDC" ? ctx.usdcBalanceRaw : token === "EURC" ? ctx.eurcBalanceRaw : ctx.usdtBalanceRaw;
          const raw    = resolveAmount(params.amount as string, balRaw);
          result = await full.vaultDeposit(token, raw);
          break;
        }
        case "vault_withdraw": {
          const token  = (params.token as "USDC" | "EURC" | "USDT") ?? "USDC";
          const shares = token === "USDC" ? ctx.vaultUsdcSharesRaw : token === "EURC" ? ctx.vaultEurcSharesRaw : ctx.vaultUsdtSharesRaw;
          result = await full.vaultWithdraw(token, shares);
          break;
        }
        case "send": {
          const token  = (params.token as "USDC" | "EURC" | "USDT") ?? "USDC";
          const balRaw = token === "USDC" ? ctx.usdcBalanceRaw : token === "EURC" ? ctx.eurcBalanceRaw : ctx.usdtBalanceRaw;
          const raw    = resolveAmount(params.amount as string, balRaw);
          result = await full.send(token, String(params.to ?? ""), formatUnits(raw, 6));
          break;
        }
        case "bridge": {
          result = await full.startBridge(
            String(params.amount ?? "0"),
            (params.fromChain as string) ?? "arc",
            (params.toChain   as string) ?? "ethereum",
            (params.token as "USDC" | "EURC") ?? "USDC",
          );
          break;
        }
        case "evaluate": {
          await agent.runOnce();
          const spread = ctx.vaultUsdcApy - ctx.poolApr;
          addMessage(
            Math.abs(spread) > agent.config.thresholdPct
              ? `Evaluation complete\n\nSpread **${Math.abs(spread).toFixed(2)}%** exceeds threshold **${agent.config.thresholdPct}%**. The **${spread > 0 ? "vault" : "pool"}** is outperforming. Say **"execute rebalance"** to act.`
              : `Evaluation complete. Spread **${Math.abs(spread).toFixed(2)}%** is below the **${agent.config.thresholdPct}%** threshold — current allocation is near-optimal.`
          );
          return;
        }
        case "start_agent":
          agent.updateConfig({ active: true });
          addMessage("Autonomous mode **enabled**. I'll evaluate the pool/vault spread every 30 seconds.");
          return;
        case "stop_agent":
          agent.updateConfig({ active: false });
          addMessage("Autonomous mode **stopped**.");
          return;
        case "set_threshold": {
          const pct = Math.min(5, Math.max(0.5, Number(params.percent ?? params.pct ?? 1.5)));
          agent.updateConfig({ thresholdPct: pct });
          addMessage(`Rebalance threshold set to **${pct.toFixed(1)}%**. I'll only move funds when the spread exceeds this.`);
          return;
        }
        default:
          return;
      }
    } catch (e: unknown) {
      addMessage(`Something went wrong executing the action: ${e instanceof Error ? e.message.slice(0, 120) : "Unknown error"}`, { status: "error" });
      return;
    }

    if (result) {
      if (result.ok) {
        addMessage(result.detail ?? "Action completed.", {
          status: "ok",
          txCard: {
            action,
            detail: result.detail ?? "Transaction confirmed.",
            txHash: result.txHash ?? "",
          },
        });
      } else {
        addMessage(`Transaction failed: ${result.error}`, { status: "error" });
      }
    }
    return result;
  }, [isConnected, openConnect, full, agent, addMessage]);

  // ── Main send handler ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isTyping || isBusyRef.current) return;
    isBusyRef.current = true;

    const originalText = text.trim();
    setMessages((p) => [...p, { id: `user_${Date.now()}`, role: "user", content: originalText, timestamp: Date.now() }]);
    setInput("");

    const sessionHistory: { role: string; content: string }[] = [];

    const getCtx = () => {
      const rawCtx = full.getContext();
      return {
        usdcBalance:        rawCtx.usdcBalance,
        eurcBalance:        rawCtx.eurcBalance,
        usdtBalance:        rawCtx.usdtBalance,
        lpBalance:          rawCtx.lpBalance,
        vaultUsdcDeposited: rawCtx.vaultUsdcDeposited,
        vaultEurcDeposited: rawCtx.vaultEurcDeposited,
        vaultUsdtDeposited: rawCtx.vaultUsdtDeposited,
        poolApr:            rawCtx.poolApr,
        vaultUsdcApy:       rawCtx.vaultUsdcApy,
        vaultEurcApy:       rawCtx.vaultEurcApy,
        vaultUsdtApy:       rawCtx.vaultUsdtApy,
        totalLiquidity:     rawCtx.totalLiquidity,
        bridgeStatus:       rawCtx.bridgeStatus,
        agentActive:        agent.config.active,
      };
    };

    for (let step = 0; step < 5; step++) {
      setIsTyping(true);

      const baseHistory = messagesRef.current
        .filter((m) => !m.isStreaming && m.content.trim())
        .slice(-6)
        .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }));

      const history = [...baseHistory, ...sessionHistory].slice(-12);

      const currentMsg = step === 0
        ? originalText
        : `Completed step ${step}. User's original request: "${originalText}". Execute the next required step now, or call respond if all steps are done.`;

      let llmResponse: { text: string; action?: string | null; params?: Record<string, unknown> };
      try {
        llmResponse = await callAutopilotLLM(currentMsg, getCtx(), history);
      } catch (e: unknown) {
        setIsTyping(false);
        const msg = e instanceof Error ? e.message : String(e);
        addMessage(
          msg.includes("OPENROUTER_API_KEY")
            ? `**API key not configured.**\n\nAdd \`OPENROUTER_API_KEY=sk-or-...\` to your \`.env.local\` file, then restart the dev server.`
            : `Couldn't reach the AI: ${msg.slice(0, 120)}`,
          { status: "error" },
        );
        break;
      }

      setIsTyping(false);

      if (llmResponse.text) {
        startStream(llmResponse.text);
        sessionHistory.push({ role: "assistant", content: llmResponse.text });
      }

      if (!llmResponse.action || llmResponse.action === "respond") break;

      if (llmResponse.text) await waitForStream(llmResponse.text);

      const result = await executeAction(llmResponse.action, llmResponse.params ?? {});

      if (!result || !result.ok) break;

      sessionHistory.push({
        role: "user",
        content: `[Step ${step + 1} completed: ${result.detail ?? llmResponse.action}]`,
      });

      await new Promise<void>((r) => setTimeout(r, 800));
    }

    isBusyRef.current = false;
  }, [isTyping, full, agent, startStream, waitForStream, executeAction, addMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const ctx = full.getContext();
  const spread = agent.vaultApy - agent.poolApr;
  const spreadAboveThreshold = Math.abs(spread) > agent.config.thresholdPct;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border bg-background/80 backdrop-blur-sm px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <BackButton />
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Lunex AI</h1>
                <p className="text-[11px] text-muted-foreground">Autonomous DeFi agent</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {agent.config.active && (
                <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  ● ACTIVE
                </Badge>
              )}
              {/* History toggle — only visible in chat tab */}
              {activeTab === "chat" && (
                <button
                  onClick={() => setShowHistory((v) => !v)}
                  title="Chat history"
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg border border-border transition-colors",
                    showHistory ? "bg-primary/10 text-primary border-primary/30" : "bg-muted/20 text-muted-foreground hover:text-foreground hover:bg-muted/40",
                  )}
                >
                  <Clock className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setActiveTab(activeTab === "dashboard" ? "chat" : "dashboard")}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg border border-border transition-colors",
                  activeTab === "dashboard" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}>
                <LayoutDashboard className="h-3.5 w-3.5" />Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chat Tab ── */}
      {activeTab === "chat" && (
        <div className="flex flex-1 min-h-0 relative">

          {/* History sidebar — mobile overlay backdrop */}
          {showHistory && (
            <div
              className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden"
              onClick={() => setShowHistory(false)}
            />
          )}

          {/* History sidebar panel */}
          {showHistory && (
            <div className={cn(
              "flex flex-col border-r border-border z-40",
              // Mobile: fixed overlay from left
              "fixed left-0 top-14 h-[calc(100vh-3.5rem)] w-[220px] lg:hidden",
              // Desktop: inline inside the flex row
              "lg:relative lg:top-auto lg:h-auto lg:w-[200px] lg:z-auto lg:shrink-0 lg:flex",
            )}>
              <HistorySidebar
                sessions={sessions}
                activeId={activeId}
                onSelect={selectChat}
                onNew={newChat}
                onDelete={deleteChat}
                onClose={() => setShowHistory(false)}
              />
            </div>
          )}
          {/* Desktop inline history panel (rendered inside flex, not fixed) */}
          {showHistory && (
            <div className="hidden lg:flex w-[200px] shrink-0 flex-col border-r border-border">
              <HistorySidebar
                sessions={sessions}
                activeId={activeId}
                onSelect={selectChat}
                onNew={newChat}
                onDelete={deleteChat}
                onClose={() => setShowHistory(false)}
              />
            </div>
          )}

          {/* Messages column */}
          <div className="flex flex-1 flex-col min-h-0">
            <div className="flex-1 overflow-y-auto py-4">
              <div className="max-w-3xl mx-auto">
                {messages.map((msg) =>
                  msg.role === "agent" ? <AgentMessage key={msg.id} msg={msg} /> : <UserMessage key={msg.id} msg={msg} />
                )}
                {isTyping && <TypingIndicator />}
                <div ref={chatEndRef} />
              </div>
            </div>

            {/* Suggestion chips */}
            {messages.length <= 2 && !isTyping && !streamId && isConnected && (
              <div className="max-w-3xl mx-auto px-4 pb-2">
                <div className="flex flex-wrap gap-2">
                  {CHIPS.map((c) => (
                    <button key={c.label} onClick={() => sendMessage(c.label)}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors">
                      <span className="text-primary">{c.icon}</span>{c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Input bar */}
            <div className="shrink-0 border-t border-border bg-background/80 backdrop-blur-sm p-4">
              <div className="max-w-3xl mx-auto">
                {!isConnected ? (
                  <div className="flex items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3">
                    <Wallet className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm text-muted-foreground">Connect your wallet to use Lunex AI</span>
                    <Button size="sm" variant="outline" onClick={openConnect} className="h-8 text-xs shrink-0">
                      Connect Wallet
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-3 items-end">
                    <Textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder=""
                      rows={1}
                      className="flex-1 resize-none min-h-[44px] max-h-[140px] text-sm leading-relaxed rounded-xl border-border bg-muted/20 focus:border-primary/50 focus:bg-background transition-colors overflow-y-auto"
                      style={{ height: "auto" }}
                      onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 140) + "px"; }}
                      disabled={isTyping || !!streamId || isBusyRef.current}
                    />
                    <Button onClick={() => sendMessage(input)} disabled={!input.trim() || isTyping || !!streamId || isBusyRef.current}
                      size="icon" className="h-11 w-11 rounded-xl shrink-0">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right controls sidebar */}
          <div className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-border bg-card/50 p-5 gap-5 overflow-y-auto">
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Quick Controls</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div><p className="text-sm font-bold">Autonomous Mode</p><p className="text-[10px] text-muted-foreground mt-0.5">Executes without popups</p></div>
                  <Switch checked={agent.config.active} onCheckedChange={(v) => {
                    if (!isConnected) { openConnect(); return; }
                    if (v && auth.isConfigured && !auth.isAuthorized) {
                      sendMessage("I need to authorize the agent first. Please approve the setup.");
                      return;
                    }
                    agent.updateConfig({ active: v });
                    sendMessage(v ? "start autonomous mode" : "stop autonomous mode");
                  }} />
                </div>
                {auth.isConfigured && !auth.isAuthorized && (
                  <button onClick={auth.authorize} disabled={auth.authTx.isPending}
                    className="w-full flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-primary hover:bg-primary/10 transition-colors disabled:opacity-50">
                    {auth.authTx.isPending
                      ? <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                      : <ShieldCheck className="h-3 w-3 shrink-0" />}
                    {auth.authTx.isPending ? "Authorizing..." : "Authorize agent (one-time)"}
                  </button>
                )}
                {auth.isConfigured && auth.isAuthorized && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold"><ShieldCheck className="h-3 w-3" />Agent authorized</span>
                    <button onClick={auth.revoke} className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"><ShieldOff className="h-3 w-3" />Revoke</button>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-bold">Auto-Execute</p><p className="text-[10px] text-muted-foreground mt-0.5">Sends txs automatically</p></div>
                <Switch checked={agent.config.autoExecute} onCheckedChange={(v) => agent.updateConfig({ autoExecute: v })} disabled={!agent.config.active} />
              </div>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <p className="text-sm font-bold">Threshold</p>
                  <p className="text-sm font-mono text-primary">{agent.config.thresholdPct.toFixed(1)}%</p>
                </div>
                <Slider min={0.5} max={5} step={0.5} value={[agent.config.thresholdPct]} onValueChange={([v]) => agent.updateConfig({ thresholdPct: v })} disabled={agent.config.active} className="py-1" />
              </div>
            </div>

            {/* Yields */}
            <div className="border border-border rounded-sm p-3 space-y-2">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-black">Live Yields</p>
              <div className="flex justify-between"><span className="text-[11px] text-muted-foreground">Pool APR</span><span className="text-[11px] font-mono font-bold text-blue-400">{agent.poolApr.toFixed(2)}%</span></div>
              <div className="flex justify-between"><span className="text-[11px] text-muted-foreground">Vault APY</span><span className="text-[11px] font-mono font-bold text-emerald-400">{agent.vaultApy.toFixed(2)}%</span></div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-[11px] text-muted-foreground">Spread</span>
                <span className={cn("text-[11px] font-mono font-bold", spreadAboveThreshold ? "text-primary" : "text-muted-foreground")}>
                  {spread >= 0 ? "+" : ""}{spread.toFixed(2)}%{spreadAboveThreshold && " ⚡"}
                </span>
              </div>
            </div>

            {/* Positions */}
            <div className="border border-border rounded-sm p-3 space-y-2">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-black">Positions</p>
              {[
                ["USDC", ctx.usdcBalance.toFixed(4)],
                ["EURC", ctx.eurcBalance.toFixed(4)],
                ["USDT", ctx.usdtBalance.toFixed(4)],
                ["Pool LP", ctx.lpBalance.toFixed(4)],
                ["Vault USDC", ctx.vaultUsdcDeposited.toFixed(4)],
                ["Vault EURC", ctx.vaultEurcDeposited.toFixed(4)],
                ["Vault USDT", ctx.vaultUsdtDeposited.toFixed(4)],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between">
                  <span className="text-[11px] text-muted-foreground">{l}</span>
                  <span className="text-[11px] font-mono">{v}</span>
                </div>
              ))}
            </div>

            {/* Bridge status */}
            {!["idle", "complete", "failed"].includes(full.bridge.status) && (
              <div className="border border-primary/20 bg-primary/5 rounded-sm p-3 space-y-1">
                <p className="text-[9px] uppercase tracking-widest text-primary font-black">Bridge In Progress</p>
                <p className="text-[11px] text-muted-foreground capitalize">{full.bridge.status.replace(/_/g, " ")}</p>
                {full.bridge.statusMessage && <p className="text-[10px] text-muted-foreground">{full.bridge.statusMessage}</p>}
              </div>
            )}

            {/* Action shortcuts */}
            <div className="mt-auto space-y-2">
              {spreadAboveThreshold && (
                <Button onClick={() => sendMessage("execute rebalance")} className="w-full gap-2 font-black uppercase tracking-widest text-[10px] h-9"
                  disabled={!isConnected || isTyping || !!streamId}>
                  <Zap className="h-3.5 w-3.5" />Execute Rebalance
                </Button>
              )}
              <Button onClick={() => sendMessage("what's my portfolio?")} variant="outline"
                className="w-full gap-2 font-black uppercase tracking-widest text-[10px] h-9" disabled={isTyping || !!streamId}>
                <Sparkles className="h-3.5 w-3.5" />Portfolio
              </Button>
              <Button onClick={() => sendMessage("evaluate")} variant="outline"
                className="w-full gap-2 font-black uppercase tracking-widest text-[10px] h-9" disabled={isTyping || !!streamId}>
                <RefreshCw className="h-3.5 w-3.5" />Evaluate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dashboard Tab ── */}
      {activeTab === "dashboard" && (
        <div className="flex-1 overflow-y-auto">
          <div className="container max-w-6xl mx-auto py-8 px-4">
            <div className="grid lg:grid-cols-[1fr_340px] gap-6">
              <div className="space-y-5">
                {/* Yield comparison */}
                <div className="border border-border bg-card rounded-sm p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground mb-4">Live Yield Comparison</p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <div className="border border-border bg-muted/10 p-2.5 sm:p-3">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Pool APR</p>
                      <p className="text-base sm:text-xl font-black font-mono text-blue-400">{agent.poolApr.toFixed(2)}%</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 hidden sm:block">USDC/EURC fees</p>
                    </div>
                    <div className="border border-border bg-muted/10 p-2.5 sm:p-3">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Vault APY</p>
                      <p className="text-base sm:text-xl font-black font-mono text-emerald-400">{agent.vaultApy.toFixed(2)}%</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 hidden sm:block">luneUSDC</p>
                    </div>
                    <div className={cn("border p-2.5 sm:p-3", spreadAboveThreshold ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10")}>
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">Spread</p>
                      <p className={cn("text-base sm:text-xl font-black font-mono", spread > 0 ? "text-emerald-400" : spread < 0 ? "text-blue-400" : "text-foreground")}>
                        {spread >= 0 ? "+" : ""}{spread.toFixed(2)}%
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{spreadAboveThreshold ? "⚡ Active" : `>${agent.config.thresholdPct}%`}</p>
                    </div>
                  </div>
                </div>

                {/* Positions */}
                <div className="border border-border bg-card rounded-sm p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground mb-4">Managed Positions</p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {[
                      { l: "Pool LP", v: agent.pool.lpBalance.toFixed(4), s: "LP tokens" },
                      { l: "Vault USDC", v: agent.vault.userDeposited.toFixed(4), s: "luneUSDC" },
                      { l: "Wallet USDC", v: agent.walletUsdc.toFixed(4), s: "undeployed" },
                    ].map(({ l, v, s }) => (
                      <div key={l} className="border border-border bg-muted/10 p-2.5 sm:p-3">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-0.5">{l}</p>
                        <p className="font-black font-mono text-sm sm:text-base truncate">{v}</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5 hidden sm:block">{s}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Decision log */}
                <div className="border border-border bg-card rounded-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Agent Decision Log</p>
                    <button onClick={agent.clearLog} className="text-muted-foreground hover:text-foreground transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="max-h-[420px] overflow-y-auto px-5">
                    {agent.log.length === 0 ? (
                      <div className="py-10 flex flex-col items-center gap-3">
                        <p className="text-xs text-muted-foreground text-center">No evaluations yet.</p>
                        <p className="text-[10px] text-muted-foreground/60 text-center">Enable autonomous mode or click Evaluate Now to start.</p>
                      </div>
                    ) : agent.log.map((e) => <LogEntry key={e.id} entry={e} />)}
                  </div>
                </div>
              </div>

              {/* Controls + Status */}
              <div className="space-y-5">
                <div className="border border-border bg-card rounded-sm p-5 space-y-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Agent Controls</p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm font-bold">Autonomous Mode</p><p className="text-[10px] text-muted-foreground mt-0.5">Executes without popups</p></div>
                      <Switch checked={agent.config.active} onCheckedChange={(v) => {
                        if (!isConnected) { openConnect(); return; }
                        if (v && auth.isConfigured && !auth.isAuthorized) return;
                        agent.updateConfig({ active: v });
                      }} disabled={auth.isConfigured && !auth.isAuthorized && !agent.config.active} />
                    </div>
                    {auth.isConfigured && !auth.isAuthorized && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2">
                        <p className="text-[10px] text-amber-400 font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3 w-3" />One-time agent authorization required</p>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          Grant the AI agent permission to rebalance on your behalf. This approves your LP tokens and vault shares to the AgentExecutor contract and sets the agent wallet as operator.
                          {AGENT_WALLET_ADDRESS && <span className="block mt-1 font-mono text-muted-foreground/60">{AGENT_WALLET_ADDRESS.slice(0,10)}…{AGENT_WALLET_ADDRESS.slice(-6)}</span>}
                        </p>
                        <div className="grid grid-cols-3 gap-1.5 text-[9px]">
                          {[
                            { label: "LP approved", done: auth.lpApproved },
                            { label: "Vault approved", done: auth.vaultApproved },
                            { label: "Operator set", done: auth.isOperator },
                          ].map(({ label, done }) => (
                            <div key={label} className={cn("flex items-center gap-1 px-2 py-1 rounded border", done ? "border-emerald-500/30 text-emerald-400" : "border-border text-muted-foreground")}>
                              <CheckCircle className="h-2.5 w-2.5 shrink-0" />{label}
                            </div>
                          ))}
                        </div>
                        <Button onClick={auth.authorize} disabled={auth.authTx.isPending} size="sm"
                          className="w-full h-8 gap-2 text-[10px] font-black uppercase tracking-widest">
                          {auth.authTx.isPending ? <><Loader2 className="h-3 w-3 animate-spin" />Authorizing...</> : <><ShieldCheck className="h-3 w-3" />Authorize Agent</>}
                        </Button>
                      </div>
                    )}
                    {auth.isConfigured && auth.isAuthorized && (
                      <div className="flex items-center justify-between py-1">
                        <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold"><ShieldCheck className="h-3 w-3" />Agent authorized — fully autonomous</span>
                        <button onClick={auth.revoke} className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"><ShieldOff className="h-3 w-3" />Revoke</button>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm font-bold">Auto-Execute</p><p className="text-[10px] text-muted-foreground mt-0.5">Sends txs automatically</p></div>
                    <Switch checked={agent.config.autoExecute} onCheckedChange={(v) => agent.updateConfig({ autoExecute: v })} disabled={!agent.config.active} />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <p className="text-sm font-bold">Rebalance Threshold</p>
                      <p className="text-sm font-mono text-primary">{agent.config.thresholdPct.toFixed(1)}%</p>
                    </div>
                    <Slider min={0.5} max={5} step={0.5} value={[agent.config.thresholdPct]} onValueChange={([v]) => agent.updateConfig({ thresholdPct: v })} disabled={agent.config.active} className="py-1" />
                    <p className="text-[9px] text-muted-foreground mt-1.5">Minimum APR spread to trigger a move</p>
                  </div>
                  <div className="border-t border-border pt-4 space-y-2">
                    <Button onClick={() => { if (!isConnected) { openConnect(); return; } agent.runOnce(); }} variant="outline"
                      className="w-full gap-2 font-black uppercase tracking-widest text-[10px] h-10" disabled={agent.isExecuting}>
                      <RefreshCw className={cn("h-3.5 w-3.5", agent.isExecuting && "animate-spin")} />Evaluate Now
                    </Button>
                  </div>
                </div>

                <div className="border border-border bg-card rounded-sm p-5 space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Status</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { l: "State", v: agent.config.active ? "RUNNING" : "STANDBY", c: agent.config.active ? "text-emerald-400" : "text-muted-foreground" },
                      { l: "Uptime", v: formatUptime(agent.startedAt), c: "text-foreground" },
                      { l: "Decisions", v: String(agent.log.length), c: "text-foreground" },
                      { l: "Executions", v: String(agent.log.filter((l) => l.executed).length), c: "text-foreground" },
                    ].map(({ l, v, c }) => (
                      <div key={l} className="border border-border bg-muted/10 p-3">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{l}</p>
                        <p className={cn("font-black font-mono mt-1 text-sm", c)}>{v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="border border-border bg-muted/10 p-3">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Last Action</p>
                    <p className={cn("font-black uppercase text-sm mt-1", decisionColor(agent.lastDecision))}>{decisionLabel(agent.lastDecision)}</p>
                  </div>
                </div>

                {agent.lastDecision !== "hold" && (
                  <div className={cn("border rounded-sm p-4", agent.lastDecision === "rebalance_to_vault" ? "border-emerald-500/30 bg-emerald-500/10" : "border-blue-500/30 bg-blue-500/10")}>
                    <div className="flex items-center gap-2 mb-2"><Zap className="h-4 w-4 text-primary" /><p className="text-[10px] font-black uppercase tracking-widest">Action Recommended</p></div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {agent.lastDecision === "rebalance_to_vault" ? "Vault outperforms pool. Remove LP → deposit vault." : "Pool outperforms vault. Redeem vault → add pool liquidity."}
                    </p>
                    {!agent.config.autoExecute && (
                      <Button onClick={() => agent.executeStep()} disabled={agent.isExecuting || !isConnected} className="w-full h-9 mt-3 gap-2 font-black uppercase tracking-widest text-[10px]">
                        {agent.isExecuting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}Execute Step
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
