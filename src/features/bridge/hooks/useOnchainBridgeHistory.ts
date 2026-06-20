import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, keccak256, slice, hexToBigInt, formatUnits, getAddress, type Log } from "viem";
import {
  BRIDGE_CHAINS,
  BRIDGE_CHAIN_KEYS,
  MESSAGE_SENT_EVENT_ABI,
  MESSAGE_TRANSMITTER_ABI,
  type BridgeChainKey,
} from "../config/bridgeConfig";
import { type BridgeTransaction } from "../state/bridgeState";

/**
 * Reads a wallet's CCTP bridge history DIRECTLY ON-CHAIN.
 *
 * For each supported source chain it scans the MessageTransmitter's
 * `MessageSent(bytes message)` events over a recent block window, decodes the
 * CCTP v2 message, and keeps the ones the connected wallet initiated (it is the
 * `depositor`/messageSender in the burn message). Mint status is read from the
 * destination MessageTransmitter via `usedMessages(keccak256(message))`.
 *
 * Returns BridgeTransaction-shaped rows so the History list + Resume/Retry work
 * uniformly with the locally-tracked transactions.
 *
 * CCTP v2 message layout (verified against the recovery amount offset [216,248]):
 *   header = 148 bytes; then burnToken@152, mintRecipient@184, amount@216,
 *   messageSender(depositor)@248. Addresses are the last 20 bytes of each word.
 */

const ENV = (import.meta as { env?: Record<string, string> }).env ?? {};
const LOOKBACK_BLOCKS = BigInt(ENV.VITE_BRIDGE_HISTORY_LOOKBACK || "50000");
const CHUNK = 9000n; // Arc public RPC caps eth_getLogs at 10k blocks
const MAX_MINT_CHECKS = 40; // bound destination reads per scan

const DOMAIN_TO_KEY: Record<number, BridgeChainKey> = {};
for (const key of BRIDGE_CHAIN_KEYS) DOMAIN_TO_KEY[BRIDGE_CHAINS[key].domain] = key;

const messageSentEvent = MESSAGE_SENT_EVENT_ABI[0];

function clientFor(chainKey: BridgeChainKey) {
  return createPublicClient({ transport: http(BRIDGE_CHAINS[chainKey].rpcUrl) });
}

function addrFromWord(message: `0x${string}`, start: number): string | null {
  try {
    return getAddress(slice(message, start + 12, start + 32));
  } catch {
    return null;
  }
}

function decodeBurnMessage(message: `0x${string}`) {
  const srcDomain = Number(hexToBigInt(slice(message, 4, 8)));
  const dstDomain = Number(hexToBigInt(slice(message, 8, 12)));
  const burnToken = addrFromWord(message, 152);
  const mintRecipient = addrFromWord(message, 184);
  const amountRaw = hexToBigInt(slice(message, 216, 248));
  const depositor = addrFromWord(message, 248);
  return { srcDomain, dstDomain, burnToken, mintRecipient, amountRaw, depositor };
}

async function scanChain(
  sourceKey: BridgeChainKey,
  wallet: string,
): Promise<{ tx: BridgeTransaction; message: `0x${string}` }[]> {
  const client = clientFor(sourceKey);
  const latest = await client.getBlockNumber();
  const start = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n;
  const from = BRIDGE_CHAINS[sourceKey];
  const lower = wallet.toLowerCase();

  const found: { tx: BridgeTransaction; message: `0x${string}` }[] = [];

  for (let to = latest; to > start; to -= CHUNK + 1n) {
    const chunkFrom = to - CHUNK > start ? to - CHUNK : start;
    let logs: Log[] = [];
    try {
      logs = await client.getLogs({
        address: from.messageTransmitter,
        event: messageSentEvent,
        fromBlock: chunkFrom,
        toBlock: to,
      });
    } catch {
      continue; // RPC chunk failed — skip, keep scanning
    }

    for (const log of logs) {
      const message = (log as Log & { args?: { message?: `0x${string}` } }).args?.message;
      if (!message) continue;
      let decoded;
      try {
        decoded = decodeBurnMessage(message);
      } catch {
        continue;
      }
      if (decoded.depositor?.toLowerCase() !== lower) continue; // only this wallet's burns

      const toKey = DOMAIN_TO_KEY[decoded.dstDomain];
      const burnToken = decoded.burnToken?.toLowerCase();
      const tokenSymbol: "USDC" | "EURC" =
        from.eurc && burnToken === from.eurc.toLowerCase() ? "EURC" : "USDC";

      found.push({
        message,
        tx: {
          id: log.transactionHash ?? `${sourceKey}-${log.logIndex}`,
          fromChain: sourceKey,
          toChain: toKey ?? sourceKey,
          tokenSymbol,
          amount: formatUnits(decoded.amountRaw, from.usdcDecimals),
          status: "waiting_attestation", // refined below by usedMessages
          burnTxHash: log.transactionHash ?? undefined,
          createdAt: 0,
          updatedAt: 0,
        },
      });
    }
  }
  return found;
}

async function refineMintStatus(rows: { tx: BridgeTransaction; message: `0x${string}` }[]) {
  // Check the destination chain's usedMessages for the most recent rows.
  await Promise.all(
    rows.slice(0, MAX_MINT_CHECKS).map(async (row) => {
      const toKey = row.tx.toChain;
      try {
        const client = clientFor(toKey);
        const minted = (await client.readContract({
          address: BRIDGE_CHAINS[toKey].messageTransmitter,
          abi: MESSAGE_TRANSMITTER_ABI,
          functionName: "usedMessages",
          args: [keccak256(row.message)],
        } as never)) as boolean;
        row.tx.status = minted ? "complete" : "waiting_attestation";
      } catch {
        /* leave as waiting_attestation */
      }
    }),
  );
}

export function useOnchainBridgeHistory(address?: string) {
  const [rows, setRows] = useState<BridgeTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const scan = useCallback(async () => {
    if (!address) {
      setRows([]);
      setScanned(false);
      return;
    }
    setLoading(true);
    try {
      const perChain = await Promise.all(
        BRIDGE_CHAIN_KEYS.map((key) => scanChain(key, address).catch(() => [])),
      );
      const all = perChain.flat();
      await refineMintStatus(all);
      // newest first is unknown without block numbers; keep insertion (latest chunks first)
      setRows(all.map((r) => r.tx));
      setScanned(true);
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    scan();
  }, [scan]);

  return { rows, loading, scanned, refetch: scan };
}
