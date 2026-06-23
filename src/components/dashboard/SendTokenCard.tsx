import { useEffect, useMemo, useState } from "react";
import { Send, Loader2, Fingerprint, Mail, Wallet, ExternalLink } from "lucide-react";
import { formatUnits, isAddress } from "viem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/context/WalletProvider";
import { useSendToken, resolveToken, type SendFromKind, type SendToken } from "@/hooks/useSendToken";
import { useUnifiedBalance } from "@/features/bridge/hooks/useUnifiedBalance";
import {
  BRIDGE_CHAINS,
  BRIDGE_CHAIN_KEYS,
  getExplorerTxUrl,
  type BridgeChainKey,
} from "@/features/bridge/config/bridgeConfig";

/**
 * Dashboard "Send Token" card. Sends USDC/EURC to any address from the chosen
 * connected wallet — passkey & email send on Arc (gasless/PIN); a connected EOA
 * (WalletConnect / injected / burner) can send across all 6 chains.
 */
export function SendTokenCard() {
  const { circle, uc, hasInjected, balance, eurcBalance, openConnect } = useWallet();
  const { balancesByChain } = useUnifiedBalance();
  const { send, isPending, txHash, error } = useSendToken();

  const kinds = useMemo(() => {
    const k: { key: SendFromKind; label: string; icon: typeof Wallet }[] = [];
    if (circle) k.push({ key: "passkey", label: "Passkey", icon: Fingerprint });
    if (uc) k.push({ key: "email", label: "Email", icon: Mail });
    if (hasInjected) k.push({ key: "eoa", label: "Connected wallet", icon: Wallet });
    return k;
  }, [circle, uc, hasInjected]);

  const [fromKind, setFromKind] = useState<SendFromKind>("eoa");
  const [token, setToken] = useState<SendToken>("USDC");
  const [chainKey, setChainKey] = useState<BridgeChainKey>("arc");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");

  // Keep fromKind valid as wallets connect/disconnect.
  useEffect(() => {
    if (kinds.length && !kinds.some((k) => k.key === fromKind)) setFromKind(kinds[0].key);
  }, [kinds, fromKind]);

  // Circle smart accounts are Arc-only.
  const effectiveChain: BridgeChainKey = fromKind === "eoa" ? chainKey : "arc";

  // EURC only where it exists on the effective chain.
  const eurcAvailable = resolveToken("EURC", effectiveChain) !== null;
  useEffect(() => {
    if (token === "EURC" && !eurcAvailable) setToken("USDC");
  }, [token, eurcAvailable]);

  const avail = useMemo(() => {
    if (fromKind === "eoa") {
      const b = balancesByChain[effectiveChain];
      if (!b) return 0;
      const raw = token === "USDC" ? b.usdc : b.eurc;
      return Number(formatUnits(raw ?? 0n, BRIDGE_CHAINS[effectiveChain].usdcDecimals));
    }
    return token === "USDC" ? balance ?? 0 : eurcBalance ?? 0;
  }, [fromKind, effectiveChain, token, balancesByChain, balance, eurcBalance]);

  const addrValid = to.length === 0 || isAddress(to);
  const overBalance = Number(amount) > 0 && Number(amount) > avail;
  const canSend = kinds.length > 0 && isAddress(to) && Number(amount) > 0 && !overBalance && !isPending;

  if (kinds.length === 0) {
    return (
      <section className="border border-border bg-card rounded-sm shadow-sm p-6 space-y-4">
        <Header />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Connect or generate a wallet to send USDC and EURC.
        </p>
        <Button onClick={openConnect} className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold uppercase tracking-wider">
          Connect Wallet
        </Button>
      </section>
    );
  }

  return (
    <section className="border border-border bg-card rounded-sm shadow-sm p-6 space-y-5">
      <Header />

      {/* From wallet */}
      <div className="space-y-2">
        <Label>From</Label>
        <div className="flex flex-wrap gap-2">
          {kinds.map((k) => (
            <button
              key={k.key}
              onClick={() => setFromKind(k.key)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
                fromKind === k.key
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <k.icon className="h-3.5 w-3.5" /> {k.label}
            </button>
          ))}
        </div>
        {fromKind !== "eoa" && (
          <p className="text-[10px] text-muted-foreground">Passkey & email wallets send on Arc.</p>
        )}
      </div>

      {/* Token + chain */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Token</Label>
          <div className="flex gap-2">
            {(["USDC", "EURC"] as const).map((t) => {
              const disabled = t === "EURC" && !eurcAvailable;
              return (
                <button
                  key={t}
                  disabled={disabled}
                  onClick={() => setToken(t)}
                  className={`flex-1 rounded-md border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-40 ${
                    token === t ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label>Network</Label>
          {fromKind === "eoa" ? (
            <select
              value={chainKey}
              onChange={(e) => setChainKey(e.target.value as BridgeChainKey)}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-primary focus:outline-none"
            >
              {BRIDGE_CHAIN_KEYS.map((key) => (
                <option key={key} value={key}>
                  {BRIDGE_CHAINS[key].label}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex h-9 items-center rounded-md border border-border bg-background px-3 text-xs text-muted-foreground">
              Arc Testnet
            </div>
          )}
        </div>
      </div>

      {/* Recipient */}
      <div className="space-y-2">
        <Label>Recipient address</Label>
        <Input
          value={to}
          onChange={(e) => setTo(e.target.value.trim())}
          placeholder="0x…"
          className={`font-mono text-sm ${!addrValid ? "border-destructive" : ""}`}
        />
        {!addrValid && <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">Invalid address</p>}
      </div>

      {/* Amount */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Amount</Label>
          <button
            type="button"
            onClick={() => setAmount(avail > 0 ? String(avail) : "")}
            className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
          >
            Balance: {avail.toFixed(2)} {token} · Max
          </button>
        </div>
        <div className="relative">
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="h-12 text-xl font-black font-mono"
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">{token}</span>
        </div>
        {overBalance && (
          <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">Amount exceeds your balance</p>
        )}
      </div>

      <Button
        disabled={!canSend}
        onClick={() => send({ fromKind, token, chainKey: effectiveChain, to, amount })}
        className="w-full h-12 gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-black uppercase tracking-widest text-[11px]"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {isPending ? "Sending…" : `Send ${token}`}
      </Button>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {txHash && txHash !== "0x" && (
        <a
          href={getExplorerTxUrl(effectiveChain, txHash)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View transaction <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2">
      <Send className="h-4 w-4 text-primary" />
      <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Send Tokens</h2>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{children}</label>;
}
