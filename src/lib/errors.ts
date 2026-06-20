/**
 * Turn raw wallet / RPC / Circle SDK errors into clean, user-facing messages.
 * Never surfaces internals like "viem@x.y.z", "Details:", JSON-RPC codes, or
 * stack noise to the UI.
 */

type AnyErr =
  | string
  | {
      shortMessage?: string;
      details?: string;
      reason?: string;
      message?: string;
      code?: number | string;
      cause?: unknown;
    }
  | null
  | undefined;

function rawMessage(err: AnyErr): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  // Prefer viem's shortMessage/reason, then details, then message.
  const e = err as Record<string, unknown>;
  const candidate =
    (e.shortMessage as string) ||
    (e.reason as string) ||
    (e.details as string) ||
    (e.message as string) ||
    "";
  return candidate;
}

/** Strip library/version noise and multi-line internals from a message. */
function scrub(message: string): string {
  return message
    // drop everything from "Version:" onward (viem appends "Version: viem@x")
    .replace(/\bVersion:\s*viem@[\d.]+.*/is, "")
    // drop "Details: ..." trailers
    .replace(/\bDetails:\s*.*/is, "")
    // drop "Request Arguments:" / "Raw Call Arguments:" blocks
    .replace(/\b(Request|Raw Call) Arguments:[\s\S]*/i, "")
    // collapse whitespace/newlines
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Map a raw error to a friendly message. `fallback` is used when nothing
 * specific matches (and is also scrubbed of any library noise).
 */
export function humanizeError(err: AnyErr, fallback = "Something went wrong. Please try again."): string {
  const raw = rawMessage(err);
  const m = raw.toLowerCase();

  // ── User actions ──────────────────────────────────────────────────────────
  if (m.includes("user rejected") || m.includes("user denied") || m.includes("rejected the request") || m.includes("action_rejected")) {
    return "Request rejected in your wallet.";
  }
  if (m.includes("popup") && m.includes("closed")) return "The wallet popup was closed before finishing.";

  // ── Passkey / Circle Modular Wallet ────────────────────────────────────────
  if (m.includes("invalid credentials") || m.includes("unauthorized") || m.includes("401")) {
    return "Wallet provider rejected the request (invalid credentials). Please check your Circle wallet configuration or try a different login method.";
  }
  if (m.includes("credential management api") || m.includes("not supported")) {
    return "Passkeys aren't available here. Open the app over HTTPS (or use a supported browser) and try again.";
  }
  if (m.includes("webauthn") || m.includes("passkey")) return "Couldn't complete the passkey. Please try again.";
  if (m.includes("aborterror") || m.includes("the operation was aborted") || m.includes("timed out") || m.includes("timeout")) {
    return "The request timed out. Please try again.";
  }

  // ── Funds / gas / allowance ────────────────────────────────────────────────
  if (m.includes("insufficient funds") || m.includes("insufficient balance")) {
    return "Insufficient balance to cover this transaction.";
  }
  if (m.includes("transfer amount exceeds balance")) return "Amount exceeds your token balance.";
  if (m.includes("allowance") || m.includes("erc20: insufficient")) return "Token approval is required before this action.";
  if (m.includes("slippage") || m.includes("min_dy") || m.includes("too few coins") || m.includes("exceeds maximum")) {
    return "Price moved beyond your slippage tolerance. Increase slippage or try again.";
  }

  // ── Connectivity / chain ──────────────────────────────────────────────────
  if (m.includes("connector not connected") || m.includes("no wallet") || m.includes("no provider") || m.includes("getaccount")) {
    return "No wallet connected. Connect a wallet and try again.";
  }
  if (m.includes("chain mismatch") || m.includes("does not match") || m.includes("switch") && m.includes("chain")) {
    return "Wrong network. Please switch to Arc and try again.";
  }
  if (m.includes("rate limit") || m.includes("429") || m.includes("daily request")) {
    return "The network is busy right now. Please try again in a moment.";
  }
  if (m.includes("reverted") || m.includes("execution reverted")) {
    return "The transaction was rejected on-chain. Please review the amounts and try again.";
  }
  if (m.includes("nonce") ) return "A pending transaction is blocking this one. Wait a moment and retry.";

  // ── Fallback: scrub library noise out of whatever we got ───────────────────
  const cleaned = scrub(raw);
  if (!cleaned || /viem|rpc error|0x[0-9a-f]{6,}/i.test(cleaned) || cleaned.length > 160) {
    return fallback;
  }
  return cleaned;
}
