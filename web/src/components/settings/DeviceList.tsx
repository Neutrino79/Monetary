import type { ReactNode } from "react";
import { Monitor } from "lucide-react";
import { Badge, Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { ago, formatWhen } from "@/components/admin/adminUi";
import { describeDevice } from "@/lib/utils/userAgent";

export interface DeviceRow {
  id: number;
  createdAt: string;
  lastSeenAt: string | null;
  ip: string | null;
  userAgent: string | null;
  current?: boolean;
}

/**
 * The "Signed-in devices" card, shared by a person's own Settings and by an administrator looking at
 * someone else's account, so both look the same. `onSignOut` omitted = read-only rows.
 */
export function DeviceListCard({
  rows, loading, error, description, emptyText = "Not signed in anywhere.", action, onSignOut, busy,
}: {
  rows: DeviceRow[] | undefined;
  loading?: boolean;
  error?: boolean;
  description: string;
  emptyText?: string;
  action?: ReactNode;
  onSignOut?: (row: DeviceRow, label: string) => void;
  busy?: boolean;
}) {
  const list = [...(rows ?? [])].sort((a, b) => Number(!!b.current) - Number(!!a.current));
  return (
    <Card>
      <div className="mb-1 flex items-center gap-3">
        <div className="text-[14.5px] font-semibold">Signed-in devices</div>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <p className="mb-4 text-[12.8px] text-ink-faint">{description}</p>
      {loading ? (
        <p className="text-[13px] text-ink-faint">Loading…</p>
      ) : error ? (
        <p role="alert" className="text-[13px] text-danger">Couldn&apos;t load the devices.</p>
      ) : list.length === 0 ? (
        <p className="text-[13px] text-ink-faint">{emptyText}</p>
      ) : (
        <ul aria-label="Signed-in devices" className="divide-y divide-line">
          {list.map((s) => {
            const label = describeDevice(s.userAgent);
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-paper-sunken text-ink-soft"><Monitor size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                    {label}
                    {s.current && <Badge className="bg-accent/15 text-accent">This device</Badge>}
                  </div>
                  <div className="truncate text-[12px] text-ink-faint">
                    {s.ip ?? "Unknown address"} · signed in {formatWhen(s.createdAt)} · active {ago(s.lastSeenAt ?? s.createdAt)}
                  </div>
                </div>
                {onSignOut && !s.current && (
                  <Button size="sm" variant="secondary" aria-label={`Sign out ${label} ${s.id}`} disabled={busy} onClick={() => onSignOut(s, label)}>
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
