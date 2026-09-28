import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { SECURITY_QUESTIONS, TIMEZONE_OPTIONS } from "@/config/security-questions";
import { appConfig } from "@/config/app";
import { AuthShell } from "./AuthShell";

export function SignupPage() {
  const signup = useAuthStore((s) => s.signup);
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [timezone, setTimezone] = useState(appConfig.defaultTimezone);
  const [questionId, setQuestionId] = useState(SECURITY_QUESTIONS[0].id);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    if (!answer.trim()) return setError("Answer your security question.");

    setLoading(true);
    try {
      await signup({ name: name.trim(), email: email.trim(), password, timezone, homeCurrencyCode: appConfig.currencyCode, securityQuestionId: questionId, securityAnswer: answer.trim() });
      toast.show(`Account created — welcome to ${appConfig.name}!`, { variant: "success" });
      navigate("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell wide>
      <h1 className="mb-1 text-[19px] font-semibold">Create your account</h1>
      <p className="mb-6 text-[12.8px] text-ink-faint">Set up your ledger — this is the owner account for this instance.</p>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] bg-danger-soft px-3 py-3 text-[12.8px] text-danger">
          <TriangleAlert size={15} className="flex-none" />
          {error}
        </div>
      )}
      <div className="mb-4">
        <FormField label="Full name" htmlFor="su-name">
          <Input id="su-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </FormField>
      </div>
      <div className="mb-4">
        <FormField label="Email" htmlFor="su-email">
          <Input id="su-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </FormField>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-4 max-[480px]:grid-cols-1">
        <FormField label="Password" htmlFor="su-pass">
          <Input id="su-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </FormField>
        <FormField label="Confirm password" htmlFor="su-pass2">
          <Input id="su-pass2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
        </FormField>
      </div>
      <div className="mb-4">
        <FormField label="Timezone" htmlFor="su-tz">
          <Select id="su-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {TIMEZONE_OPTIONS.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="mb-4">
        <FormField label="Security question" htmlFor="su-q" hint="Used to recover your password">
          <Select id="su-q" value={questionId} onChange={(e) => setQuestionId(parseInt(e.target.value, 10))}>
            {SECURITY_QUESTIONS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.text}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="mb-6">
        <FormField label="Your answer" htmlFor="su-a">
          <Input id="su-a" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" />
        </FormField>
      </div>
      <Button block onClick={submit} disabled={loading}>
        {loading ? "Creating account…" : "Create account"}
      </Button>
      <p className="mt-5 text-center text-[12.8px] text-ink-faint">
        Already have an account?{" "}
        <Link to="/login" className="font-semibold text-ink underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
