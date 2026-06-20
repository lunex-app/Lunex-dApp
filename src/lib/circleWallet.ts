/**
 * Circle Modular Wallets — passkey-secured smart accounts on Arc, gasless via
 * Circle's paymaster. Implemented per the official quickstart:
 * https://developers.circle.com/wallets/modular/create-a-wallet-and-send-gasless-txn
 *
 * Gated on VITE_CIRCLE_CLIENT_KEY + VITE_CIRCLE_CLIENT_URL; when absent the UI
 * hides the passkey option. Nothing runs at import time so the build stays green.
 */
import {
  toPasskeyTransport,
  toWebAuthnCredential,
  toModularTransport,
  toCircleSmartAccount,
  WebAuthnMode,
} from "@circle-fin/modular-wallets-core";
import { createPublicClient, erc20Abi, formatUnits, type Abi } from "viem";
import { toWebAuthnAccount, createBundlerClient } from "viem/account-abstraction";
import { encodeFunctionData } from "viem";
import { arcTestnet, TOKENS } from "@/config/wagmi";

const USDC_ADDRESS = TOKENS.USDC.address;
const USDC_DECIMALS = TOKENS.USDC.decimals;

const ENV = (import.meta as { env?: Record<string, string> }).env ?? {};
// Public, domain-allowlisted client-side values — safe in the bundle (Circle
// gates Modular Wallets by registered origin, not by key secrecy). Defaults let
// the app work on any deploy even when VITE_* env injection isn't applied; env
// vars override.
const CLIENT_KEY = ENV.VITE_CIRCLE_CLIENT_KEY || "TEST_CLIENT_KEY:381a6a62b519383dcda56d32b3293c5d:865a81cbcc62debbdc069494fc939109";
const CLIENT_URL = ENV.VITE_CIRCLE_CLIENT_URL || "https://modular-sdk.circle.com/v1/rpc/w3s/buidl";
const CHAIN_PATH = ENV.VITE_CIRCLE_CHAIN_PATH || "arcTestnet";

export function circleEnabled(): boolean {
  return Boolean(CLIENT_KEY && CLIENT_URL);
}

// viem's modular-transport Client intersection collapses to `never` under this
// tsconfig (conflicting cacheTime), so the Circle client objects are kept
// loosely typed. Their methods are exercised at runtime via circleWrite.
 
export type CircleSession = {
  kind: "passkey";
  address: `0x${string}`;
  username: string;
  bundler: any;
  account: any;
  publicClient: any;
};
 

// Cache the passkey credential + username so the session can be rebuilt on
// reload WITHOUT another passkey prompt. The credential is plain data
// ({id, publicKey}); signing a tx still requires the passkey at that moment.
const CRED_KEY = "lunex-passkey-credential";

type Credential = Parameters<typeof toWebAuthnAccount>[0]["credential"];

function cacheCredential(username: string, credential: Credential) {
  try {
    localStorage.setItem(CRED_KEY, JSON.stringify({ username, credential }));
  } catch {
    /* ignore */
  }
}
export function clearCachedCredential() {
  try {
    localStorage.removeItem(CRED_KEY);
  } catch {
    /* ignore */
  }
}

async function buildSession(username: string, credential: Credential): Promise<CircleSession> {
  const modularTransport = toModularTransport(`${CLIENT_URL}/${CHAIN_PATH}`, CLIENT_KEY);
  const publicClient = createPublicClient({ chain: arcTestnet, transport: modularTransport });
   
  const account = await (toCircleSmartAccount as any)({ client: publicClient, owner: toWebAuthnAccount({ credential }) });
   
  const bundler = (createBundlerClient as any)({ account, chain: arcTestnet, transport: modularTransport });
  return { kind: "passkey", address: account.address as `0x${string}`, username, bundler, account, publicClient };
}

function makeConnect(mode: WebAuthnMode) {
  return async (username: string): Promise<CircleSession> => {
    if (!circleEnabled()) throw new Error("Passkey wallet not configured (set VITE_CIRCLE_CLIENT_KEY/URL).");
    const passkeyTransport = toPasskeyTransport(CLIENT_URL, CLIENT_KEY);
    const credential = await toWebAuthnCredential({ transport: passkeyTransport, mode, username });
    cacheCredential(username, credential as Credential);
    return buildSession(username, credential as Credential);
  };
}

export const registerCircleWallet = makeConnect(WebAuthnMode.Register);
export const loginCircleWallet = makeConnect(WebAuthnMode.Login);

/** Rebuild the passkey session from the cached credential (no prompt). */
export async function restoreCircleWallet(): Promise<CircleSession | null> {
  if (!circleEnabled()) return null;
  try {
    const raw = localStorage.getItem(CRED_KEY);
    if (!raw) return null;
    const { username, credential } = JSON.parse(raw);
    if (!username || !credential) return null;
    return await buildSession(username, credential as Credential);
  } catch {
    return null;
  }
}

/** USDC balance (human units) for the connected smart account. */
export async function circleUsdcBalance(session: CircleSession): Promise<number> {
  const raw = (await session.publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [session.address],
  } as any)) as bigint;
  return Number(formatUnits(raw, USDC_DECIMALS));
}

export type Call = { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] };

/** Send one or more contract writes from the Circle smart account, gaslessly. */
export async function circleWrite(session: CircleSession, calls: Call[]): Promise<`0x${string}`> {
  const encoded = calls.map((c) => ({
    to: c.address,
    data: encodeFunctionData({ abi: c.abi, functionName: c.functionName, args: c.args as never }),
  }));
  const hash = await session.bundler.sendUserOperation({
    account: session.account,
    calls: encoded,
    paymaster: true,
  });
  const { receipt } = await session.bundler.waitForUserOperationReceipt({ hash });
  return receipt.transactionHash as `0x${string}`;
}
