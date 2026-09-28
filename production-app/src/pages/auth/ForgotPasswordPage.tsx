import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import * as authApi from "@/lib/api/auth";
import { SECURITY_QUESTIONS } from "@/config/security-questions";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/form";
import { AuthShell } from "./AuthShell";

type Step = "email" | "question" | "done";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [questionId, setQuestionId] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const question = SECURITY_QUESTIONS.find((q) => q.id === questionId);

  function submitEmail() {
    setError("");
    try {
      const result = authApi.requestReset(email.trim());
      setEmail(result.email);
      setQuestionId(result.questionId);
      setStep("question");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  function submitReset() {
    setError("");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    try {
      authApi.resetPassword(email, answer.trim(), password);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <AuthShell>
      <button onClick={() => navigate("/login")} className="mb-4 inline-flex items-center gap-1 text-[12.5px] text-ink-faint hover:text-ink">
        <ChevronLeft size={13} /> Back to sign in
      </button>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] bg-danger-soft px-3 py-3 text-[12.8px] text-danger">
          <TriangleAlert size={15} className="flex-none" />
          {error}
        </div>
      )}

      {step === "email" && (
        <>
          <h1 className="mb-1 text-[19px] font-semibold">Reset your password</h1>
          <p className="mb-6 text-[12.8px] text-ink-faint">Enter the email on your account and we'll ask your security question.</p>
          <div className="mb-5">
            <FormField label="Email" htmlFor="fp-email">
              <Input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={(e) => e.key === "Enter" && submitEmail()} />
            </FormField>
          </div>
          <Button block onClick={submitEmail}>
            Continue
          </Button>
        </>
      )}

      {step === "question" && question && (
        <>
          <h1 className="mb-1 text-[19px] font-semibold">Security question</h1>
          <p className="mb-6 text-[12.8px] text-ink-faint">
            Answer the question you set up for <strong>{email}</strong>.
          </p>
          <div className="mb-4">
            <FormField label={question.text} htmlFor="fp-answer">
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
          <Button block onClick={submitReset}>
            Reset password
          </Button>
        </>
      )}

      {step === "done" && (
        <>
          <h1 className="mb-1 text-[19px] font-semibold">Password reset</h1>
          <p className="mb-6 text-[12.8px] text-ink-faint">You're all set — sign in with your new password.</p>
          <Button block onClick={() => navigate("/login")}>
            Go to sign in
          </Button>
        </>
      )}
    </AuthShell>
  );
}
