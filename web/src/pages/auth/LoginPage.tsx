import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { useBranding, useSetupStatus } from "@/hooks/queries";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { AuthShell } from "./AuthShell";
import { useFormError } from "@/lib/hooks/useFormErrors";

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const demoLogin = useAuthStore((s) => s.demoLogin);
  const branding = useBranding();
  const sessionExpired = useAuthStore((s) => s.sessionExpired);
  const setup = useSetupStatus();
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useFormError([email, password]);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      toast.show("Welcome back!", { variant: "success" });
      navigate("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
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

  // Single-owner app: until the owner exists, the only thing to do is first-run setup.
  if (setup.data === false) return <Navigate to="/signup" replace />;

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
      {branding.demo && (
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-center text-[12.8px] text-ink-faint">Just looking around? No account or setup needed.</p>
          <Button block variant="secondary" onClick={enterDemo} disabled={loading}>
            Try the demo
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
