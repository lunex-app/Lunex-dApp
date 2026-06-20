import { useState, useCallback } from "react";
import { createPublicClient, http, keccak256, decodeEventLog, hexToBigInt, slice, formatUnits } from "viem";
import { useWriteContract, useAccount } from "wagmi";
import { 
  BRIDGE_CHAINS, 
  BRIDGE_CHAIN_KEYS,
  MESSAGE_TRANSMITTER_ABI, 
  MESSAGE_SENT_EVENT_ABI, 
  IRIS_API_URL,
  type BridgeChainKey
} from "../config/bridgeConfig";
import { toast } from "sonner";
import { loadBridgeTransactions, saveBridgeTransaction } from "../state/bridgeState";
import { humanizeError } from "@/lib/errors";

export type ResumeStage = 
  | "idle" 
  | "scanning"
  | "tx-found"
  | "polling-attestation"
  | "ready-to-mint"
  | "minting"
  | "success" 
  | "error";

export interface BridgeDetails {
  fromChain: string;
  toChain: string;
  toChainKey?: BridgeChainKey;
  amount: string;
  status?: "pending" | "attested" | "completed";
  attestationStatus?: string;
  completionTxHash?: string | null;
}

// Map CCTP domain IDs to chain keys
const DOMAIN_TO_KEY: Record<number, BridgeChainKey> = {};
for (const key of BRIDGE_CHAIN_KEYS) {
  DOMAIN_TO_KEY[BRIDGE_CHAINS[key].domain] = key;
}

/**
 * Extract source/destination domains from CCTP message bytes.
 */
function extractChains(messageBytes: `0x${string}`): { fromChain: string; toChain: string; toChainKey?: BridgeChainKey } {
  try {
    const srcDomain = Number(hexToBigInt(slice(messageBytes, 4, 8)));
    const dstDomain = Number(hexToBigInt(slice(messageBytes, 8, 12)));
    
    const srcKey = DOMAIN_TO_KEY[srcDomain];
    const dstKey = DOMAIN_TO_KEY[dstDomain];

    return {
      fromChain: srcKey ? BRIDGE_CHAINS[srcKey].label : `Domain ${srcDomain}`,
      toChain: dstKey ? BRIDGE_CHAINS[dstKey].label : `Domain ${dstDomain}`,
      toChainKey: dstKey,
    };
  } catch {
    return { fromChain: "Unknown", toChain: "Unknown" };
  }
}

function extractBurnAmountFromMessage(messageBytes: `0x${string}`): string {
  try {
    const rawAmount = hexToBigInt(slice(messageBytes, 216, 248));
    return formatUnits(rawAmount, 6);
  } catch {
    return "0.00";
  }
}

function createChainClient(chainKey: BridgeChainKey, rpcUrl?: string) {
  return createPublicClient({
    transport: http(rpcUrl ?? BRIDGE_CHAINS[chainKey].rpcUrl),
  });
}

// Public RPCs flake/rate-limit, which would make a valid hash look "not found".
// Try several per chain so recovery works across all supported networks.
const FALLBACK_RPCS: Record<BridgeChainKey, string[]> = {
  ethereum: ["https://eth-sepolia.public.blastapi.io", "https://ethereum-sepolia-rpc.publicnode.com", "https://rpc.sepolia.org", "https://1rpc.io/sepolia"],
  base: ["https://base-sepolia-rpc.publicnode.com", "https://sepolia.base.org", "https://base-sepolia.gateway.tenderly.co"],
  arbitrum: ["https://sepolia-rollup.arbitrum.io/rpc", "https://arbitrum-sepolia-rpc.publicnode.com"],
  avalanche: ["https://avalanche-fuji-c-chain-rpc.publicnode.com", "https://api.avax-test.network/ext/bc/C/rpc"],
  polygon: ["https://rpc-amoy.polygon.technology", "https://polygon-amoy-bor-rpc.publicnode.com"],
  arc: ["https://rpc.testnet.arc.network"],
};

function isNotFoundError(e: unknown): boolean {
  const s = String((e as { name?: string; message?: string })?.name ?? "") + " " + String((e as { message?: string })?.message ?? "");
  return /not\s*be?\s*found|notfound|could not be found/i.test(s);
}

