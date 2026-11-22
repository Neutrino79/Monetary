import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/primitives";
import { DeviceListCard } from "@/components/settings/DeviceList";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Select, FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { formatWhen } from "@/components/admin/adminUi";
import { useSecurityQuestions } from "@/hooks/queries";
import { authService } from "@/lib/api/services/authService";
import { formatBytes } from "@/lib/format/bytes";
import { useFormError } from "@/lib/hooks/useFormErrors";
import { selectIsSuperuser, useAuthStore } from "@/store/authStore";

const SESSIONS_KEY = ["me", "sessions"] as const;
const ACCOUNT_KEY = ["me", "account"] as const;
const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

/** Where the person is signed in. The device they are using right now is marked and listed first. */
export function SignedInDevicesCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const sessions = useQuery({ queryKey: SESSIONS_KEY, queryFn: authService.mySessions });
  const refresh = () => qc.invalidateQueries({ queryKey: SESSIONS_KEY });
  const signOut = useMutation({ mutationFn: (id: number) => authService.revokeMySession(id), onSuccess: refresh });
  const signOutOthers = useMutation({ mutationFn: authService.revokeOtherSessions, onSuccess: refresh });
  const [confirmOthers, setConfirmOthers] = useState(false);
  const others = (sessions.data ?? []).filter((s) => !s.current).length;

  async function one(id: number, label: string) {
    try {
      await signOut.mutateAsync(id);
      toast.show(`Signed out ${label}.`, { variant: "success" });
    } catch (e) {
      toast.show(message(e), { variant: "error" });
    }
  }
  async function everywhereElse() {
    try {
      const r = await signOutOthers.mutateAsync();
      toast.show(`Signed out ${r.ended} other device${r.ended === 1 ? "" : "s"}.`, { variant: "success" });
    } catch (e) {
      toast.show(message(e), { variant: "error" });
    }
  }

  return (
    <>
      <DeviceListCard
        rows={sessions.data} loading={sessions.isLoading} error={sessions.isError} busy={signOut.isPending}
        description="Browsers where your account is signed in. Sign out any you don't recognise."
        action={others > 0 ? (
          <Button size="sm" variant="secondary" disabled={signOutOthers.isPending} onClick={() => setConfirmOthers(true)}>Sign out other devices</Button>
        ) : undefined}
        onSignOut={(row, label) => one(row.id, label)}
      />
      <ConfirmDialog
        open={confirmOthers} onOpenChange={setConfirmOthers} variant="primary"
        title="Sign out other devices?" message="Every device except this one is signed out. Changing your password does the same, and signs this one out too."
        confirmLabel="Sign out others" onConfirm={everywhereElse}
      />
    </>
  );
}

/** Facts about the account: when it started, the last sign-in and how much space the ledger uses. */
export function AccountCard() {
  const account = useAuthStore((s) => s.account);
  const info = useQuery({ queryKey: ACCOUNT_KEY, queryFn: authService.myAccount });
  const row = (label: string, value: string) => (
    <div className="flex items-baseline justify-between gap-4 py-2 text-[13.5px]">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
  return (
    <Card>
      <div className="mb-2 text-[14.5px] font-semibold">Account</div>
      <dl className="divide-y divide-line">
        {row("Email", account?.email ?? "—")}
        {info.data && (
          <>
            {row("Member since", formatWhen(info.data.memberSince))}
            {row("Last sign-in", info.data.lastLoginAt ? formatWhen(info.data.lastLoginAt) : "—")}
            {row("Ledger size", info.data.ledgerBytes === null ? "No ledger" : formatBytes(info.data.ledgerBytes))}
          </>
        )}
      </dl>
    </Card>
  );
}

/** The question asked on "Forgot password". Changing it needs the current password. */
export function SecurityQuestionCard() {
  const toast = useToast();
  const qc = useQueryClient();
  const questions = useSecurityQuestions().data ?? [];
  const info = useQuery({ queryKey: ACCOUNT_KEY, queryFn: authService.myAccount });
  const [questionId, setQuestionId] = useState<number | "">("");
  const [answer, setAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useFormError([questionId, answer, password]);
  const [saving, setSaving] = useState(false);
  const chosen: number | "" = questionId === "" ? (info.data?.securityQuestionId ?? questions[0]?.id ?? "") : questionId;

  async function submit() {
    setError("");
    if (chosen === "") return setError("Choose a question.");
    if (!answer.trim()) return setError("Enter an answer.");
    if (!password) return setError("Enter your current password.");
    setSaving(true);
    try {
      await authService.changeSecurityQuestion(password, Number(chosen), answer.trim());
      toast.show("Security question updated.", { variant: "success" });
      setAnswer("");
      setPassword("");
      await qc.invalidateQueries({ queryKey: ACCOUNT_KEY });
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-1 text-[14.5px] font-semibold">Security question</div>
      <p className="mb-4 text-[12.8px] text-ink-faint">Used to reset your password if you forget it.</p>
      <div className="grid grid-cols-1 gap-4">
        <FormField label="Question">
          <Select aria-label="Question" value={String(chosen)} onChange={(e) => setQuestionId(Number(e.target.value))}>
            {questions.map((q) => <option key={q.id} value={q.id}>{q.text}</option>)}
          </Select>
        </FormField>
        <FormField label="Answer">
          <Input autoComplete="off" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        </FormField>
        <FormField label="Current password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
      </div>
      {error && <div role="alert" className="mt-3 text-[12.5px] text-danger">{error}</div>}
      <div className="mt-4"><Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Update question"}</Button></div>
    </Card>
  );
}

/** Self-service deletion. The account is locked straight away and can be restored by the superuser for 30 days. */
export function DeleteAccountCard() {
  const toast = useToast();
  const logout = useAuthStore((s) => s.logout);
  const isSuperuser = useAuthStore(selectIsSuperuser);
  const info = useQuery({ queryKey: ACCOUNT_KEY, queryFn: authService.myAccount });
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useFormError([password]);
  const [busy, setBusy] = useState(false);
  if (isSuperuser) return null; // the superuser role has to be transferred first
  const days = info.data?.deleteGraceDays ?? 30;

  async function remove() {
    setError("");
    if (!password) return setError("Enter your password to confirm.");
    setBusy(true);
    try {
      await authService.deleteMyAccount(password);
      toast.show("Your account is scheduled for deletion.", { variant: "success" });
      await logout();
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }

  return (
    <Card className="border-danger/40">
      <div className="mb-1 text-[14.5px] font-semibold">Delete my account</div>
      <p className="mb-4 text-[12.8px] text-ink-faint">
        Your account is locked at once and your ledger is erased after {days} days. Until then an administrator can restore it.
        Download your data first if you want a copy.
      </p>
      {open ? (
        <div className="flex max-w-sm flex-col gap-3">
          <FormField label="Confirm with your password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          {error && <div role="alert" className="text-[12.5px] text-danger">{error}</div>}
          <div className="flex gap-2">
            <Button variant="danger" onClick={remove} disabled={busy}>{busy ? "Deleting…" : "Delete my account"}</Button>
            <Button variant="ghost" onClick={() => { setOpen(false); setPassword(""); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setOpen(true)}>Delete my account…</Button>
      )}
    </Card>
  );
}
