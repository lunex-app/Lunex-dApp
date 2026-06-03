import { Clock, Check, Loader2, X, RotateCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type BridgeTransaction,
  type BridgeStatus,
  loadBridgeTransactions,
} from "../state/bridgeState";
import { BRIDGE_CHAINS } from "../config/bridgeConfig";

interface BridgeHistoryProps {
  onSelectTx?: (tx: BridgeTransaction) => void;
  onResume?: (tx: BridgeTransaction) => void;
}

function statusLabel(s: BridgeStatus) {
  switch (s) {
    case "approving": return "Approving";
    case "burning": return "Burning";
    case "waiting_attestation": return "Waiting for Circle";
    case "minting": return "Minting on Destination";
    case "complete": return "Complete";
    case "failed": return "Failed";
    default: return s;
  }
}

function StatusIcon({ status }: { status: BridgeStatus }) {
  if (status === "complete") return <Check className="h-3.5 w-3.5 text-primary" />;
  if (status === "failed") return <X className="h-3.5 w-3.5 text-destructive" />;
  return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
}

function isResumable(tx: BridgeTransaction) {
  if (tx.status === "complete") return false;
  return tx.status === "waiting_attestation" || tx.status === "burning" || !!tx.burnTxHash;
}

export function BridgeHistory({ onSelectTx, onResume }: BridgeHistoryProps) {
  const transactions = loadBridgeTransactions();

  if (transactions.length === 0) {
    return (
      <div className="p-12 text-center space-y-3">
        <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No transaction history found</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border">
      {transactions.map((tx) => (
        <div
          key={tx.id}
          className="group flex items-center justify-between p-4 hover:bg-muted/10 transition-colors cursor-pointer"
          onClick={() => onSelectTx?.(tx)}
        >
          <div className="flex items-center gap-4 flex-1">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center border ${
              tx.status === 'complete' ? 'bg-primary/10 border-primary/30' : 'bg-muted border-border'
            }`}>
               <StatusIcon status={tx.status} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider">{BRIDGE_CHAINS[tx.fromChain]?.label}</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-black uppercase tracking-wider">{BRIDGE_CHAINS[tx.toChain]?.label}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                <span>{tx.amount} ASSETS</span>
                <span>·</span>
                <span className={tx.status === 'complete' ? 'text-primary' : 'text-yellow-500'}>{statusLabel(tx.status)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            {isResumable(tx) && onResume && (
              <Button
                size="sm"
                className="h-8 text-[9px] font-black uppercase tracking-widest gap-2 bg-primary text-primary-foreground"
                onClick={() => onResume(tx)}
              >
                <RotateCw className="h-3 w-3" /> Resume
              </Button>
            )}
            <button 
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => onSelectTx?.(tx)}
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
  </svg>
);
