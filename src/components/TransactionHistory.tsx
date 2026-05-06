import { ExternalLink, Clock, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTransactionHistory, getExplorerTxUrl, type Transaction } from "@/hooks/useTransactionHistory";

const statusIcon = (status: Transaction["status"]) => {
  switch (status) {
    case "pending": return <Clock className="h-3.5 w-3.5 text-yellow-400 animate-pulse" />;
    case "confirmed": return <CheckCircle2 className="h-3.5 w-3.5 text-green" />;
    case "failed": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
  }
};

const typeLabel = (type: Transaction["type"]) => {
  const labels: Record<string, string> = {
    swap: "SWAP",
    add_liquidity: "ADD LIQUIDITY",
    remove_liquidity: "REMOVE LIQUIDITY",
    deposit: "VAULT DEPOSIT",
    withdraw: "VAULT WITHDRAW",
    approve: "APPROVE",
  };
  return labels[type] || type;
};

const TransactionHistory = () => {
  const { transactions, clearHistory } = useTransactionHistory();

  if (transactions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-muted-foreground tracking-wider uppercase">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wider uppercase text-foreground">Recent Transactions</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={clearHistory}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="h-3 w-3 mr-1" /> Clear
        </Button>
      </div>
      <div className="space-y-px">
        {transactions.slice(0, 10).map((tx) => (
          <a
            key={tx.hash}
            href={getExplorerTxUrl(tx.hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 hover:bg-muted/30 transition-colors group"
          >
            <div className="flex items-center gap-3">
              {statusIcon(tx.status)}
              <div>
                <p className="text-xs font-semibold text-foreground tracking-wider">{typeLabel(tx.type)}</p>
                <p className="text-xs text-muted-foreground">{tx.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-mono">
                {new Date(tx.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <ExternalLink className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};

export default TransactionHistory;
