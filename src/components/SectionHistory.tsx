import { ExternalLink } from "lucide-react";
import { EXPLORER_URL } from "@/config/wagmi";
import type { SectionTx } from "@/hooks/useSectionHistory";

interface Column {
  key: string;
  label: string;
}

interface SectionHistoryProps {
  transactions: SectionTx[];
  columns: Column[];
  section: string;
}

export function SectionHistory({ transactions, columns }: SectionHistoryProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-muted-foreground tracking-wider uppercase">No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-muted-foreground tracking-wider uppercase font-semibold">Time</th>
            {columns.map((col) => (
              <th key={col.key} className="text-left py-2 px-3 text-muted-foreground tracking-wider uppercase font-semibold">
                {col.label}
              </th>
            ))}
            <th className="text-left py-2 px-3 text-muted-foreground tracking-wider uppercase font-semibold">Tx</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
              <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                {new Date(tx.timestamp).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              {columns.map((col) => (
                <td key={col.key} className="py-2 px-3 font-mono text-foreground whitespace-nowrap">
                  {tx.data[col.key] || "—"}
                </td>
              ))}
              <td className="py-2 px-3">
                <a
                  href={`${EXPLORER_URL}/tx/${tx.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-mono inline-flex items-center gap-1"
                >
                  {tx.txHash.slice(0, 6)}...{tx.txHash.slice(-4)}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
