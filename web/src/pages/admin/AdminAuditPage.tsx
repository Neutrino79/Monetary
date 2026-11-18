import { useState } from "react";
import { ScrollText } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useAuditLog, useUserNames } from "@/hooks/admin";
import { formatWhen } from "@/components/admin/adminUi";
import { auditSummary, detailPairs } from "./auditText";

const PAGE = 25;

/** Everything an administrator did, newest first. There are never passwords in it. */
export function AdminAuditPage() {
  const [offset, setOffset] = useState(0);
  const q = useAuditLog(offset, PAGE);
  const names = useUserNames();
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;

  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.isError) return <p role="alert" className="text-danger">Couldn&apos;t load the audit log.</p>;
  if (items.length === 0) return <Card><EmptyState icon={ScrollText} title="Nothing logged yet" description="Account actions appear here." /></Card>;
  return (
    <Card className="p-0">
      <ul>
        {items.map((e) => (
          <li key={e.id} className="border-b border-line px-4 py-3 last:border-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[13.5px] font-medium">{auditSummary(e, names)}</span>
              <span className="text-[12px] text-ink-faint">{formatWhen(e.at)}{e.ip ? ` · ${e.ip}` : ""}</span>
            </div>
            {detailPairs(e.detail).length > 0 && (
              <div className="mt-0.5 text-[12.5px] text-ink-faint">
                {detailPairs(e.detail).map(([k, v]) => `${k}: ${v}`).join(" · ")}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-faint">
        <span>{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
        <span className="flex gap-2">
          <Button size="sm" variant="ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</Button>
          <Button size="sm" variant="ghost" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Older</Button>
        </span>
      </div>
    </Card>
  );
}
