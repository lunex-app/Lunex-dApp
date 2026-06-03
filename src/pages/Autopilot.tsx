import { useMemo, useState } from "react";
import { Bot, Loader2, Send, Sparkles, User } from "lucide-react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSwap } from "@/hooks/useSwap";
import { useBridge } from "@/features/bridge/hooks/useBridge";
import { useVaultDeposit } from "@/hooks/useVault";
import { useAddLiquidity } from "@/hooks/useLiquidity";
import { createId, protocolStorage, type AutopilotIntent } from "@/lib/localProtocol";

type IntentKind = "swap" | "bridge" | "vault" | "pool" | "pay" | "stream" | "limit_order" | "unknown";

interface ParsedIntent {
  kind: IntentKind;
  amount: string;
  fromToken: "USDC" | "EURC";
  toToken: "USDC" | "EURC";
  fromChain: "arc" | "base" | "ethereum" | "arbitrum" | "avalanche" | "polygon";
  toChain: "arc" | "base" | "ethereum" | "arbitrum" | "avalanche" | "polygon";
  needsBackend: boolean;
  summary: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  intent?: ParsedIntent;
}

const chainAliases: Record<string, ParsedIntent["fromChain"]> = {
  arc: "arc",
  base: "base",
  ethereum: "ethereum",
  eth: "ethereum",
  arbitrum: "arbitrum",
  avalanche: "avalanche",
  fuji: "avalanche",
  polygon: "polygon",
  amoy: "polygon",
};

function parseIntent(prompt: string): ParsedIntent {
  const text = prompt.toLowerCase();
  const amount = text.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "";
  const tokenMatches = [...text.matchAll(/\b(usdc|eurc)\b/g)].map((match) => match[1].toUpperCase() as "USDC" | "EURC");
  const fromToken = tokenMatches[0] ?? "USDC";
  const toToken = tokenMatches[1] ?? (fromToken === "USDC" ? "EURC" : "USDC");
  const chainMatches = Object.keys(chainAliases).filter((alias) => text.includes(alias)).map((alias) => chainAliases[alias]);
  const fromChain = chainMatches[0] ?? "arc";
  const toChain = chainMatches[1] ?? (fromChain === "arc" ? "base" : "arc");

  let kind: IntentKind = "unknown";
  if (text.includes("limit")) kind = "limit_order";
  else if (text.includes("bridge") || text.includes("cctp") || text.includes("gateway")) kind = "bridge";
  else if (text.includes("vault") || text.includes("yield") || text.includes("deposit")) kind = "vault";
  else if (text.includes("liquidity") || text.includes("pool") || text.includes("lp")) kind = "pool";
  else if (text.includes("pay") || text.includes("invoice")) kind = "pay";
  else if (text.includes("stream") || text.includes("salary") || text.includes("vesting")) kind = "stream";
  else if (text.includes("swap") || tokenMatches.length >= 2) kind = "swap";

  const needsBackend = kind === "pay" || kind === "stream" || kind === "limit_order" || kind === "unknown";
  const summary = kind === "unknown"
    ? "I need a supported intent like swap, bridge, vault deposit, liquidity, pay, stream, or limit order."
    : `${kind.replace("_", " ")} ${amount || "0"} ${fromToken}${kind === "bridge" ? ` from ${fromChain} to ${toChain}` : kind === "swap" ? ` to ${toToken}` : ""}`;

  return { kind, amount, fromToken, toToken, fromChain, toChain, needsBackend, summary };
}

function assistantCopy(intent: ParsedIntent) {
  if (!intent.amount || Number(intent.amount) <= 0) return "I found the route, but I need a valid amount before I can execute.";
  if (intent.needsBackend) {
    return "This intent needs deployed automation infrastructure before I can execute it inside the agent. I can still save the intent and prepare the transaction shape.";
  }
  return `I can execute this ${intent.kind} here. Review the route and confirm with your wallet.`;
}

