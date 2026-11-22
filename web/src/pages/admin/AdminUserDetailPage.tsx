import { DeviceListCard } from "@/components/settings/DeviceList";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/form";
import { FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { outranks, ROLE_LABEL } from "@/lib/roles";
import { selectIsSuperuser, useAuthStore } from "@/store/authStore";
import { useAdminMutation, useAdminSessions, useAdminUser, useUserHistory } from "@/hooks/admin";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { UserActions } from "@/components/admin/UserActions";
import { Person, StatusBadge, TemporaryPasswordDialog, ago, formatWhen } from "@/components/admin/adminUi";
import { formatBytes } from "@/lib/format/bytes";
import type { AdminUser, IssuedPassword } from "@/types/admin";
import { auditParts } from "./auditText";

function ProfileForm({ user }: { user: AdminUser }) {
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [timezone, setTimezone] = useState(user.timezone ?? "");
  // Once the ledger exists it owns the time zone; only the account holder changes it, in Settings.
  const hasLedger = user.storageBytes !== null;
  const save = useAdminMutation(() => adminService.updateUser(user.id, {
    name: name.trim(), email: email.trim(), ...(!hasLedger && timezone.trim() ? { timezone: timezone.trim() } : {}),
  }));
  const changed = name.trim() !== user.name || email.trim().toLowerCase() !== user.email
    || (!hasLedger && (timezone.trim() || "") !== (user.timezone ?? ""));
  const emailChanging = email.trim().toLowerCase() !== user.email;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-[15px] font-semibold">Profile</h2>
      <FormField label="Name" htmlFor="ud-name"><Input id="ud-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></FormField>
      <FormField label="Email" htmlFor="ud-email"
        hint={emailChanging ? "Changing the email signs this person out everywhere." : undefined}>
        <Input id="ud-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <FormField label="Time zone" htmlFor="ud-tz" hint={hasLedger ? "Set by the account holder in Settings once their ledger exists." : undefined}>
        <Input id="ud-tz" value={timezone} placeholder="e.g. Asia/Kolkata" disabled={hasLedger} onChange={(e) => setTimezone(e.target.value)} />
      </FormField>
      <div>
        <Button size="sm" disabled={!changed || save.isPending} onClick={async () => {
          try { await save.mutateAsync(undefined); toast.show("Profile saved.", { variant: "success" }); }
          catch (e) { toast.show(e instanceof Error ? e.message : "Couldn't save.", { variant: "error" }); }
        }}>Save changes</Button>
      </div>
    </Card>
  );
}

function Sessions({ user, canAct }: { user: AdminUser; canAct: boolean }) {
  const toast = useToast();
  const q = useAdminSessions(user.id);
  const revoke = useAdminMutation((id: number) => adminService.revokeSession(user.id, id));
  const revokeAll = useAdminMutation(() => adminService.revokeSessions(user.id));
  const [confirmAll, setConfirmAll] = useState(false);
  return (
    <>
      <DeviceListCard
        rows={q.data} loading={q.isLoading} error={q.isError}
        description={`Browsers where ${user.name} is signed in.`}
        action={canAct && (q.data?.length ?? 0) > 0 ? <Button size="sm" variant="secondary" onClick={() => setConfirmAll(true)}>Sign out everywhere…</Button> : undefined}
        onSignOut={canAct ? async (row) => {
          try { await revoke.mutateAsync(row.id); toast.show("Signed out.", { variant: "success" }); }
          catch (e) { toast.show(e instanceof Error ? e.message : "Couldn't sign out.", { variant: "error" }); }
        } : undefined}
      />
      <ConfirmDialog
        open={confirmAll} onOpenChange={setConfirmAll} variant="primary"
        title={`Sign ${user.name} out everywhere?`} message="All of their sessions end now. They can sign in again."
        confirmLabel="Sign out everywhere"
        onConfirm={async () => {
          try { await revokeAll.mutateAsync(undefined); toast.show("Sessions revoked.", { variant: "success" }); }
          catch (e) { toast.show(e instanceof Error ? e.message : "Couldn't sign out.", { variant: "error" }); }
        }}
      />
    </>
  );
}

