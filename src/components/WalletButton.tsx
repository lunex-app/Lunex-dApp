import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Fingerprint, LogOut, ChevronDown, Copy, Check, X, Mail, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/context/WalletProvider";
import { humanizeError } from "@/lib/errors";

function shortAddr(a?: string, head = 6, tail = 4) {
  if (!a) return "";
  return `${a.slice(0, head)}…${a.slice(-tail)}`;
}

/**
 * Primary wallet control. Connected: USDC balance, address + copy, disconnect.
 * Disconnected: a Connect button opening a modal of Circle login options
 * (passkey smart wallet + email/PIN wallet). The modal is driven by the shared
 * WalletProvider state so page-level "Connect" prompts reuse it.
 */
export default function WalletButton() {
  const {
    address,
    isConnected,
    circle,
    uc,
    balance,
    connecting,
    circleEnabled,
    ucEnabled,
    lastUsername,
    lastUcEmail,
    connect,
    connectEmailWallet,
    disconnect,
    connectModalOpen,
    openConnect,
    closeConnect,
  } = useWallet();

  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    toast.success("Address copied");
    setTimeout(() => setCopied(false), 1500);
  };

  if (isConnected && address) {
    const tag = circle ? (circle.username[0] || "C").toUpperCase() : uc ? "P" : "•";
    const kind = circle ? `Passkey · ${circle.username}` : uc ? "PIN wallet · Circle" : "Injected wallet";
    return (
      <div className="relative">
        <Button
          size="sm"
          onClick={() => setMenuOpen((o) => !o)}
          className="bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 text-xs font-mono h-8 px-3 gap-2"
        >
          {balance != null && <span className="hidden sm:inline text-muted-foreground">{balance.toFixed(2)} USDC</span>}
          <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[9px] text-primary-foreground">{tag}</span>
          <span>{shortAddr(address)}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-border bg-card p-3 shadow-2xl">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">{kind}</div>
              <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">{shortAddr(address, 8, 6)}</span>
                <button onClick={copy} className="text-muted-foreground hover:text-primary" title="Copy address">
                  {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <div className="mb-3 rounded-md border border-border bg-background px-3 py-2.5">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">USDC Balance</div>
                <div className="font-mono text-lg font-bold text-foreground">{(balance ?? 0).toFixed(2)}</div>
              </div>
              {(circle || uc) && (
                <button
                  onClick={() => {
                    disconnect();
                    setMenuOpen(false);
                    toast.success("Disconnected");
                  }}
                  className="font-mono flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-destructive hover:bg-background"
                >
                  <LogOut className="h-3.5 w-3.5" /> Disconnect
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        onClick={openConnect}
        className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold tracking-wider uppercase h-8 px-4"
      >
        Connect
      </Button>
      {connectModalOpen && (
        <ConnectModal
          connecting={connecting}
          circleEnabled={circleEnabled}
          ucEnabled={ucEnabled}
          lastUsername={lastUsername}
          lastUcEmail={lastUcEmail}
          onClose={closeConnect}
          onPasskey={connect}
          onEmail={connectEmailWallet}
        />
      )}
    </>
  );
}

type ModalProps = {
  connecting: boolean;
  circleEnabled: boolean;
  ucEnabled: boolean;
  lastUsername: string | null;
  lastUcEmail: string | null;
  onClose: () => void;
  onPasskey: (username: string, mode: "register" | "login") => Promise<void>;
  onEmail: (email: string) => Promise<void>;
};

function ConnectModal({ connecting, circleEnabled, ucEnabled, lastUsername, lastUcEmail, onClose, onPasskey, onEmail }: ModalProps) {
  const [view, setView] = useState<"options" | "passkey" | "email">("options");
  const [username, setUsername] = useState(lastUsername ?? "");
  const [email, setEmail] = useState(lastUcEmail ?? "");

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handle = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      toast.error(humanizeError(e as never, "Couldn't connect your wallet. Please try again."));
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <div className="relative w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {view !== "options" && (
              <button onClick={() => setView("options")} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h2 className="text-sm font-bold uppercase tracking-widest">
              {view === "passkey" ? "Passkey wallet" : view === "email" ? "Continue with email" : ""}
            </h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {view === "options" && (
          <div className="space-y-2.5">
            <div className="mb-6 flex flex-col items-center text-center">
              <img src="/lunex-logo.png" alt="Lunex" className="h-11 w-auto mb-3" />
              <h3 className="text-lg font-semibold tracking-tight text-foreground">Log in to Lunex</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Connect a wallet to swap, provide liquidity, and earn yield.</p>
            </div>
            {ucEnabled && (
              <button
                onClick={() => setView("email")}
                className="flex w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-primary"
              >
                <Mail className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Email</div>
                  <div className="text-[11px] text-muted-foreground">One-time code to your inbox. Gasless, no seed phrase.</div>
                </div>
              </button>
            )}
            {circleEnabled && (
              <button
                onClick={() => setView("passkey")}
                className="flex w-full items-center gap-3 rounded-md border border-border bg-background p-3 text-left transition-colors hover:border-primary"
              >
                <Fingerprint className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <div className="text-sm font-semibold">Passkey</div>
                  <div className="text-[11px] text-muted-foreground">Face ID or fingerprint on this device. Gasless.</div>
                </div>
              </button>
            )}
            {!circleEnabled && !ucEnabled && (
              <p className="text-xs text-muted-foreground">No wallet providers are configured.</p>
            )}
          </div>
        )}

        {view === "passkey" && (
          <div className="space-y-3">
            <label className="block text-[11px] uppercase tracking-widest text-muted-foreground">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alice"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                disabled={connecting || !username.trim()}
                onClick={() => handle(() => onPasskey(username.trim(), "register"))}
                className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs uppercase tracking-wider"
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </Button>
              <Button
                disabled={connecting || !username.trim()}
                variant="outline"
                onClick={() => handle(() => onPasskey(username.trim(), "login"))}
                className="text-xs uppercase tracking-wider"
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Create a new passkey wallet or sign back into an existing one.</p>
          </div>
        )}

        {view === "email" && (
          <div className="space-y-3">
            <label className="block text-[11px] uppercase tracking-widest text-muted-foreground">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@email.com"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button
              disabled={connecting || !email.trim()}
              onClick={() => handle(() => onEmail(email.trim()))}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs uppercase tracking-wider"
            >
              {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue with email"}
            </Button>
            <p className="text-[11px] text-muted-foreground">We email a one-time code, then you set a 6-digit PIN that signs your transactions.</p>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
