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
  const tokenName = (token === "usdc" ? "USDC" : token === "usdt" ? "USDT" : "EURC") as "USDC" | "EURC" | "USDT";
  const shareName = token === "usdc" ? "luneUSDC" : token === "usdt" ? "luneUSDT" : "luneEURC";
  const vaultAddress = token === "usdc" ? CONTRACTS.LUNE_VAULT_USDC : token === "usdt" ? CONTRACTS.LUNE_VAULT_USDT : CONTRACTS.LUNE_VAULT_EURC;
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
    try { return parseUnits(amount, 6); } catch { return 0n; }
  })();

  const { data: convertedSharesRaw } = useReadContract({
    address: vaultAddress, abi: vaultAbi, functionName: "convertToShares",
    args: assetsInputRaw > 0n ? [assetsInputRaw] : undefined,
    chainId: arcTestnet.id,
    query: { enabled: tab === "withdraw" && assetsInputRaw > 0n, refetchInterval: 5000 },
  });

  const isUsingMaxWithdraw = tab === "withdraw" && amount && parseFloat(amount || "0") >= vault.userDeposited * 0.999;
  const sharesToRedeemRaw = tab === "withdraw"
    ? isUsingMaxWithdraw ? vault.userSharesRaw : ((convertedSharesRaw as bigint | undefined) ?? 0n)
    : 0n;

  const depositAmount = tab === "deposit" ? amount : "";
  const withdrawSharesStr = formatUnits(sharesToRedeemRaw, 18);

  const deposit = useVaultDeposit(tokenName, depositAmount);
  const withdraw = useVaultWithdraw(tokenName, sharesToRedeemRaw);
  const active = tab === "deposit" ? deposit : withdraw;

  useEffect(() => { if (active.isConfirmed) { balance.refetch(); vault.refetchAll(); } }, [active.isConfirmed]);

  useEffect(() => {
    if (active.isConfirmed && active.actionTxHash) {
      history.addTx({
        txHash: active.actionTxHash, type: tab,
        data: {
          action: tab === "deposit" ? "Deposit" : "Withdraw", token: tokenName, amount,
          shares: tab === "deposit"
            ? (vault.sharePrice > 0 ? (parseFloat(amount || "0") / vault.sharePrice).toFixed(4) : "0")
            : parseFloat(withdrawSharesStr).toFixed(4),
        },
      });
    }
  }, [active.isConfirmed, active.actionTxHash]);

  const txStage = computeTxStage({
    approveError: active.approveError, actionError: active.error, isConfirmed: active.isConfirmed,
    isActionPending: active.isActionPending, actionTxHash: active.actionTxHash, isActionConfirming: active.isActionConfirming,
    isApprovePending: active.isApprovePending, approveTxHash: active.approveTxHash as string | undefined,
    isApproveConfirming: active.isApproveConfirming, isApproved: active.isApproved, isAllowanceLoading: active.isAllowanceLoading,
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
    if (!isConnected) return "Connect Wallet";
    if (tab === "withdraw" && vault.userSharesRaw <= 0n) return "No Shares";
    if (!amount || parsedInputAmount <= 0n) return "Enter an Amount";
    if (hasInsufficientDepositBalance) return `Insufficient ${tokenName}`;
    if (hasInsufficientWithdrawBalance) return "Amount Exceeds Position";
    if (active.isApproving) return "Approving…";
    if (active.isBusy) return tab === "deposit" ? "Depositing…" : "Withdrawing…";
    return tab === "deposit" ? "Deposit" : "Withdraw";
  };

  const handleClick = () => {
    if (!isConnected) { openConnect(); return; }
    if (!amount || parsedInputAmount <= 0n || hasInsufficientBalance) return;
    if (tab === "withdraw" && sharesToRedeemRaw <= 0n) return;
    active.execute();
  };

  const maxVal = tab === "deposit"
    ? (balance.balance ? parseFloat(balance.balance.formatted) : 0)
    : vault.userDeposited;

  return (
    <div className="container max-w-4xl mx-auto py-16 px-4">
      <div className="mb-8">
        <BackButton />
        <h1 className="text-3xl font-bold tracking-tight mt-6 uppercase">{shareName} Vault</h1>
        <p className="text-muted-foreground text-sm font-mono mt-1">Auto-compounding ERC-4626 strategy for {tokenName} capital</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 border border-border bg-card rounded-xl text-center">
          <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Observed APY</p>
          <p className="text-lg font-bold font-mono text-primary">{formatApy(dynamicApy)}</p>
        </div>
        <div className="p-4 border border-border bg-card rounded-xl text-center">
          <p className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest mb-1">Share Price</p>
          <p className="text-sm font-bold font-mono">{vault.sharePrice.toFixed(6)} {tokenName}</p>
        </div>
      </div>

      {isConnected && vault.userShares > 0 && (
        <div className="border border-primary/20 bg-primary/5 px-4 py-3 mb-6 rounded-xl flex justify-between items-center">
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

      <div className="rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <div className="flex gap-1 bg-muted/30 rounded-xl p-1">
            {(["deposit", "withdraw"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setAmount(""); }}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors
                  ${tab === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Amount input */}
        <div className="px-4 pb-1">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
              {tab === "deposit" ? `${tokenName} to Deposit` : `${tokenName} to Withdraw`}
            </span>
            {isConnected && (
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <span className="font-mono">{tab === "deposit" ? (balance.isLoading ? "…" : balance.formatted) : vault.userDeposited.toFixed(2)}</span>
                <span className="text-border">·</span>
                <button onClick={() => setAmount((maxVal * 0.5).toFixed(6))} className="text-primary hover:underline font-semibold">50%</button>
                <button onClick={() => setAmount(maxVal.toFixed(6))} className="text-primary hover:underline font-semibold">MAX</button>
              </div>
            )}
          </div>
          <div className="rounded-xl bg-muted/40 px-3 py-2 hover:bg-muted/50 transition-colors">
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!isConnected}
                className="flex-1 min-w-0 bg-transparent text-xl font-bold text-foreground outline-none placeholder:text-muted-foreground/20 disabled:opacity-40 leading-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="flex items-center gap-1.5 bg-background rounded-full border border-border px-2.5 py-1.5 shrink-0">
                <TokenIcon symbol={tokenName} size="sm" />
                <span className="text-xs font-bold">{tokenName}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quote details */}
        {amount && parseFloat(amount) > 0 && (
          <div className="mx-4 my-3 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5 space-y-1.5">
            {[
              [tab === "deposit" ? "Shares to receive" : "Assets to receive",
               tab === "deposit" ? `${preview} ${shareName}` : `${parseFloat(withdrawSharesStr || "0").toFixed(6)} units`],
              ["Exchange rate", `1 ${tokenName} = ${vault.sharePrice > 0 ? (1 / vault.sharePrice).toFixed(6) : "—"} ${shareName}`],
              ["Protocol", "ERC-4626 Vault"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <span className="text-[10px] font-mono text-foreground">{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="px-4 pb-4">
          <Button
            className="w-full h-10 rounded-full text-xs font-black tracking-widest uppercase bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-[0.98]"
            onClick={handleClick}
            disabled={active.isBusy || parsedInputAmount <= 0n || hasInsufficientBalance}
          >
            {active.isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />}
            {getButtonText()}
          </Button>
        </div>

        <div className="px-4 pb-3 text-center">
          <p className="text-[9px] text-muted-foreground/60 font-bold uppercase tracking-widest">ERC-4626 yield derived from observed share price movement</p>
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
