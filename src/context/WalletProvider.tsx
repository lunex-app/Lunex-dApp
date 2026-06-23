import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected as injectedConnector } from "wagmi/connectors";
import { arcTestnet } from "@/config/wagmi";
import {
  circleEnabled,
  registerCircleWallet,
  loginCircleWallet,
  restoreCircleWallet,
  clearCachedCredential,
  circleUsdcBalance,
  circleEurcBalance,
  type CircleSession,
} from "@/lib/circleWallet";
import {
  ucWalletEnabled,
  connectEmailWallet as connectEmailWalletLib,
  ucUsdcBalance,
  ucEurcBalance,
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
  /** The injected EOA address (independent of the active Circle session). */
  injectedAddress?: `0x${string}`;
  /** True once a browser wallet (injected EOA) is connected — needed for Gateway/CCTP. */
  hasInjected: boolean;
  /** Connect a browser wallet (MetaMask/injected) on demand, e.g. for Gateway. */
  connectInjected: () => Promise<void>;
  connectingInjected: boolean;
  circleEnabled: boolean;
  ucEnabled: boolean;
  connecting: boolean;
  /** USDC balance of the connected wallet (human units). */
  balance: number | null;
  /** EURC balance of the connected wallet (human units). */
  eurcBalance: number | null;
  /** Human-readable name of the wallet's current network. */
  network: string;
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
  const { address: injected, chain: injectedChain } = useAccount();
  const { connectAsync, connectors } = useConnect();
  const { disconnectAsync } = useDisconnect();
  const [connectingInjected, setConnectingInjected] = useState(false);
  const [circle, setCircle] = useState<CircleSession | null>(null);
  const [uc, setUc] = useState<UcSession | null>(() => loadUcSession());
  const [connecting, setConnecting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [eurcBalance, setEurcBalance] = useState<number | null>(null);
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

  // Connect a browser wallet (injected EOA) on demand. Circle wallets are
  // Arc-only, so Gateway/CCTP (multi-chain) need an injected wallet; a Circle
  // user can attach one here without losing their Circle session.
  const connectInjected = useCallback(async () => {
    if (injected) return; // already connected
    setConnectingInjected(true);
    try {
      const connector =
        connectors.find((c) => c.type === "injected" || c.id === "injected") ??
        connectors[0] ??
        injectedConnector();
      await connectAsync({ connector });
    } finally {
      setConnectingInjected(false);
    }
  }, [connectAsync, connectors, injected]);

  const refreshBalance = useCallback(() => {
    if (circle) {
      circleUsdcBalance(circle).then(setBalance).catch(() => setBalance(null));
      circleEurcBalance(circle).then(setEurcBalance).catch(() => setEurcBalance(null));
    } else if (uc) {
      ucUsdcBalance(uc).then(setBalance).catch(() => setBalance(null));
      ucEurcBalance(uc).then(setEurcBalance).catch(() => setEurcBalance(null));
    }
  }, [circle, uc]);

  useEffect(() => {
    if (!circle && !uc) {
      setBalance(null);
      setEurcBalance(null);
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
    injectedAddress: injected as `0x${string}` | undefined,
    hasInjected: Boolean(injected),
    connectInjected,
    connectingInjected,
    circleEnabled: circleEnabled(),
    ucEnabled: ucWalletEnabled(),
    connecting,
    balance,
    eurcBalance,
    // Circle wallets (passkey/UC) operate on Arc; injected reports its chain.
    network: circle || uc ? arcTestnet.name : injectedChain?.name ?? (injected ? "Unknown network" : ""),
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
      // Also tear down any connected EOA (WalletConnect / injected) wagmi session.
      disconnectAsync().catch(() => {});
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
