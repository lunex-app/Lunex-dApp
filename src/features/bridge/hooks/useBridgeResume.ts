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

function createChainClient(chainKey: BridgeChainKey) {
  return createPublicClient({
    transport: http(BRIDGE_CHAINS[chainKey].rpcUrl),
  });
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
  }) as boolean;
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
      const chainsToTry: BridgeChainKey[] = [...BRIDGE_CHAIN_KEYS];
      let receipt: any = null;
      let tx: any = null;
      let matchedChain: BridgeChainKey | null = null;

      for (const chainKey of chainsToTry) {
        try {
          const client = createChainClient(chainKey);
          receipt = await client.getTransactionReceipt({ hash: inputTxHash as `0x${string}` });
          if (receipt) {
            // Also get the actual transaction to extract sender
            try {
              tx = await client.getTransaction({ hash: inputTxHash as `0x${string}` });
            } catch { /* optional */ }
            matchedChain = chainKey;
            break;
          }
        } catch { continue; }
      }

      if (!receipt || !matchedChain) {
        throw new Error("Transaction not found on any supported chain. Please verify the hash.");
      }

      // Validate that the connected wallet matches the tx sender
      const sender = tx?.from || receipt?.from;
      if (sender && address && sender.toLowerCase() !== address.toLowerCase()) {
        throw new Error(
          `Wallet mismatch. This transaction was sent by ${sender.slice(0, 8)}...${sender.slice(-6)}. Please connect the originating wallet to recover this bridge.`
        );
      }

      // Parse logs for MessageSent event
      let foundMessageBytes: `0x${string}` | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: MESSAGE_SENT_EVENT_ABI,
            data: log.data,
            topics: log.topics,
          });
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

      setMessageBytes(foundMessageBytes);
      setMessageHash(keccak256(foundMessageBytes));
      setSourceTxHash(inputTxHash);
      setSourceDomain(BRIDGE_CHAINS[matchedChain].domain);
      setDetectedChain(BRIDGE_CHAINS[matchedChain].label);
      setBridgeDetails({ ...chains, amount, status: alreadyMinted ? "completed" : "pending" });
      setTxSender(sender || null);
      setStage(alreadyMinted ? "success" : "tx-found");
      if (alreadyMinted) toast.success("This CCTP message has already been completed on the destination chain.");

    } catch (err: any) {
      setErrorVisible(err.message || "Unknown error");
      setStage("error");
    }
  };

  /**
   * STEP 2: Check Circle for attestation (Single Check, no waiting)
   */
  const fetchAttestation = async () => {
    if (!sourceTxHash || sourceDomain === null) return;

    setStage("polling-attestation");

    try {
      const messageObj = await getIrisMessage(sourceDomain, sourceTxHash);
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
      setErrorVisible(err.message || "Checking attestation failed");
      setStage("error");
    }
  };

  /**
   * STEP 3: Mint on Destination Chain.
   */
  const completeMint = async () => {
    if (!messageBytes || !attestation || !bridgeDetails?.toChainKey) return;

    // Wallet address check — must match originating tx sender
    if (txSender && address && txSender.toLowerCase() !== address.toLowerCase()) {
      setErrorVisible(
        `Wallet mismatch. Connect the originating wallet (${txSender.slice(0, 8)}...${txSender.slice(-6)}) to complete this recovery.`
      );
      setStage("error");
      return;
    }

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
      }) as boolean;

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
      });

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
      setErrorVisible(err?.shortMessage || err?.message || "Minting transaction failed. Please check the explorer.");
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
