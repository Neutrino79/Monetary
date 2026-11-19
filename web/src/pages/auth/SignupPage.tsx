import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { timezoneOptions } from "@/config/timezones";
import { appConfig } from "@/config/app";
import { useBranding, useSecurityQuestions, useSetupStatus } from "@/hooks/queries";
import { ApiError } from "@/lib/api/errors";
import { authService } from "@/lib/api/services/authService";
import { useDemoMode } from "@/hooks/queries";
import { AuthShell } from "./AuthShell";
import { useFormError } from "@/lib/hooks/useFormErrors";

export function SignupPage() {
  const setupAccount = useAuthStore((s) => s.setup);
  const { name: appName } = useBranding();
  const status = useSetupStatus();
  const questions = useSecurityQuestions().data ?? [];
  const navigate = useNavigate();
  const toast = useToast();

  const [name, setName] = useState("");
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") ?? ""); // "Request again" arrives here with it filled in
  const [website, setWebsite] = useState(""); // honeypot: real people never see or fill this
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [timezone, setTimezone] = useState(appConfig.defaultTimezone);
  const [currency, setCurrency] = useState(appConfig.currencyCode);
  const [questionId, setQuestionId] = useState<number | null>(null);
  const { isDemo } = useDemoMode();
  // First run creates the superuser; once any account exists this page asks for an account instead.
  const [raced, setRaced] = useState(false);
  const [requested, setRequested] = useState(false);
  const requesting = status.data === true || raced;
  const selectedQuestion = questionId ?? questions[0]?.id ?? null;
  const [answer, setAnswer] = useState("");
  const [error, setError] = useFormError([name, email, password, confirm, timezone, currency, questionId, answer]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isDemo) navigate("/login", { replace: true }); // the demo has no sign-ups
  }, [isDemo, navigate]);

  async function submit() {
    setError("");
    if (!name.trim()) return setError("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password.length > 128) return setError("Password must be at most 128 characters.");
    if (!/^[A-Za-z]{3}$/.test(currency)) return setError("Enter a 3-letter currency code, e.g. INR.");
    if (selectedQuestion == null) return setError("Choose a security question.");
    if (password !== confirm) return setError("Passwords don't match.");
    if (!answer.trim()) return setError("Answer your security question.");

    setLoading(true);
    try {
      if (requesting) {
        await authService.register({ name: name.trim(), email: email.trim(), password, timezone, homeCurrencyCode: currency.toUpperCase(), securityQuestionId: selectedQuestion, securityAnswer: answer.trim(), website });
        setRequested(true);
        return;
      }
      await setupAccount({ name: name.trim(), email: email.trim(), password, timezone, homeCurrencyCode: currency.toUpperCase(), securityQuestionId: selectedQuestion, securityAnswer: answer.trim() });
      toast.show(`Account created — welcome to ${appName}!`, { variant: "success" });
      navigate("/dashboard");
    } catch (e) {
      if (ApiError.isApiError(e) && e.code === "ALREADY_SETUP") setRaced(true);
      else setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (requested) {
    return (
      <AuthShell>
        <h1 className="mb-1 text-[19px] font-semibold">Request received</h1>
        <p className="mb-6 text-[12.8px] text-ink-faint">
          Thanks! An administrator will review your request. Once it is approved, sign in with the email and password you just chose. If you
          already have an account, nothing changes: sign in as usual.
        </p>
        <Button block onClick={() => navigate("/login")}>Back to sign in</Button>
      </AuthShell>
    );
  }

  if (status.isLoading) {
    return (
      <AuthShell>
        <div className="flex items-center justify-center py-10">
          <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-line-strong border-t-ink" aria-label="Checking setup status" />
        </div>
      </AuthShell>
    );
  }

  if (status.isError) {
    return (
      <AuthShell>
        <h1 className="mb-1 text-[19px] font-semibold">Can't reach {appName}</h1>
        <p className="mb-6 text-[12.8px] text-ink-faint">{status.error instanceof Error ? status.error.message : "Please try again."}</p>
        <Button block onClick={() => status.refetch()}>Try again</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell wide>
      <h1 className="mb-1 text-[19px] font-semibold">{requesting ? "Request an account" : "Set up your ledger"}</h1>
      <p className="mb-6 text-[12.8px] text-ink-faint">
        {requesting
          ? `Ask for your own private ledger on ${appName}. An administrator approves new accounts before they can sign in.`
          : "Create the first account for this instance. It becomes the administrator. This can only be done once."}
      </p>
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
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="su-website">Website</label>
        <input id="su-website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
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
      <div className="mb-4 grid grid-cols-2 gap-4 max-[480px]:grid-cols-1">
        <FormField label="Home currency" htmlFor="su-cur" hint="3-letter code. Can't be changed later">
          <Input id="su-cur" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="INR" />
        </FormField>
        <FormField label="Timezone" htmlFor="su-tz">
          <Select id="su-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {timezoneOptions().map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </FormField>
      </div>
      <div className="mb-4">
        <FormField label="Security question" htmlFor="su-q" hint="Used to recover your password">
          <Select id="su-q" value={selectedQuestion ?? ""} onChange={(e) => setQuestionId(parseInt(e.target.value, 10))}>
            {questions.map((q) => (
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
        {loading ? (requesting ? "Sending…" : "Setting up…") : requesting ? "Request account" : "Create administrator account"}
      </Button>
      {requesting && (
        <p className="mt-5 text-center text-[12.8px] text-ink-faint">
          Already have an account?{" "}
          <button type="button" className="font-medium text-ink hover:underline" onClick={() => navigate("/login")}>
            Sign in
          </button>
        </p>
      )}
    </AuthShell>
  );
}
