import { useState, useCallback, useRef, useEffect } from "react";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { parseUnits, pad, zeroHash, encodeFunctionData, decodeFunctionResult, createPublicClient, http, createWalletClient, custom } from "viem";
import { toast } from "sonner";
import {
  BRIDGE_CHAINS,
  TOKEN_MESSENGER_ABI,
  MESSAGE_TRANSMITTER_ABI,
  ERC20_APPROVE_ABI,
  IRIS_API_URL,
  type BridgeChainKey,
} from "../config/bridgeConfig";
import {
  type BridgeTransaction,
  type BridgeStatus,
  saveBridgeTransaction,
  loadBridgeTransactions,
} from "../state/bridgeState";

/** Poll CCTP V2 attestation API using domain + txHash */
function useAttestationV2() {
  const [attestation, setAttestation] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"pending" | "complete" | "error">("pending");
  const [error, setError] = useState<string | null>(null);

  const startPolling = useCallback(async (domain: number, txHash: string) => {
    setStatus("pending");
    setAttestation(null);
    setMessage(null);
    setError(null);

    const url = `${IRIS_API_URL}/v2/messages/${domain}?transactionHash=${txHash}`;
    const maxAttempts = 120;
    const delayMs = 5000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        let res: Response;
        try {
          res = await fetch(url, { signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }

        if (res.ok) {
          const data = await res.json();
          if (data?.messages?.[0]?.status === "complete" && data.messages[0].attestation) {
            setAttestation(data.messages[0].attestation);
            setMessage(data.messages[0].message);
            setStatus("complete");
            return { message: data.messages[0].message, attestation: data.messages[0].attestation };
          }
        }
      } catch {
        // transient error, keep polling
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }

    setStatus("error");
    setError("Attestation timeout — you can retry minting later");
    return null;
  }, []);

  return { attestation, message, status, error, startPolling };
}

/**
 * Request wallet to switch to a specific chain using window.ethereum directly.
 */
async function switchWalletChain(targetChainId: number): Promise<void> {
  const provider = (window as any).ethereum;
  if (!provider) throw new Error("No wallet provider found");

  const hexChainId = "0x" + targetChainId.toString(16);

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexChainId }],
    });
  } catch (switchError: any) {
    console.error("Chain switch error:", switchError);
    if (switchError?.code === 4902 || switchError?.data?.originalError?.code === 4902) {
      throw new Error(`Chain ${targetChainId} is not in your wallet. Please add it manually.`);
    }
    if (switchError?.code === 4001) {
      throw new Error("Switch request rejected.");
    }
    throw new Error(`Please switch to chain ID ${targetChainId} manually.`);
  }
  await new Promise((r) => setTimeout(r, 2000));
}

async function getWalletChainId(): Promise<number> {
  const provider = (window as any).ethereum;
  if (!provider) return 0;
  const hex = await provider.request({ method: "eth_chainId" });
  return parseInt(hex, 16);
}

