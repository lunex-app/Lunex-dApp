import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageCircle, X, Send, Bot, User, Loader2,
  CheckCircle, AlertCircle, ArrowLeftRight, Droplets,
  ArrowDownToLine, Sprout, Link2, ExternalLink, Maximize2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { formatUnits } from "viem";
import { Link } from "react-router-dom";
import { useWallet } from "@/context/WalletProvider";
import { useFullAgent, type ActionResult } from "@/hooks/useFullAgent";
import { resolveAmount } from "@/lib/agentParser";
import { callAutopilotLLM } from "@/lib/autopilotLLM";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TxCard { action: string; detail: string; txHash: string }

interface Msg {
  id: string;
  role: "user" | "agent";
  content: string;
  status?: "step" | "ok" | "error";
  txCard?: TxCard;
  streaming?: boolean;
}

// ── Mini tx card ──────────────────────────────────────────────────────────────

const TX_ICONS: Record<string, React.ReactNode> = {
  swap:             <ArrowLeftRight className="h-3 w-3" />,
  add_liquidity:    <Droplets className="h-3 w-3" />,
  remove_liquidity: <ArrowDownToLine className="h-3 w-3" />,
  vault_deposit:    <Sprout className="h-3 w-3" />,
  vault_withdraw:   <Sprout className="h-3 w-3" />,
  send:             <Send className="h-3 w-3" />,
  bridge:           <Link2 className="h-3 w-3" />,
};

