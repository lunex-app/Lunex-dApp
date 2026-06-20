import { describe, it, expect, beforeEach } from "vitest";
import { addressToBytes32 } from "@/features/bridge/utils/addressUtils";
import {
  loadBridgeTransactions,
  saveBridgeTransaction,
  getPendingBridgeTransactions,
  type BridgeTransaction,
} from "@/features/bridge/state/bridgeState";
import { getExplorerTxUrl, getExplorerAddressUrl } from "@/config/wagmi";

const makeTx = (over: Partial<BridgeTransaction> = {}): BridgeTransaction => ({
  id: Math.random().toString(36).slice(2),
  fromChain: "base",
  toChain: "arc",
  amount: "100",
  status: "approving",
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

describe("addressToBytes32 (CCTP mintRecipient)", () => {
  it("left-pads a 20-byte address to 32 bytes", () => {
    const addr = "0x1234567890123456789012345678901234567890";
    const padded = addressToBytes32(addr);
    expect(padded).toBe("0x" + "00".repeat(12) + addr.slice(2));
    expect(padded.length).toBe(66); // 0x + 64 hex chars
  });
});

describe("bridge transaction persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty list when nothing is stored", () => {
    expect(loadBridgeTransactions()).toEqual([]);
  });

  it("saves and reloads a transaction", () => {
    saveBridgeTransaction(makeTx({ id: "a" }));
    const all = loadBridgeTransactions();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("a");
  });

  it("updates an existing transaction in place rather than duplicating", () => {
    saveBridgeTransaction(makeTx({ id: "a", status: "approving" }));
    saveBridgeTransaction(makeTx({ id: "a", status: "complete" }));
    const all = loadBridgeTransactions();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("complete");
  });

  it("caps stored history at 20 entries", () => {
    for (let n = 0; n < 25; n++) saveBridgeTransaction(makeTx({ id: `tx-${n}` }));
    expect(loadBridgeTransactions()).toHaveLength(20);
  });

  it("returns [] when stored JSON is corrupt", () => {
    localStorage.setItem("lunex_bridge_transactions", "{not json");
    expect(loadBridgeTransactions()).toEqual([]);
  });
});

describe("getPendingBridgeTransactions", () => {
  beforeEach(() => localStorage.clear());

  it("only returns burning / waiting_attestation transactions", () => {
    saveBridgeTransaction(makeTx({ id: "done", status: "complete" }));
    saveBridgeTransaction(makeTx({ id: "burning", status: "burning" }));
    saveBridgeTransaction(makeTx({ id: "waiting", status: "waiting_attestation" }));
    saveBridgeTransaction(makeTx({ id: "failed", status: "failed" }));
    const pending = getPendingBridgeTransactions().map((t) => t.id).sort();
    expect(pending).toEqual(["burning", "waiting"]);
  });
});

describe("explorer URL helpers", () => {
  it("builds tx and address URLs", () => {
    expect(getExplorerTxUrl("0xabc")).toMatch(/\/tx\/0xabc$/);
    expect(getExplorerAddressUrl("0xdef")).toMatch(/\/address\/0xdef$/);
  });
});
