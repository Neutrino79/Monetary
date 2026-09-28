import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { AuthShell } from "./AuthShell";

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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

  return (
    <AuthShell>
      <h1 className="mb-1 text-[19px] font-semibold">Welcome back</h1>
      <p className="mb-6 text-[12.8px] text-ink-faint">Sign in to see your accounts, transactions and reports.</p>
      <div className="mb-5 flex items-center gap-2 rounded-[10px] bg-info-soft px-3 py-3 text-[12px] leading-relaxed text-info">
        <Sparkles size={13} className="flex-none" />
        <span>
          <strong>Prototype demo:</strong> ananya.kulkarni@example.com / demo1234
        </span>
      </div>
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
        Don't have an account?{" "}
        <Link to="/signup" className="font-semibold text-ink underline underline-offset-2">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
