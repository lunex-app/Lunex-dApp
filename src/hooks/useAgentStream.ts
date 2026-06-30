import { useState, useCallback, useEffect, useRef } from "react";
import { formatUnits, parseUnits, createPublicClient, http } from "viem";
import { useReadContract } from "wagmi";
import { useWallet } from "@/context/WalletProvider";
import { useTx } from "./useTx";
import { lunexStreamAbi, lunexLimitOrderKeeperAbi, erc20Abi, stableSwapAbi } from "@/config/abis";
import { CONTRACTS, TOKENS, arcTestnet } from "@/config/wagmi";
import type { Write } from "@/lib/circleTx";

// ── Signal Agent ──────────────────────────────────────────────────────────────

export type PriceSignal = "BUY_USDC" | "BUY_EURC" | "NEUTRAL";

export interface SignalEntry {
  id: string;
  timestamp: number;
  signal: PriceSignal;
  usdcReserve: number;
  eurcReserve: number;
  ratio: number;
  reasoning: string;
}

// ── Execution Agent ───────────────────────────────────────────────────────────

export interface ExecutionLogEntry {
  id: string;
  timestamp: number;
  signal: PriceSignal;
  action: "swap" | "skipped" | "no_stream";
  txHash?: string;
  amountIn?: string;
  reasoning: string;
}

// ── Keeper Agent ──────────────────────────────────────────────────────────────

