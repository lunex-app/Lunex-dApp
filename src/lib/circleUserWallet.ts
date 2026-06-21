/**
 * Circle user-controlled wallets (PIN / email): the human "extra connect"
 * option alongside the passkey Modular Wallet.
 *
 * The entity secret + API key NEVER touch the browser. This module talks to the
 * Circle UC backend (/api/uc/*) for the session token + challenge IDs, and runs
 * the PIN ceremony locally with @circle-fin/w3s-pw-web-sdk. Contract writes are
 * initiated on the backend as challenges and signed here with the user's PIN.
 *
 * Lunex reuses the live Polaris Railway runtime for /api/uc/* (same Circle UC
 * entity, ARC-TESTNET) — its contract-execution endpoint accepts any contract,
 * so it serves the Lunex pool/vault contracts unchanged.
 */
import type { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";
import { createPublicClient, http, encodeFunctionData, erc20Abi, formatUnits, type Abi } from "viem";
import { arcTestnet, TOKENS } from "@/config/wagmi";

const USDC_ADDRESS = TOKENS.USDC.address;
const USDC_DECIMALS = TOKENS.USDC.decimals;
const ARC_RPC_URL = arcTestnet.rpcUrls.default.http[0];

const ENV = (import.meta as { env?: Record<string, string> }).env ?? {};
const API_URL = ENV.VITE_API_URL || "";
const APP_ID = ENV.VITE_CIRCLE_UC_APP_ID || "";

export function ucWalletEnabled(): boolean {
  return Boolean(API_URL && APP_ID);
}

export type UcSession = {
  kind: "uc";
  userToken: string;
  encryptionKey: string;
  walletId: string;
  address: `0x${string}`;
  /** Present for email-OTP logins; used only for display / re-login prefill. */
  email?: string;
  /** Present for legacy PIN logins. */
  userId?: string;
};

const publicClient = createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC_URL) });

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `request to ${path} failed`);
  return r.json() as Promise<T>;
}

