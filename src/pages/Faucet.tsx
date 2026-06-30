import { useState, useEffect } from "react";
import { Droplets, Clock, CheckCircle2, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletProvider";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { TOKENS, CONTRACTS, arcTestnet, getExplorerTxUrl } from "@/config/wagmi";
import { lunexUsdtAbi } from "@/config/abis";
import { formatUnits } from "viem";
import { toast } from "sonner";

const USDT_DEPLOYED = TOKENS.USDT.address !== "0x0000000000000000000000000000000000000000";
const USDT_ADDRESS = TOKENS.USDT.address;
const FAUCET_AMOUNT_DISPLAY = "1,000";

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function Faucet() {
  const { address, isConnected, openConnect } = useWallet();
  const [countdown, setCountdown] = useState<number>(0);

  // Read cooldown remaining
  const { data: cooldownRaw, refetch: refetchCooldown } = useReadContract({
    address: USDT_ADDRESS,
    abi: lunexUsdtAbi,
    functionName: "cooldownRemaining",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: arcTestnet.id,
    query: { enabled: USDT_DEPLOYED && isConnected && !!address, refetchInterval: 15_000 },
  });

  // Read USDT balance
  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: lunexUsdtAbi,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    chainId: arcTestnet.id,
    query: { enabled: USDT_DEPLOYED && isConnected && !!address, refetchInterval: 15_000 },
  });

  const cooldownSecs = Number(cooldownRaw ?? 0n);
  const usdtBalance = balanceRaw ? Number(formatUnits(balanceRaw, 6)).toFixed(2) : "0.00";
  const canClaim = USDT_DEPLOYED && isConnected && cooldownSecs === 0;

  // Countdown ticker
  useEffect(() => {
    setCountdown(cooldownSecs);
  }, [cooldownSecs]);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); refetchCooldown(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [countdown, refetchCooldown]);

  // Write claim()
  const { writeContract, data: txHash, isPending: isWritePending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) {
      toast.success(`Claimed ${FAUCET_AMOUNT_DISPLAY} USDT!`);
      refetchCooldown();
      refetchBalance();
    }
  }, [isSuccess, refetchCooldown, refetchBalance]);

  const handleClaim = () => {
    if (!isConnected) { openConnect(); return; }
    writeContract({
      address: USDT_ADDRESS,
      abi: lunexUsdtAbi,
      functionName: "claim",
      chainId: arcTestnet.id,
    });
  };

  const isBusy = isWritePending || isConfirming;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
            <Droplets className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">USDT Faucet</h1>
          <p className="text-sm text-muted-foreground">
            Claim {FAUCET_AMOUNT_DISPLAY} testnet USDT once every 24 hours
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          {/* Token info */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <span className="text-xs font-bold text-emerald-400">$</span>
              </div>
              <div>
                <div className="text-sm font-semibold">Tether USD</div>
                <div className="text-[11px] text-muted-foreground">USDT - Arc Testnet</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono font-semibold">
                {isConnected ? usdtBalance : "--"}
              </div>
              <div className="text-[11px] text-muted-foreground">Your balance</div>
            </div>
          </div>

          {/* Claim amount */}
          <div className="text-center py-2">
            <span className="text-4xl font-bold tabular-nums text-primary">
              {FAUCET_AMOUNT_DISPLAY}
            </span>
            <span className="text-xl font-semibold text-muted-foreground ml-2">USDT</span>
            <div className="text-xs text-muted-foreground mt-1">per claim - pegged to $1.00</div>
          </div>

          {/* Status */}
          {!USDT_DEPLOYED && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>USDT contract not yet deployed. Run <code className="font-mono bg-muted px-1 rounded">deploy-usdt-ecosystem.ts</code> first.</span>
            </div>
          )}

          {USDT_DEPLOYED && isConnected && countdown > 0 && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Next claim in</span>
              <span className="font-mono font-semibold text-foreground">{formatCountdown(countdown)}</span>
            </div>
          )}

          {USDT_DEPLOYED && isConnected && countdown === 0 && !isBusy && !isSuccess && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Ready to claim your daily USDT</span>
            </div>
          )}

          {/* Button */}
          <Button
            className="w-full h-11 font-semibold tracking-wide"
            disabled={!!(USDT_DEPLOYED && isConnected && (countdown > 0 || isBusy))}
            onClick={handleClaim}
          >
            {isBusy ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isWritePending ? "Confirm in wallet..." : "Confirming..."}
              </>
            ) : !isConnected ? (
              "Connect Wallet"
            ) : !USDT_DEPLOYED ? (
              "Contract Not Deployed"
            ) : countdown > 0 ? (
              <>
                <Clock className="w-4 h-4 mr-2" />
                {formatCountdown(countdown)} until next claim
              </>
            ) : (
              <>
                <Droplets className="w-4 h-4 mr-2" />
                Claim {FAUCET_AMOUNT_DISPLAY} USDT
              </>
            )}
          </Button>

          {/* Tx link */}
          {txHash && (
            <a
              href={getExplorerTxUrl(txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              View transaction <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Amount", value: `${FAUCET_AMOUNT_DISPLAY} USDT` },
            { label: "Cooldown", value: "24 hours" },
            { label: "Price", value: "$1.00" },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg border border-border bg-card/50 p-3 text-center">
              <div className="text-xs text-muted-foreground mb-1">{label}</div>
              <div className="text-sm font-semibold">{value}</div>
            </div>
          ))}
        </div>

        {/* Also get testnet USDC/EURC */}
        <div className="rounded-lg border border-border bg-card/30 px-4 py-3 text-xs text-center text-muted-foreground">
          Need USDC or EURC? Get them at{" "}
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            faucet.circle.com
          </a>
        </div>
      </div>
    </div>
  );
}