export interface KeeperLogEntry {
  id: string;
  timestamp: number;
  orderId: number;
  action: "executed" | "skipped" | "no_orders";
  txHash?: string;
  reasoning: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// The Lunex treasury acts as the "Signal Agent service wallet" in this demo.
// In production this would be a separate registered agent's address.
const SIGNAL_AGENT_WALLET = "0xC81b2328f7f04DC667428DA9a84CE627338873fd" as `0x${string}`;

const STREAM_RATE_PER_SECOND = 0.001;   // $0.001 USDC per second
const STREAM_DURATION_SECS   = 3600;    // 1 hour stream
const STREAM_TOTAL_USDC      = STREAM_RATE_PER_SECOND * STREAM_DURATION_SECS; // 3.6 USDC

const SWAP_AMOUNT_USDC       = "1";     // 1 USDC per signal trade
const SIGNAL_INTERVAL_MS     = 10_000;  // 10-second signal cadence
const KEEPER_INTERVAL_MS     = 30_000;  // 30-second keeper scan
const IMBALANCE_THRESHOLD    = 0.02;    // 2% deviation from 1:1 triggers a signal

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useAgentStream() {
  const { address, isConnected } = useWallet();
  const streamTx = useTx();
  const execTx   = useTx();
  const keeperTx = useTx();

  // Signal Agent
  const [signalActive, setSignalActive] = useState(false);
  const [signals, setSignals] = useState<SignalEntry[]>([]);
  const [latestSignal, setLatestSignal] = useState<PriceSignal>("NEUTRAL");

  // Execution Agent
  const [activeStreamId, setActiveStreamId] = useState<bigint | null>(null);
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [execLog, setExecLog] = useState<ExecutionLogEntry[]>([]);
  const [execActive, setExecActive] = useState(false);

  // Keeper Agent
  const [keeperActive, setKeeperActive] = useState(false);
  const [keeperLog, setKeeperLog] = useState<KeeperLogEntry[]>([]);

  // Prevent overlapping keeper scans
  const keeperRunningRef = useRef(false);
  // Track which signal was last acted on so we don't double-execute
  const lastActedSignalRef = useRef<string | null>(null);

  // ── Pool balances for signal generation ──────────────────────────────────────

  const { data: poolBalancesRaw } = useReadContract({
    address: CONTRACTS.LUNEX_SWAP_POOL,
    abi: stableSwapAbi,
    functionName: "get_balances",
    chainId: arcTestnet.id,
    query: { refetchInterval: signalActive ? SIGNAL_INTERVAL_MS : 30_000 },
  });

  // ── nextOrderId for keeper scan ───────────────────────────────────────────────

  const { data: nextOrderIdRaw, refetch: refetchNextOrderId } = useReadContract({
    address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER,
    abi: lunexLimitOrderKeeperAbi,
    functionName: "nextOrderId",
    chainId: arcTestnet.id,
    query: { refetchInterval: keeperActive ? KEEPER_INTERVAL_MS : false },
  });
  const nextOrderId = (nextOrderIdRaw as bigint | undefined) ?? 0n;

  // ── Signal Agent logic ────────────────────────────────────────────────────────

  const generateSignal = useCallback((): Omit<SignalEntry, "id"> => {
    const ts = Date.now();
    if (!poolBalancesRaw) {
      return { timestamp: ts, signal: "NEUTRAL", usdcReserve: 0, eurcReserve: 0, ratio: 1, reasoning: "Pool data unavailable." };
    }
    const balances = poolBalancesRaw as readonly [bigint, bigint];
    const usdcReserve = Number(balances[0]) / 1e6;
    const eurcReserve = Number(balances[1]) / 1e6;
    const ratio = eurcReserve > 0 ? usdcReserve / eurcReserve : 1;

    let signal: PriceSignal = "NEUTRAL";
    let reasoning = "";
    if (ratio < 1 - IMBALANCE_THRESHOLD) {
      signal = "BUY_USDC";
      reasoning = `Pool: ${usdcReserve.toFixed(0)} USDC / ${eurcReserve.toFixed(0)} EURC (ratio ${ratio.toFixed(3)}). Pool is EURC-heavy - buy USDC to restore peg.`;
    } else if (ratio > 1 + IMBALANCE_THRESHOLD) {
      signal = "BUY_EURC";
      reasoning = `Pool: ${usdcReserve.toFixed(0)} USDC / ${eurcReserve.toFixed(0)} EURC (ratio ${ratio.toFixed(3)}). Pool is USDC-heavy - buy EURC to restore peg.`;
    } else {
      reasoning = `Pool ratio ${ratio.toFixed(3)} - within ${(IMBALANCE_THRESHOLD * 100).toFixed(0)}% of peg. No arbitrage opportunity.`;
    }
    return { timestamp: ts, signal, usdcReserve, eurcReserve, ratio, reasoning };
  }, [poolBalancesRaw]);

  const appendSignal = useCallback((entry: Omit<SignalEntry, "id">) => {
    const id = `sig_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setSignals((prev) => [{ id, ...entry }, ...prev].slice(0, 60));
    setLatestSignal(entry.signal);
    return id;
  }, []);

  const signalTickRef = useRef(() => {
    const entry = generateSignal();
    appendSignal(entry);
  });
  signalTickRef.current = () => {
    const entry = generateSignal();
    appendSignal(entry);
  };

  useEffect(() => {
    if (!signalActive) return;
    signalTickRef.current();
    const id = setInterval(() => signalTickRef.current(), SIGNAL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [signalActive]);

  // ── Execution Agent - stream creation ─────────────────────────────────────────

  const createStream = useCallback(async () => {
    if (!address || !isConnected) return;
    const totalAmountRaw = parseUnits(STREAM_TOTAL_USDC.toString(), 6);
    const now = BigInt(Math.floor(Date.now() / 1000));
    const end = now + BigInt(STREAM_DURATION_SECS);

    const writes: Write[] = [
      {
        address: TOKENS.USDC.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [CONTRACTS.LUNEX_STREAM, totalAmountRaw],
      },
      {
        address: CONTRACTS.LUNEX_STREAM,
        abi: lunexStreamAbi,
        functionName: "createStream",
        args: [
          SIGNAL_AGENT_WALLET, // recipient: Signal Agent service wallet
          TOKENS.USDC.address, // token
          totalAmountRaw,      // totalAmount
          now,                 // startTime
          end,                 // endTime
          0n,                  // cliffTime (none)
          1n,                  // releaseFrequency = per-second
          0,                   // streamType: Linear (0)
          true,                // cancelable
          false,               // transferable
          true,                // recipientCanClaimAnytime
        ],
      },
    ];

    await streamTx.execute(writes);
    // The real stream ID would be parsed from the tx receipt's StreamCreated event.
    // For demo purposes we use a placeholder bigint.
    setActiveStreamId(BigInt(Date.now() % 1000 + 1));
    setStreamStartedAt(Date.now());
    setExecActive(true);
  }, [address, isConnected, streamTx]);

  const cancelStream = useCallback(async () => {
    if (activeStreamId === null) return;
    await streamTx.execute([
      {
        address: CONTRACTS.LUNEX_STREAM,
        abi: lunexStreamAbi,
        functionName: "cancel",
        args: [activeStreamId],
      },
    ]);
    setActiveStreamId(null);
    setStreamStartedAt(null);
    setExecActive(false);
  }, [activeStreamId, streamTx]);

  // ── Execution Agent - act on signals ─────────────────────────────────────────

  const appendExecLog = useCallback((entry: Omit<ExecutionLogEntry, "id">) => {
    const id = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setExecLog((prev) => [{ id, ...entry }, ...prev].slice(0, 60));
  }, []);

  const executeOnSignal = useCallback(
    async (signal: PriceSignal, signalId: string) => {
      if (lastActedSignalRef.current === signalId) return; // already handled
      lastActedSignalRef.current = signalId;

      if (!execActive || activeStreamId === null) {
        appendExecLog({
          timestamp: Date.now(),
          signal,
          action: "no_stream",
          reasoning: "No active payment stream. Subscribe to the Signal Agent first.",
        });
        return;
      }
      if (signal === "NEUTRAL") {
        appendExecLog({ timestamp: Date.now(), signal, action: "skipped", reasoning: "Signal is NEUTRAL - no trade required." });
        return;
      }
      if (!address || !isConnected) return;

      const fromSymbol = signal === "BUY_USDC" ? "EURC" : "USDC";
      const toSymbol   = signal === "BUY_USDC" ? "USDC" : "EURC";
      const fromAddr   = fromSymbol === "USDC" ? TOKENS.USDC.address : TOKENS.EURC.address;
      const i = BigInt(fromSymbol === "USDC" ? 0 : 1);
      const j = BigInt(toSymbol   === "USDC" ? 0 : 1);
      const amountIn = parseUnits(SWAP_AMOUNT_USDC, 6);

      const writes: Write[] = [
        { address: fromAddr, abi: erc20Abi, functionName: "approve", args: [CONTRACTS.LUNEX_SWAP_POOL, amountIn] },
        { address: CONTRACTS.LUNEX_SWAP_POOL, abi: stableSwapAbi, functionName: "exchange", args: [i, j, amountIn, 0n] },
      ];
      const hash = await execTx.execute(writes);

      appendExecLog({
        timestamp: Date.now(),
        signal,
        action: "swap",
        txHash: hash ?? undefined,
        amountIn: SWAP_AMOUNT_USDC,
        reasoning: `Signal: ${signal}. Swapped ${SWAP_AMOUNT_USDC} ${fromSymbol} → ${toSymbol} to help restore pool peg. Stream paying $${STREAM_RATE_PER_SECOND}/s.`,
      });
    },
    [execActive, activeStreamId, address, isConnected, execTx, appendExecLog],
  );

  // React to new signals when execution agent is subscribed
  useEffect(() => {
    if (!execActive || signals.length === 0) return;
    const newest = signals[0];
    executeOnSignal(newest.signal, newest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signals]);

  // ── Keeper Agent ──────────────────────────────────────────────────────────────

  const appendKeeperLog = useCallback((entry: Omit<KeeperLogEntry, "id">) => {
    const id = `keep_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setKeeperLog((prev) => [{ id, ...entry }, ...prev].slice(0, 60));
  }, []);

  const runKeeperScan = useCallback(async () => {
    if (keeperRunningRef.current || !isConnected) return;
    keeperRunningRef.current = true;
    try {
      if (nextOrderId === 0n) {
        appendKeeperLog({ timestamp: Date.now(), orderId: 0, action: "no_orders", reasoning: "No limit orders exist yet." });
        return;
      }

      const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
      let foundExecutable = false;

      for (let oid = 1n; oid <= nextOrderId; oid++) {
        try {
          const result = (await publicClient.readContract({
            address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER,
            abi: lunexLimitOrderKeeperAbi,
            functionName: "canExecute",
            args: [oid],
          })) as [boolean, bigint, bigint];

          const [canExec, quote, rateE18] = result;
          if (!canExec) continue;

          foundExecutable = true;
          const hash = await keeperTx.execute([
            {
              address: CONTRACTS.LUNEX_LIMIT_ORDER_KEEPER,
              abi: lunexLimitOrderKeeperAbi,
              functionName: "executeOrder",
              args: [oid],
            },
          ]);
          appendKeeperLog({
            timestamp: Date.now(),
            orderId: Number(oid),
            action: "executed",
            txHash: hash ?? undefined,
            reasoning: `Order #${oid} executable at rate ${(Number(rateE18) / 1e18).toFixed(6)}. Output: ${(Number(quote) / 1e6).toFixed(4)} USDC.`,
          });
          break; // one per scan cycle
        } catch {
          // Order inactive or doesn't exist - skip
        }
      }

      if (!foundExecutable) {
        appendKeeperLog({
          timestamp: Date.now(),
          orderId: 0,
          action: "skipped",
          reasoning: `Scanned ${Number(nextOrderId)} order(s). None currently meet their execution conditions.`,
        });
      }
    } finally {
      keeperRunningRef.current = false;
      refetchNextOrderId();
    }
  }, [isConnected, nextOrderId, keeperTx, appendKeeperLog, refetchNextOrderId]);

  const keeperScanRef = useRef(runKeeperScan);
  keeperScanRef.current = runKeeperScan;

  useEffect(() => {
    if (!keeperActive) return;
    keeperScanRef.current();
    const id = setInterval(() => keeperScanRef.current(), KEEPER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [keeperActive]);

  return {
    // Signal Agent
    signalActive,
    setSignalActive,
    signals,
    latestSignal,
    SIGNAL_INTERVAL_MS,
    // Execution Agent
    execActive,
    activeStreamId,
    streamStartedAt,
    execLog,
    createStream,
    cancelStream,
    streamTx,
    execTx,
    STREAM_TOTAL_USDC,
    STREAM_RATE_PER_SECOND,
    STREAM_DURATION_SECS,
    SWAP_AMOUNT_USDC,
    SIGNAL_AGENT_WALLET,
    // Keeper Agent
    keeperActive,
    setKeeperActive,
    keeperLog,
    runKeeperScan,
    keeperTx,
    nextOrderId,
  };
}
