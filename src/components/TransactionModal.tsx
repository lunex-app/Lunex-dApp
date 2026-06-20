import { Loader2, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXPLORER_URL } from "@/config/wagmi";

type Stage = "approve-wallet" | "approve-pending" | "verifying" | "approve-success" | "action-wallet" | "action-pending" | "success" | "error" | null;

interface TransactionModalProps {
  stage: Stage;
  approveLabel?: string;
  actionLabel?: string;
  successSummary?: string;
  txHash?: string;
  errorMessage?: string;
  onClose: () => void;
  onRetry?: () => void;
}

export function computeTxStage(s: {
  approveError?: Error | null;
  actionError?: Error | null;
  isConfirmed?: boolean;
  isActionPending?: boolean;
  actionTxHash?: string;
  isActionConfirming?: boolean;
  isApprovePending?: boolean;
  approveTxHash?: string;
  isApproveConfirming?: boolean;
  isApproved?: boolean;
  isAllowanceLoading?: boolean;
}): Stage {
  if (s.approveError || s.actionError) return "error";
  if (s.isConfirmed) return "success";
  // "verifying" only applies AFTER an approval tx was actually submitted — not on
  // the initial allowance fetch (which would flash the modal on page load).
  if (s.approveTxHash && s.isApproved && s.isAllowanceLoading) return "verifying";
  if (s.isApproved && !s.isActionPending && !s.actionTxHash && s.approveTxHash) return "approve-success";
  if (s.actionTxHash && s.isActionConfirming) return "action-pending";
  if (s.isActionPending) return "action-wallet";
  if (s.approveTxHash && s.isApproveConfirming) return "approve-pending";
  if (s.isApprovePending) return "approve-wallet";
  return null;
}

export function TransactionModal({ stage, approveLabel, actionLabel, successSummary, txHash, errorMessage, onClose, onRetry }: TransactionModalProps) {
  if (!stage) return null;
  const link = txHash ? `${EXPLORER_URL}/tx/${txHash}` : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative border border-border bg-card p-8 max-w-sm w-full mx-4 text-center">
        {stage === "approve-wallet" && (
          <>
            <Loader2 className="h-12 w-12 text-orange-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Confirm in Wallet</h3>
            <p className="text-sm text-muted-foreground mb-2">Please confirm the approval in your wallet</p>
            {approveLabel && <p className="text-xs text-muted-foreground font-mono">{approveLabel}</p>}
          </>
        )}
        {stage === "approve-pending" && (
          <>
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Approval Pending</h3>
            <p className="text-sm text-muted-foreground mb-2">Waiting for approval to confirm on Arc Network...</p>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline font-mono inline-flex items-center gap-1">
                {txHash!.slice(0, 10)}...{txHash!.slice(-8)} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        )}
        {stage === "verifying" && (
          <>
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Verifying Approval</h3>
            <p className="text-sm text-muted-foreground mb-2">Transaction confirmed! Synchronizing onchain state...</p>
          </>
        )}
        {stage === "approve-success" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Approval Confirmed</h3>
            <p className="text-sm text-muted-foreground mb-3">You can now proceed with the transaction.</p>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono mb-4 block">
                View on ArcScan <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button onClick={onClose} className="w-full mt-3 bg-primary text-primary-foreground">Continue</Button>
          </>
        )}
        {stage === "action-wallet" && (
          <>
            <Loader2 className="h-12 w-12 text-orange-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Confirm Transaction</h3>
            <p className="text-sm text-muted-foreground mb-2">Please confirm the transaction in your wallet</p>
            {actionLabel && <p className="text-xs text-muted-foreground font-mono">{actionLabel}</p>}
          </>
        )}
        {stage === "action-pending" && (
          <>
            <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Transaction Pending</h3>
            <p className="text-sm text-muted-foreground mb-2">Waiting for confirmation on Arc Network...</p>
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline font-mono inline-flex items-center gap-1">
                {txHash!.slice(0, 10)}...{txHash!.slice(-8)} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </>
        )}
        {stage === "success" && (
          <>
            <CheckCircle2 className="h-12 w-12 text-green mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Transaction Confirmed</h3>
            {successSummary && <p className="text-sm text-muted-foreground mb-3">{successSummary}</p>}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono mb-4 block">
                View on ArcScan <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button onClick={onClose} className="w-full mt-3 bg-primary text-primary-foreground">Done</Button>
          </>
        )}
        {stage === "error" && (
          <>
            <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Transaction Failed</h3>
            {errorMessage && <p className="text-sm text-muted-foreground mb-3 break-words">{errorMessage.slice(0, 200)}</p>}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-mono mb-4 block">
                View on ArcScan <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button onClick={onRetry || onClose} className="w-full mt-3" variant="outline">Try Again</Button>
          </>
        )}
      </div>
    </div>
  );
}
