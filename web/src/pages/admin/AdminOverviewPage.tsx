import { useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { selectIsSuperuser, useAuthStore } from "@/store/authStore";
import { Inbox, Trash2 } from "lucide-react";
import { Card, IconChip, ProgressBar, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useAdminMutation, useAdminStats, useAdminUsers, useAuditLog, useUserNames } from "@/hooks/admin";
import { PageIntro, Person, ago, dayLabel, daysSince, formatWhen, statusLabel } from "@/components/admin/adminUi";
import { formatBytes } from "@/lib/format/bytes";
import { auditParts } from "./auditText";

const STATUS_ORDER = ["active", "pending_approval", "suspended", "rejected", "pending_delete"];
const STATUS_COLOR: Record<string, string> = {
  active: "var(--accent)", pending_approval: "var(--warn)", suspended: "var(--danger)", rejected: "var(--ink-faint)", pending_delete: "var(--negative)",
};
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
  const statusRows = STATUS_ORDER.map((k) => ({ key: k, count: s.byStatus[k] ?? 0, label: statusLabel(k), color: STATUS_COLOR[k] })).filter((r) => r.count > 0);
  const biggest = largest[0]?.storageBytes ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageIntro>Accounts and activity across this installation. Administrators manage accounts only and never see anyone&apos;s ledger.</PageIntro>

      {(s.pendingApproval > 0 || s.overdueForPurge > 0) && (
        <section aria-label="Needs your attention" className={`grid gap-4 ${s.pendingApproval > 0 && s.overdueForPurge > 0 ? "grid-cols-2" : "grid-cols-1"} max-[980px]:grid-cols-1`}>
          {s.pendingApproval > 0 && (
            <Card className="flex items-center gap-4 py-4">
              <IconChip icon={Inbox} color="var(--warn)" />
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold">{plural(s.pendingApproval, "sign-up request is", "sign-up requests are")} waiting</div>
                <div className="text-[13px] text-ink-soft">
                  {oldestDays !== null && oldestDays > 0 ? `The oldest has waited ${dayLabel(oldestDays)}. ` : ""}They can&apos;t sign in until you decide.
                </div>
              </div>
              <Link to="/admin/pending"><Button size="sm" tabIndex={-1}>Review</Button></Link>
            </Card>
          )}
          {s.overdueForPurge > 0 && (
            <Card className="flex items-center gap-4 py-4">
              <IconChip icon={Trash2} color="var(--danger)" />
              <div className="min-w-0 flex-1">
                <div className="text-[14.5px] font-semibold">{plural(s.overdueForPurge, "account is", "accounts are")} overdue for purge</div>
                <div className="text-[13px] text-ink-soft">
                  Their 30-day period has ended. {isSuperuser ? "Purging removes them and their ledgers for good." : "Only the superuser can purge them."}
                </div>
              </div>
              {isSuperuser && <Button size="sm" variant="danger" onClick={() => setConfirmPurge(true)}>Purge now</Button>}
            </Card>
          )}
        </section>
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

      <section aria-label="Totals" className="grid grid-cols-6 gap-4 max-[1180px]:grid-cols-3 max-[640px]:grid-cols-2">
        {tiles.map(([label, value, note]) => (
          <Card key={label} className="px-5 py-4">
            <div className="text-[13px] text-ink-soft">{label}</div>
            <div className="mt-1.5 text-[26px] font-semibold leading-tight tracking-tight">{value}</div>
            <div className="mt-1 text-[12.5px] text-ink-faint">{note}</div>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] items-start gap-5 max-[980px]:grid-cols-1">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-[15px] font-semibold">Recent activity</h2>
            <Link to="/admin/audit" className="text-[13px] font-medium text-accent hover:underline">Full audit log →</Link>
          </div>
          {recent.data?.items.length ? (
            <ul>
              {recent.data.items.map((e) => {
                const p = auditParts(e, names);
                return (
                  <li key={e.id} className="flex items-center gap-3 border-b border-line px-5 py-3 last:border-b-0">
                    <Person name={p.actor} size={30} />
                    <div className="min-w-0 flex-1 text-[13.5px] leading-snug">
                      <div><b className="font-semibold">{p.actor}</b> {p.verb}{p.target && <>: <b className="font-semibold">{p.target}</b></>}</div>
                      {p.extra && <div className="truncate text-[12.5px] text-ink-soft">{p.extra}</div>}
                    </div>
                    <time className="flex-none text-[12.5px] text-ink-faint" title={formatWhen(e.at)}>{ago(e.at)}</time>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-[13px] text-ink-faint">Nothing has happened yet.</p>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <h2 className="mb-4 text-[15px] font-semibold">Accounts by status</h2>
            <div role="img" aria-label={statusRows.map((r) => `${r.count} ${r.label.toLowerCase()}`).join(", ")} className="flex h-2.5 overflow-hidden rounded-full bg-paper-sunken">
              {statusRows.map((r) => <div key={r.key} style={{ width: `${(r.count / s.totalUsers) * 100}%`, background: r.color }} />)}
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {statusRows.map((r) => (
                <li key={r.key} className="flex items-center gap-2.5 text-[13.5px]">
                  <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: r.color }} />
                  <span className="flex-1">{r.label}</span>
                  <span className="font-semibold">{r.count}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h2 className="text-[15px] font-semibold">Largest ledgers</h2>
            <p className="mb-4 text-[12.5px] text-ink-faint">Size only. Contents are never shown.</p>
            {largest.length === 0 ? (
              <p className="text-[13px] text-ink-faint">No ledgers yet.</p>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {largest.map((u) => (
                  <li key={u.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13.5px]">
                      <Link to={`/admin/users/${u.id}`} className="truncate hover:underline">{u.name}</Link>
                      <span className="ledger-figure flex-none text-[12.5px] text-ink-soft">{formatBytes(u.storageBytes ?? 0)}</span>
                    </div>
                    <ProgressBar pct={biggest ? ((u.storageBytes ?? 0) / biggest) * 100 : 0} />
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
