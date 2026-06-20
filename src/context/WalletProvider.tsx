import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAccount } from "wagmi";
import {
  circleEnabled,
  registerCircleWallet,
  loginCircleWallet,
  restoreCircleWallet,
  clearCachedCredential,
  circleUsdcBalance,
  type CircleSession,
} from "@/lib/circleWallet";
import {
  ucWalletEnabled,
  connectEmailWallet as connectEmailWalletLib,
  ucUsdcBalance,
  type UcSession,
} from "@/lib/circleUserWallet";

/**
 * Wallet layer for Lunex. Circle wallets are primary: a passkey Modular smart
 * account (gasless on Arc) and a user-controlled email/PIN wallet. An injected
 * EOA (wagmi) remains available as a fallback — required for the cross-chain
 * bridge, which Circle Arc-only smart accounts can't drive.
 */
const LAST_USER_KEY = "lunex-circle-username";
const LAST_UC_KEY = "lunex-uc-email";
const UC_SESSION_KEY = "lunex-uc-session";

/** The email (UC) session is plain data, so it survives reloads in localStorage. */
function loadUcSession(): UcSession | null {
  try {
    const raw = localStorage.getItem(UC_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as UcSession;
    return s && s.kind === "uc" && s.address && s.walletId ? s : null;
  } catch {
    return null;
  }
}

type Ctx = {
  address?: `0x${string}`;
  isConnected: boolean;
  circle: CircleSession | null;
  uc: UcSession | null;
  /** Whichever Circle session is active (passkey or PIN), for routing writes. */
  signer: CircleSession | UcSession | null;
  /** True when only an injected EOA is connected (no Circle session). */
  isInjectedOnly: boolean;
  circleEnabled: boolean;
  ucEnabled: boolean;
  connecting: boolean;
  balance: number | null;
  lastUsername: string | null;
  lastUcEmail: string | null;
  connect: (username: string, mode: "register" | "login") => Promise<void>;
  connectEmailWallet: (email: string) => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => void;
  /** Connect-modal control, so page-level "Connect" buttons reuse the same modal. */
  connectModalOpen: boolean;
  openConnect: () => void;
  closeConnect: () => void;
};

const WalletCtx = createContext<Ctx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { address: injected } = useAccount();
  const [circle, setCircle] = useState<CircleSession | null>(null);
  const [uc, setUc] = useState<UcSession | null>(() => loadUcSession());
  const [connecting, setConnecting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [lastUsername, setLastUsername] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_USER_KEY);
    } catch {
      return null;
    }
  });
  const [lastUcEmail, setLastUcEmail] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_UC_KEY);
    } catch {
      return null;
    }
  });

  const connect = useCallback(async (username: string, mode: "register" | "login") => {
    setConnecting(true);
    try {
      const session = mode === "register" ? await registerCircleWallet(username) : await loginCircleWallet(username);
      setCircle(session);
      setUc(null);
      try {
        localStorage.setItem(LAST_USER_KEY, username);
      } catch {
        /* ignore */
      }
      setLastUsername(username);
      setConnectModalOpen(false);
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectEmailWallet = useCallback(async (email: string) => {
    setConnecting(true);
    try {
      const session = await connectEmailWalletLib(email);
      setUc(session);
      setCircle(null);
      try {
        localStorage.setItem(LAST_UC_KEY, email);
        localStorage.setItem(UC_SESSION_KEY, JSON.stringify(session));
      } catch {
        /* ignore */
      }
      setLastUcEmail(email);
      setConnectModalOpen(false);
    } finally {
      setConnecting(false);
    }
  }, []);

  // Restore a passkey session from the cached credential on load (no prompt).
  useEffect(() => {
    if (uc) return;
    let alive = true;
    restoreCircleWallet()
      .then((s) => {
        if (alive && s) setCircle((cur) => cur ?? s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
     
  }, []);

  const refreshBalance = useCallback(() => {
    if (circle) circleUsdcBalance(circle).then(setBalance).catch(() => setBalance(null));
    else if (uc) ucUsdcBalance(uc).then(setBalance).catch(() => setBalance(null));
  }, [circle, uc]);

  useEffect(() => {
    if (!circle && !uc) {
      setBalance(null);
      return;
    }
    refreshBalance();
    const id = setInterval(refreshBalance, 15000);
    return () => clearInterval(id);
  }, [circle, uc, refreshBalance]);

  const value: Ctx = {
    address: (circle?.address ?? uc?.address ?? injected) as `0x${string}` | undefined,
    isConnected: Boolean(circle || uc || injected),
    circle,
    uc,
    signer: circle ?? uc,
    isInjectedOnly: Boolean(!circle && !uc && injected),
    circleEnabled: circleEnabled(),
    ucEnabled: ucWalletEnabled(),
    connecting,
    balance,
    lastUsername,
    lastUcEmail,
    connect,
    connectEmailWallet,
    disconnect: () => {
      setCircle(null);
      setUc(null);
      clearCachedCredential();
      try {
        localStorage.removeItem(UC_SESSION_KEY);
      } catch {
        /* ignore */
      }
    },
    refreshBalance,
    connectModalOpen,
    openConnect: () => setConnectModalOpen(true),
    closeConnect: () => setConnectModalOpen(false),
  };

  return <WalletCtx.Provider value={value}>{children}</WalletCtx.Provider>;
}

export function useWallet(): Ctx {
  const ctx = useContext(WalletCtx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
