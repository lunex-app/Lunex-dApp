import { useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Copy, Check, Eye, KeyRound, Wallet, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBurner } from "@/lib/burner/store";

type Mode = "menu" | "create" | "backup" | "unlock" | "import";

/**
 * Modal for Lunex's in-app generated ("burner") wallet: create a new password-
 * encrypted wallet, unlock an existing one, or import a seed phrase. After a
 * successful create/unlock it connects the burner wagmi connector so the wallet
 * is usable across the app exactly like an injected EOA.
 */
export function GenerateWalletDialog({ onClose }: { onClose: () => void }) {
  const burner = useBurner();
  const { connect, connectors } = useConnect();
  const [mode, setMode] = useState<Mode>(burner.exists ? "unlock" : "menu");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [busy, setBusy] = useState(false);

  const connectBurner = () => {
    const c = connectors.find((x) => x.id === "lunex-burner");
    if (c) connect({ connector: c });
  };

  const handleCreate = async () => {
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    if (password !== confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const phrase = await burner.createWallet(password);
      setMnemonic(phrase);
      setMode("backup");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create wallet");
    } finally {
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setBusy(true);
    try {
      await burner.unlock(password);
      connectBurner();
      toast.success("Wallet unlocked");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    const words = importPhrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      return toast.error("Seed phrase must be 12 or 24 words");
    }
    setBusy(true);
    try {
      await burner.importWallet(importPhrase, password);
      connectBurner();
      toast.success("Wallet imported");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const finishBackup = () => {
    connectBurner();
    toast.success("Wallet ready");
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground">Lunex Wallet</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {mode === "menu" && (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Generate a self-custody wallet, encrypted with a password and stored only in this
              browser. Gasless on Arc and ready for swaps, sends, and bridging — ideal for testnet.
            </p>
            <button
              onClick={() => setMode("create")}
              className="flex w-full items-center gap-2 rounded-md bg-primary px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:bg-primary/90"
            >
              <KeyRound className="h-3.5 w-3.5" /> Generate New Wallet
            </button>
            <button
              onClick={() => setMode("import")}
              className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary"
            >
              Import Seed Phrase
            </button>
          </div>
        )}

        {mode === "create" && (
          <div className="space-y-3">
            <FieldLabel>Encryption Password</FieldLabel>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <FieldLabel>Confirm Password</FieldLabel>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
            />
            <KeyNote />
            <DialogActions onCancel={() => setMode("menu")} onConfirm={handleCreate} confirmLabel="Create Wallet" busy={busy} />
          </div>
        )}

        {mode === "backup" && <BackupView mnemonic={mnemonic} onDone={finishBackup} />}

        {mode === "unlock" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Unlock your Lunex wallet
              {burner.address ? ` (${burner.address.slice(0, 6)}…${burner.address.slice(-4)})` : ""}.
            </p>
            <FieldLabel>Password</FieldLabel>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              placeholder="Wallet password"
            />
            <button onClick={() => setMode("menu")} className="text-[11px] text-muted-foreground hover:text-primary">
              Use a different wallet
            </button>
            <DialogActions onCancel={onClose} onConfirm={handleUnlock} confirmLabel="Unlock" busy={busy} />
          </div>
        )}

        {mode === "import" && (
          <div className="space-y-3">
            <FieldLabel>Seed Phrase (12 or 24 words)</FieldLabel>
            <textarea
              value={importPhrase}
              onChange={(e) => setImportPhrase(e.target.value)}
              rows={3}
              placeholder="word1 word2 word3 …"
              className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <FieldLabel>Encryption Password</FieldLabel>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
            <KeyNote />
            <DialogActions onCancel={() => setMode("menu")} onConfirm={handleImport} confirmLabel="Import Wallet" busy={busy} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function BackupView({ mnemonic, onDone }: { mnemonic: string; onDone: () => void }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-500">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Write this seed phrase down and store it offline. Anyone with it controls this wallet. It is shown only once.
        </span>
      </div>
      <div className="relative rounded-md border border-border bg-background p-3">
        <div className={`grid grid-cols-3 gap-2 font-mono text-xs ${revealed ? "" : "blur-sm select-none"}`}>
          {mnemonic.split(" ").map((w, i) => (
            <span key={i} className="text-foreground">
              <span className="mr-1 text-muted-foreground">{i + 1}.</span>
              {w}
            </span>
          ))}
        </div>
        {!revealed && (
          <button
            onClick={() => setRevealed(true)}
            className="absolute inset-0 flex items-center justify-center gap-1.5 text-xs font-semibold text-primary"
          >
            <Eye className="h-3.5 w-3.5" /> Click to reveal
          </button>
        )}
      </div>
      <button
        onClick={() => {
          navigator.clipboard.writeText(mnemonic);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
      >
        {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy to clipboard"}
      </button>
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have safely backed up my seed phrase
      </label>
      <Button
        disabled={!saved}
        onClick={onDone}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold uppercase tracking-wider"
      >
        Continue
      </Button>
    </div>
  );
}

function KeyNote() {
  return (
    <p className="text-[10px] text-muted-foreground">
      Browser-stored keys are convenient for testnet but riskier than a hardware wallet. Avoid keeping large balances here.
    </p>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{children}</div>;
}

function DialogActions({
  onCancel,
  onConfirm,
  confirmLabel,
  busy,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  busy: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-1">
      <Button variant="outline" onClick={onCancel} className="text-xs uppercase tracking-wider">
        Cancel
      </Button>
      <Button
        onClick={onConfirm}
        disabled={busy}
        className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold uppercase tracking-wider"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
      </Button>
    </div>
  );
}
