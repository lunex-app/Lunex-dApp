import { useState, useMemo, useEffect } from "react";
import { ArrowRight, Wallet, Loader2, Zap, Info, History as HistoryIcon, ArrowLeftRight, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useBridge } from "@/features/bridge/hooks/useBridge";
import { useUnifiedBalance } from "@/features/bridge/hooks/useUnifiedBalance";
import { ChainSelector } from "@/features/bridge/components/ChainSelector";
import { BridgeProgress } from "@/features/bridge/components/BridgeProgress";
import { BridgeHistory } from "@/features/bridge/components/BridgeHistory";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type BridgeChainKey, BRIDGE_CHAINS, getExplorerTxUrl } from "@/features/bridge/config/bridgeConfig";
import { getPendingBridgeTransactions, type BridgeTransaction } from "@/features/bridge/state/bridgeState";
import BackButton from "@/components/BackButton";
import { parseUnits } from "viem";

const Bridge = () => {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { formattedTotal: globalBalance, isLoading: globalBalanceLoading, balancesByChain } = useUnifiedBalance();
  
  const [amount, setAmount] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState<"USDC" | "EURC">("USDC");
  const [fromChain, setFromChain] = useState<BridgeChainKey>("base");
  const [toChain, setToChain] = useState<BridgeChainKey>("arc");
  const [isFastPath, setIsFastPath] = useState(false);
  const [activeTab, setActiveTab] = useState("bridge");
  const [pendingTxs, setPendingTxs] = useState(getPendingBridgeTransactions());
  const [selectedTx, setSelectedTx] = useState<BridgeTransaction | null>(null);

  const bridge = useBridge();

  useEffect(() => {
    const interval = setInterval(() => {
      setPendingTxs(getPendingBridgeTransactions());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const sourceChainConfig = BRIDGE_CHAINS[fromChain];
  const sourceBalanceData = balancesByChain[fromChain];
  const sourceBalance = sourceBalanceData?.formatted || "0.00";
  const sourceDecimals = sourceChainConfig.usdcDecimals;

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
    if (!sourceBalanceData) return false;
    return parsedAmount > sourceBalanceData.value;
  }, [parsedAmount, sourceBalanceData]);

  const sameChain = fromChain === toChain;

  const handleBridge = async () => {
    if (!amount || parsedAmount <= 0n || insufficientBalance || sameChain) return;
    await bridge.startBridge(amount, fromChain, toChain, isFastPath, tokenSymbol);
  };

  const receiveAmount = useMemo(() => {
    if (!amount || isNaN(Number(amount))) return "";
    const fee = isFastPath ? 0.998 : 0.999;
    return (Number(amount) * fee).toFixed(2);
  }, [amount, isFastPath]);

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
        <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted/20 border border-border p-1 rounded-sm h-12">
          <TabsTrigger value="bridge" className="data-[state=active]:bg-background data-[state=active]:text-primary rounded-sm font-bold uppercase tracking-widest text-[10px]">Transfer Assets</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-background data-[state=active]:text-primary rounded-sm font-bold uppercase tracking-widest text-[10px]">Bridge History</TabsTrigger>
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
                <p className="text-[9px] text-muted-foreground font-mono">Available: {sourceBalance} {tokenSymbol}</p>
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
                {/* Percentage Buttons */}
                <div className="grid grid-cols-4 gap-2 mt-2">
                   {[25, 55, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        onClick={() => {
                           const val = (parseFloat(sourceBalance) * (pct / 100)).toFixed(sourceDecimals === 6 ? 6 : 2);
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

              <div className="grid grid-cols-1 gap-3 pt-4 border-t border-border">
                {[
                   { label: "Bridge Fee", val: isFastPath ? "0.11%" : "0.10%", color: "text-foreground" },
                   { label: "Execution Model", val: isFastPath ? "Iris V2 Fast Path" : "Circle CCTP Native", color: "text-foreground" },
                   { label: "Estimated Settlement", val: isFastPath ? "1-2 Minutes" : "5-15 Minutes", color: isFastPath ? "text-primary" : "text-foreground" },
                ].map((item, i) => (
                   <div key={i} className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className={item.color}>{item.val}</span>
                   </div>
                ))}
              </div>

              {!isConnected ? (
                <Button className="w-full h-14 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-sm" onClick={openConnectModal}>Connect Wallet</Button>
              ) : (
                <Button 
                  className="w-full h-14 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-sm disabled:opacity-50 shadow-lg shadow-primary/20 active:scale-[0.98] transition-all" 
                  onClick={handleBridge}
                  disabled={!amount || parsedAmount <= 0n || insufficientBalance || isProcessing || sameChain}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-3" /> {bridge.statusMessage || "Protocol Active..."}</>
                  ) : sameChain ? (
                    "Select Target Chain"
                  ) : insufficientBalance ? (
                    "Insufficient Balance"
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

        <TabsContent value="history">
          <div className="bg-card border border-border rounded-sm overflow-hidden">
             <BridgeHistory onSelectTx={(tx) => setSelectedTx(tx)} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Transaction Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-300">
           <div className="relative border border-border bg-card p-8 max-w-lg w-full rounded-sm shadow-2xl space-y-6">
              <div className="flex justify-between items-center border-b border-border pb-4">
                 <h2 className="text-xl font-black uppercase tracking-widest">Transaction Details</h2>
                 <button onClick={() => setSelectedTx(null)} className="p-2 hover:bg-muted rounded-full transition-colors">
                    <ArrowLeftRight className="h-5 w-5 rotate-45" />
                 </button>
              </div>

              <div className="grid grid-cols-2 gap-6">
                 <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Amount</p>
                    <p className="text-xl font-black font-mono mt-1">{selectedTx.amount} USDC</p>
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
