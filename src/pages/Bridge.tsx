import { useState, useMemo, useEffect } from "react";
import { ArrowRight, Loader2, Zap, Info, ArrowLeftRight, ExternalLink, Fuel, X, RotateCw, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/context/WalletProvider";
import { useBridge } from "@/features/bridge/hooks/useBridge";
import { useUnifiedBalance } from "@/features/bridge/hooks/useUnifiedBalance";
import { ChainSelector } from "@/features/bridge/components/ChainSelector";
import { BridgeProgress } from "@/features/bridge/components/BridgeProgress";
import { BridgeHistory } from "@/features/bridge/components/BridgeHistory";
import { BridgeRecoveryPanel } from "@/features/bridge/components/BridgeRecoveryPanel";
import { GatewayPanel } from "@/features/bridge/components/GatewayPanel";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type BridgeChainKey, BRIDGE_CHAINS, getExplorerTxUrl } from "@/features/bridge/config/bridgeConfig";
import { getPendingBridgeTransactions, type BridgeTransaction } from "@/features/bridge/state/bridgeState";
import BackButton from "@/components/BackButton";
import { formatUnits, parseUnits } from "viem";

const Bridge = () => {
  const { address, isConnected, openConnect, circle, uc } = useWallet();
  const isCircleWallet = Boolean(circle || uc);
  const {
    balancesByChain,
    refetch: refetchBalances,
  } = useUnifiedBalance();
  
  const [amount, setAmount] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState<"USDC" | "EURC">("USDC");
  const [fromChain, setFromChain] = useState<BridgeChainKey>("base");
  const [toChain, setToChain] = useState<BridgeChainKey>("arc");
  const [isFastPath, setIsFastPath] = useState(false);
  const [gasTopUpEnabled, setGasTopUpEnabled] = useState(false);
  const [gasTopUpAmount, setGasTopUpAmount] = useState("");
  const [activeTab, setActiveTab] = useState("bridge");
  const [pendingTxs, setPendingTxs] = useState(getPendingBridgeTransactions());
  const [selectedTx, setSelectedTx] = useState<BridgeTransaction | null>(null);

  const bridge = useBridge();

  // Refetch balances when bridge status becomes 'complete'
  useEffect(() => {
    if (bridge.status === "complete") {
      refetchBalances();
    }
  }, [bridge.status, refetchBalances]);

  useEffect(() => {
    const interval = setInterval(() => {
      setPendingTxs(getPendingBridgeTransactions());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const sourceChainConfig = BRIDGE_CHAINS[fromChain];
  const sourceBalanceData = balancesByChain[fromChain];
  const sourceDecimals = sourceChainConfig.usdcDecimals;
  const sourceTokenBalance = tokenSymbol === "EURC" ? (sourceBalanceData?.eurc ?? 0n) : (sourceBalanceData?.usdc ?? 0n);
  const sourceTokenBalanceFormatted = formatUnits(sourceTokenBalance, sourceDecimals);

  const eurcSupported = sourceChainConfig.eurc !== undefined && BRIDGE_CHAINS[toChain].eurc !== undefined;

  useEffect(() => {
    if (tokenSymbol === "EURC" && !eurcSupported) {
      setTokenSymbol("USDC");
    }
  }, [fromChain, toChain, eurcSupported, tokenSymbol]);

  const parsedAmount = useMemo(() => {
    try {
      return amount ? parseUnits(amount, sourceDecimals) : 0n;
    } catch {
      return 0n;
    }
  }, [amount, sourceDecimals]);

  const insufficientBalance = useMemo(() => {
    return parsedAmount > sourceTokenBalance;
  }, [parsedAmount, sourceTokenBalance]);

  const sameChain = fromChain === toChain;

  const handleBridge = async () => {
    if (!amount || parsedAmount <= 0n || insufficientBalance || sameChain) return;
    if (gasTopUpEnabled && gasTopUpAmount) {
      const topUp = Number(gasTopUpAmount);
      const total = Number(amount);
      if (!Number.isFinite(topUp) || topUp <= 0 || topUp >= total) return;
    }
    await bridge.startBridge(amount, fromChain, toChain, isFastPath, tokenSymbol, gasTopUpEnabled ? gasTopUpAmount : undefined);
  };

  const isProcessing = bridge.status !== "idle" && bridge.status !== "failed" && bridge.status !== "complete";
  const isActive = bridge.status !== "idle";

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <div className="mb-10">
        <BackButton />
        <div className="flex items-center gap-3 mt-6">
          <ArrowLeftRight className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight uppercase">Cross-Chain Bridge</h1>
        </div>
        <p className="text-muted-foreground text-sm font-mono mt-2">Native Asset Protocol via Circle CCTP</p>
      </div>

      {/* Pending Transactions Alert */}
      {pendingTxs.length > 0 && !isActive && (
        <div className="mb-8 p-5 border border-primary/50 bg-primary/5 rounded-sm flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-500 shadow-lg shadow-primary/10">
           <div className="flex items-center gap-4">
             <div className="h-10 w-10 bg-primary/20 rounded-full flex items-center justify-center animate-pulse">
                <Zap className="h-5 w-5 text-primary" />
             </div>
             <div>
               <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">Action Required: Pending Settlement</p>
               <p className="text-[12px] text-muted-foreground font-medium mt-1">Found {pendingTxs.length} transfer{pendingTxs.length > 1 ? 's' : ''} awaiting finalization on the target chain.</p>
             </div>
           </div>
           <Button 
            className="bg-primary text-primary-foreground font-black uppercase tracking-[0.1em] h-11 px-8 shadow-xl hover:scale-105 transition-all"
            onClick={() => bridge.resumeTransaction(pendingTxs[0])}
           >
             Continue Latest
           </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap justify-start gap-2 mb-8 h-auto bg-transparent p-0">
          <TabsTrigger value="bridge" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <ArrowLeftRight className="h-3.5 w-3.5" /> Transfer
          </TabsTrigger>
          <TabsTrigger value="gateway" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <Zap className="h-3.5 w-3.5" /> Gateway
          </TabsTrigger>
          <TabsTrigger value="recovery" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <RotateCw className="h-3.5 w-3.5" /> Recovery
          </TabsTrigger>
          <TabsTrigger value="history" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground data-[state=active]:border-primary/50 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            <History className="h-3.5 w-3.5" /> History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bridge" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Select Route</label>
                  <div className="flex gap-2 p-1 bg-muted/20 border border-border rounded-sm">
                    {["USDC", "EURC"].map((s) => {
                      const disabled = s === "EURC" && !eurcSupported;
                      return (
                        <button
                          key={s}
                          disabled={disabled}
                          onClick={() => setTokenSymbol(s as any)}
                          className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest transition-all ${
                            tokenSymbol === s 
                              ? "bg-primary text-primary-foreground shadow-sm" 
                              : "text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                          }`}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <ChainSelector 
                  fromChain={fromChain} 
                  toChain={toChain} 
                  onFromChange={setFromChain} 
                  onToChange={setToChain} 
                  onSwap={() => {
                    const temp = fromChain;
                    setFromChain(toChain);
                    setToChain(temp);
                  }}
                  disabled={isProcessing}
                />
                <div className="flex justify-between items-center px-1">
                   <p className="text-[9px] text-muted-foreground font-mono uppercase">
                     Available: {Number(sourceTokenBalanceFormatted || 0).toFixed(2)} {tokenSymbol}
                   </p>
                   <button 
                    onClick={() => refetchBalances()}
                    className="text-[9px] text-primary hover:underline font-bold uppercase tracking-widest"
                   >
                     Refresh
                   </button>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount to Bridge</label>
                <div className="relative group">
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-muted/10 border-border text-2xl font-bold font-mono h-16 rounded-sm focus-visible:ring-primary pl-4"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-muted-foreground uppercase">{tokenSymbol}</div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-2">
                   {[25, 55, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => {
                           const bal = Number(sourceTokenBalanceFormatted || 0);
                           const val = (bal * (pct / 100)).toFixed(sourceDecimals === 6 ? 6 : 2);
                           setAmount(val);
                        }}
                        className="py-2 text-[10px] font-black uppercase tracking-widest border border-border bg-muted/10 hover:border-primary hover:text-primary transition-all rounded-sm active:scale-95"
                      >
                         {pct === 100 ? "Max" : `${pct}%`}
                      </button>
                   ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/20 border border-border rounded-sm">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${isFastPath ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                       <span className="text-[10px] font-bold uppercase tracking-widest">Accelerated Finality</span>
                       <TooltipProvider>
                         <Tooltip>
                           <TooltipTrigger asChild>
                             <button className="text-muted-foreground hover:text-primary transition-colors"><Info className="h-3 w-3" /></button>
                           </TooltipTrigger>
                           <TooltipContent className="max-w-[200px]">
                             <p className="text-[10px] uppercase tracking-widest font-bold">Uses Circle CCTP V2 Fast Path to bridge assets before source chain finality (~1-2 mins). Small fee applies.</p>
                           </TooltipContent>
                         </Tooltip>
                       </TooltipProvider>
                    </div>
                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter mt-0.5">Powered by Circle Iris V2</p>
                  </div>
                </div>
                <Switch checked={isFastPath} onCheckedChange={setIsFastPath} className="data-[state=checked]:bg-primary" />
              </div>

              <div className="space-y-4 p-4 bg-muted/20 border border-border rounded-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${gasTopUpEnabled ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Fuel className="h-4 w-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-widest">Destination Gas Top-Up</span>
                      <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter mt-0.5">
                        Uses Circle forwarding on fast CCTP routes
                      </p>
                    </div>
                  </div>
                  <Switch checked={gasTopUpEnabled} onCheckedChange={setGasTopUpEnabled} className="data-[state=checked]:bg-primary" />
                </div>
                {gasTopUpEnabled && (
                  <div className="space-y-2 animate-in fade-in duration-200">
                    <div className="relative">
                      <Input
                        type="number"
                        value={gasTopUpAmount}
                        onChange={(event) => setGasTopUpAmount(event.target.value)}
                        placeholder="0.00"
                        className="h-11 font-mono"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-muted-foreground">{tokenSymbol}</span>
                    </div>
                    <p className="text-[10px] text-yellow-500 leading-relaxed">
                      Gas top-up sends the destination mint to the Lunex relayer so a funded operator can split settlement and deliver native gas. Fast path must stay enabled; destination relayer liquidity is required.
                    </p>
                    {BRIDGE_CHAINS[toChain].topUpRelayer ? (
                      <p className="text-[9px] text-muted-foreground font-mono break-all">
                        Relayer: {BRIDGE_CHAINS[toChain].topUpRelayer}
                      </p>
                    ) : (
                      <p className="text-[9px] text-destructive font-bold uppercase tracking-widest">
                        No top-up relayer configured for {BRIDGE_CHAINS[toChain].label}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {isCircleWallet && (
                <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-500">
                  Bridging moves USDC between chains, so it needs a browser wallet like MetaMask. Your Lunex passkey/email wallet only works on Arc — connect a browser wallet to bridge.
                </div>
              )}
              {!isConnected ? (
                <Button className="w-full h-14 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-sm" onClick={openConnect}>Connect</Button>
              ) : (
                <Button 
                  className="w-full h-14 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-sm disabled:opacity-50 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all" 
                  onClick={handleBridge}
                  disabled={!amount || parsedAmount <= 0n || insufficientBalance || isProcessing || sameChain || (gasTopUpEnabled && (!isFastPath || !BRIDGE_CHAINS[toChain].topUpRelayer))}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-3" /> {bridge.statusMessage || "Protocol Active..."}</>
                  ) : sameChain ? (
                    "Select Target Chain"
                  ) : insufficientBalance ? (
                    "Insufficient Balance"
                  ) : gasTopUpEnabled && !isFastPath ? (
                    "Enable Fast Path for Top-Up"
                  ) : gasTopUpEnabled && !BRIDGE_CHAINS[toChain].topUpRelayer ? (
                    "Relayer Unavailable"
                  ) : (
                    "Initialize Transfer"
                  )}
                </Button>
              )}
            </div>

            <div className="space-y-6">
              {isActive && bridge.bridgeTx ? (
                <BridgeProgress
                  status={bridge.status}
                  burnTxHash={bridge.bridgeTx.burnTxHash}
                  mintTxHash={bridge.bridgeTx.mintTxHash}
                  fromChain={bridge.bridgeTx.fromChain}
                  toChain={bridge.bridgeTx.toChain}
                  bridgeTx={bridge.bridgeTx}
                  error={bridge.error}
                  onRetry={() => bridge.resumeTransaction(bridge.bridgeTx!)}
                  onReset={bridge.reset}
                  onMint={() => bridge.resumeTransaction(bridge.bridgeTx!)}
                  attestationReady={bridge.attestation.status === "complete"}
                />
              ) : (
                <div className="border border-border bg-card p-8 rounded-sm text-center space-y-4">
                  <div className="h-16 w-16 bg-primary/5 rounded-full flex items-center justify-center mx-auto">
                    <ArrowRight className="h-8 w-8 text-primary/40" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest">Multi-Asset Bridging</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Lunex supports native bridging for both USDC and EURC via Circle's CCTP. 
                    Your assets are never wrapped; they are natively minted on the destination chain 
                    for maximum security and zero slippage.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="gateway">
          <GatewayPanel />
        </TabsContent>

        <TabsContent value="recovery">
          <BridgeRecoveryPanel />
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-card border border-border rounded-sm overflow-hidden">
             <BridgeHistory onSelectTx={(tx) => setSelectedTx(tx)} onResume={(tx) => bridge.resumeTransaction(tx)} />
          </div>
        </TabsContent>
      </Tabs>

      {selectedTx && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
           <div className="relative border border-border bg-card p-8 max-w-lg w-full rounded-sm shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-border pb-4">
                 <h2 className="text-xl font-black uppercase tracking-widest">Transaction Details</h2>
                 <button onClick={() => setSelectedTx(null)} className="p-2 hover:bg-muted rounded-full transition-colors">
                    <X className="h-5 w-5" />
                 </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount</p>
                    <p className="text-xl font-black font-mono mt-1">{selectedTx.amount} {selectedTx.tokenSymbol ?? "USDC"}</p>
                 </div>
                 <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Status</p>
                    <p className={`text-[10px] font-black uppercase tracking-widest mt-2 inline-block px-2 py-0.5 rounded-sm ${
                       selectedTx.status === 'complete' ? 'bg-primary/20 text-primary' : 'bg-yellow-500/20 text-yellow-500'
                    }`}>
                       {selectedTx.status}
                    </p>
                 </div>
              </div>

              {selectedTx.gasTopUpAmount && (
                <div className="border border-yellow-500/30 bg-yellow-500/10 p-4 rounded-sm">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-yellow-500">Destination gas top-up</p>
                  <p className="text-xs font-mono mt-1">
                    {selectedTx.gasTopUpAmount} {selectedTx.tokenSymbol ?? "USDC"} · {selectedTx.gasTopUpStatus ?? "requested"}
                  </p>
                </div>
              )}

              <div className="space-y-4 pt-4">
                 <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                       <div className="h-2 w-2 rounded-full bg-primary" />
                       <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source: {BRIDGE_CHAINS[selectedTx.fromChain].label}</span>
                    </div>
                    {selectedTx.burnTxHash && (
                       <a href={getExplorerTxUrl(selectedTx.fromChain, selectedTx.burnTxHash)} target="_blank" className="flex items-center gap-1 text-[10px] text-primary font-bold hover:underline">
                          View TX <ExternalLink className="h-3 w-3" />
                       </a>
                    )}
                 </div>
                 <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                       <div className="h-2 w-2 rounded-full bg-primary" />
                       <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Target: {BRIDGE_CHAINS[selectedTx.toChain].label}</span>
                    </div>
                    {selectedTx.mintTxHash && (
                       <a href={getExplorerTxUrl(selectedTx.toChain, selectedTx.mintTxHash)} target="_blank" className="flex items-center gap-1 text-[10px] text-primary font-bold hover:underline">
                          View TX <ExternalLink className="h-3 w-3" />
                       </a>
                    )}
                 </div>
              </div>

              <div className="pt-6 border-t border-border">
                 <Button className="w-full font-black uppercase tracking-widest" onClick={() => setSelectedTx(null)}>Close Details</Button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Bridge;
