import { useEffect, useState, useRef, useCallback } from "react";
import {
  Bot, Zap, TrendingUp, TrendingDown, Minus,
  RefreshCw, Trash2, CheckCircle, Clock,
  Send, User, LayoutDashboard, MessageSquare,
  Sparkles, ArrowLeftRight, Droplets, Sprout,
  ArrowDownToLine, Link2, AlertCircle, Loader2, ExternalLink, Wallet,
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
import { useFullAgent, type ActionResult } from "@/hooks/useFullAgent";
import { resolveAmount } from "@/lib/agentParser";
import { callAutopilotLLM } from "@/lib/autopilotLLM";
import { BRIDGE_CHAINS } from "@/features/bridge/config/bridgeConfig";
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
  return (
    <div className="flex gap-3 py-3 border-b border-border/40 last:border-0">
      <div className="mt-0.5 shrink-0">{decisionIcon(entry.decision)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("text-[10px] font-black tracking-widest uppercase", decisionColor(entry.decision))}>{decisionLabel(entry.decision)}</span>
          {entry.executed
            ? <span className="flex items-center gap-1 text-[9px] text-emerald-400 font-semibold"><CheckCircle className="h-2.5 w-2.5" />EXECUTED</span>
            : entry.decision !== "hold" && <span className="flex items-center gap-1 text-[9px] text-muted-foreground"><Clock className="h-2.5 w-2.5" />LOGGED</span>}
          <span className="ml-auto text-[9px] text-muted-foreground font-mono">{new Date(entry.timestamp).toLocaleTimeString()}</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{entry.reasoning}</p>
        <div className="flex gap-3 mt-1.5 text-[9px] font-mono text-muted-foreground/70">
          <span>Pool {entry.poolApr.toFixed(2)}%</span>
          <span>Vault {entry.vaultApy.toFixed(2)}%</span>
          {entry.txHash && entry.txHash !== "0x" && (
            <a href={`https://testnet.arcscan.app/tx/${entry.txHash}`} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">view tx ↗</a>
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
      {data.txHash && data.txHash !== "0x" && (
        <a
          href={`https://testnet.arcscan.app/tx/${data.txHash}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-primary hover:text-primary/80 underline-offset-2 hover:underline w-fit"
        >
          <ExternalLink className="h-3 w-3" />
          View on ArcScan
        </a>
      )}
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

// ── Quick-start chips ─────────────────────────────────────────────────────────

const CHIPS = [
  { label: "What's my portfolio?", icon: <LayoutDashboard className="h-3 w-3" /> },
  { label: "Swap 10 USDC to EURC", icon: <ArrowLeftRight className="h-3 w-3" /> },
  { label: "Add 10 USDC to pool", icon: <Droplets className="h-3 w-3" /> },
  { label: "Deposit 10 USDC to vault", icon: <Sprout className="h-3 w-3" /> },
  { label: "Remove all liquidity", icon: <ArrowDownToLine className="h-3 w-3" /> },
  { label: "Bridge 5 USDC to Base", icon: <Link2 className="h-3 w-3" /> },
];

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "agent",
  content: `Hi! I'm **Lunex AI** - your autonomous DeFi agent. I can execute any action on the protocol directly from this chat. What would you like to do?`,
  timestamp: Date.now(),
};

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "chat" | "dashboard";

export default function Autopilot() {
  const { isConnected, openConnect } = useWallet();
  const agent = useAutopilotAgent();
  const full = useFullAgent();

  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [, setTick] = useState(0);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  // Streaming state
  const [streamTarget, setStreamTarget] = useState("");
  const [streamIndex, setStreamIndex] = useState(0);
  const [streamId, setStreamId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const isBusyRef = useRef(false);

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

  // Wait for the current stream to finish
  const waitForStream = useCallback((text: string) =>
    new Promise<void>((resolve) => {
      const duration = text.length * 6 + 300;
      setTimeout(resolve, duration);
    }), []);

  // ── Action executor - routes Claude's structured response to protocol calls ──

  const executeAction = useCallback(async (action: string, params: Record<string, unknown>) => {
    if (!isConnected) { openConnect(); return; }

    const ctx = full.getContext();
    let result: ActionResult | null = null;

    // Show a step-in-progress message before executing
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
          const from = (params.fromToken as "USDC" | "EURC") ?? "USDC";
          const to = (params.toToken as "USDC" | "EURC") ?? (from === "USDC" ? "EURC" : "USDC");
          const balRaw = from === "USDC" ? ctx.usdcBalanceRaw : ctx.eurcBalanceRaw;
          const raw = resolveAmount(params.amount as string, balRaw);
          result = await full.performSwap(from, to, formatUnits(raw, 6));
          break;
        }
        case "add_liquidity": {
          result = await full.addLiquidity(
            String(params.usdcAmount ?? "0"),
            String(params.eurcAmount ?? "0"),
          );
          break;
        }
        case "remove_liquidity": {
          result = await full.removeLiquidity(
            (params.mode as "both" | "usdc" | "eurc") ?? "both",
            Number(params.percent ?? 100),
          );
          break;
        }
        case "vault_deposit": {
          const token = (params.token as "USDC" | "EURC") ?? "USDC";
          const balRaw = token === "USDC" ? ctx.usdcBalanceRaw : ctx.eurcBalanceRaw;
          const raw = resolveAmount(params.amount as string, balRaw);
          result = await full.vaultDeposit(token, raw);
          break;
        }
        case "vault_withdraw": {
          const token = (params.token as "USDC" | "EURC") ?? "USDC";
          const shares = token === "USDC" ? ctx.vaultUsdcSharesRaw : ctx.vaultEurcSharesRaw;
          result = await full.vaultWithdraw(token, shares);
          break;
        }
        case "send": {
          const token = (params.token as "USDC" | "EURC") ?? "USDC";
          const balRaw = token === "USDC" ? ctx.usdcBalanceRaw : ctx.eurcBalanceRaw;
          const raw = resolveAmount(params.amount as string, balRaw);
          result = await full.send(token, String(params.to ?? ""), formatUnits(raw, 6));
          break;
        }
        case "bridge": {
          result = await full.startBridge(
            String(params.amount ?? "0"),
            (params.fromChain as string) ?? "arc",
            (params.toChain as string) ?? "ethereum",
            (params.token as "USDC" | "EURC") ?? "USDC",
          );
          break;
        }
        case "evaluate": {
          await agent.runOnce();
          const spread = ctx.vaultUsdcApy - ctx.poolApr;
          addMessage(
            Math.abs(spread) > agent.config.thresholdPct
              ? `Evaluation complete ⚡\n\nSpread **${Math.abs(spread).toFixed(2)}%** exceeds threshold **${agent.config.thresholdPct}%**. The **${spread > 0 ? "vault" : "pool"}** is outperforming. Say **"execute rebalance"** to act.`
              : `Evaluation complete. Spread **${Math.abs(spread).toFixed(2)}%** is below the **${agent.config.thresholdPct}%** threshold - current allocation is near-optimal.`
          );
          return;
        }
        case "start_agent":
          agent.updateConfig({ active: true });
          return;
        case "stop_agent":
          agent.updateConfig({ active: false });
          return;
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
  }, [isConnected, openConnect, full, agent, addMessage]);

  // ── Main send handler ────────────────────────────────────────────────────────

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isTyping || isBusyRef.current) return;
    isBusyRef.current = true;

    setMessages((p) => [...p, { id: `user_${Date.now()}`, role: "user", content: text.trim(), timestamp: Date.now() }]);
    setInput("");
    setIsTyping(true);

    // Build conversation history for Claude (last 8 completed messages)
    const history = messages
      .filter((m) => !m.isStreaming && m.content.trim())
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    // Strip bigint fields - JSON.stringify throws on bigints; Claude only needs human-readable numbers
    const rawCtx = full.getContext();
    const llmCtx: Record<string, unknown> = {
      usdcBalance: rawCtx.usdcBalance,
      eurcBalance: rawCtx.eurcBalance,
      lpBalance: rawCtx.lpBalance,
      vaultUsdcDeposited: rawCtx.vaultUsdcDeposited,
      vaultEurcDeposited: rawCtx.vaultEurcDeposited,
      poolApr: rawCtx.poolApr,
      vaultUsdcApy: rawCtx.vaultUsdcApy,
      vaultEurcApy: rawCtx.vaultEurcApy,
      totalLiquidity: rawCtx.totalLiquidity,
      bridgeStatus: rawCtx.bridgeStatus,
      agentActive: agent.config.active,
    };

    let llmResponse: { text: string; action?: string | null; params?: Record<string, unknown> };
    try {
      llmResponse = await callAutopilotLLM(text, llmCtx, history);
    } catch (e: unknown) {
      setIsTyping(false);
      const msg = e instanceof Error ? e.message : String(e);
      addMessage(
        msg.includes("OPENROUTER_API_KEY")
          ? `**API key not configured.**\n\nAdd \`OPENROUTER_API_KEY=sk-or-...\` to your \`.env.local\` file, then restart the dev server.`
          : `Couldn't reach the AI: ${msg.slice(0, 120)}`,
        { status: "error" },
      );
      isBusyRef.current = false;
      return;
    }

    setIsTyping(false);

    // Stream Claude's text response
    startStream(llmResponse.text);

    // Execute action after streaming completes
    if (llmResponse.action) {
      await waitForStream(llmResponse.text);
      await executeAction(llmResponse.action, llmResponse.params ?? {});
    }

    isBusyRef.current = false;
  }, [isTyping, messages, full, startStream, waitForStream, executeAction, addMessage]);

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
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={cn("text-[10px] font-black uppercase tracking-widest px-3 py-1",
                agent.config.active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "text-muted-foreground")}>
                {agent.config.active ? "● ACTIVE" : "○ PAUSED"}
              </Badge>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(["chat", "dashboard"] as Tab[]).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={cn("flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-colors border-l border-border first:border-l-0",
                      activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/40")}>
                    {tab === "chat" ? <><MessageSquare className="h-3.5 w-3.5" />Chat</> : <><LayoutDashboard className="h-3.5 w-3.5" />Dashboard</>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chat Tab ── */}
      {activeTab === "chat" && (
        <div className="flex flex-1 min-h-0">
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

            {/* Suggestion chips - only shown at start when connected */}
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

          {/* Right sidebar */}
          <div className="hidden lg:flex w-[280px] shrink-0 flex-col border-l border-border bg-card/50 p-5 gap-5 overflow-y-auto">
            <div className="space-y-4">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Quick Controls</p>
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-bold">Autonomous Mode</p><p className="text-[10px] text-muted-foreground mt-0.5">Evaluates every 30s</p></div>
                <Switch checked={agent.config.active} onCheckedChange={(v) => { if (!isConnected) { openConnect(); return; } agent.updateConfig({ active: v }); sendMessage(v ? "start autonomous mode" : "stop autonomous mode"); }} />
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
                ["Pool LP", ctx.lpBalance.toFixed(4)],
                ["Vault USDC", ctx.vaultUsdcDeposited.toFixed(4)],
                ["Vault EURC", ctx.vaultEurcDeposited.toFixed(4)],
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
                  <div className="grid grid-cols-3 gap-4">
                    <div className="border border-border bg-muted/10 p-4">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Pool APR</p>
                      <p className="text-2xl font-black font-mono text-blue-400">{agent.poolApr.toFixed(2)}%</p>
                      <p className="text-[9px] text-muted-foreground mt-1">USDC/EURC swap fees</p>
                    </div>
                    <div className="border border-border bg-muted/10 p-4">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Vault APY</p>
                      <p className="text-2xl font-black font-mono text-emerald-400">{agent.vaultApy.toFixed(2)}%</p>
                      <p className="text-[9px] text-muted-foreground mt-1">luneUSDC auto-compound</p>
                    </div>
                    <div className={cn("border p-4", spreadAboveThreshold ? "border-primary/40 bg-primary/5" : "border-border bg-muted/10")}>
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">Spread</p>
                      <p className={cn("text-2xl font-black font-mono", spread > 0 ? "text-emerald-400" : spread < 0 ? "text-blue-400" : "text-foreground")}>
                        {spread >= 0 ? "+" : ""}{spread.toFixed(2)}%
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-1">{spreadAboveThreshold ? "⚡ Threshold met" : `Need >${agent.config.thresholdPct}%`}</p>
                    </div>
                  </div>
                </div>

                {/* Positions */}
                <div className="border border-border bg-card rounded-sm p-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground mb-4">Managed Positions</p>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { l: "Pool LP", v: agent.pool.lpBalance.toFixed(4), s: "LP tokens" },
                      { l: "Vault USDC", v: agent.vault.userDeposited.toFixed(4), s: "in luneUSDC" },
                      { l: "Wallet USDC", v: agent.walletUsdc.toFixed(4), s: "undeployed" },
                    ].map(({ l, v, s }) => (
                      <div key={l} className="border border-border bg-muted/10 p-4">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{l}</p>
                        <p className="font-black font-mono text-lg">{v}</p>
                        <p className="text-[9px] text-muted-foreground mt-1">{s}</p>
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
                    {agent.log.length === 0
                      ? <p className="py-10 text-xs text-muted-foreground text-center">No decisions yet - switch to Chat and say "evaluate".</p>
                      : agent.log.map((e) => <LogEntry key={e.id} entry={e} />)}
                  </div>
                </div>
              </div>

              {/* Controls + Status */}
              <div className="space-y-5">
                <div className="border border-border bg-card rounded-sm p-5 space-y-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Agent Controls</p>
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm font-bold">Autonomous Mode</p><p className="text-[10px] text-muted-foreground mt-0.5">Polls every 30s</p></div>
                    <Switch checked={agent.config.active} onCheckedChange={(v) => { if (!isConnected) { openConnect(); return; } agent.updateConfig({ active: v }); }} />
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
                    <Button onClick={() => setActiveTab("chat")} variant="outline"
                      className="w-full gap-2 font-black uppercase tracking-widest text-[10px] h-10">
                      <MessageSquare className="h-3.5 w-3.5" />Open Chat
                    </Button>
                  </div>
                </div>

                <div className="border border-border bg-card rounded-sm p-5 space-y-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Status</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { l: "State", v: agent.config.active ? "RUNNING" : "STOPPED", c: agent.config.active ? "text-emerald-400" : "text-muted-foreground" },
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
