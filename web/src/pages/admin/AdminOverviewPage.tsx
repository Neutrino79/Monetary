import { Link } from "react-router-dom";
import { Card, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useAdminStats, useAuditLog, useUserNames } from "@/hooks/admin";
import { formatWhen } from "@/components/admin/adminUi";
import { auditSummary } from "./auditText";

export function AdminOverviewPage() {
  const stats = useAdminStats();
  const recent = useAuditLog(0, 8);
  const names = useUserNames();

  if (stats.isLoading) return <Skeleton className="h-40 w-full" />;
  if (stats.isError || !stats.data) return <p role="alert" className="text-danger">Couldn&apos;t load the overview.</p>;
  const s = stats.data;

  return (
    <div className="flex flex-col gap-6">
      {s.pendingApproval > 0 && (
        <Card className="flex items-center justify-between gap-4 border-warn p-4">
          <div>
            <div className="text-[15px] font-semibold">
              {s.pendingApproval} account request{s.pendingApproval === 1 ? "" : "s"} waiting for approval
            </div>
            <div className="text-[12.8px] text-ink-faint">People can&apos;t sign in until you approve them.</div>
          </div>
          <Link to="/admin/pending"><Button size="sm">Review</Button></Link>
        </Card>
      )}

      <div className="grid grid-cols-5 gap-4 max-[980px]:grid-cols-2">
        {[
          ["Total accounts", s.totalUsers],
          ["Active", s.byStatus.active ?? 0],
          ["Pending approval", s.pendingApproval],
          ["Suspended", s.byStatus.suspended ?? 0],
          ["Superusers", s.activeSuperusers],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <div className="text-[12px] text-ink-faint">{label}</div>
            <div className="mt-1 text-[26px] font-semibold">{value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold">Recent activity</h2>
          <Link to="/admin/audit" className="text-[12.8px] text-accent hover:underline">Full audit log</Link>
        </div>
        {recent.data?.items.length ? (
          <ul>
            {recent.data.items.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0 text-[13px]">
                <span>{auditSummary(e, names)}</span>
                <span className="flex-none text-[12px] text-ink-faint">{formatWhen(e.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-6 text-[13px] text-ink-faint">Nothing has happened yet.</p>
        )}
      </Card>
    </div>
  );
}
