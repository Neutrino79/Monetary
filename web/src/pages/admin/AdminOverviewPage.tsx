import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { selectIsSuperuser, useAuthStore } from "@/store/authStore";
import { Card, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useAdminMutation, useAdminStats, useAdminUsers, useAuditLog, useUserNames } from "@/hooks/admin";
import { PageIntro, Person, ago, dayLabel, daysSince, formatWhen, statusLabel } from "@/components/admin/adminUi";
import { formatBytes } from "@/lib/format/bytes";
import { auditParts } from "./auditText";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Accounts and activity across the installation: what needs a decision, how big things are, what just happened. */
export function AdminOverviewPage() {
  const stats = useAdminStats();
  const recent = useAuditLog(0, 8);
  const people = useAdminUsers({ limit: 200 });
  const names = useUserNames();
  const toast = useToast();
  const isSuperuser = useAuthStore(selectIsSuperuser);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const purge = useAdminMutation(() => adminService.purge());

  if (stats.isLoading) return <Skeleton className="h-40 w-full" />;
  if (stats.isError || !stats.data) return <p role="alert" className="text-danger">Couldn&apos;t load the overview.</p>;
  const s = stats.data;
  const users = people.data?.items ?? [];
  const waiting = users.filter((u) => u.status === "pending_approval").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const oldestDays = waiting[0] ? daysSince(waiting[0].createdAt) : null;
  const largest = users.filter((u) => u.storageBytes).sort((a, b) => (b.storageBytes ?? 0) - (a.storageBytes ?? 0)).slice(0, 5);
  const active = s.byStatus.active ?? 0;

  const tiles: [string, string | number, string][] = [
    ["Total accounts", s.totalUsers, "every status"],
    ["Active", active, s.totalUsers ? `${Math.round((active / s.totalUsers) * 100)}% of accounts` : "—"],
    ["Pending approval", s.pendingApproval, oldestDays === null ? "nobody waiting" : `oldest waited ${dayLabel(oldestDays)}`],
    ["Suspended", s.byStatus.suspended ?? 0, "cannot sign in"],
    ["Admins", s.activeAdmins, "besides the superuser"],
    ["Ledger storage", `${s.ledgerCount} · ${(s.ledgerBytes / 1024 / 1024).toFixed(1)} MB`, "ledger files on disk"],
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageIntro>Accounts and activity across this installation. Administrators manage accounts only and never see anyone&apos;s ledger.</PageIntro>

      {s.pendingApproval > 0 && (
        <Card className="flex items-center justify-between gap-4 border-warn bg-warn-soft p-4">
          <div>
            <div className="text-[15px] font-semibold">
              {s.pendingApproval} account request{s.pendingApproval === 1 ? "" : "s"} waiting for approval
            </div>
            <div className="text-[12.8px] text-ink-soft">
              {oldestDays !== null ? `The oldest has waited ${dayLabel(oldestDays)}. ` : ""}They can&apos;t sign in until you decide.
            </div>
          </div>
          <Link to="/admin/pending"><Button size="sm">Review</Button></Link>
        </Card>
      )}

      {s.overdueForPurge > 0 && (
        <Card className="flex items-center justify-between gap-4 border-danger bg-danger-soft p-4">
          <div>
            <div className="text-[15px] font-semibold">{plural(s.overdueForPurge, "account", "accounts")} overdue for purge</div>
            <div className="text-[12.8px] text-ink-soft">
              Their 30-day period has ended. {isSuperuser ? "Purging removes them and their ledgers for good." : "Only the superuser can purge them."}
            </div>
          </div>
          {isSuperuser && <Button size="sm" variant="danger" onClick={() => setConfirmPurge(true)}>Purge now</Button>}
        </Card>
      )}
      <ConfirmDialog
        open={confirmPurge} onOpenChange={setConfirmPurge}
        title={`Purge ${plural(s.overdueForPurge, "account", "accounts")}?`}
        message="This permanently deletes the accounts and their ledgers. It cannot be undone."
        confirmLabel="Purge now"
        onConfirm={async () => {
          try { const r = await purge.mutateAsync(undefined); toast.show(`Purged ${plural(r.purged, "account", "accounts")}.`, { variant: "success" }); }
          catch (e) { toast.show(e instanceof Error ? e.message : "Couldn't purge.", { variant: "error" }); }
        }}
      />

      <div className="grid grid-cols-3 gap-4 max-[980px]:grid-cols-2">
        {tiles.map(([label, value, note]) => (
          <Card key={label} className="p-4">
            <div className="text-[12px] text-ink-faint">{label}</div>
            <div className="mt-1 text-[26px] font-semibold">{value}</div>
            <div className="text-[12px] text-ink-faint">{note}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5 max-[980px]:grid-cols-1">
        <Card className="p-0">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Recent activity</h2>
            <Link to="/admin/audit" className="text-[12.8px] text-accent hover:underline">Full audit log →</Link>
          </div>
          {recent.data?.items.length ? (
            <ul>
              {recent.data.items.map((e) => {
                const p = auditParts(e, names);
                return (
                  <li key={e.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0">
                    <Person name={p.actor} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block">
                        <b className="font-semibold">{p.actor}</b> {p.verb}{p.target && <>: <b className="font-semibold">{p.target}</b></>}
                      </span>
                      {p.extra && <span className="block truncate text-[12px] text-ink-faint">{p.extra}</span>}
                    </span>
                    <span className="flex-none text-[12px] text-ink-faint" title={formatWhen(e.at)}>{ago(e.at)}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-6 text-[13px] text-ink-faint">Nothing has happened yet.</p>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card className="p-0">
            <div className="border-b border-line px-4 py-3 text-[14px] font-semibold">Accounts by status</div>
            <ul>
              {Object.entries(s.byStatus).map(([status, count]) => (
                <li key={status} className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[13px] last:border-0">
                  <span>{statusLabel(status)}</span>
                  <span className="font-semibold">{count}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-0">
            <div className="border-b border-line px-4 py-3">
              <div className="text-[14px] font-semibold">Largest ledgers</div>
              <div className="text-[12px] text-ink-faint">Size only. Contents are never shown.</div>
            </div>
            {largest.length === 0 ? (
              <p className="px-4 py-5 text-[13px] text-ink-faint">No ledgers yet.</p>
            ) : (
              <ul>
                {largest.map((u) => (
                  <li key={u.id} className="flex items-center justify-between border-b border-line px-4 py-2.5 text-[13px] last:border-0">
                    <Link to={`/admin/users/${u.id}`} className="truncate hover:underline">{u.name}</Link>
                    <span className="flex-none font-semibold">{formatBytes(u.storageBytes ?? 0)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
