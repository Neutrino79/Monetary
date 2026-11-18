import { UserCheck } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { useAdminUsers } from "@/hooks/admin";
import { UserActions } from "@/components/admin/UserActions";
import { TemporaryPasswordDialog, formatWhen } from "@/components/admin/adminUi";
import { useAuthStore } from "@/store/authStore";
import { useState } from "react";
import type { IssuedPassword } from "@/types/admin";

/** Sign-up requests waiting for a decision, oldest first so nobody is left waiting. */
export function AdminPendingPage() {
  const q = useAdminUsers({ status: "pending_approval", limit: 100 });
  const selfId = useAuthStore((s) => s.account?.id);
  const [issued, setIssued] = useState<IssuedPassword | null>(null);
  const items = [...(q.data?.items ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <p role="alert" className="text-danger">Couldn&apos;t load the requests.</p>;
  if (items.length === 0) {
    return (
      <Card>
        <EmptyState icon={UserCheck} title="No pending requests" description="New sign-ups appear here for you to approve or reject." />
      </Card>
    );
  }
  return (
    <Card className="p-0">
      <ul>
        {items.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{u.name}</div>
              <div className="truncate text-[12.8px] text-ink-faint">
                {u.email} · requested {formatWhen(u.createdAt)} · {u.homeCurrencyCode ?? "—"}
              </div>
            </div>
            <UserActions user={u} isSelf={u.id === selfId} onIssued={setIssued} />
          </li>
        ))}
      </ul>
      <TemporaryPasswordDialog email={issued?.user.email ?? ""} password={issued?.temporaryPassword ?? null} onClose={() => setIssued(null)} />
    </Card>
  );
}
