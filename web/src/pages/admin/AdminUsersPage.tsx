import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, Users } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/form";
import { useAdminMutation, useAdminUsers } from "@/hooks/admin";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { formatBytes } from "@/lib/format/bytes";
import { useAuthStore } from "@/store/authStore";
import { ROLE_LABEL } from "@/lib/roles";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { UserActions, isLocked } from "@/components/admin/UserActions";
import { StatusBadge, TemporaryPasswordDialog, formatWhen } from "@/components/admin/adminUi";
import type { AccountStatus } from "@/types";
import type { BulkAction, IssuedPassword } from "@/types/admin";

const PAGE = 25;

export function AdminUsersPage() {
  const selfId = useAuthStore((s) => s.account?.id);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const toast = useToast();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const bulk = useAdminMutation((vars: { action: BulkAction; ids: number[] }) => adminService.bulk(vars.action, vars.ids));
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
  const q = useAdminUsers({ q: search, status, limit: PAGE, offset });
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
          <Input aria-label="Search users" placeholder="Search name or email" className="pl-9" value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
        </div>
        <Select aria-label="Filter by status" value={status} className="w-48"
          onChange={(e) => { setStatus(e.target.value as AccountStatus | ""); setOffset(0); }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_approval">Pending approval</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
          <option value="pending_delete">Pending deletion</option>
        </Select>
        <Button onClick={() => setCreating(true)}><Plus size={15} /> Create user</Button>
      </div>

      {picked.size > 0 && (
        <Card className="flex flex-wrap items-center gap-2 p-3" role="toolbar" aria-label="Bulk actions">
          <span className="mr-2 text-[13px] font-medium">{picked.size} selected</span>
          <Button size="sm" disabled={bulk.isPending} onClick={() => runBulk("approve")}>Approve</Button>
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("reject")}>Reject</Button>
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("suspend")}>Suspend</Button>
          <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("reactivate")}>Reactivate</Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
        </Card>
      )}

      {q.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : q.isError ? (
        <p role="alert" className="text-danger">Couldn&apos;t load users.</p>
      ) : items.length === 0 ? (
        <Card><EmptyState icon={Users} title="No users found" description="Try a different search or status." /></Card>
      ) : (
        <Card className="p-0">
          <ul>
            {items.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
                <input type="checkbox" aria-label={`Select ${u.name}`} checked={picked.has(u.id)} onChange={() => toggle(u.id)} className="mr-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link to={`/admin/users/${u.id}`} className="truncate text-[14px] font-semibold hover:underline">{u.name}</Link>
                    <StatusBadge status={u.status} />
                    {u.role !== "user" && <span data-testid={`role-${u.id}`} className="ml-2 text-[11.5px] font-semibold text-ink-soft">{ROLE_LABEL[u.role]}</span>}
                    {u.role === "superuser" && <span className="text-[11.5px] font-semibold text-accent">Superuser</span>}
                    {u.mustChangePassword && <span className="text-[11.5px] text-ink-faint">temporary password</span>}
                    {isLocked(u) && <span className="text-[11.5px] font-semibold text-danger">locked</span>}
                  </div>
                  <div className="truncate text-[12.8px] text-ink-faint">
                    {u.email} · active {formatWhen(u.lastActivityAt)}{u.storageBytes !== null ? ` · ${formatBytes(u.storageBytes)}` : ""}
                    {u.statusReason ? ` · ${u.statusReason}` : ""}
                  </div>
                </div>
                <UserActions user={u} isSelf={u.id === selfId} onIssued={setIssued} />
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-faint">
            <span>{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
              <Button size="sm" variant="ghost" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
            </span>
          </div>
        </Card>
      )}

      <CreateUserDialog open={creating} onOpenChange={setCreating} onCreated={setIssued} />
      <TemporaryPasswordDialog email={issued?.user.email ?? ""} password={issued?.temporaryPassword ?? null} onClose={() => setIssued(null)} />
    </div>
  );
}
