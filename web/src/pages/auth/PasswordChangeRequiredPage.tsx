import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { authService } from "@/lib/api/services/authService";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { Input, FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { useFormError } from "@/lib/hooks/useFormErrors";
import { AuthShell } from "./AuthShell";

/**
 * Shown instead of the app while the account still has the temporary password an administrator
 * handed out. Nothing else is reachable until it is replaced. The server ends every session when the
 * password changes, so afterwards the person signs in again with the new one.
 */
export function PasswordChangeRequiredPage() {
  const account = useAuthStore((s) => s.account);
  const finish = useAuthStore((s) => s.finishPasswordChange);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useFormError([current, next, confirm]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError("");
    if (!current) return setError("Enter the temporary password you were given.");
    if (next.length < 8) return setError("New password must be at least 8 characters.");
    if (next.length > 128) return setError("New password must be at most 128 characters.");
    if (next === current) return setError("Choose a password different from the temporary one.");
    if (next !== confirm) return setError("New passwords don't match.");
    setSaving(true);
    try {
      await authService.changePassword(current, next);
      finish();
      toast.show("Password changed. Sign in with your new password.", { variant: "success" });
      navigate("/login", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="mb-1 text-[19px] font-semibold">Choose a new password</h1>
      <p className="mb-6 text-[12.8px] text-ink-faint">
        {account ? `${account.email} is using a temporary password.` : "This account is using a temporary password."} Set your own to
        continue.
      </p>
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-[10px] bg-danger-soft px-3 py-3 text-[12.8px] text-danger">
          <TriangleAlert size={15} className="flex-none" />
          {error}
        </div>
      )}
      <div className="mb-4">
        <FormField label="Temporary password" htmlFor="pc-cur">
          <Input id="pc-cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </FormField>
      </div>
      <div className="mb-4">
        <FormField label="New password" htmlFor="pc-new" hint="At least 8 characters">
          <Input id="pc-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </FormField>
      </div>
      <div className="mb-6">
        <FormField label="Confirm new password" htmlFor="pc-new2">
          <Input id="pc-new2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </FormField>
      </div>
      <div className="flex flex-col gap-3">
        <Button block onClick={submit} disabled={saving}>
          {saving ? "Saving…" : "Set new password"}
        </Button>
        <Button block variant="secondary" onClick={() => logout().then(() => navigate("/login", { replace: true }))}>
          Sign out
        </Button>
      </div>
    </AuthShell>
  );
}
