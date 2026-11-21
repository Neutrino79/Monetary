import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/form";
import { Tabs } from "@/components/ui/Tabs";
import { ControlStrip, FilterField, StripFilters, StripSearch } from "@/components/list/ControlStrip";
import { useAdminMutation, useAdminStats, useAdminUsers } from "@/hooks/admin";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { formatBytes } from "@/lib/format/bytes";
import { useAuthStore } from "@/store/authStore";
import { ROLE_LABEL } from "@/lib/roles";
import { UserActions, isLocked } from "@/components/admin/UserActions";
import { PageIntro, Person, StatusBadge, TemporaryPasswordDialog, ago } from "@/components/admin/adminUi";
import { Pager, Table, TableCard, Th, tdClass, trClass } from "@/components/admin/adminTable";
import type { AdminUser, BulkAction, IssuedPassword } from "@/types/admin";

const PAGE = 10;
type Sort = "activity" | "name" | "size" | "newest";
type RoleFilter = "" | "admins" | "users";
/** Sign-up requests (waiting or rejected) are decided on the Requests page; this list is for existing accounts. */
const REQUEST_STATUSES = ["pending_approval", "rejected"];

const SORTS: Record<Sort, (a: AdminUser, b: AdminUser) => number> = {
  activity: (a, b) => (b.lastActivityAt ?? "").localeCompare(a.lastActivityAt ?? ""),
  name: (a, b) => a.name.localeCompare(b.name),
  size: (a, b) => (b.storageBytes ?? 0) - (a.storageBytes ?? 0),
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
};

const TABS: { value: string; label: string; statuses: string[] }[] = [
  { value: "all", label: "All", statuses: ["active", "suspended", "pending_delete"] },
  { value: "active", label: "Active", statuses: ["active"] },
  { value: "suspended", label: "Suspended", statuses: ["suspended"] },
  { value: "pending_delete", label: "Pending deletion", statuses: ["pending_delete"] },
];

