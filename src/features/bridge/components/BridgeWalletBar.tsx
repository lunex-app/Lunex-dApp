import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Wallet, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Connected-wallet bar for the bridge tabs (CCTP / Gateway / Recovery). These
 * flows need a multi-chain EOA (RainbowKit: injected or WalletConnect/mobile),
 * separate from the Circle app login. When connected it shows the address, the
 * source-chain USDC/EURC balance, and a disconnect button; otherwise a connect
 * button. Lives only inside the bridge tabs.
 */
export function BridgeWalletBar({
  usdc,
  eurc,
  chainLabel,
  showBalances = true,
}: {
  usdc?: string;
  eurc?: string;
  chainLabel?: string;
  showBalances?: boolean;
}) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  if (!isConnected || !address) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <p className="text-[11px] leading-relaxed text-amber-500">
          Connect a wallet (MetaMask or mobile via WalletConnect) to move USDC across chains.
        </p>
        <Button
          onClick={() => openConnectModal?.()}
          className="h-8 shrink-0 gap-2 font-black uppercase tracking-widest text-[10px]"
        >
          <Wallet className="h-3.5 w-3.5" /> Connect
        </Button>
      </div>
    );
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-1.5 w-1.5 rounded-full bg-green-500" />
        <span className="font-mono text-xs font-bold text-foreground">{short}</span>
      </div>
      {showBalances && (usdc != null || eurc != null) && (
        <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
          {usdc != null && (
            <span>
              <span className="font-bold text-foreground">{usdc}</span> USDC
            </span>
          )}
          {eurc != null && (
            <span>
              <span className="font-bold text-foreground">{eurc}</span> EURC
            </span>
          )}
          {chainLabel && <span className="text-primary">· {chainLabel}</span>}
        </div>
      )}
      <button
        onClick={() => disconnect()}
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" /> Disconnect
      </button>
    </div>
  );
}
