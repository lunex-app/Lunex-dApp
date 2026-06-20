import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReadContract } from "wagmi";
import { useWallet } from "@/context/WalletProvider";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useVaultDeposit, useVaultWithdraw } from "@/hooks/useVault";
import { useVaultData } from "@/hooks/useVaultData";
import { TransactionModal, computeTxStage } from "@/components/TransactionModal";
import { useSectionHistory } from "@/hooks/useSectionHistory";
import { formatUnits, parseUnits } from "viem";
import { vaultAbi } from "@/config/abis";
import { CONTRACTS, arcTestnet } from "@/config/wagmi";
import BackButton from "@/components/BackButton";
import { hasInsufficientRawBalance, hasInsufficientTokenBalance, parseTokenAmount } from "@/lib/tokenAmounts";
import { TokenIcon } from "@/components/TokenIcon";
import { formatApy, useDynamicApy } from "@/hooks/useApy";

const VaultDetail = () => {
  const { token } = useParams<{ token: string }>();
  const isUSDC = token === "usdc";
  const tokenName = (isUSDC ? "USDC" : "EURC") as "USDC" | "EURC";
  const shareName = isUSDC ? "luneUSDC" : "luneEURC";
  const vaultAddress = isUSDC ? CONTRACTS.LUNE_VAULT_USDC : CONTRACTS.LUNE_VAULT_EURC;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const { isConnected, openConnect } = useWallet();
  const balance = useTokenBalance(tokenName);
  const vault = useVaultData(tokenName);
  const dynamicApy = useDynamicApy(`vault-${tokenName.toLowerCase()}-share-price`, vault.sharePrice, 0);
  const history = useSectionHistory("yield");

  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");


  const assetsInputRaw = (() => {
    if (tab !== "withdraw" || !amount) return 0n;
    try {
      return parseUnits(amount, 6);
    } catch {
      return 0n;
    }
  })();

  const { data: convertedSharesRaw } = useReadContract({
    address: vaultAddress,
    abi: vaultAbi,
    functionName: "convertToShares",
    args: assetsInputRaw > 0n ? [assetsInputRaw] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: tab === "withdraw" && assetsInputRaw > 0n, refetchInterval: 5000 },
  });

  const isUsingMaxWithdraw = tab === "withdraw" && amount && parseFloat(amount || "0") >= vault.userDeposited * 0.999;
  const sharesToRedeemRaw = tab === "withdraw"
    ? isUsingMaxWithdraw
      ? vault.userSharesRaw
      : ((convertedSharesRaw as bigint | undefined) ?? 0n)
    : 0n;

  const depositAmount = tab === "deposit" ? amount : "";
  const withdrawSharesStr = formatUnits(sharesToRedeemRaw, 18);

  const deposit = useVaultDeposit(tokenName, depositAmount);
  const withdraw = useVaultWithdraw(tokenName, sharesToRedeemRaw);
  const active = tab === "deposit" ? deposit : withdraw;

  useEffect(() => {
    if (active.isConfirmed) {
      balance.refetch();
      vault.refetchAll();
    }
  }, [active.isConfirmed]);

  useEffect(() => {
    if (active.isConfirmed && active.actionTxHash) {
      history.addTx({
        txHash: active.actionTxHash,
        type: tab,
        data: {
          action: tab === "deposit" ? "Deposit" : "Withdraw",
          token: tokenName,
          amount,
          shares:
            tab === "deposit"
              ? (vault.sharePrice > 0 ? (parseFloat(amount || "0") / vault.sharePrice).toFixed(4) : "0")
              : parseFloat(withdrawSharesStr).toFixed(4),
        },
      });
    }
  }, [active.isConfirmed, active.actionTxHash, tab, tokenName, amount, withdrawSharesStr, vault.sharePrice, history]);

  const txStage = computeTxStage({
    approveError: active.approveError,
    actionError: active.error,
    isConfirmed: active.isConfirmed,
    isActionPending: active.isActionPending,
    actionTxHash: active.actionTxHash,
    isActionConfirming: active.isActionConfirming,
    isApprovePending: active.isApprovePending,
    approveTxHash: active.approveTxHash as string | undefined,
    isApproveConfirming: active.isApproveConfirming,
    isApproved: active.isApproved,
    isAllowanceLoading: active.isAllowanceLoading,
  });

  const handleModalClose = () => {
    const wasSuccess = active.isConfirmed;
    active.resetAll();
    if (wasSuccess) setAmount("");
  };

  const preview = (() => {
    if (!amount || parseFloat(amount) <= 0) return "0.00";
    if (tab === "deposit") return vault.sharePrice > 0 ? (parseFloat(amount) / vault.sharePrice).toFixed(4) : "0.00";
    return amount;
  })();

  const parsedInputAmount = parseTokenAmount(amount, 6);
  const hasInsufficientDepositBalance = tab === "deposit" && hasInsufficientTokenBalance(amount, balance.balance);
  const hasInsufficientWithdrawBalance = tab === "withdraw" && hasInsufficientRawBalance(amount, vault.userAssetsRaw, 6);
  const hasInsufficientBalance = hasInsufficientDepositBalance || hasInsufficientWithdrawBalance;

  const getButtonText = () => {
    if (!isConnected) return "CONNECT";
    if (tab === "withdraw" && vault.userSharesRaw <= 0n) return "NO SHARES";
    if (!amount || parsedInputAmount <= 0n) return "ENTER AN AMOUNT";
    if (hasInsufficientDepositBalance) return `INSUFFICIENT ${tokenName}`;
    if (hasInsufficientWithdrawBalance) return "AMOUNT EXCEEDS VAULT POSITION";
    if (active.isApproving) return "APPROVING...";
    if (active.isBusy) return tab === "deposit" ? "DEPOSITING..." : "WITHDRAWING...";
    return tab === "deposit" ? "DEPOSIT" : "WITHDRAW";
  };

  const handleClick = () => {
    if (!isConnected) {
      openConnect();
      return;
    }
    if (!amount || parsedInputAmount <= 0n || hasInsufficientBalance) return;
    if (tab === "withdraw" && sharesToRedeemRaw <= 0n) return;
    active.execute();
  };

  const handleMax = () => {
    if (tab === "deposit" && balance.balance) {
      setAmount(balance.balance.formatted);
    } else if (tab === "withdraw") {
      setAmount(vault.userDeposited.toFixed(6));
    }
  };

  return (
    <div className="container max-w-lg mx-auto py-16 px-4">
      <div className="mb-8">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">{shareName} Vault</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Institutional strategy for {tokenName} capital growth</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
         <div className="p-4 border border-border bg-card rounded-sm text-center">
            <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Observed APY</p>
            <p className="text-lg font-bold font-mono text-primary">{formatApy(dynamicApy)}</p>
         </div>
         <div className="p-4 border border-border bg-card rounded-sm text-center">
            <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Share Valuation</p>
            <p className="text-sm font-bold font-mono">{vault.sharePrice.toFixed(6)} {tokenName}</p>
         </div>
      </div>

      {isConnected && vault.userShares > 0 && (
        <div className="border border-primary/20 bg-primary/5 p-6 mb-8 rounded-sm flex justify-between items-center">
           <div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Active Position</p>
              <p className="text-xl font-bold font-mono text-primary mt-1">${fmt(vault.userDeposited)}</p>
           </div>
           <div className="text-right">
              <p className="text-[8px] text-primary/60 font-bold uppercase tracking-widest">Shares Held</p>
              <p className="text-xs font-bold font-mono text-primary">{vault.userShares.toFixed(6)}</p>
           </div>
        </div>
      )}

      <div className="border border-border bg-card rounded-sm shadow-sm overflow-hidden">
        <div className="flex bg-muted/20 border-b border-border">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setAmount("");
              }}
              className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-8 space-y-8">
          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">{tokenName} Allocation</span>
              <span className="text-[10px] text-muted-foreground font-mono">
                Balance: {tab === "deposit" ? (balance.isLoading ? "..." : balance.formatted) : vault.userDeposited.toFixed(2)}
              </span>
            </div>
            <div className="relative group">
               <input
                 type="number"
                 placeholder="0.00"
                 value={amount}
                 onChange={(e) => setAmount(e.target.value)}
                 disabled={!isConnected}
                 className="w-full bg-muted/10 border border-border h-16 px-4 text-2xl font-bold text-foreground outline-none placeholder:text-muted-foreground/20 font-mono disabled:opacity-50 rounded-sm focus:border-primary transition-colors"
               />
               <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                 <TokenIcon symbol={tokenName} size="sm" />
                 <span className="text-xs font-bold font-mono text-muted-foreground">{tokenName}</span>
               </div>
            </div>
            {isConnected && (
              <div className="flex gap-2">
                {[25, 55, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    onClick={() => {
                      const maxVal = tab === "deposit"
                        ? (balance.balance ? parseFloat(balance.balance.formatted) : 0)
                        : vault.userDeposited;
                      setAmount((maxVal * (pct / 100)).toFixed(6));
                    }}
                    className="flex-1 py-1.5 text-[10px] font-bold border border-border bg-background hover:border-primary hover:text-primary transition-all uppercase tracking-widest"
                  >
                    {pct === 100 ? "Max" : `${pct}%`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {amount && parseFloat(amount) > 0 && (
            <div className="px-6 py-4 bg-muted/10 border border-border rounded-sm space-y-3">
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                <span className="text-muted-foreground">{tab === "deposit" ? "Shares to receive" : "Assets to receive"}</span>
                <span className="font-mono text-foreground">{tab === "deposit" ? `${preview} ${shareName}` : `${parseFloat(withdrawSharesStr || "0").toFixed(6)} units`}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                <span className="text-muted-foreground">Exchange rate</span>
                <span className="font-mono text-foreground">1 {tokenName} = {vault.sharePrice > 0 ? (1 / vault.sharePrice).toFixed(6) : "—"} {shareName}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                <span className="text-muted-foreground">Protocol</span>
                <span className="font-mono text-foreground">ERC-4626 Vault</span>
              </div>
            </div>
          )}

          <Button 
            className="w-full h-14 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-sm shadow-sm active:scale-[0.98] transition-all" 
            onClick={handleClick} 
            disabled={active.isBusy || parsedInputAmount <= 0n || hasInsufficientBalance}
          >
            {active.isBusy && <Loader2 className="h-4 w-4 animate-spin mr-3" />}
            {getButtonText()}
          </Button>
        </div>
        
        <div className="p-4 bg-muted/20 border-t border-border text-center">
           <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest leading-relaxed">
              ERC-4626 vault yield is derived from observed share price movement
           </p>
        </div>
      </div>

      <TransactionModal
        stage={txStage}
        approveLabel={`Approve ${amount} ${tokenName}`}
        actionLabel={tab === "deposit" ? `Deposit ${amount} ${tokenName}` : `Withdraw ${amount} ${tokenName}`}
        successSummary={tab === "deposit" ? `Deposited ${amount} ${tokenName} → ${preview} ${shareName}` : `Withdrew ${amount} ${tokenName}`}
        txHash={active.actionTxHash || (active.approveTxHash as string | undefined)}
        errorMessage={(active.error || active.approveError)?.message}
        onClose={handleModalClose}
        onRetry={() => active.resetAll()}
      />
    </div>
  );
};

export default VaultDetail;
