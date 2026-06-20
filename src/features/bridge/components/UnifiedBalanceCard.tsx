import { Loader2, RotateCw, Wallet } from "lucide-react";
import { BRIDGE_CHAIN_KEYS, BRIDGE_CHAINS } from "../config/bridgeConfig";
import type { BridgeChainKey } from "../config/bridgeConfig";

interface UnifiedBalanceCardProps {
  walletTotal: string;
  gatewayTotal: number;
  gatewayPendingTotal: number;
  balancesByChain: Record<string, { formatted: string; nativeFormatted: string }>;
  gatewayByChain: Record<string, { confirmed: string; pending: string }>;
  loading: boolean;
  gatewayLoading: boolean;
  gatewayError: string | null;
  onRefresh: () => void;
}

const fmt = (value: number | string) =>
  Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function UnifiedBalanceCard({
  walletTotal,
  gatewayTotal,
  gatewayPendingTotal,
  balancesByChain,
  gatewayByChain,
  loading,
  gatewayLoading,
  gatewayError,
  onRefresh,
}: UnifiedBalanceCardProps) {
  return (
    <section className="mb-8 border border-primary/30 bg-primary/5 rounded-sm overflow-hidden">
      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <Wallet className="h-5 w-5 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Circle Unified Balance</span>
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Gateway USDC</p>
              <p className="text-3xl font-black font-mono text-primary">
                {gatewayLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : `$${fmt(gatewayTotal)}`}
              </p>
              {gatewayPendingTotal > 0 && <p className="text-[10px] text-yellow-500 font-mono">+${fmt(gatewayPendingTotal)} pending</p>}
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest">Wallet USDC/EURC</p>
              <p className="text-3xl font-black font-mono">{loading ? "..." : `$${walletTotal}`}</p>
            </div>
          </div>
          {gatewayError && <p className="text-[10px] text-yellow-500 font-mono max-w-xl">{gatewayError}</p>}
        </div>
        <button
          onClick={onRefresh}
          className="h-9 px-3 border border-primary/30 text-primary hover:bg-primary/10 transition-colors text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
        >
          <RotateCw className={`h-3 w-3 ${loading || gatewayLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 border-t border-primary/20">
        {BRIDGE_CHAIN_KEYS.map((chainKey: BridgeChainKey) => {
          const chain = BRIDGE_CHAINS[chainKey];
          const wallet = balancesByChain[chainKey];
          const gateway = gatewayByChain[chainKey];
          return (
            <div key={chainKey} className="p-4 border-r border-b border-primary/10 last:border-r-0">
              <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground mb-2">{chain.label}</p>
              <p className="text-xs font-bold font-mono">{fmt(gateway?.confirmed ?? 0)} Gateway</p>
              <p className="text-[10px] font-mono text-muted-foreground">{fmt(wallet?.formatted ?? 0)} wallet</p>
              <p className="text-[9px] font-mono text-muted-foreground">
                {Number(wallet?.nativeFormatted || 0).toFixed(chainKey === "arc" ? 2 : 5)} {chain.nativeSymbol} gas
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
