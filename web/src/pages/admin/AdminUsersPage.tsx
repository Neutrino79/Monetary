import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/form";
import { useAdminMutation, useAdminStats, useAdminUsers } from "@/hooks/admin";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { formatBytes } from "@/lib/format/bytes";
import { useAuthStore } from "@/store/authStore";
import { ROLE_LABEL } from "@/lib/roles";
import { UserActions, isLocked } from "@/components/admin/UserActions";
import { PageIntro, Person, StatusBadge, TemporaryPasswordDialog, ago } from "@/components/admin/adminUi";
import { cn } from "@/lib/utils/cn";
import type { AccountStatus } from "@/types";
import type { AdminUser, BulkAction, IssuedPassword } from "@/types/admin";

const PAGE = 9;
type Sort = "activity" | "name" | "size" | "newest";
type RoleFilter = "" | "admins" | "users";

const SORTS: Record<Sort, (a: AdminUser, b: AdminUser) => number> = {
  activity: (a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
  name: (a, b) => a.name.localeCompare(b.name),
  size: (a, b) => (b.storageBytes ?? 0) - (a.storageBytes ?? 0),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

const CHIPS: { status: AccountStatus | ""; label: string }[] = [
  { status: "", label: "All" },
  { status: "active", label: "Active" },
  { status: "pending_approval", label: "Pending" },
  { status: "suspended", label: "Suspended" },
  { status: "rejected", label: "Rejected" },
  { status: "pending_delete", label: "Pending deletion" },
];

const GRID = "min-[981px]:grid min-[981px]:grid-cols-[24px_minmax(0,2.2fr)_9rem_6.5rem_7.5rem_6rem_11rem] min-[981px]:items-center";

/** Every account, filterable and sortable. Up to 200 accounts are loaded and filtered here, so the list stays instant. */
export function AdminUsersPage() {
  const selfId = useAuthStore((s) => s.account?.id);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [role, setRole] = useState<RoleFilter>("");
  const [sort, setSort] = useState<Sort>("activity");
  const [page, setPage] = useState(0);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toast = useToast();
  const stats = useAdminStats();
  const bulk = useAdminMutation((vars: { action: BulkAction; ids: number[] }) => adminService.bulk(vars.action, vars.ids));
  const q = useAdminUsers({ q: search, status, limit: 200 });

  const rows = useMemo(() => {
    const all = q.data?.items ?? [];
    const byRole = role === "admins" ? all.filter((u) => u.role !== "user") : role === "users" ? all.filter((u) => u.role === "user") : all;
    return [...byRole].sort(SORTS[sort]);
  }, [q.data, role, sort]);
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const counts = stats.data?.byStatus ?? {};
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const reset = () => setPage(0);

  async function runBulk(action: BulkAction) {
    try {
      const r = await bulk.mutateAsync({ action, ids: [...picked] });
      const firstError = r.results.find((x) => !x.ok)?.error;
      toast.show(`${r.succeeded} done${r.failed ? `, ${r.failed} skipped${firstError ? ` (${firstError})` : ""}` : ""}.`,
        { variant: r.failed ? "error" : "success" });
      setPicked(new Set());
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageIntro>
        {stats.data ? `${stats.data.totalUsers} accounts. ` : ""}Open one to see devices, history and every action you can take.
      </PageIntro>

      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Search users" placeholder="Search name or email"
          className="h-9 min-w-52 flex-1 rounded-[10px] border border-line bg-paper-raised px-3 text-[13.5px] outline-none focus:border-line-strong"
          value={search} onChange={(e) => { setSearch(e.target.value); reset(); }}
        />
        <Select aria-label="Filter by role" value={role} className="w-40" onChange={(e) => { setRole(e.target.value as RoleFilter); reset(); }}>
          <option value="">All roles</option>
          <option value="admins">Admins</option>
          <option value="users">Regular users</option>
        </Select>
        <Select aria-label="Sort by" value={sort} className="w-52" onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="activity">Sort: last activity</option>
          <option value="name">Sort: name</option>
          <option value="size">Sort: ledger size</option>
          <option value="newest">Sort: newest</option>
        </Select>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {CHIPS.map((c) => {
          const n = c.status === "" ? stats.data?.totalUsers : counts[c.status];
          const active = status === c.status;
          return (
            <button key={c.label} type="button" aria-pressed={active} onClick={() => { setStatus(c.status); reset(); }}
              className={cn("inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium",
                active ? "border-ink bg-ink text-paper" : "bg-paper-raised text-ink-soft hover:bg-paper-sunken")}>
              {c.label}{n !== undefined && <span className="opacity-70">{n}</span>}
            </button>
          );
        })}
      </div>

      {picked.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-3" role="toolbar" aria-label="Bulk actions">
          <span className="mr-2 text-[13px] font-medium">{picked.size} selected</span>
          <Button size="sm" disabled={bulk.isPending} onClick={() => runBulk("approve")}>Approve</Button>
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("reject")}>Reject</Button>
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("suspend")}>Suspend</Button>
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("reactivate")}>Reactivate</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
          <span className="text-[12px] text-ink-faint">Accounts an action doesn&apos;t apply to are skipped. Up to 50 at once.</span>
        </Card>
      )}

      {q.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : q.isError ? (
        <p role="alert" className="text-danger">Couldn&apos;t load users.</p>
      ) : rows.length === 0 ? (
        <Card><EmptyState icon={Users} title="No users found" description="Try a different search or status." /></Card>
      ) : (
        <Card className="p-0">
          <div className={cn("hidden border-b border-line px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint", GRID)} aria-hidden>
            <span /><span>User</span><span>Status</span><span>Role</span><span>Last activity</span><span>Ledger</span><span className="text-right">Action</span>
          </div>
          <ul>
            {shown.map((u) => (
              <li key={u.id} className={cn("max-[980px]:flex max-[980px]:flex-wrap max-[980px]:items-center max-[980px]:gap-x-3 max-[980px]:gap-y-2 border-b border-line px-4 py-3 last:border-0", GRID)}>
                <input type="checkbox" aria-label={`Select ${u.name}`} checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
                <div className="flex min-w-0 items-center gap-3 max-[980px]:w-[calc(100%-2.25rem)] min-[981px]:flex-1">
                  <Person name={u.name} />
                  <div className="min-w-0">
                    <Link to={`/admin/users/${u.id}`} className="block truncate text-[14px] font-semibold hover:underline">{u.name}</Link>
                    <div className="truncate text-[12.5px] text-ink-faint">{u.email}</div>
                    {(u.mustChangePassword || isLocked(u)) && (
                      <div className="text-[11.5px]">
                        {u.mustChangePassword && <span className="text-ink-faint">Temporary password</span>}
                        {isLocked(u) && <span className="ml-2 font-semibold text-danger">locked</span>}
                      </div>
                    )}
                  </div>
                </div>
                <span><StatusBadge status={u.status} /></span>
                <span data-testid={`role-${u.id}`} className="text-[12.5px] text-ink-soft">{ROLE_LABEL[u.role]}</span>
                <span className="text-[12.5px] text-ink-soft">{ago(u.lastActivityAt)}</span>
                <span className="text-[12.5px] text-ink-soft">{u.storageBytes === null ? "—" : formatBytes(u.storageBytes)}</span>
                <span className="ml-auto flex justify-end">
                  {u.id === selfId ? <span className="text-[12px] text-ink-faint">You</span> : <UserActions user={u} isSelf={false} onIssued={setIssued} />}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-faint">
            <span>{page * PAGE + 1}–{Math.min(page * PAGE + PAGE, rows.length)} of {rows.length}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</Button>
            </span>
          </div>
        </Card>
      )}

      <TemporaryPasswordDialog email={issued?.user.email ?? ""} password={issued?.temporaryPassword ?? null} onClose={() => setIssued(null)} />
    </div>
  );
}
