import { Clock, Check, Loader2, X, RotateCw, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type BridgeTransaction,
  type BridgeStatus,
  loadBridgeTransactions,
} from "../state/bridgeState";
import { BRIDGE_CHAINS, getExplorerTxUrl } from "../config/bridgeConfig";

interface BridgeHistoryProps {
  onResume: (tx: BridgeTransaction) => void;
}

function statusLabel(s: BridgeStatus) {
  switch (s) {
    case "approving":
      return "Approving";
    case "burning":
      return "Burning";
    case "waiting_attestation":
      return "Waiting attestation";
    case "minting":
      return "Minting";
    case "complete":
      return "Complete";
    case "failed":
      return "Failed";
    default:
      return s;
  }
}

function StatusIcon({ status }: { status: BridgeStatus }) {
  if (status === "complete")
    return <Check className="h-3.5 w-3.5 text-primary" />;
  if (status === "failed")
    return <X className="h-3.5 w-3.5 text-destructive" />;
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
}

function isResumable(tx: BridgeTransaction) {
  if (tx.status === "complete") return false;
  return tx.status === "waiting_attestation" || tx.status === "burning" || !!tx.burnTxHash;
}

export function BridgeHistory({ onResume }: BridgeHistoryProps) {
  const transactions = loadBridgeTransactions();

  if (transactions.length === 0) return null;

  return (
    <div className="mt-8 border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-xs font-bold uppercase tracking-wider">
          Bridge History
        </h3>
      </div>

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center gap-3 p-3 border border-border bg-background text-xs"
          >
            <StatusIcon status={tx.status} />

            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <span>{BRIDGE_CHAINS[tx.fromChain]?.label ?? tx.fromChain}</span>
                <span className="text-muted-foreground">→</span>
                <span>{BRIDGE_CHAINS[tx.toChain]?.label ?? tx.toChain}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>{tx.amount} USDC</span>
                <span>·</span>
                <span>{statusLabel(tx.status)}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {tx.burnTxHash && (
                <a
                  href={getExplorerTxUrl(tx.fromChain, tx.burnTxHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80"
                  title="View burn tx"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {isResumable(tx) && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1 px-2"
                  onClick={() => onResume(tx)}
                >
                  <RotateCw className="h-3 w-3" /> Resume
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
