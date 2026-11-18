import { useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/form";
import { useAdminUsers } from "@/hooks/admin";
import { useAuthStore } from "@/store/authStore";
import { CreateUserDialog } from "@/components/admin/CreateUserDialog";
import { UserActions } from "@/components/admin/UserActions";
import { StatusBadge, TemporaryPasswordDialog, formatWhen } from "@/components/admin/adminUi";
import type { AccountStatus } from "@/types";
import type { IssuedPassword } from "@/types/admin";

const PAGE = 25;

export function AdminUsersPage() {
  const selfId = useAuthStore((s) => s.account?.id);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccountStatus | "">("");
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
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
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold">{u.name}</span>
                    <StatusBadge status={u.status} />
                    {u.role === "superuser" && <span className="text-[11.5px] font-semibold text-accent">Superuser</span>}
                    {u.mustChangePassword && <span className="text-[11.5px] text-ink-faint">temporary password</span>}
                  </div>
                  <div className="truncate text-[12.8px] text-ink-faint">
                    {u.email} · last sign-in {formatWhen(u.lastLoginAt)}
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