/** Role change and deletion: the superuser's cards beside the account. */
function RoleAndDelete({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const toast = useToast();
  const [ask, setAsk] = useState<null | "role" | "delete">(null);
  const nextRole = user.role === "admin" ? "user" : "admin";
  const change = useAdminMutation(() => adminService.setRole(user.id, nextRole));
  const remove = useAdminMutation(() => adminService.remove(user.id));
  const go = async (job: () => Promise<unknown>, ok: string) => {
    try { await job(); toast.show(ok, { variant: "success" }); }
    catch (e) { toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" }); }
  };
  return (
    <>
      <Card>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-[15px] font-semibold">Role</h2><span className="text-[11.5px] text-ink-faint">Superuser only</span></div>
        <p className="mb-3 text-[12.8px] text-ink-soft">
          {user.role === "admin"
            ? "Admin. Can approve requests and suspend, unlock or reset ordinary users. Can't delete accounts, create admins or see anyone's ledger."
            : "Regular user. An admin can approve requests and suspend, unlock or reset ordinary users. Admins can't delete accounts, create admins or see anyone's ledger."}
        </p>
        {user.status === "active" && !isSelf && (
          <Button size="sm" variant="secondary" onClick={() => setAsk("role")}>{nextRole === "admin" ? "Make admin…" : "Make regular user…"}</Button>
        )}
      </Card>
      {user.status !== "pending_delete" && !isSelf && (
        <Card className="border-danger">
          <div className="mb-2 flex items-center justify-between"><h2 className="text-[15px] font-semibold text-danger">Delete account</h2><span className="text-[11.5px] text-ink-faint">Superuser only</span></div>
          <p className="mb-3 text-[12.8px] text-ink-soft">The account is locked now and its data is removed after 30 days. You can restore it until then.</p>
          <Button size="sm" variant="danger" onClick={() => setAsk("delete")}>Delete {user.name}…</Button>
        </Card>
      )}
      <ConfirmDialog
        open={ask === "role"} onOpenChange={(o) => !o && setAsk(null)} variant="primary"
        title={`Make ${user.name} ${nextRole === "admin" ? "an admin" : "a regular user"}?`}
        message={nextRole === "admin" ? "They will be able to approve requests and suspend, unlock or reset ordinary users. They cannot delete accounts, create admins or see anyone's ledger." : "They lose access to the Admin area and are signed out so the change applies."}
        confirmLabel="Change role"
        onConfirm={() => go(() => change.mutateAsync(undefined), `${user.name} is now ${nextRole === "admin" ? "an admin" : "a regular user"}.`)}
      />
      <ConfirmDialog
        open={ask === "delete"} onOpenChange={(o) => !o && setAsk(null)}
        title={`Delete ${user.name}?`}
        message="The account is locked now and its data is removed after 30 days. You can restore it until then."
        confirmLabel="Delete" onConfirm={() => go(() => remove.mutateAsync(undefined), `${user.name} scheduled for deletion.`)}
      />
    </>
  );
}

export function AdminUserDetailPage() {
  const id = Number(useParams().id);
  const selfId = useAuthStore((s) => s.account?.id);
  const actorRole = useAuthStore((s) => s.account?.role);
  const isSuperuser = useAuthStore(selectIsSuperuser);
  const q = useAdminUser(id);
  const audit = useUserHistory(id);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);

  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.isError || !q.data) return <p role="alert" className="text-danger">Couldn&apos;t load this account.</p>;
  const u = q.data;
  const canManage = outranks(actorRole, u.role) || u.id === selfId;
  const canEdit = outranks(actorRole, u.role);
  const isRequest = u.status === "pending_approval" || u.status === "rejected";
  const history = audit.data?.items ?? [];
  const names = new Map([[u.id, `${u.name} (${u.email})`]]);
  const facts: [string, string][] = [
    ["Created", formatWhen(u.createdAt)],
    ["Last sign-in", formatWhen(u.lastLoginAt)],
    ["Last activity", ago(u.lastActivityAt)],
    ["Ledger size", u.storageBytes === null ? "no ledger" : formatBytes(u.storageBytes)],
    ["Currency", u.homeCurrencyCode ?? "—"],
    ["Time zone", u.timezone ?? "—"],
    ...(u.statusReason ? [["Reason", u.statusReason] as [string, string]] : []),
  ];

  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Breadcrumb" className="text-[12.8px] text-ink-faint">
        <Link to={isRequest ? "/admin/pending" : "/admin/users"} className="text-accent hover:underline">{isRequest ? "Requests" : "Users"}</Link> <span aria-hidden>/</span> <span className="text-ink">{u.name}</span>
      </nav>
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Person name={u.name} size={46} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[18px] font-semibold">{u.name}</h1>
              <StatusBadge status={u.status} />
              <span className="rounded-full bg-paper-sunken px-2.5 py-0.5 text-[11.5px] font-semibold text-ink-soft">{ROLE_LABEL[u.role]}</span>
            </div>
            <div className="text-[13px] text-ink-faint">{u.email}</div>
          </div>
        </div>
        <UserActions user={u} isSelf={u.id === selfId} onIssued={setIssued} />
      </Card>
      {u.mustChangePassword && (
        <div role="status" className="rounded-[12px] bg-info-soft px-4 py-3 text-[13px] text-info">
          {u.name.split(" ")[0]} is still using the temporary password{u.passwordExpiresAt ? ` (valid until ${formatWhen(u.passwordExpiresAt)})` : ""}. They are asked to change it at next sign-in.
        </div>
      )}
      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] items-start gap-6 max-[980px]:grid-cols-1">
        <div className="flex flex-col gap-6">
          {canEdit && <ProfileForm key={u.updatedAt} user={u} />}
          <Sessions user={u} canAct={canManage} />
          <Card className="overflow-hidden p-0">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="text-[15px] font-semibold">History</span>
              <Link to="/admin/audit" className="text-[12.8px] text-accent hover:underline">Open in audit log →</Link>
            </div>
            {history.length === 0 ? <p className="px-5 py-6 text-[13px] text-ink-faint">Nothing recorded yet.</p> : (
              <ul>{history.map((e) => {
                const p = auditParts(e, names);
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 border-b border-line px-5 py-3 text-[13px] last:border-b-0">
                    <span><b className="font-semibold">{p.actor}</b> {p.verb}</span>
                    <span className="flex-none text-[12px] text-ink-faint" title={formatWhen(e.at)}>{ago(e.at)}</span>
                  </li>
                );
              })}</ul>
            )}
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-4 text-[15px] font-semibold">Account</h2>
            <dl className="flex flex-col gap-2 text-[13px]">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-ink-faint">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
              ))}
            </dl>
            <p className="mt-3 text-[12px] text-ink-faint">Only the size of the ledger is visible to administrators, never what is in it.</p>
          </Card>
          {isSuperuser && outranks(actorRole, u.role) && <RoleAndDelete user={u} isSelf={u.id === selfId} />}
        </div>
      </div>
      <TemporaryPasswordDialog email={issued?.user.email ?? ""} password={issued?.temporaryPassword ?? null} onClose={() => setIssued(null)} />
    </div>
  );
}
