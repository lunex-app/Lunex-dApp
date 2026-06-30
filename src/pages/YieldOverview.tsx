import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletProvider";
import { useVaultData } from "@/hooks/useVaultData";
import { SectionHistory } from "@/components/SectionHistory";
import { useSectionHistory } from "@/hooks/useSectionHistory";
import EmptyState from "@/components/EmptyState";
import BackButton from "@/components/BackButton";
import { useUnifiedBalance } from "@/features/bridge/hooks/useUnifiedBalance";
import { Wallet, Loader2 } from "lucide-react";
import { formatApy, useDynamicApy } from "@/hooks/useApy";

const YIELD_COLUMNS = [
  { key: "action", label: "Action" },
  { key: "token", label: "Token" },
  { key: "amount", label: "Amount" },
  { key: "shares", label: "Shares" },
];

const YieldOverview = () => {
  const { isConnected } = useWallet();
  const usdcVault = useVaultData("USDC");
  const eurcVault = useVaultData("EURC");
  const usdtVault = useVaultData("USDT");
  const history = useSectionHistory("yield");
  const { formattedTotal: globalBalance, isLoading: globalBalanceLoading } = useUnifiedBalance();
  const usdcApy = useDynamicApy("vault-usdc-share-price", usdcVault.sharePrice, 0);
  const eurcApy = useDynamicApy("vault-eurc-share-price", eurcVault.sharePrice, 0);
  const usdtApy = useDynamicApy("vault-usdt-share-price", usdtVault.sharePrice, 0);
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const hasPositions = usdcVault.userShares > 0 || eurcVault.userShares > 0 || usdtVault.userShares > 0;

  const vaults = [
    { token: "USDC" as const, share: "luneUSDC", tvl: usdcVault.totalAssets, sharePrice: usdcVault.sharePrice, userShares: usdcVault.userShares, userDeposited: usdcVault.userDeposited, route: "/yield/usdc", accent: "teal", apy: usdcApy },
    { token: "EURC" as const, share: "luneEURC", tvl: eurcVault.totalAssets, sharePrice: eurcVault.sharePrice, userShares: eurcVault.userShares, userDeposited: eurcVault.userDeposited, route: "/yield/eurc", accent: "purple", apy: eurcApy },
    { token: "USDT" as const, share: "luneUSDT", tvl: usdtVault.totalAssets, sharePrice: usdtVault.sharePrice, userShares: usdtVault.userShares, userDeposited: usdtVault.userDeposited, route: "/yield/usdt", accent: "green", apy: usdtApy },
  ];

  const [claimedRewards, setClaimedRewards] = useState(false);

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <div className="mb-10">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">Yield Vaults</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Institutional auto-compounding ERC-4626 standard strategies</p>
      </div>

      {isConnected && (
        <div className="flex items-center justify-between px-6 py-4 mb-8 bg-primary/10 border border-primary/30 rounded-sm">
          <div className="flex items-center gap-3">
             <Wallet className="h-4 w-4 text-primary" />
             <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Global Unified Balance</span>
          </div>
          {globalBalanceLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          ) : (
            <span className="font-mono text-sm font-bold text-primary">
              {globalBalance} USDC
            </span>
          )}
        </div>
      )}

      {isConnected && (
         <div className="mb-12">
            {hasPositions ? (
               <div className="border border-border bg-card rounded-sm overflow-hidden shadow-sm">
                  <div className="px-6 py-4 border-b border-border bg-muted/30 flex justify-between items-center">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-primary">Your Yield Distribution</span>
                     <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[8px] font-bold tracking-widest uppercase">Share-price tracked</span>
                  </div>
                  <div className="grid md:grid-cols-2 divide-x divide-border">
                     {vaults.filter(v => v.userShares > 0).map(v => (
                        <div key={v.token} className="p-8 space-y-4">
                           <div className="flex items-center gap-3">
                              <div className={`h-8 w-8 rounded-full border border-border flex items-center justify-center font-bold text-xs ${v.accent === "teal" ? "bg-[#2775CA] text-white" : v.accent === "purple" ? "bg-[#3D8FFD] text-white" : "bg-[#26A17B] text-white"}`}>{v.token[0]}</div>
                              <div>
                                 <h4 className="text-lg font-bold">{v.share}</h4>
                                 <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Active Position</p>
                              </div>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                              <div>
                                 <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Shares</p>
                                 <p className="text-sm font-bold font-mono">{v.userShares.toFixed(6)}</p>
                              </div>
                              <div>
                                 <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Estimated Value</p>
                                 <p className="text-sm font-bold font-mono">${fmt(v.userDeposited)}</p>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            ) : (
               <div className="border border-border bg-card rounded-sm"><EmptyState variant="deposits" title="No active yield positions" description="Initialize a position in one of our auto-compounding vaults to begin earning standard protocol yield." /></div>
            )}
         </div>
      )}

      <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase mb-6 text-muted-foreground border-b border-border pb-4">Standardized Strategy Index</h3>
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        {vaults.map((v) => (
          <div key={v.token} className="border border-border bg-card rounded-sm p-8 shadow-sm relative overflow-hidden group hover:border-primary/50 transition-colors">
            <div className={`absolute top-0 right-0 w-32 h-32 opacity-[0.03] rotate-45 transform translate-x-12 -translate-y-12 transition-all group-hover:opacity-[0.05] ${v.accent === "teal" ? "bg-[#2775CA]" : v.accent === "purple" ? "bg-[#3D8FFD]" : "bg-[#26A17B]"}`} />
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold">{v.share}</h2>
                <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">ERC-4626 Vault</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-primary font-mono">{formatApy(v.apy)}</p>
                <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-tighter">Share-price APY</p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-px bg-border border border-border mb-8">
               <div className="p-4 bg-background text-center font-mono">
                  <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Pool TVL</p>
                  <p className="text-sm font-bold">${fmt(v.tvl)}</p>
               </div>
               <div className="p-4 bg-background text-center font-mono">
                  <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Share Price</p>
                  <p className="text-sm font-bold">{v.sharePrice.toFixed(6)}</p>
               </div>
            </div>

            <div className="flex gap-2">
              <Link to={v.route} className="flex-1"><Button className="w-full h-11 bg-primary text-primary-foreground font-bold tracking-widest uppercase text-[10px]">Deposit</Button></Link>
              <Link to={v.route} className="flex-1"><Button variant="outline" className="w-full h-11 border-border font-bold tracking-widest uppercase text-[10px]">Withdraw</Button></Link>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12">
         <h3 className="text-[10px] font-bold tracking-[0.3em] uppercase mb-6 text-muted-foreground border-b border-border pb-4">Vault Activity history</h3>
         <div className="bg-card border border-border rounded-sm overflow-hidden">
            <SectionHistory transactions={history.transactions} columns={YIELD_COLUMNS} section="yield" />
         </div>
      </div>
    </div>
  );
};

export default YieldOverview;
