import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { authService } from "@/lib/api/services/authService";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/form";
import { AuthShell } from "./AuthShell";
import { useFormError } from "@/lib/hooks/useFormErrors";

type Step = "email" | "question" | "done";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useFormError([step, email, answer, password, confirm]);
  const [loading, setLoading] = useState(false);

  async function submitEmail() {
    setError("");
    setLoading(true);
    try {
      const result = await authService.getResetQuestion(email.trim());
      setEmail(result.email);
      setQuestion(result.question);
      setStep("question");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function submitReset() {
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password.length > 128) return setError("Password must be at most 128 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setLoading(true);
    try {
      await authService.resetPassword(email, answer.trim(), password);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <button onClick={() => navigate("/login")} className="mb-4 inline-flex items-center gap-1 text-caption text-ink-faint hover:text-ink">
        <ChevronLeft size={13} /> Back to sign in
      </button>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-control bg-danger-soft px-3 py-3 text-caption text-danger">
          <TriangleAlert size={15} className="flex-none" />
          {error}
        </div>
      )}

      {step === "email" && (
        <>
          <h1 className="mb-1 text-[19px] font-semibold">Reset your password</h1>
          <p className="mb-6 text-caption text-ink-faint">Enter the email on your account and we'll ask your security question.</p>
          <div className="mb-5">
            <FormField label="Email" htmlFor="fp-email">
              <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => e.key === "Enter" && submitEmail()} />
            </FormField>
          </div>
          <Button block onClick={submitEmail} disabled={loading}>
            {loading ? "Checking…" : "Continue"}
          </Button>
        </>
      )}

      {step === "question" && question && (
        <>
          <h1 className="mb-1 text-[19px] font-semibold">Security question</h1>
          <p className="mb-6 text-caption text-ink-faint">
            Answer the question you set up for <strong>{email}</strong>.
          </p>
          <div className="mb-4">
            <FormField label={question} htmlFor="fp-answer">
              <Input id="fp-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" />
            </FormField>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-4 max-[480px]:grid-cols-1">
            <FormField label="New password" htmlFor="fp-pass">
              <Input id="fp-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </FormField>
            <FormField label="Confirm" htmlFor="fp-pass2">
              <Input id="fp-pass2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter" />
            </FormField>
          </div>
          <Button block onClick={submitReset} disabled={loading}>
            {loading ? "Resetting…" : "Reset password"}
          </Button>
        </>
      )}

      {step === "done" && (
        <>
          <h1 className="mb-1 text-[19px] font-semibold">Password reset</h1>
          <p className="mb-6 text-caption text-ink-faint">You're all set — sign in with your new password.</p>
          <Button block onClick={() => navigate("/login")}>
            Go to sign in
          </Button>
        </>
      )}
    </AuthShell>
  );
}