const Autopilot = () => {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "agent", content: "Tell me what to do with USDC or EURC. I can execute swaps, CCTP bridges, vault deposits, and liquidity actions directly from this page when the route is supported." },
  ]);
  const latestIntent = useMemo(() => [...messages].reverse().find((message) => message.intent)?.intent, [messages]);

  const swap = useSwap({
    fromSymbol: latestIntent?.kind === "swap" ? latestIntent.fromToken : "USDC",
    toSymbol: latestIntent?.kind === "swap" ? latestIntent.toToken : "EURC",
    amount: latestIntent?.kind === "swap" ? latestIntent.amount : "",
    slippage: "0.5",
  });
  const bridge = useBridge();
  const vaultDeposit = useVaultDeposit(latestIntent?.fromToken ?? "USDC", latestIntent?.kind === "vault" ? latestIntent.amount : "");
  const liquidity = useAddLiquidity(
    latestIntent?.kind === "pool" && latestIntent.fromToken === "USDC" ? latestIntent.amount : "",
    latestIntent?.kind === "pool" && latestIntent.fromToken === "EURC" ? latestIntent.amount : "",
    "0.5"
  );

  const submitPrompt = () => {
    if (!prompt.trim()) return;
    const parsed = parseIntent(prompt);
    setMessages((items) => [
      ...items,
      { id: createId("user"), role: "user", content: prompt.trim() },
      { id: createId("agent"), role: "agent", content: assistantCopy(parsed), intent: parsed },
    ]);
    setPrompt("");
    if (address) {
      const intent: AutopilotIntent = {
        id: createId("intent"),
        wallet: address,
        prompt: prompt.trim(),
        intent: parsed.kind,
        summary: parsed.summary,
        steps: [parsed.summary],
        status: parsed.needsBackend ? "needs_review" : "ready",
        createdAt: Date.now(),
      };
      protocolStorage.saveAutopilotIntent(address, intent);
    }
  };

  const executeIntent = async () => {
    if (!latestIntent) return;
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!latestIntent.amount || Number(latestIntent.amount) <= 0 || latestIntent.needsBackend) return;

    if (latestIntent.kind === "swap") swap.executeSwap();
    if (latestIntent.kind === "bridge") await bridge.startBridge(latestIntent.amount, latestIntent.fromChain, latestIntent.toChain, false, latestIntent.fromToken);
    if (latestIntent.kind === "vault") vaultDeposit.execute();
    if (latestIntent.kind === "pool") liquidity.execute();
  };

  const busy = swap.isBusy || bridge.status === "approving" || bridge.status === "burning" || bridge.status === "waiting_attestation" || bridge.status === "minting" || vaultDeposit.isBusy || liquidity.isBusy;
  const canExecute = latestIntent && !latestIntent.needsBackend && latestIntent.amount && Number(latestIntent.amount) > 0;

  return (
    <div className="container max-w-6xl mx-auto py-10 px-4">
      <div className="mb-6">
        <BackButton />
        <div className="flex items-center gap-3 mt-6">
          <Bot className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight uppercase">Lunex Autopilot</h1>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-6 min-h-[680px]">
        <section className="border border-border bg-card rounded-sm flex flex-col overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Intent workspace</p>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "agent" && <div className="h-8 w-8 border border-primary/30 bg-primary/10 text-primary flex items-center justify-center"><Bot className="h-4 w-4" /></div>}
                <div className={`max-w-[78%] border p-4 text-sm ${message.role === "user" ? "border-primary/30 bg-primary text-primary-foreground" : "border-border bg-background"}`}>
                  <p>{message.content}</p>
                  {message.intent && (
                    <div className="mt-3 border-t border-border/50 pt-3 grid sm:grid-cols-3 gap-3 text-[10px] font-mono">
                      <span>{message.intent.kind.replace("_", " ")}</span>
                      <span>{message.intent.amount || "0"} {message.intent.fromToken}</span>
                      <span>{message.intent.kind === "bridge" ? `${message.intent.fromChain} → ${message.intent.toChain}` : `${message.intent.fromToken} → ${message.intent.toToken}`}</span>
                    </div>
                  )}
                </div>
                {message.role === "user" && <div className="h-8 w-8 border border-border bg-muted/20 flex items-center justify-center"><User className="h-4 w-4" /></div>}
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border bg-background">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitPrompt();
                }
              }}
              placeholder="Example: bridge 100 USDC from Arc to Base Sepolia via CCTP"
              className="min-h-[96px] resize-none"
            />
            <div className="flex justify-end mt-3">
              <Button onClick={submitPrompt} className="gap-2 font-black uppercase tracking-widest text-[10px]">
                <Send className="h-4 w-4" /> Send
              </Button>
            </div>
          </div>
        </section>

        <aside className="border border-border bg-card rounded-sm p-5 h-fit space-y-5">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Current intent</p>
          {latestIntent ? (
            <>
              <div>
                <p className="text-xl font-black uppercase">{latestIntent.kind.replace("_", " ")}</p>
                <p className="text-xs text-muted-foreground mt-1">{latestIntent.summary}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="border border-border bg-muted/10 p-3">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Amount</p>
                  <p className="font-mono font-bold">{latestIntent.amount || "0"} {latestIntent.fromToken}</p>
                </div>
                <div className="border border-border bg-muted/10 p-3">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground">Output</p>
                  <p className="font-mono font-bold">{latestIntent.kind === "swap" ? latestIntent.toToken : latestIntent.toChain}</p>
                </div>
              </div>
              {latestIntent.needsBackend && (
                <div className="border border-yellow-500/30 bg-yellow-500/10 p-4 text-xs text-yellow-500">
                  This requires an API/backend executor or deployed automation contract for proper intent execution.
                </div>
              )}
              <Button disabled={!canExecute || busy} onClick={executeIntent} className="w-full h-12 gap-2 font-black uppercase tracking-widest text-[10px]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Execute Intent
              </Button>
              {bridge.error && <p className="text-xs text-destructive">{bridge.error}</p>}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No active intent.</p>
          )}
        </aside>
      </div>
    </div>
  );
};

export default Autopilot;
