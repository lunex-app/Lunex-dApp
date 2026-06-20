import { Check, Loader2, X, RotateCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BridgeTransaction, type BridgeStatus } from "../state/bridgeState";
import { getExplorerTxUrl, type BridgeChainKey, BRIDGE_CHAINS } from "../config/bridgeConfig";

interface BridgeProgressProps {
  status: BridgeStatus;
  burnTxHash?: string;
  mintTxHash?: string;
  fromChain: BridgeChainKey;
  toChain: BridgeChainKey;
  bridgeTx?: BridgeTransaction | null;
  error?: string | null;
  onRetry?: () => void;
  onReset?: () => void;
  onMint?: () => void;
  attestationReady?: boolean;
}

const STEPS = [
  { key: "burning", label: "Burning source asset" },
  { key: "waiting_attestation", label: "Waiting for attestation" },
  { key: "minting", label: "Minting on destination" },
  { key: "complete", label: "Bridge complete" },
] as const;

function stepIndex(status: BridgeStatus): number {
  if (status === "approving") return 0;
  if (status === "burning") return 0;
  if (status === "waiting_attestation") return 1;
  if (status === "minting") return 2;
  if (status === "complete") return 3;
  return -1;
}

export function BridgeProgress({
  status,
  burnTxHash,
  mintTxHash,
  fromChain,
  toChain,
  bridgeTx,
  error,
  onRetry,
  onReset,
  onMint,
  attestationReady,
}: BridgeProgressProps) {
  const currentStep = stepIndex(status);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative border border-border bg-card p-8 max-w-sm w-full space-y-6">
        <div className="flex items-center gap-3 border-b border-border/50 pb-4">
           {onReset && (
             <button onClick={onReset} className="p-1 hover:bg-muted rounded-full transition-colors">
               <RotateCw className="h-4 w-4" />
             </button>
           )}
           <h3 className="text-lg font-bold uppercase tracking-wider flex-1 text-center">Bridge Progress</h3>
        </div>

        <div className="space-y-4">
          {STEPS.map((step, i) => {
            const isActive = i === currentStep && status !== "complete" && status !== "failed";
            const isDone = i < currentStep || status === "complete";
            const isFailed = status === "failed" && i === currentStep;

            return (
              <div key={step.key} className="flex items-center gap-3">
                <div
                  className={`h-8 w-8 flex items-center justify-center border text-xs font-bold shrink-0 ${
                    isDone
                      ? "bg-primary text-primary-foreground border-primary"
                      : isActive
                      ? "border-primary text-primary animate-pulse"
                      : isFailed
                      ? "border-destructive text-destructive"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {isDone ? (
                    <Check className="h-4 w-4" />
                  ) : isActive ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isFailed ? (
                    <X className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p
                    className={`text-xs font-semibold tracking-wider ${
                      isDone
                        ? "text-primary"
                        : isActive
                        ? "text-foreground"
                        : isFailed
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {step.label}
                  </p>
                  {step.key === "waiting_attestation" && isActive && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      This may take several minutes to reach finality
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Transaction links */}
        <div className="space-y-2 text-xs flex flex-col items-center">
          {burnTxHash && (
            <a
              href={getExplorerTxUrl(fromChain, burnTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-primary hover:underline font-mono"
            >
              View Burn TX <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {mintTxHash && (
            <a
              href={getExplorerTxUrl(toChain, mintTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1 text-primary hover:underline font-mono"
            >
              View Mint TX <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        {/* Error state */}
        {status === "failed" && error && (
          <div className="border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive text-center">
            {error}
          </div>
        )}

        {/* Receipt Details on Complete */}
        {status === "complete" && bridgeTx?.amountIn && (
          <div className="bg-primary/5 border border-primary/20 p-4 rounded-sm space-y-3 animate-in zoom-in-95 duration-300">
             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
               <span className="text-muted-foreground">Original Deposit</span>
               <span className="text-foreground">{bridgeTx.amountIn} {bridgeTx.tokenSymbol ?? "USDC"} ({BRIDGE_CHAINS[fromChain].label})</span>
             </div>
             <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
               <span className="text-muted-foreground">Final Settlement</span>
               <span className="text-primary font-mono">{bridgeTx.amountOut} {bridgeTx.tokenSymbol ?? "USDC"} ({BRIDGE_CHAINS[toChain].label})</span>
             </div>
             {bridgeTx.gasTopUpAmount && (
               <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                 <span className="text-muted-foreground">Gas Top-Up</span>
                 <span className="text-yellow-500 font-mono">
                   {bridgeTx.gasTopUpAmount} {bridgeTx.tokenSymbol ?? "USDC"} requested · {bridgeTx.gasTopUpStatus ?? "requested"}
                 </span>
               </div>
             )}
             {bridgeTx.gasTopUpStatus === "relayer_pending" && (
               <p className="text-[9px] text-yellow-500 leading-relaxed">
                 Destination funds were minted to the Lunex top-up relayer. Native gas delivery completes after the funded relayer operator processes this request.
               </p>
             )}
             <div className="h-px bg-primary/10 w-full" />
             <p className="text-[9px] text-center text-muted-foreground uppercase font-bold tracking-[0.2em]">Cross-Chain Routing Successful</p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2 pt-2">
          {status === "failed" && onRetry && (
            <Button variant="outline" onClick={onRetry} className="w-full gap-2 font-bold uppercase tracking-widest h-11">
              <RotateCw className="h-4 w-4" /> Try Again
            </Button>
          )}
          {status === "waiting_attestation" && attestationReady && onMint && (
            <Button
              className="bg-primary text-primary-foreground w-full uppercase tracking-widest font-black h-11"
              onClick={onMint}
            >
              Finalize Settlement
            </Button>
          )}
          {status === "waiting_attestation" && onReset && (
            <Button variant="ghost" className="w-full text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground" onClick={onReset}>
              Continue in History Tab
            </Button>
          )}
          {(status === "complete" || status === "failed") && onReset && (
            <Button className="w-full font-bold uppercase tracking-widest h-11" onClick={onReset}>
              Close Receipt
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
