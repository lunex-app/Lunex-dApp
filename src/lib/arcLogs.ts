/**
 * Shared reader for Lunex contract event logs on Arc, sourced LIVE from the
 * chain via Arc's indexed explorer (Blockscout-style) `getLogs` API. No
 * Supabase, no off-chain database — the on-chain events are the source of truth.
 *
 * Used by the protocol volume reader and the public Analytics dashboard.
 */
import { EXPLORER_URL } from "@/config/wagmi";

// keccak256 of each event signature (topic0). Verified against deployed logs.
export const ARC_TOPICS = {
  // StableSwap pool — TokenExchange(address indexed buyer, uint256 sold_id,
  //   uint256 tokens_sold, uint256 bought_id, uint256 tokens_bought).
  //   index 0 = USDC, index 1 = EURC; one leg of every trade is USDC.
  tokenExchange: "0xb2e76ae99761dc136e598d4a629bb347eccb9532a5f8bbd72e18467c3c34cc98",
  // StableSwap pool — AddLiquidity(address indexed provider, uint256 amount0
  //   (USDC), uint256 amount1 (EURC), uint256 invariant, uint256 token_supply).
  addLiquidity: "0xd92dda7384b5f0fa573be9bbf63d63ac81a5bbb08ebc31f00c0f066e50239609",
  // ERC-4626 vaults — Deposit/Withdraw: data = [assets, shares].
  deposit: "0xdcbc1c05240f31ff3ad067ef1ee35ce4997762752e3a095284754544f4c709d7",
  withdraw: "0xfbde797d201c681b91056529119e0b02407c7bb96a4a2c75c01fc9667232c8db",
  // CCTP MessageTransmitter — MessageSent(bytes message) (outbound burns).
  messageSent: "0x8c5261668696ce22758910d05bab8f186d6eb247ceac2af2e82c7dc17669b036",
  // CCTP v2 TokenMessenger — DepositForBurn(address burnToken, uint256 amount,
  //   address depositor, bytes32 mintRecipient, ...). amount = data word 0.
  depositForBurn: "0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5",
} as const;

// CCTP v2 sandbox contracts on Arc (shared across testnet chains).
export const ARC_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA";

// Block the swap pool was deployed at — bounds all-time scans.
export const POOL_DEPLOY_BLOCK = 31_829_533;
export const STABLE_DECIMALS = 1e6; // USDC + EURC both have 6 decimals on Arc

const MAX_PAGES = 30; // 30 * 1000 events guard against a runaway loop
const PAGE_SIZE = 1000; // Blockscout caps getLogs at 1000 rows/response

export interface ExplorerLog {
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  timeStamp: string; // hex unix seconds
  topics: (string | null)[];
  data: string;
}

/** Read the n-th 32-byte word of a log's data as a bigint. */
export function logWord(data: string, index: number): bigint {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const slice = hex.slice(index * 64, (index + 1) * 64);
  if (slice.length < 64) return 0n;
  return BigInt("0x" + slice);
}

/** Unix seconds a log was emitted (0 if unavailable). */
export function logTime(log: ExplorerLog): number {
  if (!log.timeStamp) return 0;
  const t = parseInt(log.timeStamp, 16);
  return Number.isFinite(t) ? t : 0;
}

/** The address packed in an indexed topic (last 20 bytes), lowercased. */
export function topicAddress(log: ExplorerLog, topicIndex: number): string | null {
  const t = log.topics[topicIndex];
  if (!t || t.length < 66) return null;
  return ("0x" + t.slice(26)).toLowerCase();
}

/**
 * Fetch every log of `topic0` emitted by `address` since `fromBlock`, paginating
 * through the explorer (it returns at most 1000 rows): advance `fromBlock` past
 * the last block seen and de-duplicate overlapping rows by (txHash, logIndex).
 */
export async function fetchAllLogs(
  address: string,
  topic0: string,
  fromBlock: number = POOL_DEPLOY_BLOCK,
  maxPages: number = MAX_PAGES,
): Promise<ExplorerLog[]> {
  const out: ExplorerLog[] = [];
  const seen = new Set<string>();
  let cursor = fromBlock;

  for (let page = 0; page < maxPages; page++) {
    const url =
      `${EXPLORER_URL}/api?module=logs&action=getLogs` +
      `&address=${address}&topic0=${topic0}&fromBlock=${cursor}&toBlock=latest`;
    let rows: ExplorerLog[] = [];
    try {
      const res = await fetch(url);
      const json = (await res.json()) as { result?: ExplorerLog[] | string };
      if (!Array.isArray(json.result)) break; // "No records found" or an error string
      rows = json.result;
    } catch {
      break;
    }
    if (rows.length === 0) break;

    let maxBlock = cursor;
    for (const row of rows) {
      const key = `${row.transactionHash}:${row.logIndex}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(row);
      }
      const b = parseInt(row.blockNumber, 16);
      if (b > maxBlock) maxBlock = b;
    }

    if (rows.length < PAGE_SIZE) break; // last page
    if (maxBlock <= cursor) break; // no progress — avoid an infinite loop
    cursor = maxBlock; // overlap on maxBlock handled by the dedupe set
  }

  return out;
}