function TxConfirmed({ card }: { card: TxCard }) {
  return (
    <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-bold">
        <CheckCircle className="h-3 w-3 shrink-0" />
        {TX_ICONS[card.action] ?? null}
        {card.action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} Confirmed
      </div>
      <p className="text-[11px] text-foreground leading-snug">{card.detail}</p>
      {card.txHash && card.txHash !== "0x" && (
        <a
          href={`https://testnet.arcscan.app/tx/${card.txHash}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-primary hover:underline"
        >
          <ExternalLink className="h-2.5 w-2.5" />
          View on ArcScan
        </a>
      )}
    </div>
  );
}

// ── Render markdown-lite ──────────────────────────────────────────────────────

function Md({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : p.split("\n").map((line, j, arr) =>
              <span key={`${i}-${j}`}>{line}{j < arr.length - 1 && <br />}</span>
            )
      )}
    </>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

const WELCOME: Msg = {
  id: "welcome",
  role: "agent",
  content: "Hi! I'm Lunex AI. I can swap, bridge, send tokens, deposit to vaults, manage liquidity — all without leaving this chat. What would you like to do?",
};

const CHIPS = [
  "Swap 10 USDC to EURC",
  "Bridge 5 USDC to Base",
  "Deposit 10 USDT to vault",
  "What's my balance?",
];

export default function ChatBot() {
  const { isConnected, address, openConnect } = useWallet();
  const full = useFullAgent();

  const [open, setOpen]     = useState(false);
  const [msgs, setMsgs]     = useState<Msg[]>([WELCOME]);
  const [input, setInput]   = useState("");
  const [busy, setBusy]     = useState(false);
  const bottomRef           = useRef<HTMLDivElement>(null);
  const busyRef             = useRef(false);
  const msgsRef             = useRef<Msg[]>([WELCOME]);

  useEffect(() => { msgsRef.current = msgs; }, [msgs]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const addMsg = useCallback((m: Omit<Msg, "id">) => {
    const id = `m_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setMsgs((p) => [...p, { id, ...m }]);
    return id;
  }, []);

  const patchMsg = useCallback((id: string, patch: Partial<Msg>) => {
    setMsgs((p) => p.map((m) => m.id === id ? { ...m, ...patch } : m));
  }, []);

  // ── Action executor ───────────────────────────────────────────────────────

  const execute = useCallback(async (action: string, params: Record<string, unknown>): Promise<ActionResult | null> => {
    if (!isConnected) { openConnect(); return null; }
    if (action === "respond") return null;

    const ctx = full.getContext();

    const stepText: Record<string, string> = {
      swap:             `Approving **${String(params.fromToken ?? "token")}** and confirming swap...`,
      add_liquidity:    "Adding liquidity to pool...",
      remove_liquidity: "Removing liquidity from pool...",
      vault_deposit:    `Depositing **${String(params.token ?? "token")}** to vault...`,
      vault_withdraw:   `Withdrawing from **${String(params.token ?? "token")}** vault...`,
      send:             `Sending **${String(params.token ?? "token")}**...`,
      bridge:           `Initiating bridge ${String(params.fromChain ?? "arc").toUpperCase()} → ${String(params.toChain ?? "?").toUpperCase()}...`,
    };
    if (stepText[action]) addMsg({ role: "agent", content: stepText[action], status: "step" });

    try {
      let result: ActionResult | null = null;

      switch (action) {
        case "swap": {
          const from = (params.fromToken as "USDC" | "EURC" | "USDT") ?? "USDC";
          const to   = (params.toToken   as "USDC" | "EURC" | "USDT") ?? (from === "USDC" ? "EURC" : "USDC");
          const balRaw = from === "USDC" ? ctx.usdcBalanceRaw : from === "EURC" ? ctx.eurcBalanceRaw : ctx.usdtBalanceRaw;
          const raw = resolveAmount(params.amount as string, balRaw);
          result = await full.performSwap(from, to, formatUnits(raw, 6));
          break;
        }
        case "add_liquidity":
          result = await full.addLiquidity(String(params.usdcAmount ?? "0"), String(params.eurcAmount ?? "0"));
          break;
        case "remove_liquidity":
          result = await full.removeLiquidity((params.mode as "both" | "usdc" | "eurc") ?? "both", Number(params.percent ?? 100));
          break;
        case "vault_deposit": {
          const token = (params.token as "USDC" | "EURC" | "USDT") ?? "USDC";
          const balRaw = token === "USDC" ? ctx.usdcBalanceRaw : token === "EURC" ? ctx.eurcBalanceRaw : ctx.usdtBalanceRaw;
          const raw = resolveAmount(params.amount as string, balRaw);
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
        case "bridge":
          result = await full.startBridge(
            String(params.amount ?? "0"),
            (params.fromChain as string ?? "arc") as never,
            (params.toChain   as string ?? "ethereum") as never,
            (params.token as "USDC" | "EURC") ?? "USDC",
          );
          break;
        default:
          return null;
      }

      if (result?.ok) {
        addMsg({
          role: "agent",
          content: result.detail ?? "Done.",
          status: "ok",
          txCard: { action, detail: result.detail ?? "Transaction confirmed.", txHash: result.txHash ?? "" },
        });
      } else if (result) {
        addMsg({ role: "agent", content: `Transaction failed: ${result.error}`, status: "error" });
      }
      return result;
    } catch (e) {
      addMsg({ role: "agent", content: `Error: ${e instanceof Error ? e.message.slice(0, 120) : "Unknown"}`, status: "error" });
      return null;
    }
  }, [isConnected, openConnect, full, addMsg]);

  // ── Send handler ──────────────────────────────────────────────────────────

  const send = useCallback(async (text: string) => {
    if (!text.trim() || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    const userText = text.trim();
    addMsg({ role: "user", content: userText });
    setInput("");

    const getCtx = () => {
      const c = full.getContext();
      return {
        usdcBalance:        c.usdcBalance,
        eurcBalance:        c.eurcBalance,
        usdtBalance:        c.usdtBalance,
        lpBalance:          c.lpBalance,
        vaultUsdcDeposited: c.vaultUsdcDeposited,
        vaultEurcDeposited: c.vaultEurcDeposited,
        vaultUsdtDeposited: c.vaultUsdtDeposited,
        poolApr:            c.poolApr,
        vaultUsdcApy:       c.vaultUsdcApy,
        vaultEurcApy:       c.vaultEurcApy,
        vaultUsdtApy:       c.vaultUsdtApy,
        totalLiquidity:     c.totalLiquidity,
        bridgeStatus:       c.bridgeStatus,
        agentActive:        false,
        walletAddress:      address ?? "",
      };
    };

    const sessionHistory: { role: string; content: string }[] = [];

    for (let step = 0; step < 4; step++) {
      const baseHistory = msgsRef.current
        .filter((m) => !m.streaming && m.content.trim() && m.status !== "step")
        .slice(-8)
        .map((m) => ({ role: m.role === "agent" ? "assistant" : "user", content: m.content }));

      const history = [...baseHistory, ...sessionHistory].slice(-12);
      const currentMsg = step === 0
        ? userText
        : `Step ${step} complete (${sessionHistory[sessionHistory.length - 1]?.content ?? "done"}). If more steps are needed for the original request "${userText}", call execute_action again. Otherwise call respond.`;

      let llm: { text: string; action?: string | null; params?: Record<string, unknown> };
      try {
        llm = await callAutopilotLLM(currentMsg, getCtx(), history);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        addMsg({
          role: "agent",
          status: "error",
          content: msg.includes("ANTHROPIC_API_KEY")
            ? "API key not configured. Add ANTHROPIC_API_KEY to .env.local and restart."
            : `Could not reach Lunex AI: ${msg.slice(0, 100)}`,
        });
        break;
      }

      if (llm.text) {
        addMsg({ role: "agent", content: llm.text });
        sessionHistory.push({ role: "assistant", content: llm.text });
      }

      if (!llm.action || llm.action === "respond") break;

      const result = await execute(llm.action, llm.params ?? {});
      if (!result || !result.ok) break;

      sessionHistory.push({ role: "user", content: `[Step ${step + 1} done: ${result.detail ?? llm.action}]` });
      await new Promise<void>((r) => setTimeout(r, 600));
    }

    busyRef.current = false;
    setBusy(false);
  }, [full, address, addMsg, execute]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-4 sm:right-6 z-50 w-[360px] sm:w-[400px] max-h-[540px] flex flex-col border border-border bg-card shadow-2xl rounded-xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background/60 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <span className="text-sm font-bold text-foreground">Lunex AI</span>
                  <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-primary">Agent</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link to="/autopilot" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors" title="Open full agent">
                  <Maximize2 className="h-3.5 w-3.5" />
                </Link>
                <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
              {msgs.map((msg) => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "agent" && (
                    <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center mt-0.5 border ${
                      msg.status === "error" ? "bg-destructive/10 border-destructive/20" :
                      msg.status === "step"  ? "bg-primary/10 border-primary/20" :
                      msg.status === "ok"    ? "bg-emerald-500/10 border-emerald-500/20" :
                                               "bg-primary/10 border-primary/20"
                    }`}>
                      {msg.status === "error"  ? <AlertCircle className="h-3 w-3 text-destructive" /> :
                       msg.status === "step"   ? <Loader2 className="h-3 w-3 text-primary animate-spin" /> :
                       msg.status === "ok"     ? <CheckCircle className="h-3 w-3 text-emerald-400" /> :
                                                 <Bot className="h-3 w-3 text-primary" />}
                    </div>
                  )}
                  <div className={`max-w-[82%] text-[13px] px-3 py-2 rounded-xl leading-relaxed ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : msg.status === "error"
                        ? "bg-destructive/5 border border-destructive/20 text-destructive rounded-tl-sm"
                        : "bg-muted/40 border border-border/60 text-foreground rounded-tl-sm"
                  }`}>
                    {msg.role === "agent" ? <Md text={msg.content} /> : msg.content}
                    {msg.txCard && <TxConfirmed card={msg.txCard} />}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 h-6 w-6 rounded-full bg-muted border border-border flex items-center justify-center mt-0.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="flex gap-2 justify-start">
                  <div className="flex-shrink-0 h-6 w-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Loader2 className="h-3 w-3 text-primary animate-spin" />
                  </div>
                  <div className="bg-muted/40 border border-border/60 rounded-xl rounded-tl-sm px-3 py-2 flex gap-1 items-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Quick chips — show only at the start */}
            {msgs.length <= 1 && !busy && isConnected && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
                {CHIPS.map((c) => (
                  <button key={c} onClick={() => send(c)}
                    className="text-[11px] border border-border rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                    {c}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="border-t border-border p-3 shrink-0">
              {!isConnected ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Connect wallet to use Lunex AI</span>
                  <button onClick={openConnect} className="text-xs font-bold text-primary hover:underline">Connect</button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKey}
                    placeholder="Swap, bridge, send, deposit..."
                    disabled={busy}
                    className="flex-1 bg-background text-foreground text-[13px] px-3 py-2 rounded-lg border border-border focus:outline-none focus:border-primary placeholder:text-muted-foreground disabled:opacity-50"
                  />
                  <button type="submit" disabled={!input.trim() || busy}
                    className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 sm:right-6 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
        aria-label="Open Lunex AI"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
      </button>
    </>
  );
}