/** Existing accounts, filterable and sortable. Up to 200 are loaded and filtered here, so the list stays instant. */
export function AdminUsersPage() {
  const selfId = useAuthStore((s) => s.account?.id);
  const isPhone = useMediaQuery("(max-width: 640px)");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");
  const [role, setRole] = useState<RoleFilter>("");
  const [sort, setSort] = useState<Sort>("activity");
  const [page, setPage] = useState(0);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const toast = useToast();
  const stats = useAdminStats();
  const bulk = useAdminMutation((vars: { action: BulkAction; ids: number[] }) => adminService.bulk(vars.action, vars.ids));
  const q = useAdminUsers({ q: search, limit: 200 });

  const accounts = useMemo(() => (q.data?.items ?? []).filter((u) => !REQUEST_STATUSES.includes(u.status)), [q.data]);
  const statuses = TABS.find((t) => t.value === tab)!.statuses;
  const rows = useMemo(() => {
    const inTab = accounts.filter((u) => statuses.includes(u.status));
    const byRole = role === "admins" ? inTab.filter((u) => u.role !== "user") : role === "users" ? inTab.filter((u) => u.role === "user") : inTab;
    return [...byRole].sort(SORTS[sort]);
  }, [accounts, statuses, role, sort]);
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const by = stats.data?.byStatus ?? {};
  const countOf = (sts: string[]) => sts.reduce((n, s) => n + (by[s] ?? 0), 0);
  const filterCount = (role ? 1 : 0) + (sort !== "activity" ? 1 : 0);
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every((u) => picked.has(u.id));

  async function runBulk(action: BulkAction) {
    try {
      const r = await bulk.mutateAsync({ action, ids: [...picked] });
      const firstError = r.results.find((x) => !x.ok)?.error;
      toast.show(`${r.succeeded} done${r.failed ? `, ${r.failed} skipped${firstError ? ` (${firstError})` : ""}` : ""}.`, { variant: r.failed ? "error" : "success" });
      setPicked(new Set());
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  const userCell = (u: AdminUser) => (
    <div className="flex min-w-0 items-center gap-3">
      <Person name={u.name} />
      <div className="min-w-0">
        <Link to={`/admin/users/${u.id}`} className="block truncate text-[14px] font-semibold hover:underline">{u.name}</Link>
        <div className="truncate text-[12px] text-ink-soft">{u.email}</div>
        {(u.mustChangePassword || isLocked(u)) && (
          <div className="mt-0.5 flex gap-2 text-[11.5px]">
            {u.mustChangePassword && <span className="text-ink-faint">Temporary password</span>}
            {isLocked(u) && <span className="font-semibold text-danger">Locked</span>}
          </div>
        )}
      </div>
    </div>
  );
  const action = (u: AdminUser) => (u.id === selfId ? <span className="text-[12px] text-ink-faint">You</span> : <UserActions user={u} isSelf={false} onIssued={setIssued} />);

  return (
    <div className="flex flex-col gap-5">
      <PageIntro>
        {stats.data ? `${countOf(TABS[0].statuses)} accounts. ` : ""}Open one to see devices, history and every action you can take. Sign-up requests are on the Requests page.
      </PageIntro>

      <Tabs
        tabs={TABS.map((t) => ({ value: t.value, label: stats.data ? `${t.label} ${countOf(t.statuses)}` : t.label }))}
        value={tab}
        onValueChange={(v) => { setTab(v); setPage(0); setPicked(new Set()); }}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <ControlStrip className="w-full sm:w-auto">
              <StripSearch alwaysOpen value={search} onChange={(v) => { setSearch(v); setPage(0); }} placeholder="Search name or email" />
              <StripFilters count={filterCount} resultCount={rows.length} onReset={() => { setRole(""); setSort("activity"); setPage(0); }}>
                <FilterField label="Role">
                  <Select aria-label="Role" className="w-full" value={role} onChange={(e) => { setRole(e.target.value as RoleFilter); setPage(0); }}>
                    <option value="">All roles</option>
                    <option value="admins">Admins</option>
                    <option value="users">Regular users</option>
                  </Select>
                </FilterField>
                <FilterField label="Sort by">
                  <Select aria-label="Sort by" className="w-full" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    <option value="activity">Last activity</option>
                    <option value="name">Name</option>
                    <option value="size">Ledger size</option>
                    <option value="newest">Newest</option>
                  </Select>
                </FilterField>
              </StripFilters>
            </ControlStrip>
            {picked.size > 0 && (
              <div role="toolbar" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium">{picked.size} selected</span>
                <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("suspend")}>Suspend</Button>
                <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("reactivate")}>Reactivate</Button>
                <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
              </div>
            )}
          </div>

          <TableCard>
            {q.isLoading ? (
              <div className="flex flex-col gap-2 p-5">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-11 rounded-[10px]" />)}</div>
            ) : q.isError ? (
              <p role="alert" className="p-5 text-danger">Couldn&apos;t load users.</p>
            ) : rows.length === 0 ? (
              <div className="p-5"><EmptyState icon={Users} title="No users found" description="Try a different search or filter." /></div>
            ) : (
              <>
                {isPhone ? (
                  <ul aria-label="Users" className="px-4">
                    {shown.map((u) => (
                      <li key={u.id} className="flex flex-col gap-3 border-b border-line py-4 last:border-b-0">
                        <div className="flex items-start gap-3">
                          <Checkbox aria-label={`Select ${u.name}`} className="mt-2.5" checked={picked.has(u.id)} onChange={() => toggle(u.id)} />
                          <div className="min-w-0 flex-1">{userCell(u)}</div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-7 text-[12.5px] text-ink-soft">
                          <StatusBadge status={u.status} />
                          <span data-testid={`role-${u.id}`}>{ROLE_LABEL[u.role]}</span>
                          <span>{ago(u.lastActivityAt)}</span>
                          <span>{u.storageBytes === null ? "—" : formatBytes(u.storageBytes)}</span>
                          <span className="ml-auto">{action(u)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Table
                    label="Users"
                    head={
                      <>
                        <Th className="w-12"><Checkbox aria-label="Select all on this page" checked={allShown} onChange={() => setPicked(allShown ? new Set() : new Set(shown.map((u) => u.id)))} /></Th>
                        <Th>User</Th><Th>Status</Th><Th>Role</Th><Th>Last activity</Th><Th>Ledger</Th><Th align="right">Action</Th>
                      </>
                    }
                  >
                    {shown.map((u) => (
                      <tr key={u.id} className={trClass}>
                        <td className={tdClass}><Checkbox aria-label={`Select ${u.name}`} checked={picked.has(u.id)} onChange={() => toggle(u.id)} /></td>
                        <td className={tdClass}>{userCell(u)}</td>
                        <td className={tdClass}><StatusBadge status={u.status} /></td>
                        <td className={`${tdClass} text-ink-soft`} data-testid={`role-${u.id}`}>{ROLE_LABEL[u.role]}</td>
                        <td className={`${tdClass} whitespace-nowrap text-ink-soft`}>{ago(u.lastActivityAt)}</td>
                        <td className={`${tdClass} whitespace-nowrap text-ink-soft`}>{u.storageBytes === null ? "—" : formatBytes(u.storageBytes)}</td>
                        <td className={`${tdClass} text-right`}><div className="flex justify-end">{action(u)}</div></td>
                      </tr>
                    ))}
                  </Table>
                )}
                <Pager total={rows.length} page={page} pageSize={PAGE} noun="account" onPage={setPage} />
              </>
            )}
          </TableCard>
        </div>
      </Tabs>

      <TemporaryPasswordDialog email={issued?.user.email ?? ""} password={issued?.temporaryPassword ?? null} onClose={() => setIssued(null)} />
    </div>
  );
}
