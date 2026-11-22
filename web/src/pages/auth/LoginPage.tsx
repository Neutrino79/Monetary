import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useDemoMode, useSetupStatus } from "@/hooks/queries";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { AuthShell } from "./AuthShell";
import { useFormError } from "@/lib/hooks/useFormErrors";
import { accountStateCode, type AccountStateCode } from "@/lib/api/services/authService";
import { AccountStatusNotice } from "./AccountStatusNotice";

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const demoLogin = useAuthStore((s) => s.demoLogin);
  const { isDemo, isLoading: demoLoading } = useDemoMode();
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const setup = useSetupStatus();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useFormError([email, password]);
  const [loading, setLoading] = useState(false);
  const [accountState, setAccountState] = useState<AccountStateCode | null>(null);

  async function submit() {
    setError("");
    setAccountState(null);
    setLoading(true);
    try {
      await login(email, password);
      toast.show("Welcome back!", { variant: "success" });
      navigate("/dashboard");
    } catch (e) {
      const state = accountStateCode(e);
      if (state) setAccountState(state);
      else setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function enterDemo() {
    setError("");
    setLoading(true);
    try {
      await demoLogin();
      navigate("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the demo.");
    } finally {
      setLoading(false);
    }
  }

  // Until the first account exists, the only thing to do is first-run setup.
  if (setup.data === false) return <Navigate to="/signup" replace />;

  // Demo mode: no sign-in form at all, just a welcome and one button.
  if (demoLoading) return <AuthShell><div className="py-8 text-center text-[12.8px] text-ink-faint">Loading…</div></AuthShell>;
  if (isDemo) {
    return (
      <AuthShell>
        <h1 className="mb-1 text-[19px] font-semibold">Welcome to the demo</h1>
        <p className="mb-5 text-[12.8px] text-ink-faint">
          Explore a year of sample accounts, transactions, splits and reports. There is nothing to set up and no
          account to create, and nothing you do here is real.
        </p>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-[10px] bg-danger-soft px-3 py-3 text-[12.8px] text-danger">
            <TriangleAlert size={15} className="flex-none" />
            {error}
          </div>
        )}
        <Button block onClick={enterDemo} disabled={loading}>
          {loading ? "Opening the demo…" : "Start the demo"}
        </Button>
      </AuthShell>
    );
  }

  if (accountState) {
    return (
      <AuthShell>
        <AccountStatusNotice
          code={accountState}
          onBack={() => { setAccountState(null); setPassword(""); }}
          onRequestAgain={() => navigate(`/signup?email=${encodeURIComponent(email.trim())}`)}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="mb-1 text-[19px] font-semibold">Welcome back</h1>
      <p className="mb-6 text-[12.8px] text-ink-faint">Sign in to see your accounts, transactions and reports.</p>
      {sessionExpired && !error && (
        <div className="mb-4 rounded-[10px] bg-info-soft px-3 py-3 text-[12.8px] text-info">Your session has expired. Please sign in again.</div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] bg-danger-soft px-3 py-3 text-[12.8px] text-danger">
          <TriangleAlert size={15} className="flex-none" />
          {error}
        </div>
      )}
      <div className="mb-4">
        <FormField label="Email" htmlFor="lg-email">
          <Input id="lg-email" type="email" autoComplete="username" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </FormField>
      </div>
      <div className="mb-2">
        <FormField label="Password" htmlFor="lg-pass">
          <Input id="lg-pass" type="password" autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </FormField>
      </div>
      <div className="mb-5 text-right">
        <Link to="/forgot-password" className="text-[12.8px] font-medium text-ink-faint hover:text-ink">
          Forgot password?
        </Link>
      </div>
      <Button block onClick={submit} disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <p className="mt-5 text-center text-[12.8px] text-ink-faint">
        New here?{" "}
        <Link to="/signup" className="font-medium text-ink hover:underline">
          Request an account
        </Link>
      </p>
    </AuthShell>
  );
}
