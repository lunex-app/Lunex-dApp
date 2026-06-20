import { useMemo } from "react";
import { Clock, Check, Loader2, X, RotateCw, Info, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  type BridgeTransaction,
  type BridgeStatus,
  loadBridgeTransactions,
} from "../state/bridgeState";
import { BRIDGE_CHAINS } from "../config/bridgeConfig";
import { useOnchainBridgeHistory } from "../hooks/useOnchainBridgeHistory";
import { useWallet } from "@/context/WalletProvider";

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

/** Merge locally-tracked (live, in-progress) txs with on-chain history. */
function mergeHistory(local: BridgeTransaction[], onchain: BridgeTransaction[]): BridgeTransaction[] {
  const byKey = new Map<string, BridgeTransaction>();
  const keyOf = (t: BridgeTransaction) => (t.burnTxHash || t.id).toLowerCase();

  // On-chain is the source of truth for confirmed transfers.
  for (const t of onchain) byKey.set(keyOf(t), t);
  // Local entries overlay: they carry richer/live status for in-progress txs and
  // any tx whose burn hasn't landed in the scan window yet.
  for (const t of local) {
    const k = keyOf(t);
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, t);
    } else if (existing.status !== "complete") {
      // Prefer the more advanced status; keep on-chain "complete" if it has it.
      byKey.set(k, { ...existing, ...t, status: t.status === "complete" ? "complete" : existing.status });
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function BridgeHistory({ onSelectTx, onResume }: BridgeHistoryProps) {
  const { address } = useWallet();
  const { rows: onchain, loading, refetch } = useOnchainBridgeHistory(address);

  const transactions = useMemo(
    () => mergeHistory(loadBridgeTransactions(), onchain),
    [onchain],
  );

  return (
    <div>
      <div className="flex items-center justify-between p-4 border-b border-border">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {address ? "On-chain bridge history" : "Connect a wallet to view history"}
        </p>
        <button
          onClick={() => refetch()}
          disabled={loading || !address}
          className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-primary disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {loading ? "Scanning" : "Refresh"}
        </button>
      </div>

      {transactions.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          {loading ? (
            <>
              <Loader2 className="h-8 w-8 text-muted-foreground/30 mx-auto animate-spin" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scanning chains on-chain…</p>
            </>
          ) : (
            <>
              <Clock className="h-8 w-8 text-muted-foreground/30 mx-auto" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No bridge transfers found</p>
            </>
          )}
        </div>
      ) : (
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
                    <span>{Number(tx.amount || 0).toFixed(2)} {tx.tokenSymbol ?? "USDC"}</span>
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
                    <RotateCw className="h-3 w-3" /> {tx.status === "failed" ? "Retry" : "Resume"}
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
      )}
    </div>
  );
}

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
  </svg>
);
