import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search } from "lucide-react";
import { TokenIcon } from "@/components/TokenIcon";
import { TOKENS } from "@/config/wagmi";

const tokenList = Object.values(TOKENS);

interface TokenSelectorProps {
  selected: (typeof tokenList)[number];
  onSelect: (token: (typeof tokenList)[number]) => void;
  disabledSymbol?: string;
}

export function TokenSelector({ selected, onSelect, disabledSymbol }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = tokenList.filter((t) => {
    const q = search.toLowerCase();
    return (
      t.symbol.toLowerCase().includes(q) ||
      t.name.toLowerCase().includes(q) ||
      t.address.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-3 bg-muted hover:bg-muted/80 transition-colors min-w-[160px]"
      >
        <TokenIcon symbol={selected.symbol} size="sm" />
        <div className="text-left">
          <span className="text-sm font-semibold text-foreground block leading-tight">{selected.symbol}</span>
          <span className="text-xs text-muted-foreground leading-tight">{selected.name}</span>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 border border-border bg-card shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted">
              <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                placeholder="Search name, symbol, or address..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none text-foreground placeholder:text-muted-foreground min-w-0"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filtered.map((token) => (
              <button
                key={token.symbol}
                onClick={() => {
                  onSelect(token);
                  setOpen(false);
                  setSearch("");
                }}
                disabled={token.symbol === disabledSymbol}
                className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors min-h-[48px] ${
                  token.symbol === selected.symbol
                    ? "bg-primary/10 text-primary"
                    : token.symbol === disabledSymbol
                    ? "opacity-40 cursor-not-allowed"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <TokenIcon symbol={token.symbol} size="sm" />
                <div className="flex-1 min-w-0">
                  <span className="font-semibold block">{token.symbol}</span>
                  <span className="text-xs text-muted-foreground">{token.name}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                  {token.address.slice(0, 6)}...{token.address.slice(-4)}
                </span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No tokens found on Arc Network</p>
            )}
          </div>
          <div className="p-2 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">Arc Network Testnet</p>
          </div>
        </div>
      )}
    </div>
  );
}
