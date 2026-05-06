import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import BackButton from "@/components/BackButton";

const AdminLogin = () => {
  const { signIn, signUp, isLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setSubmitting(true);

    if (mode === "login") {
      const result = await signIn(email, password);
      if (result.error) setError(result.error);
    } else {
      const result = await signUp(email, password, displayName);
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Account created. Check your email to verify, then log in.");
        setMode("login");
      }
    }
    setSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="container max-w-md mx-auto py-16 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-md mx-auto py-16">
      <BackButton />
      <h1 className="text-3xl font-bold uppercase tracking-tight mb-2">Lunex SDK</h1>
      <p className="text-xs text-muted-foreground mb-8 tracking-wider uppercase">Admin Panel</p>

      <div className="border border-border bg-card p-6">
        <div className="flex gap-px bg-border mb-6">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(""); setSuccess(""); }}
              className={`flex-1 py-2 text-xs font-semibold tracking-wider uppercase transition-colors ${
                mode === m ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "login" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "signup" && (
            <div>
              <label className="text-xs text-muted-foreground tracking-wider uppercase block mb-1">Display Name</label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" required />
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground tracking-wider uppercase block mb-1">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@lunex.fi" required />
          </div>
          <div>
            <label className="text-xs text-muted-foreground tracking-wider uppercase block mb-1">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 6 characters" minLength={6} required />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && <p className="text-xs text-green-500">{success}</p>}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AdminLogin;
