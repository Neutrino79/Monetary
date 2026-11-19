import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/form";
import { FormField } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { outranks, ROLE_LABEL } from "@/lib/roles";
import { useAuthStore } from "@/store/authStore";
import { useAdminMutation, useAdminSessions, useAdminUser, useAuditLog } from "@/hooks/admin";
import { UserActions } from "@/components/admin/UserActions";
import { StatusBadge, TemporaryPasswordDialog, formatWhen } from "@/components/admin/adminUi";
import { formatBytes } from "@/lib/format/bytes";
import type { AdminUser, IssuedPassword } from "@/types/admin";
import { auditSummary } from "./auditText";

function ProfileForm({ user }: { user: AdminUser }) {
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [timezone, setTimezone] = useState(user.timezone ?? "");
  const save = useAdminMutation(() => adminService.updateUser(user.id, {
    name: name.trim(), email: email.trim(), ...(timezone.trim() ? { timezone: timezone.trim() } : {}),
  }));
  const changed = name.trim() !== user.name || email.trim().toLowerCase() !== user.email || (timezone.trim() || "") !== (user.timezone ?? "");
  const emailChanging = email.trim().toLowerCase() !== user.email;
  return (
    <Card className="flex flex-col gap-3 p-4">
      <h2 className="text-[14px] font-semibold">Profile</h2>
      <FormField label="Name" htmlFor="ud-name"><Input id="ud-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} /></FormField>
      <FormField label="Email" htmlFor="ud-email"
        hint={emailChanging ? "Changing the email signs this person out everywhere." : undefined}>
        <Input id="ud-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </FormField>
      <FormField label="Time zone" htmlFor="ud-tz"><Input id="ud-tz" value={timezone} placeholder="e.g. Asia/Kolkata" onChange={(e) => setTimezone(e.target.value)} /></FormField>
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
  return (
    <Card className="p-0">
      <div className="border-b border-line px-4 py-3 text-[14px] font-semibold">Signed-in devices</div>
      {q.isLoading ? <Skeleton className="m-4 h-16" /> : !q.data?.length ? (
        <p className="px-4 py-5 text-[13px] text-ink-faint">Not signed in anywhere.</p>
      ) : (
        <ul>
          {q.data.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="min-w-0 text-[13px]">
                <div className="truncate font-medium">{s.userAgent ?? "Unknown device"}</div>
                <div className="text-[12px] text-ink-faint">{s.ip ?? "unknown address"} · last seen {formatWhen(s.lastSeenAt ?? s.createdAt)} · signed in {formatWhen(s.createdAt)}</div>
              </div>
              {canAct && (
                <Button size="sm" variant="secondary" aria-label={`Sign out ${s.userAgent ?? "device"} ${s.id}`}
                  onClick={async () => {
                    try { await revoke.mutateAsync(s.id); toast.show("Signed out.", { variant: "success" }); }
                    catch (e) { toast.show(e instanceof Error ? e.message : "Couldn't sign out.", { variant: "error" }); }
                  }}>Sign out</Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function AdminUserDetailPage() {
  const id = Number(useParams().id);
  const selfId = useAuthStore((s) => s.account?.id);
  const actorRole = useAuthStore((s) => s.account?.role);
  const q = useAdminUser(id);
  const audit = useAuditLog(0, 200);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);

  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.isError || !q.data) return <p role="alert" className="text-danger">Couldn&apos;t load this account.</p>;
  const u = q.data;
  const canManage = outranks(actorRole, u.role) || u.id === selfId;
  const canEdit = outranks(actorRole, u.role);
  const history = (audit.data?.items ?? []).filter((e) => e.targetUserId === u.id).slice(0, 10);
  const names = new Map([[u.id, `${u.name} (${u.email})`]]);

  return (
    <div className="flex flex-col gap-4">
      <Link to="/admin/users" className="inline-flex items-center gap-1 text-[12.8px] text-accent hover:underline"><ArrowLeft size={14} /> All users</Link>
      <Card className="flex flex-wrap items-start justify-between gap-4 p-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-semibold">{u.name}</h1>
            <StatusBadge status={u.status} />
            {u.role !== "user" && <span className="text-[12px] font-semibold text-ink-soft">{ROLE_LABEL[u.role]}</span>}
          </div>
          <div className="text-[13px] text-ink-faint">{u.email}</div>
          <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-[12.8px] max-[600px]:grid-cols-1">
            <div><dt className="inline text-ink-faint">Created </dt><dd className="inline">{formatWhen(u.createdAt)}</dd></div>
            <div><dt className="inline text-ink-faint">Last sign-in </dt><dd className="inline">{formatWhen(u.lastLoginAt)}</dd></div>
            <div><dt className="inline text-ink-faint">Last activity </dt><dd className="inline">{formatWhen(u.lastActivityAt)}</dd></div>
            <div><dt className="inline text-ink-faint">Ledger size </dt><dd className="inline">{u.storageBytes === null ? "no ledger" : formatBytes(u.storageBytes)}</dd></div>
            <div><dt className="inline text-ink-faint">Currency </dt><dd className="inline">{u.homeCurrencyCode ?? "—"}</dd></div>
            {u.statusReason && <div><dt className="inline text-ink-faint">Reason </dt><dd className="inline">{u.statusReason}</dd></div>}
          </dl>
        </div>
        <UserActions user={u} isSelf={u.id === selfId} onIssued={setIssued} />
      </Card>
      {canEdit && <ProfileForm key={u.updatedAt} user={u} />}
      <Sessions user={u} canAct={canManage} />
      <Card className="p-0">
        <div className="border-b border-line px-4 py-3 text-[14px] font-semibold">Recent history</div>
        {history.length === 0 ? <p className="px-4 py-5 text-[13px] text-ink-faint">Nothing recorded yet.</p> : (
          <ul>{history.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0">
              <span>{auditSummary(e, names)}</span><span className="flex-none text-[12px] text-ink-faint">{formatWhen(e.at)}</span>
            </li>))}</ul>
        )}
      </Card>
      <TemporaryPasswordDialog email={issued?.user.email ?? ""} password={issued?.temporaryPassword ?? null} onClose={() => setIssued(null)} />
    </div>
  );
}
