import { useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { TokenIcon } from "@/components/TokenIcon";
import { TOKENS } from "@/config/wagmi";

const tokenList = Object.values(TOKENS);

interface TokenSelectorProps {
  selected: (typeof tokenList)[number];
  onSelect: (token: (typeof tokenList)[number]) => void;
  disabledSymbol?: string;
  balances?: Record<string, { formatted: string; isLoading?: boolean }>;
}

export function TokenSelector({ selected, onSelect, disabledSymbol, balances }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = tokenList.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
    );
  });

  const handleSelect = (token: (typeof tokenList)[number]) => {
    onSelect(token);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      {/* Pill trigger */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 bg-background rounded-full border border-border px-2.5 py-1.5 hover:border-primary/50 transition-colors shrink-0 shadow-sm"
      >
        <TokenIcon symbol={selected.symbol} size="sm" />
        <span className="font-bold text-xs text-foreground">{selected.symbol}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { setOpen(false); setSearch(""); } }}
        >
          <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-sm tracking-wide">Select Token</h3>
              <button
                onClick={() => { setOpen(false); setSearch(""); }}
                className="h-7 w-7 flex items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2.5 bg-muted rounded-xl px-3.5 py-2.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Search name or address…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground min-w-0"
                  autoFocus
                />
                {search && (
                  <button onClick={() => setSearch("")} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Token list */}
            <div className="overflow-y-auto max-h-64">
              {filtered.map((token) => {
                const bal = balances?.[token.symbol];
                const isSelected = token.symbol === selected.symbol;
                const isDisabled = token.symbol === disabledSymbol;
                return (
                  <button
                    key={token.symbol}
                    onClick={() => !isDisabled && handleSelect(token)}
                    disabled={isDisabled}
                    className={`w-full px-5 py-3.5 flex items-center gap-3.5 transition-colors
                      ${isSelected ? "bg-primary/10" : isDisabled ? "opacity-40 cursor-not-allowed" : "hover:bg-muted/60"}`}
                  >
                    <TokenIcon symbol={token.symbol} size="md" />
                    <div className="flex-1 text-left min-w-0">
                      <p className={`font-bold text-sm ${isSelected ? "text-primary" : "text-foreground"}`}>
                        {token.symbol}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{token.name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {bal?.isLoading ? (
                        <p className="text-xs text-muted-foreground font-mono">…</p>
                      ) : bal ? (
                        <p className="text-sm font-mono font-semibold">{bal.formatted}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground font-mono">—</p>
                      )}
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-8">No tokens found</p>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground text-center">Arc Network Testnet · {tokenList.length} tokens</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
