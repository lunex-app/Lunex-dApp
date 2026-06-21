import { useState } from "react";
import { Search, Loader2, ExternalLink, X } from "lucide-react";
import { fetchWalletActivity, isAddress, type WalletActivity } from "@/lib/walletActivity";
import { EXPLORER_URL } from "@/config/wagmi";

const usd = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString();
const when = (ts: number | null) => (ts ? new Date(ts * 1000).toLocaleDateString() : "—");

/**
 * Search any wallet's Lunex activity (swaps, liquidity, vaults, bridge), read
 * live on-chain. Used on the public Analytics and the portfolio Dashboard.
 */
export function WalletSearch({ initialAddress }: { initialAddress?: string }) {
  const [input, setInput] = useState(initialAddress ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WalletActivity | null>(null);

  const run = async () => {
    const addr = input.trim();
    if (!isAddress(addr)) {
      setError("Enter a valid wallet address (0x…).");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      setData(await fetchWalletActivity(addr));
    } catch {
      setError("Couldn't read this wallet's activity. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setData(null);
    setError(null);
    setInput("");
  };

  return (
    <div className="border border-border bg-card rounded-sm p-6">
      <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
        <Search className="h-4 w-4" /> Wallet Lookup
      </h2>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Search any wallet address (0x…)"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-background pl-9 pr-9 py-2.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {input && (
            <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Clear">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 text-[11px] font-black uppercase tracking-widest text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {error && <p className="mt-3 text-[11px] text-destructive">{error}</p>}

      {data && (
        <div className="mt-6 space-y-5 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a
              href={`${EXPLORER_URL}/address/${data.address}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-primary hover:underline break-all"
            >
              {data.address} ↗
            </a>
            <span className="text-[10px] font-mono text-muted-foreground">
              {when(data.firstActive)} → {when(data.lastActive)}
            </span>
          </div>

          {data.txCount === 0 ? (
            <p className="text-xs text-muted-foreground">No Lunex activity found for this wallet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ["Total Volume", usd(data.totalVolumeUsd)],
                  ["Transactions", num(data.txCount)],
                  ["Swaps", `${num(data.swapCount)} · ${usd(data.swapVolumeUsd)}`],
                  ["Bridge", `${num(data.bridgeCount)} · ${usd(data.bridgeVolumeUsd)}`],
                ].map(([label, value]) => (
                  <div key={label} className="border border-border rounded-sm p-3 bg-muted/10">
                    <p className="text-[9px] uppercase tracking-widest font-bold text-muted-foreground mb-1">{label}</p>
                    <p className="font-mono text-sm font-bold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground uppercase tracking-wider">
                      <th className="py-2 pr-3 font-semibold">Time</th>
                      <th className="py-2 pr-3 font-semibold">Action</th>
                      <th className="py-2 pr-3 font-semibold">Detail</th>
                      <th className="py-2 font-semibold">Tx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((h, i) => (
                      <tr key={`${h.txHash}-${i}`} className="border-b border-border/50">
                        <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                          {h.ts ? new Date(h.ts * 1000).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-2 pr-3 font-bold">{h.action}</td>
                        <td className="py-2 pr-3 font-mono">{h.detail}</td>
                        <td className="py-2">
                          <a href={`${EXPLORER_URL}/tx/${h.txHash}`} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
