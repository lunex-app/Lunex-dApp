import { useState, useCallback, useRef } from "react";
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
 * This avoids wagmi's stale chainId issues during multi-step flows.
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
    // 4902 = chain not added
    if (switchError?.code === 4902) {
      throw new Error(
        `Chain ${targetChainId} not added to your wallet. Please add it manually and retry.`
      );
    }
    throw new Error(
      `Please switch your wallet to chain ID ${targetChainId} and try again.`
    );
  }

  // Wait for wallet to settle
  await new Promise((r) => setTimeout(r, 2000));
}

/** Get current wallet chain ID directly from provider */
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

  /**
   * Ensure wallet is on the correct chain. Uses direct provider calls
   * to avoid stale wagmi state during multi-step bridge flows.
   */
  const ensureChain = useCallback(
    async (targetChainId: number, label: string) => {
      const currentChainId = await getWalletChainId();
      if (currentChainId === targetChainId) return;

      setStatusMessage(`Switching to ${label}...`);
      await switchWalletChain(targetChainId);

      // Verify switch succeeded
      const afterChainId = await getWalletChainId();
      if (afterChainId !== targetChainId) {
        throw new Error(
          `Wallet is still on chain ${afterChainId}. Please switch to ${label} (chain ID: ${targetChainId}) manually.`
        );
      }
    },
    []
  );

  const startBridge = useCallback(
    async (amount: string, fromChain: BridgeChainKey, toChain: BridgeChainKey, isFastPath: boolean = false) => {
      if (!address || !walletClient) {
        setError("Wallet not connected");
        return;
      }

      if (fromChain === toChain) {
        setError("Source and destination chains must be different");
        return;
      }

      const from = BRIDGE_CHAINS[fromChain];
      const to = BRIDGE_CHAINS[toChain];
      const fromPublicClient = getChainClient(fromChain);
      const toPublicClient = getChainClient(toChain);
      const parsedAmount = parseUnits(amount, from.usdcDecimals);

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
      setStatusMessage("");
      saveBridgeTransaction(tx);

      try {
        // ── Step 0: Ensure wallet is on SOURCE chain ──
        await ensureChain(from.chainId, from.label);

        // Pre-flight: check USDC balance
        const balanceOfAbi = [{
          name: "balanceOf" as const,
          type: "function" as const,
          stateMutability: "view" as const,
          inputs: [{ name: "account", type: "address" as const }],
          outputs: [{ name: "", type: "uint256" as const }],
        }] as const;

        const callData = encodeFunctionData({
          abi: balanceOfAbi,
          functionName: "balanceOf",
          args: [address],
        });
        const raw = await fromPublicClient.call({ to: from.usdc, data: callData });
        const balance = decodeFunctionResult({ abi: balanceOfAbi, functionName: "balanceOf", data: raw.data! }) as bigint;

        if (balance < parsedAmount) {
          throw new Error(
            `Insufficient USDC balance. You have ${(Number(balance) / 10 ** from.usdcDecimals).toFixed(2)} USDC but tried to bridge ${amount} USDC.`
          );
        }

        // ── Step 1: Approve USDC (on SOURCE chain) ──
        setStatus("approving");
        setStatusMessage("Approving USDC spend on " + from.label + "...");
        updateTx({ status: "approving" });

        // Verify still on source chain before approve
        await ensureChain(from.chainId, from.label);

        const sourceWalletClient = createWalletClient({
          account: address as `0x${string}`,
          transport: custom((window as any).ethereum)
        });

        const approveHash = await sourceWalletClient.writeContract({
          address: from.usdc,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [from.tokenMessenger, parsedAmount],
          account: address,
          chain: null as any,
        });
        await fromPublicClient.waitForTransactionReceipt({ hash: approveHash });

        // ── Step 2: Burn via depositForBurn (on SOURCE chain) ──
        setStatus("burning");
        setStatusMessage("Burning USDC on " + from.label + "...");
        updateTx({ status: "burning" });

        // Verify STILL on source chain — do NOT switch to destination
        await ensureChain(from.chainId, from.label);

        const mintRecipient = pad(address, { size: 32 });
        const destinationCaller = zeroHash as `0x${string}`;
        const maxFee = isFastPath ? (parsedAmount * 10n / 10000n) : 0n; // 10 bps max fee for fast path
        const minFinalityThreshold = isFastPath ? 1000 : 2000;

        const burnHash = await sourceWalletClient.writeContract({
          address: from.tokenMessenger,
          abi: TOKEN_MESSENGER_ABI,
          functionName: "depositForBurn",
          args: [parsedAmount, to.domain, mintRecipient, from.usdc, destinationCaller, maxFee, minFinalityThreshold],
          account: address,
          chain: null as any,
        });

        await fromPublicClient.waitForTransactionReceipt({ hash: burnHash });

        // ── Step 3: Switch to DESTINATION chain while waiting for attestation ──
        setStatus("waiting_attestation");
        setStatusMessage(`Switching to ${to.label}...`);
        updateTx({
          status: "waiting_attestation",
          burnTxHash: burnHash,
        });

        // Prompt user to switch to destination chain immediately after burn
        await ensureChain(to.chainId, to.label);

        setStatusMessage("Waiting for Circle attestation...");
        const attResult = await attestationV2.startPolling(from.domain, burnHash);
        if (!attResult) {
          throw new Error("Attestation timeout — you can retry minting later from bridge history");
        }

        // ── Step 4: Mint on DESTINATION chain ──
        setStatus("minting");
        setStatusMessage("Minting USDC on " + to.label + "...");
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

        await toPublicClient.waitForTransactionReceipt({ hash: mintHash });

        setStatus("complete");
        setStatusMessage("Bridge complete!");
        updateTx({ 
          status: "complete", 
          mintTxHash: mintHash, 
          attestation: attResult.attestation,
          amountIn: amount,
          amountOut: (Number(amount) * (isFastPath ? 0.998 : 0.999)).toFixed(2) // 0.1% extra fee for fast path
        });
        toast.success("Bridge complete!", { description: `Received ${(Number(amount) * (isFastPath ? 0.998 : 0.999)).toFixed(2)} USDC on ${to.label}` });
      } catch (err: any) {
        const msg = err?.shortMessage || err?.message || "Bridge failed";
        setStatus("failed");
        setError(msg);
        setStatusMessage("");
        updateTx({ status: "failed", error: msg });
      }
    },
    [address, walletClient, ensureChain, updateTx, attestationV2, getChainClient]
  );

  const completeMint = useCallback(async () => {
    if (!bridgeTx || !walletClient || !bridgeTx.burnTxHash || !address) return;

    const from = BRIDGE_CHAINS[bridgeTx.fromChain];
    const to = BRIDGE_CHAINS[bridgeTx.toChain];
    const toPublicClient = getChainClient(bridgeTx.toChain);

    try {
      // Re-poll attestation if needed
      setStatus("waiting_attestation");
      setStatusMessage("Checking attestation status...");
      const attResult = await attestationV2.startPolling(from.domain, bridgeTx.burnTxHash);
      if (!attResult) {
        throw new Error("Attestation not ready yet");
      }

      // Switch to destination chain for minting
      setStatusMessage("Switch to " + to.label + " to complete mint...");
      await ensureChain(to.chainId, to.label);

      setStatus("minting");
      setStatusMessage("Minting USDC on " + to.label + "...");
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

      await toPublicClient.waitForTransactionReceipt({ hash: mintHash });

      setStatus("complete");
      setStatusMessage("Bridge complete!");
      updateTx({ status: "complete", mintTxHash: mintHash, attestation: attResult.attestation });
      toast.success("Bridge complete!", { description: "Your USDC has been successfully bridged." });
    } catch (err: any) {
      const msg = err?.shortMessage || err?.message || "Mint failed";
      setStatus("failed");
      setError(msg);
      setStatusMessage("");
      updateTx({ status: "failed", error: msg });
    }
  }, [bridgeTx, walletClient, attestationV2, ensureChain, updateTx, address, getChainClient]);

  const reset = useCallback(() => {
    setBridgeTx(null);
    setStatus("idle");
    setError(null);
    setStatusMessage("");
  }, []);

  const resumeBridge = useCallback((tx: BridgeTransaction) => {
    setBridgeTx(tx);
    setStatus(tx.status);
    setError(tx.error || null);
    setStatusMessage("");
  }, []);

  return {
    status,
    error,
    statusMessage,
    bridgeTx,
    attestation: attestationV2,
    startBridge,
    completeMint,
    reset,
    resumeBridge,
  };
}
