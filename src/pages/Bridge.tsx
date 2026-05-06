import { useState, useMemo } from "react";
import { ArrowRight, Wallet, Loader2, Zap, Info, History as HistoryIcon, ArrowLeftRight } from "lucide-react";
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
import { type BridgeChainKey, BRIDGE_CHAINS } from "@/features/bridge/config/bridgeConfig";
import BackButton from "@/components/BackButton";
import { parseUnits, formatUnits, pad, zeroHash } from "viem";

const Bridge = () => {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { formattedTotal: globalBalance, isLoading: globalBalanceLoading, balancesByChain } = useUnifiedBalance();
  
  const [amount, setAmount] = useState("");
  const [fromChain, setFromChain] = useState<BridgeChainKey>("base");
  const [toChain, setToChain] = useState<BridgeChainKey>("arc");
  const [isFastPath, setIsFastPath] = useState(false);
  const [activeTab, setActiveTab] = useState("bridge");

  const bridge = useBridge();

  const sourceChainConfig = BRIDGE_CHAINS[fromChain];
  const targetChainConfig = BRIDGE_CHAINS[toChain];
  
  const sourceBalanceData = balancesByChain[fromChain];
  const sourceBalance = sourceBalanceData?.formatted || "0.00";
  const sourceDecimals = sourceChainConfig.usdcDecimals;

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
    await bridge.startBridge(amount, fromChain, toChain, isFastPath);
  };

  const receiveAmount = useMemo(() => {
    if (!amount || isNaN(Number(amount))) return "";
    const fee = isFastPath ? 0.998 : 0.999; // 0.1% base + 0.1% fast path fee
    return (Number(amount) * fee).toFixed(2);
  }, [amount, isFastPath]);

  const isProcessing = bridge.status !== "idle" && bridge.status !== "failed" && bridge.status !== "success";
  const isActive = bridge.status !== "idle";

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <div className="mb-10">
        <BackButton />
        <div className="flex items-center gap-3 mt-6">
          <ArrowLeftRight className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight uppercase">Cross-Chain Bridge</h1>
        </div>
        <p className="text-muted-foreground text-sm font-mono mt-2">Powered by Circle CCTP Native Infrastructure</p>
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-8 bg-muted/20 border border-border p-1 rounded-sm h-12">
          <TabsTrigger value="bridge" className="data-[state=active]:bg-background data-[state=active]:text-primary rounded-sm font-bold uppercase tracking-widest text-[10px]">Transfer Assets</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-background data-[state=active]:text-primary rounded-sm font-bold uppercase tracking-widest text-[10px]">Bridge History</TabsTrigger>
        </TabsList>

        <TabsContent value="bridge" className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Bridge Form */}
            <div className="space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Select Route</label>
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
                <p className="text-[9px] text-muted-foreground font-mono">Balance: {sourceBalance} USDC</p>
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
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold font-mono text-muted-foreground uppercase">USDC</div>
                </div>
                <div className="flex gap-2 w-full mt-2">
                  {isConnected && [25, 50, 75, 100].map((pct) => (
                    <button 
                      key={pct} 
                      onClick={() => {
                        const val = (parseFloat(sourceBalance) * (pct / 100)).toFixed(sourceDecimals === 6 ? 6 : 2);
                        setAmount(val);
                      }}
                      className="flex-1 py-1.5 text-[9px] font-bold border border-border bg-card hover:border-primary hover:text-primary transition-all uppercase tracking-tighter"
                    >
                      {pct === 100 ? "Max" : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fast Path Toggle */}
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
                             <button className="text-muted-foreground hover:text-primary transition-colors">
                               <Info className="h-3 w-3" />
                             </button>
                           </TooltipTrigger>
                           <TooltipContent className="max-w-[200px]">
                             <p className="text-[10px] uppercase tracking-widest font-bold">Uses Circle CCTP V2 Fast Path to bridge USDC before source chain finality (~1-2 mins). Small additional fee applies.</p>
                           </TooltipContent>
                         </Tooltip>
                       </TooltipProvider>
                    </div>
                    <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-tighter mt-0.5">Powered by Circle Iris V2</p>
                  </div>
                </div>
                <Switch 
                  checked={isFastPath}
                  onCheckedChange={setIsFastPath}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 pt-4 border-t border-border">
                {[
                   { label: "Bridge Fee", val: isFastPath ? "0.01% (Fast)" : "0.00 (Standard)", color: isFastPath ? "text-primary" : "text-foreground" },
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
                  className="w-full h-14 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-sm disabled:opacity-50" 
                  onClick={handleBridge}
                  disabled={!amount || parsedAmount <= 0n || insufficientBalance || isProcessing || sameChain}
                >
                  {isProcessing ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-3" /> Protocol Active...</>
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

            {/* Right Side: Information / Progress */}
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
                  onRetry={() => bridge.startBridge(amount, fromChain, toChain, isFastPath)}
                  onReset={bridge.reset}
                  onMint={bridge.completeMint}
                  attestationReady={bridge.attestation.status === "complete"}
                />
              ) : (
                <div className="border border-border bg-card p-8 rounded-sm text-center space-y-4">
                  <div className="h-16 w-16 bg-primary/5 rounded-full flex items-center justify-center mx-auto">
                    <ArrowRight className="h-8 w-8 text-primary/40" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-widest">Native USDC Bridging</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Lunex utilizes Circle's Cross-Chain Transfer Protocol (CCTP) to move USDC natively between chains. Assets are burned on the source and minted on the target, ensuring no liquidity fragmentation or wrapper risk.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history">
          <div className="bg-card border border-border rounded-sm overflow-hidden">
             <BridgeHistory />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Bridge;
