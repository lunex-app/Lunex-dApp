import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BRIDGE_CHAINS, BRIDGE_CHAIN_KEYS, type BridgeChainKey } from "../config/bridgeConfig";

import lunexLogo from "@/assets/lunex-logo.png";
import arcLogo from "@/assets/arc-logo.png";

const SVGO = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const chainIcons: Record<string, string> = {
  ethereum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  avalanche: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png",
  arbitrum: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/info/logo.png",
  base: "https://assets.coingecko.com/asset_platforms/images/131/large/base.png",
  polygon: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png",
  arc: arcLogo
};

interface ChainSelectorProps {
  fromChain: BridgeChainKey;
  toChain: BridgeChainKey;
  onFromChange: (chain: BridgeChainKey) => void;
  onToChange: (chain: BridgeChainKey) => void;
  onSwap: () => void;
  disabled?: boolean;
}

export function ChainSelector({
  fromChain,
  toChain,
  onFromChange,
  onToChange,
  onSwap,
  disabled,
}: ChainSelectorProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          From
        </p>
        <Select
          value={fromChain}
          onValueChange={(v) => onFromChange(v as BridgeChainKey)}
          disabled={disabled}
        >
          <SelectTrigger className="bg-background border-border text-sm font-semibold h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BRIDGE_CHAIN_KEYS.filter((k) => k !== toChain).map((k) => (
              <SelectItem key={k} value={k}>
                <span className="flex items-center gap-2">
                  <img src={chainIcons[k]} alt={k} className="h-4 w-4 rounded-full object-contain" />
                  <span>{BRIDGE_CHAINS[k].label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="outline"
        size="icon"
        className="shrink-0 h-9 w-9 border-border mt-4"
        onClick={onSwap}
        disabled={disabled}
      >
        <ArrowRightLeft className="h-4 w-4" />
      </Button>

      <div className="flex-1 space-y-1">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          To
        </p>
        <Select
          value={toChain}
          onValueChange={(v) => onToChange(v as BridgeChainKey)}
          disabled={disabled}
        >
          <SelectTrigger className="bg-background border-border text-sm font-semibold h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BRIDGE_CHAIN_KEYS.filter((k) => k !== fromChain).map((k) => (
              <SelectItem key={k} value={k}>
                <span className="flex items-center gap-2">
                  <img src={chainIcons[k]} alt={k} className="h-4 w-4 rounded-full object-contain" />
                  <span>{BRIDGE_CHAINS[k].label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