export function useBridge() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  const [bridgeTx, setBridgeTx] = useState<BridgeTransaction | null>(null);
  const [status, setStatus] = useState<BridgeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const attestationV2 = useAttestationV2();

  const getChainClient = useCallback((chain: BridgeChainKey) => {
    const config = BRIDGE_CHAINS[chain];
    return createPublicClient({ transport: http(config.rpcUrl) });
  }, []);

  const updateTx = useCallback((updates: Partial<BridgeTransaction>) => {
    setBridgeTx((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updates, updatedAt: Date.now() };
      saveBridgeTransaction(updated);
      return updated;
    });
  }, []);

  const ensureChain = useCallback(
    async (targetChainId: number, label: string) => {
      const currentChainId = await getWalletChainId();
      if (currentChainId === targetChainId) return;

      setStatusMessage(`Requesting switch to ${label}...`);
      try {
        await switchChainAsync({ chainId: targetChainId });
      } catch (wagmiError: any) {
        try {
          await switchWalletChain(targetChainId);
        } catch (rawError: any) {
          throw rawError;
        }
      }

      let afterChainId = 0;
      for (let i = 0; i < 5; i++) {
        afterChainId = await getWalletChainId();
        if (afterChainId === targetChainId) break;
        await new Promise(r => setTimeout(r, 1000));
      }

      if (afterChainId !== targetChainId) {
        throw new Error(`Please switch to ${label} manually to proceed.`);
      }
      setStatusMessage("");
    },
    [switchChainAsync]
  );

  /** Restart or Continue a transaction from its current state */
  const resumeTransaction = useCallback(async (tx: BridgeTransaction) => {
    setBridgeTx(tx);
    setStatus(tx.status);
    setError(null);
    setStatusMessage("Resuming transaction...");

    const from = BRIDGE_CHAINS[tx.fromChain];
    const to = BRIDGE_CHAINS[tx.toChain];

    try {
      if (tx.status === "approving" || tx.status === "burning" || tx.status === "failed") {
        // If it failed during burn or earlier, it's safest to check if we have a burn hash
        if (tx.burnTxHash) {
          tx.status = "waiting_attestation";
        } else {
          // Restart from start
          return startBridge(tx.amount, tx.fromChain, tx.toChain, false); 
        }
      }

      if (tx.status === "waiting_attestation" || tx.status === "minting") {
        if (!tx.burnTxHash) throw new Error("Missing burn transaction hash");
        
        setStatus("waiting_attestation");
        setStatusMessage("Waiting for Circle attestation...");
        const attResult = await attestationV2.startPolling(from.domain, tx.burnTxHash);
        if (!attResult) throw new Error("Attestation timeout");

        await ensureChain(to.chainId, to.label);
        
        setStatus("minting");
        setStatusMessage("Minting on " + to.label + "...");
        updateTx({ status: "minting" });

        const mintWalletClient = createWalletClient({
          account: address as `0x${string}`,
          transport: custom((window as any).ethereum)
        });

        const mintHash = await mintWalletClient.writeContract({
          address: to.messageTransmitter,
          abi: MESSAGE_TRANSMITTER_ABI,
          functionName: "receiveMessage",
          args: [attResult.message as `0x${string}`, attResult.attestation as `0x${string}`],
          account: address,
          chain: null as any,
        });

        await getChainClient(tx.toChain).waitForTransactionReceipt({ hash: mintHash });
        
        setStatus("complete");
        updateTx({ status: "complete", mintTxHash: mintHash, attestation: attResult.attestation });
        toast.success("Bridge complete!");
      }
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || "Resume failed";
      setStatus("failed");
      setError(msg);
      updateTx({ status: "failed", error: msg });
    }
  }, [address, ensureChain, updateTx, attestationV2, getChainClient]);

  const startBridge = useCallback(
    async (amount: string, fromChain: BridgeChainKey, toChain: BridgeChainKey, isFastPath: boolean = false, tokenSymbol: "USDC" | "EURC" = "USDC") => {
      if (!address || !walletClient) {
        setError("Wallet not connected");
        return;
      }

      const from = BRIDGE_CHAINS[fromChain];
      const to = BRIDGE_CHAINS[toChain];
      const fromPublicClient = getChainClient(fromChain);
      const parsedAmount = parseUnits(amount, from.usdcDecimals);
      
      const tokenAddress = tokenSymbol === "EURC" ? from.eurc : from.usdc;
      if (!tokenAddress) {
        setError(`${tokenSymbol} is not supported on ${from.label}`);
        return;
      }

      const tx: BridgeTransaction = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromChain,
        toChain,
        amount,
        status: "approving",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setBridgeTx(tx);
      setStatus("approving");
      setError(null);
      saveBridgeTransaction(tx);

      try {
        await ensureChain(from.chainId, from.label);

        // Approve
        setStatusMessage(`Approving ${tokenSymbol}...`);
        const sourceWalletClient = createWalletClient({
          account: address as `0x${string}`,
          transport: custom((window as any).ethereum)
        });

        const approveHash = await sourceWalletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [from.tokenMessenger, parsedAmount],
          account: address,
          chain: null as any,
        });
        await fromPublicClient.waitForTransactionReceipt({ hash: approveHash });

        // Burn
        setStatus("burning");
        setStatusMessage(`Burning ${tokenSymbol}...`);
        updateTx({ status: "burning" });
        
        const mintRecipient = pad(address, { size: 32 });
        const maxFee = isFastPath ? (parsedAmount * 10n / 10000n) : 0n;
        const minFinalityThreshold = isFastPath ? 1000 : 2000;

        const burnHash = await sourceWalletClient.writeContract({
          address: from.tokenMessenger,
          abi: TOKEN_MESSENGER_ABI,
          functionName: "depositForBurn",
          args: [parsedAmount, to.domain, mintRecipient, tokenAddress, zeroHash, maxFee, minFinalityThreshold],
          account: address,
          chain: null as any,
        });
        await fromPublicClient.waitForTransactionReceipt({ hash: burnHash });

        // Wait Attestation
        setStatus("waiting_attestation");
        updateTx({ status: "waiting_attestation", burnTxHash: burnHash });
        
        await ensureChain(to.chainId, to.label);
        
        const attResult = await attestationV2.startPolling(from.domain, burnHash);
        if (!attResult) throw new Error("Attestation timeout");

        // Mint
        setStatus("minting");
        updateTx({ status: "minting" });
        const mintHash = await sourceWalletClient.writeContract({
          address: to.messageTransmitter,
          abi: MESSAGE_TRANSMITTER_ABI,
          functionName: "receiveMessage",
          args: [attResult.message as `0x${string}`, attResult.attestation as `0x${string}`],
          account: address,
          chain: null as any,
        });
        await getChainClient(toChain).waitForTransactionReceipt({ hash: mintHash });

        setStatus("complete");
        updateTx({ status: "complete", mintTxHash: mintHash, amountIn: amount, amountOut: (Number(amount) * (isFastPath ? 0.998 : 0.999)).toFixed(2) });
        toast.success("Bridge complete!");
      } catch (err: any) {
        const msg = err?.shortMessage || err?.message || "Bridge failed";
        setStatus("failed");
        setError(msg);
        updateTx({ status: "failed", error: msg });
      }
    },
    [address, walletClient, ensureChain, updateTx, attestationV2, getChainClient]
  );

  const reset = useCallback(() => {
    setBridgeTx(null);
    setStatus("idle");
    setError(null);
  }, []);

  return {
    status,
    error,
    statusMessage,
    bridgeTx,
    attestation: attestationV2,
    startBridge,
    resumeTransaction,
    reset,
  };
}
