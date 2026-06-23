/**
 * Unified contract-write routing for the three wallet kinds Lunex supports:
 *  - passkey (Circle Modular smart account): all writes batched into ONE gasless
 *    user operation;
 *  - uc (Circle user-controlled, PIN): each write is a PIN-signed challenge;
 *  - injected (EOA via wagmi): each write sent + awaited in turn.
 *
 * Mirrors Polaris's src/lib/tx.ts run(writes, signer).
 */
import { writeContract, waitForTransactionReceipt, switchChain, getAccount } from "wagmi/actions";
import type { Abi, Hash } from "viem";
import { wagmiConfig, arcTestnet } from "@/config/wagmi";
import { circleWrite, type CircleSession } from "./circleWallet";
import { ucWrite, type UcSession } from "./circleUserWallet";

/** Either Circle wallet kind, or null/undefined for the injected-wallet path. */
export type Signer = CircleSession | UcSession | null | undefined;

/** A single contract write description, shared by the wagmi and Circle paths. */
export type Write = {
  address: `0x${string}`;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

export function isCircleSigner(s: Signer): s is CircleSession | UcSession {
  return Boolean(s && "kind" in s);
}

/**
 * Execute a sequence of writes against the active signer. Returns a tx hash for
 * the passkey/injected paths; the UC (PIN) path settles async per challenge and
 * returns "0x".
 */
export async function run(writes: Write[], signer?: Signer): Promise<Hash> {
  if (signer && "kind" in signer && signer.kind === "uc") {
    for (const w of writes) await ucWrite(signer, w);
    return "0x" as Hash; // PIN challenges settle async; no single hash returned
  }
  if (signer && "kind" in signer && signer.kind === "passkey") {
    return circleWrite(signer, writes);
  }
  // Injected EOA (incl. the in-app generated burner) via wagmi. These writes
  // target the Lunex contracts on Arc, so make sure the wallet is on Arc first —
  // a generated wallet may be sitting on Base/Polygon/etc. after a send/bridge.
  if (getAccount(wagmiConfig).chainId !== arcTestnet.id) {
    await switchChain(wagmiConfig, { chainId: arcTestnet.id });
  }
  let last: Hash = "0x" as Hash;
  for (const w of writes) {
    last = await writeContract(wagmiConfig, {
      address: w.address,
      abi: w.abi,
      functionName: w.functionName,
      args: w.args as never,
      chainId: arcTestnet.id,
    } as any);
    await waitForTransactionReceipt(wagmiConfig, { hash: last, chainId: arcTestnet.id });
  }
  return last;
}

/** Convenience builder for an ERC-20 approval write. */
export function approveWrite(token: `0x${string}`, erc20Abi: Abi, spender: `0x${string}`, amount: bigint): Write {
  return { address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] };
}
