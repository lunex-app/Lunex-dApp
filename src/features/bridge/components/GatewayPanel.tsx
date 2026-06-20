import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChainSelector } from "./ChainSelector";
import { BridgeWalletBar } from "./BridgeWalletBar";
import { useGateway } from "../hooks/useGateway";
import { useUnifiedBalance } from "../hooks/useUnifiedBalance";
import { useWallet } from "@/context/WalletProvider";
import { BRIDGE_CHAINS, type BridgeChainKey } from "../config/bridgeConfig";
import { formatUnits } from "viem";

const fmtFee = (fee: any) => {
  if (!fee) return "";
  const amount = fee.amount ?? fee.value ?? fee.total ?? "";
  const token = fee.token ?? "USDC";
  return `${amount} ${token}`.trim();
};

export function GatewayPanel() {
  const gateway = useGateway();
  const { circle, uc, hasInjected } = useWallet();
  const isCircleWallet = Boolean(circle || uc);
  // Gateway needs a real multi-chain EOA. A Circle user can connect one via
  // RainbowKit (injected or WalletConnect/mobile) without losing their session.
  const needsInjected = !hasInjected;
  const [mode, setMode] = useState<"deposit" | "spend">("deposit");
  const [transferMode, setTransferMode] = useState<"instant" | "manual">("instant");
  const [amount, setAmount] = useState("");
  const [fromChain, setFromChain] = useState<BridgeChainKey>("arc");
  const [toChain, setToChain] = useState<BridgeChainKey>("base");

  const { balancesByChain } = useUnifiedBalance();
  // Gateway is USDC-only; show the wallet's USDC balance on the source chain.
  const srcUsdcRaw = balancesByChain[fromChain]?.usdc ?? 0n;
  const srcUsdc = Number(formatUnits(srcUsdcRaw, BRIDGE_CHAINS[fromChain].usdcDecimals));

  const isBusy = gateway.status === "depositing" || gateway.status === "spending" || gateway.status === "estimating";
  const validAmount = Number(amount) > 0;

  // Load the unified Gateway balance once a browser wallet is available
  // (whether it's the only wallet or attached alongside a Circle session).
  const { refreshGatewayBalance } = gateway;
  useEffect(() => {
    if (hasInjected) refreshGatewayBalance();
  }, [hasInjected, refreshGatewayBalance]);

  const feeRows = useMemo(() => {
    const fees = (gateway.lastEstimate as any)?.fees;
    return Array.isArray(fees) ? fees.filter(Boolean) : [];
  }, [gateway.lastEstimate]);

  const runPrimary = async () => {
    if (!validAmount) return;
    if (mode === "deposit") {
      await gateway.deposit(fromChain, amount);
    } else {
      await gateway.spend(fromChain, toChain, amount, transferMode);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_0.9fr] gap-8">
      <section className="border border-border bg-card rounded-sm p-6 space-y-6">
        <div className="flex gap-px bg-border">
          {(["deposit", "spend"] as const).map((nextMode) => (
            <button
              key={nextMode}
              onClick={() => setMode(nextMode)}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest ${mode === nextMode ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              {nextMode === "deposit" ? "Deposit to Gateway" : "Instant Transfer"}
            </button>
          ))}
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary mb-2">Circle Gateway</p>
          <h2 className="text-2xl font-bold uppercase tracking-tight">{mode === "deposit" ? "Create Unified USDC Balance" : "Spend Unified Balance"}</h2>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            {mode === "deposit"
              ? "Deposit USDC into the Gateway Wallet on a source chain. Deposits are required before Gateway can mint instantly on other chains."
              : "Spend your unified Gateway balance: Circle's Forwarding Service mints USDC on the destination chain in under a second — no source-chain finality wait."}
          </p>
        </div>

        <BridgeWalletBar usdc={srcUsdc.toFixed(2)} chainLabel={BRIDGE_CHAINS[fromChain].label} />
        {needsInjected && isCircleWallet && (
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Gateway is multi-chain, so it needs a browser wallet — your Lunex passkey/email session stays active.
          </p>
        )}

        {gateway.gatewayBalance != null && (
          <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Unified Gateway Balance</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-primary">{gateway.gatewayBalance.toFixed(2)} USDC</span>
              <button onClick={() => gateway.refreshGatewayBalance()} className="text-muted-foreground hover:text-primary" title="Refresh">
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}

        <ChainSelector
          fromChain={fromChain}
          toChain={toChain}
          onFromChange={setFromChain}
          onToChange={setToChain}
          onSwap={() => {
            setFromChain(toChain);
            setToChain(fromChain);
          }}
          disabled={isBusy}
        />

        {mode === "deposit" && (
          <div className="border border-border bg-muted/10 p-4 text-xs text-muted-foreground">
            Depositing on <strong className="text-foreground">{BRIDGE_CHAINS[fromChain].label}</strong>. Gateway credits the connected wallet as the depositor.
          </div>
        )}

        {mode === "spend" && (
          <div className="space-y-3">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Mint mode</label>
            <div className="flex gap-px bg-border h-11">
              {(["instant", "manual"] as const).map((nextMode) => (
                <button
                  key={nextMode}
                  onClick={() => setTransferMode(nextMode)}
                  className={`flex-1 text-[10px] font-black uppercase tracking-widest ${transferMode === nextMode ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}
                >
                  {nextMode === "instant" ? "Instant Relayer" : "Manual Mint"}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Instant mode uses Circle's Forwarding Service and needs fee headroom in the Gateway balance. Manual mode avoids the forwarder fee but requires the wallet to sign the destination mint.
            </p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">USDC Amount</label>
            <button
              type="button"
              onClick={() => setAmount(srcUsdc > 0 ? String(srcUsdc) : "")}
              className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline"
            >
              Balance: {srcUsdc.toFixed(2)} USDC · Max
            </button>
          </div>
          <div className="relative">
            <Input
              type="number"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="h-14 text-2xl font-black font-mono"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-muted-foreground">USDC</span>
          </div>
          {validAmount && Number(amount) > srcUsdc && (
            <p className="text-[10px] text-destructive font-bold uppercase tracking-widest">Amount exceeds your {BRIDGE_CHAINS[fromChain].label} USDC balance</p>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {mode === "spend" && (
            <Button
              variant="outline"
              disabled={!validAmount || isBusy || needsInjected || fromChain === toChain}
              onClick={() => gateway.estimateSpend(fromChain, toChain, amount, transferMode)}
              className="h-12 gap-2 font-black uppercase tracking-widest text-[10px]"
            >
              {gateway.status === "estimating" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
              Estimate
            </Button>
          )}
          <Button
            disabled={!validAmount || isBusy || needsInjected || (mode === "spend" && fromChain === toChain)}
            onClick={runPrimary}
            className="h-12 gap-2 font-black uppercase tracking-widest text-[10px]"
          >
            {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            {mode === "deposit" ? "Deposit" : "Transfer"}
          </Button>
        </div>

        {gateway.error && <p className="text-xs text-destructive">{gateway.error}</p>}
      </section>

      <section className="border border-border bg-card rounded-sm p-6 space-y-5">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">Gateway status</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Mode</p>
            <p className="text-sm font-bold uppercase">{mode}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">State</p>
            <p className="text-sm font-bold uppercase text-primary">{gateway.status}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Mint</p>
            <p className="text-sm font-bold uppercase">{mode === "spend" ? transferMode : "deposit"}</p>
          </div>
        </div>

        {feeRows.length > 0 && (
          <div className="border border-border bg-muted/10 p-4">
            <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-3">Estimated Fees</p>
            <div className="space-y-2">
              {feeRows.map((fee, index) => (
                <div key={index} className="flex justify-between text-[10px] font-mono">
                  <span>{fee.type ?? fee.feeType ?? `Fee ${index + 1}`}</span>
                  <span>{fmtFee(fee)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(gateway.lastDeposit || gateway.lastSpend) && (
          <div className="border border-primary/30 bg-primary/5 p-4">
            <p className="text-[9px] text-primary font-bold uppercase tracking-widest mb-2">Last transaction</p>
            <p className="text-xs font-mono break-all">{gateway.lastDeposit?.txHash ?? gateway.lastSpend?.txHash}</p>
          </div>
        )}
      </section>
    </div>
  );
}
