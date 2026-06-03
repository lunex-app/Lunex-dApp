import { useState } from "react";
import { AlertCircle, Check, Loader2, RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBridgeResume } from "../hooks/useBridgeResume";
import { BRIDGE_CHAINS, getExplorerTxUrl } from "../config/bridgeConfig";

const isTxHash = (value: string) => /^0x[a-fA-F0-9]{64}$/.test(value.trim());

export function BridgeRecoveryPanel() {
  const [txHash, setTxHash] = useState("");
  const recovery = useBridgeResume();
  const cleanHash = txHash.trim();
  const canSearch = isTxHash(cleanHash) && recovery.stage !== "scanning";

  return (
    <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
      <section className="border border-border bg-card p-6 rounded-sm space-y-5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary mb-2">CCTP Recovery</p>
          <h2 className="text-2xl font-bold uppercase tracking-tight">Recover a Stuck Burn</h2>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Paste the burn transaction hash from any supported CCTP transfer. Lunex scans supported chains, extracts the Circle message, fetches attestation, and lets the originating wallet complete minting on the destination chain.
          </p>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Burn transaction hash</label>
          <Input
            value={txHash}
            onChange={(event) => setTxHash(event.target.value)}
            placeholder="0x..."
            className="font-mono text-xs h-12"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-2">
          <Button
            disabled={!canSearch}
            onClick={() => recovery.findTransaction(cleanHash)}
            className="h-11 gap-2 font-black uppercase tracking-widest text-[10px]"
          >
            {recovery.stage === "scanning" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Fetch
          </Button>
          <Button
            variant="outline"
            disabled={recovery.stage !== "tx-found"}
            onClick={recovery.fetchAttestation}
            className="h-11 gap-2 font-black uppercase tracking-widest text-[10px]"
          >
            {recovery.stage === "polling-attestation" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            Attest
          </Button>
          <Button
            variant="outline"
            disabled={recovery.stage !== "ready-to-mint" || recovery.bridgeDetails?.status === "completed"}
            onClick={recovery.completeMint}
            className="h-11 gap-2 font-black uppercase tracking-widest text-[10px]"
          >
            {recovery.stage === "minting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Complete
          </Button>
        </div>

        {recovery.errorVisible && (
          <div className="flex gap-3 border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <p>{recovery.errorVisible}</p>
          </div>
        )}
      </section>

      <section className="border border-border bg-card p-6 rounded-sm">
        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground mb-5">Detected transfer</p>
        {recovery.bridgeDetails ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Source</p>
                <p className="text-sm font-bold">{recovery.bridgeDetails.fromChain}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Destination</p>
                <p className="text-sm font-bold">{recovery.bridgeDetails.toChain}</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Amount</p>
                <p className="text-xl font-black font-mono">{Number(recovery.bridgeDetails.amount || 0).toFixed(6)} USDC</p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Stage</p>
                <p className="text-[10px] font-black uppercase text-primary tracking-widest">{recovery.stage.replaceAll("-", " ")}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Completion</p>
                <p className="text-sm font-bold uppercase">
                  {recovery.bridgeDetails.status === "completed"
                    ? "Already completed"
                    : recovery.bridgeDetails.status === "attested"
                      ? "Attestation ready"
                      : "Not minted yet"}
                </p>
              </div>
            </div>
            {recovery.bridgeDetails.attestationStatus && (
              <div className="border border-border bg-muted/20 p-3">
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Circle Iris status</p>
                <p className="text-xs font-mono uppercase">{recovery.bridgeDetails.attestationStatus}</p>
              </div>
            )}
            {recovery.bridgeDetails.completionTxHash && recovery.bridgeDetails.toChainKey && (
              <a
                href={getExplorerTxUrl(recovery.bridgeDetails.toChainKey, recovery.bridgeDetails.completionTxHash)}
                target="_blank"
                rel="noreferrer"
                className="block text-[10px] text-primary font-black uppercase tracking-widest hover:underline"
              >
                View completed destination mint
              </a>
            )}
            {recovery.txSender && (
              <div className="border border-border bg-muted/20 p-3">
                <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Originating wallet</p>
                <p className="text-xs font-mono break-all">{recovery.txSender}</p>
              </div>
            )}
            {recovery.mintTxHash && recovery.bridgeDetails.toChainKey && (
              <a
                href={getExplorerTxUrl(recovery.bridgeDetails.toChainKey, recovery.mintTxHash)}
                target="_blank"
                rel="noreferrer"
                className="block text-[10px] text-primary font-black uppercase tracking-widest hover:underline"
              >
                View recovered mint on {BRIDGE_CHAINS[recovery.bridgeDetails.toChainKey].label}
              </a>
            )}
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-muted-foreground">
            No recovery transaction loaded.
          </div>
        )}
      </section>
    </div>
  );
}