/**
 * Look up a tx receipt on one chain, trying each fallback RPC. Returns the
 * receipt+tx when found, or null when the tx is genuinely not on this chain.
 * A "not found" reply ends the chain early; transient RPC errors fall through
 * to the next RPC so a flaky endpoint can't mask a valid hash.
 */
async function findOnChain(chainKey: BridgeChainKey, hash: `0x${string}`) {
  for (const rpc of FALLBACK_RPCS[chainKey]) {
    try {
      const client = createChainClient(chainKey, rpc);
      const receipt = await client.getTransactionReceipt({ hash });
      if (receipt) {
        let tx: unknown = null;
        try { tx = await client.getTransaction({ hash }); } catch { /* optional */ }
        return { receipt, tx, chainKey };
      }
    } catch (e) {
      if (isNotFoundError(e)) return null; // definitively not on this chain
      // else transient RPC error — try the next fallback RPC
    }
  }
  return null;
}

async function getIrisMessage(sourceDomain: number, txHash: string) {
  const res = await fetch(`${IRIS_API_URL}/v2/messages/${sourceDomain}?transactionHash=${txHash}`);
  const body = await res.text();
  if (!res.ok) {
    const detail = body.trim().slice(0, 240);
    throw new Error(`Circle Iris returned HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }

  try {
    const data = JSON.parse(body);
    return data?.messages?.[0] ?? null;
  } catch {
    throw new Error("Circle Iris returned an unreadable response.");
  }
}

async function checkAlreadyMinted(toChainKey: BridgeChainKey | undefined, message: `0x${string}`) {
  if (!toChainKey) return false;
  const targetChain = BRIDGE_CHAINS[toChainKey];
  const client = createChainClient(toChainKey);
  return await client.readContract({
    address: targetChain.messageTransmitter,
    abi: MESSAGE_TRANSMITTER_ABI,
    functionName: "usedMessages",
    args: [keccak256(message)],
  } as any) as boolean;
}

export function useBridgeResume() {
  const { address, isConnected } = useAccount();
  const [stage, setStage] = useState<ResumeStage>("idle");
  const [errorVisible, setErrorVisible] = useState<string | null>(null);
  const [messageBytes, setMessageBytes] = useState<`0x${string}` | null>(null);
  const [messageHash, setMessageHash] = useState<string | null>(null);
  const [attestation, setAttestation] = useState<`0x${string}` | null>(null);
  const [sourceTxHash, setSourceTxHash] = useState<string | null>(null);
  const [sourceDomain, setSourceDomain] = useState<number | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);
  const [detectedChain, setDetectedChain] = useState<string | null>(null);
  const [bridgeDetails, setBridgeDetails] = useState<BridgeDetails | null>(null);
  // Track original sender from the tx for wallet validation
  const [txSender, setTxSender] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const reset = useCallback(() => {
    setStage("idle");
    setErrorVisible(null);
    setMessageBytes(null);
    setMessageHash(null);
    setAttestation(null);
    setSourceTxHash(null);
    setSourceDomain(null);
    setMintTxHash(null);
    setDetectedChain(null);
    setBridgeDetails(null);
    setTxSender(null);
  }, []);

  /**
   * STEP 1: Scan chains, find tx, extract CCTP message + amount from Transfer logs.
   */
  const findTransaction = async (inputTxHash: string) => {
    if (!isConnected) {
      toast.error("Connect wallet first");
      return;
    }

    setStage("scanning");
    setErrorVisible(null);

    try {
      // Scan all supported chains in parallel (each with RPC fallbacks), then
      // pick the match in canonical order. This works for a hash from any of the
      // 6 networks and isn't defeated by a single flaky RPC.
      const settled = await Promise.all(
        BRIDGE_CHAIN_KEYS.map((key) => findOnChain(key, inputTxHash as `0x${string}`).catch(() => null)),
      );
      const match = settled.find(Boolean);

      if (!match) {
        throw new Error("Transaction not found on any supported chain. Please verify the hash.");
      }
      const receipt = match.receipt as any;
      const tx = match.tx as any;
      const matchedChain = match.chainKey;

      // Record the original sender for display. We do NOT block on a mismatch:
      // Lunex burns set destinationCaller = zeroHash, so ANY wallet may submit
      // receiveMessage and the minted USDC still goes to the original
      // mintRecipient encoded in the message. Blocking here would defeat
      // recovery (e.g. recovering from a different device/wallet).
      const sender = tx?.from || receipt?.from;

      // Parse logs for MessageSent event
      let foundMessageBytes: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: MESSAGE_SENT_EVENT_ABI,
            data: log.data,
            topics: log.topics,
          }) as { eventName: string; args: { message: `0x${string}` } };
          if (decoded.eventName === "MessageSent") {
            foundMessageBytes = decoded.args.message;
            break;
          }
        } catch { continue; }
      }

      if (!foundMessageBytes) {
        throw new Error("This is not a valid CCTP bridge transaction. No MessageSent event found.");
      }

      // Extract chain info and the CCTP burn amount from message bytes.
      const chains = extractChains(foundMessageBytes);
      const amount = extractBurnAmountFromMessage(foundMessageBytes);
      const alreadyMinted = await checkAlreadyMinted(chains.toChainKey, foundMessageBytes);

      const matchedDomain = BRIDGE_CHAINS[matchedChain].domain;
      setMessageBytes(foundMessageBytes);
      setMessageHash(keccak256(foundMessageBytes));
      setSourceTxHash(inputTxHash);
      setSourceDomain(matchedDomain);
      setDetectedChain(BRIDGE_CHAINS[matchedChain].label);
      setBridgeDetails({ ...chains, amount, status: alreadyMinted ? "completed" : "pending" });
      setTxSender(sender || null);

      if (alreadyMinted) {
        setStage("success");
        toast.success("This CCTP message has already been completed on the destination chain.");
        return;
      }

      setStage("tx-found");
      // Auto-progress: immediately try to fetch the Circle attestation so the
      // user only needs to paste a hash, then click Complete when ready.
      void fetchAttestation(inputTxHash, matchedDomain);

    } catch (err: any) {
      setErrorVisible(humanizeError(err, "Couldn't find that transaction. Check the hash and try again."));
      setStage("error");
    }
  };

  /**
   * STEP 2: Check Circle for attestation (Single Check, no waiting)
   */
  const fetchAttestation = async (txHashArg?: string, domainArg?: number) => {
    const txHash = txHashArg ?? sourceTxHash;
    const domain = domainArg ?? sourceDomain;
    if (!txHash || domain === null || domain === undefined) return;

    setStage("polling-attestation");

    try {
      const messageObj = await getIrisMessage(domain, txHash);
      if (!messageObj) {
        throw new Error("Circle Iris found no CCTP message for this transaction yet.");
      }

      const messageFromIris = messageObj.message as `0x${string}` | undefined;
      const decoded = messageObj.decodedMessage;
      const decodedBody = decoded?.decodedMessageBody;
      const srcKey = DOMAIN_TO_KEY[Number(decoded?.sourceDomain)];
      const dstKey = DOMAIN_TO_KEY[Number(decoded?.destinationDomain)];
      const amount = decodedBody?.amount ? formatUnits(BigInt(decodedBody.amount), 6) : (messageFromIris ? extractBurnAmountFromMessage(messageFromIris) : bridgeDetails?.amount ?? "0.00");
      const nextDetails = {
        fromChain: srcKey ? BRIDGE_CHAINS[srcKey].label : decoded?.sourceDomain ? `Domain ${decoded.sourceDomain}` : bridgeDetails?.fromChain ?? "Unknown",
        toChain: dstKey ? BRIDGE_CHAINS[dstKey].label : decoded?.destinationDomain ? `Domain ${decoded.destinationDomain}` : bridgeDetails?.toChain ?? "Unknown",
        toChainKey: dstKey ?? bridgeDetails?.toChainKey,
        amount,
        attestationStatus: messageObj.status,
        completionTxHash: messageObj.forwardTxHash ?? null,
      };

      if (messageFromIris) {
        const alreadyMinted = await checkAlreadyMinted(nextDetails.toChainKey, messageFromIris);
        if (alreadyMinted || messageObj.forwardState === "CONFIRMED" || messageObj.forwardState === "COMPLETE") {
          setMessageBytes(messageFromIris);
          setAttestation((messageObj.attestation ?? null) as `0x${string}` | null);
          setBridgeDetails({ ...nextDetails, status: "completed" });
          setStage("success");
          toast.success("This bridge has already been completed.");
          return;
        }
      }

      setBridgeDetails({ ...nextDetails, status: messageObj?.status === "complete" ? "attested" : "pending" });

      if (messageObj?.status === "complete" && messageObj?.attestation && messageObj?.message) {
        setMessageBytes(messageObj.message as `0x${string}`);
        setAttestation(messageObj.attestation as `0x${string}`);
        setStage("ready-to-mint");
      } else {
        throw new Error("Attestation not ready yet. The source chain may still be finalizing. Please try again in a few minutes.");
      }
    } catch (err: any) {
      setErrorVisible(humanizeError(err, "Couldn't check the Circle attestation. Please try again shortly."));
      setStage("error");
    }
  };

  /**
   * STEP 3: Mint on Destination Chain.
   */
  const completeMint = async () => {
    if (!messageBytes || !attestation || !bridgeDetails?.toChainKey) return;

    // No wallet-match requirement: the mint sends USDC to the mintRecipient
    // baked into the message, not to msg.sender. Any connected wallet on the
    // destination chain can finalize a stuck transfer.
    setStage("minting");
    
    // Dynamically retrieve the correct destination chain config
    const targetChain = BRIDGE_CHAINS[bridgeDetails.toChainKey];
    if (!targetChain) {
      setErrorVisible("Destination chain configuration not found.");
      setStage("error");
      return;
    }

    try {
      // PROACTIVELY CHECK IF ALREADY PROCESSED
      const client = createChainClient(bridgeDetails.toChainKey);
      const isAlreadyMinted = await client.readContract({
        address: targetChain.messageTransmitter,
        abi: MESSAGE_TRANSMITTER_ABI,
        functionName: "usedMessages",
        args: [keccak256(messageBytes)],
      } as any) as boolean;

      if (isAlreadyMinted) {
         // If already minted, we treat it as success but notify the user
         if (sourceTxHash) {
            const history = loadBridgeTransactions();
            const pendingTx = history.find(t => t.burnTxHash?.toLowerCase() === sourceTxHash.toLowerCase() || t.id === sourceTxHash);
            if (pendingTx) {
               pendingTx.status = "complete";
               pendingTx.updatedAt = Date.now();
               saveBridgeTransaction(pendingTx);
            }
         }
         setStage("success");
         toast.success("This bridge has already been completed.");
         return;
      }

      const hash = await writeContractAsync({
        address: targetChain.messageTransmitter,
        abi: MESSAGE_TRANSMITTER_ABI,
        functionName: "receiveMessage",
        args: [messageBytes, attestation],
        chainId: targetChain.chainId,
      } as any);

      // Wait for actual transaction receipt
      const receipt = await client.waitForTransactionReceipt({ hash });

      // Verify it succeeded onchain (status 1 = success)
      if (receipt.status !== "success") {
        throw new Error("Minting transaction was submitted but reverted onchain. Check the explorer for details.");
      }

      // Link to Bridge History: find the matching pending tx and set to complete
      if (sourceTxHash) {
        const history = loadBridgeTransactions();
        const pendingTx = history.find(t => 
          t.burnTxHash?.toLowerCase() === sourceTxHash.toLowerCase() || 
          t.id === sourceTxHash
        );
        if (pendingTx) {
          pendingTx.status = "complete";
          pendingTx.mintTxHash = hash;
          pendingTx.updatedAt = Date.now();
          saveBridgeTransaction(pendingTx);
        }
      }

      setMintTxHash(hash);
      setStage("success");
      toast.success(`Bridge recovered! USDC minted on ${targetChain.label}.`);
    } catch (err: any) {
      setErrorVisible(humanizeError(err, "Minting failed. Please try again or check the explorer."));
      setStage("error");
    }
  };

  return {
    findTransaction,
    fetchAttestation,
    completeMint,
    reset,
    stage,
    errorVisible,
    mintTxHash,
    detectedChain,
    bridgeDetails,
    txSender,
  };
}
