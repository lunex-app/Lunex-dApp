import { initiateUserControlledWalletsClient } from "@circle-fin/user-controlled-wallets";
import { randomUUID } from "node:crypto";
import "dotenv/config";

/**
 * Circle user-controlled wallets (PIN/email) for Lunex — the human "email"
 * connect option alongside the passkey Modular Wallet.
 *
 * The entity secret + API key live ONLY here on the backend. The browser runs
 * the PIN ceremony with @circle-fin/w3s-pw-web-sdk using a short-lived userToken
 * + encryptionKey that this module mints. Contract writes (swap, add_liquidity,
 * deposit, ...) are initiated here as challenges and signed by the user's PIN.
 *
 * Arc testnet is supported by the user-controlled wallets API, so the wallet
 * created is a real Arc account that holds USDC and calls the Lunex contracts.
 */
const API_KEY = process.env.CIRCLE_UC_API_KEY;
const ENTITY_SECRET = process.env.CIRCLE_UC_ENTITY_SECRET;
const BLOCKCHAIN = process.env.CIRCLE_UC_BLOCKCHAIN || "ARC-TESTNET";
const ACCOUNT_TYPE = process.env.CIRCLE_UC_ACCOUNT_TYPE || "SCA"; // gasless smart account

let client = null;
export function ucEnabled() {
  return Boolean(API_KEY && ENTITY_SECRET);
}
function uc() {
  if (!ucEnabled()) throw new Error("Circle user-controlled wallets not configured");
  if (!client) client = initiateUserControlledWalletsClient({ apiKey: API_KEY, entitySecret: ENTITY_SECRET });
  return client;
}

/** Create a fresh user + session token. The browser uses these to run the ceremony. */
export async function createSession() {
  const c = uc();
  const userId = `lunex-${randomUUID()}`;
  await c.createUser({ userId });
  const tok = await c.createUserToken({ userId });
  return { userId, userToken: tok.data.userToken, encryptionKey: tok.data.encryptionKey };
}

/** Mint a fresh session token for an existing user (re-login). */
export async function refreshSession(userId) {
  const c = uc();
  const tok = await c.createUserToken({ userId });
  return { userId, userToken: tok.data.userToken, encryptionKey: tok.data.encryptionKey };
}

/** Challenge that sets the PIN and creates the Arc wallet in one ceremony. */
export async function initChallenge(userId) {
  const c = uc();
  const res = await c.createUserPinWithWallets({ userId, blockchains: [BLOCKCHAIN], accountType: ACCOUNT_TYPE });
  return { challengeId: res.data.challengeId };
}

/** The user's Arc wallet (id + address), once the ceremony has completed. */
export async function getWallet(userId) {
  const c = uc();
  const res = await c.listWallets({ userId, blockchain: BLOCKCHAIN });
  const w = res.data?.wallets?.[0];
  if (!w) return null;
  return { walletId: w.id, address: w.address, state: w.state };
}

/* ── Email OTP login (the auth mode enabled in the Circle Console) ──────────── */

/** Request an email-OTP device token; Circle emails the one-time code from the Lunex app. */
export async function emailDeviceToken(deviceId, email) {
  const c = uc();
  const res = await c.createDeviceTokenForEmailLogin({ deviceId, email });
  return {
    deviceToken: res.data.deviceToken,
    deviceEncryptionKey: res.data.deviceEncryptionKey,
    otpToken: res.data.otpToken,
  };
}

/** The user's Arc wallet, addressed by the post-login userToken. */
export async function walletByToken(userToken) {
  const c = uc();
  const res = await c.listWallets({ userToken, blockchain: BLOCKCHAIN });
  const w = res.data?.wallets?.[0];
  if (!w) return null;
  return { walletId: w.id, address: w.address, state: w.state };
}

/** Create an Arc wallet for an email-authenticated user; returns a challengeId. */
export async function createWalletForToken(userToken) {
  const c = uc();
  const res = await c.createWallet({ userToken, blockchains: [BLOCKCHAIN], accountType: ACCOUNT_TYPE });
  return { challengeId: res.data.challengeId };
}

/**
 * First-login challenge for an email user: set a PIN AND create the Arc wallet
 * in one ceremony (user-controlled wallets are PIN-secured by design).
 */
export async function pinSetupByToken(userToken) {
  const c = uc();
  const res = await c.createUserPinWithWallets({ userToken, blockchains: [BLOCKCHAIN], accountType: ACCOUNT_TYPE });
  return { challengeId: res.data.challengeId };
}

/** Contract-execution challenge addressed by userToken (email-login users). */
export async function contractExecutionChallengeByToken(userToken, walletId, contractAddress, abiFunctionSignature, abiParameters) {
  const c = uc();
  const res = await c.createUserTransactionContractExecutionChallenge({
    userToken,
    walletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return { challengeId: res.data.challengeId };
}

/** Contract-execution challenge addressed by userId (PIN-login users). */
export async function contractExecutionChallenge(userId, walletId, contractAddress, abiFunctionSignature, abiParameters) {
  const c = uc();
  const res = await c.createUserTransactionContractExecutionChallenge({
    userId,
    walletId,
    contractAddress,
    abiFunctionSignature,
    abiParameters,
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  return { challengeId: res.data.challengeId };
}