/** The Lunex brand mark, served from the app origin (falls back gracefully). */
function brandLogo(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/lunex-logo.png`;
}

/**
 * Read the app's current theme so the Circle PIN/OTP ceremony matches what the
 * user is looking at. ThemeSwitcher toggles a `dark` class on <html> and
 * persists "lunex-theme" in localStorage (default = dark).
 */
function isDarkTheme(): boolean {
  if (typeof document !== "undefined" && document.documentElement.classList.contains("dark")) return true;
  if (typeof document !== "undefined" && document.documentElement.classList.contains("light")) return false;
  if (typeof localStorage !== "undefined") return localStorage.getItem("lunex-theme") !== "light";
  return true;
}

// Cyan accent is shared across both themes.
const ACCENT = "#19E0E6";

// Deep-navy surfaces for dark mode.
const DARK_PALETTE = {
  backdrop: "#04070F",
  backdropOpacity: 0.7,
  bg: "#0A1018",
  divider: "#1B2533",
  textMain: "#EAF2F8",
  textMain2: "#EAF2F8",
  textAuxiliary: "#8CA0B3",
  textAuxiliary2: "#5C6B7C",
  textSummary: "#EAF2F8",
  textSummaryHighlight: ACCENT,
  textPlaceholder: "#5C6B7C",
  textInteractive: ACCENT,
  textDetailToggle: ACCENT,
  success: "#13C99A",
  error: "#FF5A5A",
  pinDotBase: "#0F1722",
  pinDotBaseBorder: "#243040",
  pinDotActivated: ACCENT,
  enteredPinText: "#EAF2F8",
  inputText: "#EAF2F8",
  inputBorderFocused: ACCENT,
  inputBorderFocusedError: "#FF5A5A",
  inputBg: "#0F1722",
};

// Clean white surfaces for light mode, dark slate text.
const LIGHT_PALETTE = {
  backdrop: "#0A1018",
  backdropOpacity: 0.45,
  bg: "#FFFFFF",
  divider: "#E2E8F0",
  textMain: "#0A1018",
  textMain2: "#0A1018",
  textAuxiliary: "#475569",
  textAuxiliary2: "#94A3B8",
  textSummary: "#0A1018",
  textSummaryHighlight: "#0891A6",
  textPlaceholder: "#94A3B8",
  textInteractive: "#0891A6",
  textDetailToggle: "#0891A6",
  success: "#0E9F7A",
  error: "#DC2626",
  pinDotBase: "#F1F5F9",
  pinDotBaseBorder: "#CBD5E1",
  pinDotActivated: "#0891A6",
  enteredPinText: "#0A1018",
  inputText: "#0A1018",
  inputBorderFocused: "#0891A6",
  inputBorderFocusedError: "#DC2626",
  inputBg: "#F8FAFC",
};

/** Apply Lunex branding (logo, palette, typography, copy) to the PIN ceremony. */
function brandSdk(sdk: W3SSdk): void {
  const logo = brandLogo();

  // Match the app's active light/dark theme.
  sdk.setThemeColor(isDarkTheme() ? DARK_PALETTE : LIGHT_PALETTE);

  sdk.setResources({
    securityIntroMain: logo,
    emailIcon: logo,
    dAppIcon: logo,
    fontFamily: {
      name: "Inter",
      url: "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
    },
  });

  sdk.setLocalizations({
    common: { continue: "Continue", confirm: "Confirm", sign: "Approve", retry: "Try again" },
    initPincode: {
      headline: "Secure your Lunex wallet",
      subhead: "Set a 6-digit PIN. It protects your wallet and signs your transactions on Arc.",
    },
    confirmInitPincode: {
      headline: "Confirm your PIN",
      subhead: "Re-enter your PIN to finish creating your Lunex wallet.",
    },
    enterPincode: {
      headline: "Enter your Lunex PIN",
      subhead: "Confirm this action with the PIN you set for your wallet.",
    },
  });
}

/**
 * The Circle PIN SDK bundles Node-oriented deps (jsonwebtoken, dotenv) that
 * reference process/Buffer and crash if evaluated at app startup. We import it
 * lazily here so it is code-split out of the entry bundle and only loaded when
 * the user actually opens the PIN wallet flow.
 */
async function makeSdk(userToken: string, encryptionKey: string): Promise<W3SSdk> {
  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
  const sdk = new W3SSdk();
  sdk.setAppSettings({ appId: APP_ID });
  sdk.setAuthentication({ userToken, encryptionKey });
  brandSdk(sdk);
  return sdk;
}

/** Run a Circle challenge (PIN ceremony / tx signing). Resolves on success. */
function runChallenge(sdk: W3SSdk, challengeId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    sdk.execute(challengeId, (error) => {
      if (error) reject(new Error(error.message || "challenge failed"));
      else resolve();
    });
  });
}

/** Poll for the Arc wallet addressed by a post-login userToken. */
async function walletByToken(userToken: string): Promise<{ walletId: string; address: `0x${string}` } | null> {
  const w = await api<{ walletId?: string; address?: string }>("/api/uc/wallet-by-token", { userToken });
  return w.walletId && w.address ? { walletId: w.walletId, address: w.address as `0x${string}` } : null;
}

/**
 * Email-OTP connect (the auth mode enabled in the Circle Console).
 *
 * Browser getDeviceId() -> backend emails the OTP -> Circle's verifyOtp() UI
 * collects the code -> onLoginComplete yields a userToken -> we look up (or
 * create) the user's Arc wallet.
 */
export async function connectEmailWallet(email: string): Promise<UcSession> {
  if (!ucWalletEnabled()) throw new Error("Circle user wallet not configured");
  if (!email.trim()) throw new Error("Enter your email");
  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");

  // onLoginComplete delivers the authenticated session token.
  let resolveLogin!: (r: { userToken: string; encryptionKey: string }) => void;
  let rejectLogin!: (e: Error) => void;
  const loginDone = new Promise<{ userToken: string; encryptionKey: string }>((res, rej) => {
    resolveLogin = res;
    rejectLogin = rej;
  });
  const onLoginComplete = (
    error: { message?: string } | undefined,
    result: { userToken?: string; encryptionKey?: string } | undefined,
  ) => {
    if (error) rejectLogin(new Error(error.message || "Email login failed"));
    else if (result?.userToken && result.encryptionKey)
      resolveLogin({ userToken: result.userToken, encryptionKey: result.encryptionKey });
    else rejectLogin(new Error("Email login returned no session"));
  };

  const sdk = new W3SSdk({ appSettings: { appId: APP_ID } }, onLoginComplete);
  brandSdk(sdk);

  const deviceId = await sdk.getDeviceId();
  const { deviceToken, deviceEncryptionKey, otpToken } = await api<{
    deviceToken: string;
    deviceEncryptionKey: string;
    otpToken: string;
  }>("/api/uc/email-token", { deviceId, email: email.trim() });

  sdk.updateConfigs(
    { appSettings: { appId: APP_ID }, loginConfigs: { deviceToken, deviceEncryptionKey, otpToken } },
    onLoginComplete,
  );
  sdk.verifyOtp();

  const { userToken, encryptionKey } = await loginDone;

  // User-controlled wallets are PIN-secured by design; email is just the login
  // method. On first login the user has no wallet yet, so we run the
  // "set PIN + create wallet" ceremony. On later logins the wallet exists.
  let wallet = await walletByToken(userToken);
  if (!wallet) {
    const { challengeId } = await api<{ challengeId: string }>("/api/uc/pin-setup", { userToken });
    // Run the "set PIN + create wallet" ceremony on a FRESH SDK instance — the
    // same pattern ucWrite uses for tx signing. Reusing the login SDK here can
    // leave the PIN UI un-rendered (its UI flow is consumed by verifyOtp).
    const pinSdk = await makeSdk(userToken, encryptionKey);
    await runChallenge(pinSdk, challengeId); // user sets a 6-digit PIN, wallet is created
    for (let i = 0; i < 20 && !wallet; i++) {
      wallet = await walletByToken(userToken);
      if (!wallet) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!wallet) throw new Error("Wallet not ready, please try again");
  return { kind: "uc", userToken, encryptionKey, walletId: wallet.walletId, address: wallet.address, email: email.trim() };
}

async function ucTokenBalance(session: UcSession, token: `0x${string}`, decimals: number): Promise<number> {
  const raw = (await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [session.address],
  } as any)) as bigint;
  return Number(formatUnits(raw, decimals));
}

/** USDC balance (human units) of the user wallet. */
export function ucUsdcBalance(session: UcSession): Promise<number> {
  return ucTokenBalance(session, USDC_ADDRESS, USDC_DECIMALS);
}

/** EURC balance (human units) of the user wallet. */
export function ucEurcBalance(session: UcSession): Promise<number> {
  return ucTokenBalance(session, TOKENS.EURC.address, TOKENS.EURC.decimals);
}

type Call = { address: `0x${string}`; abi: Abi; functionName: string; args: readonly unknown[] };

/**
 * Execute a single contract write from the user wallet: the backend builds a
 * contract-execution challenge, the user signs it here with their PIN. Circle
 * sponsors gas (SCA), so no native balance is required.
 */
// Deeply convert BigInt → string (including inside arrays/tuples, e.g. a
// uint256[2] arg) so the params survive JSON.stringify in the API request.
function toAbiParam(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(toAbiParam);
  return v;
}

export async function ucWrite(session: UcSession, call: Call): Promise<void> {
  const abiFunctionSignature = humanSignature(call);
  const abiParameters = call.args.map(toAbiParam);
  // Validate encodability up-front (throws clearly if the call is malformed).
  encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args as never });
  const { challengeId } = await api<{ challengeId: string }>("/api/uc/execute", {
    userToken: session.userToken,
    userId: session.userId,
    walletId: session.walletId,
    contractAddress: call.address,
    abiFunctionSignature,
    abiParameters,
  });
  const sdk = await makeSdk(session.userToken, session.encryptionKey);
  await runChallenge(sdk, challengeId);
}

/** Build a Solidity human-readable function signature, e.g. exchange(uint256,uint256,uint256,uint256). */
function humanSignature(call: Call): string {
  const frag = (call.abi as Array<{ type?: string; name?: string; inputs?: Array<{ type: string }> }>).find(
    (f) => f.type === "function" && f.name === call.functionName,
  );
  if (!frag?.inputs) throw new Error(`ABI missing function ${call.functionName}`);
  return `${call.functionName}(${frag.inputs.map((i) => i.type).join(",")})`;
}
