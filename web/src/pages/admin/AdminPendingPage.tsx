import { useState } from "react";
import { UserCheck } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { useAdminMutation, useAdminUsers } from "@/hooks/admin";
import { PageIntro, Person, dayLabel, daysSince, formatWhen } from "@/components/admin/adminUi";
import { cn } from "@/lib/utils/cn";
import type { AdminUser, BulkAction } from "@/types/admin";

const REJECT_REASONS = ["Unknown person", "Duplicate account", "Not eligible"];

/** One waiting request, with the rejection panel opening inline so the reason is chosen where the person is shown. */
function RequestRow({
  u, picked, onPick, onApprove, onReject, busy,
}: {
  u: AdminUser; picked: boolean; onPick: () => void; onApprove: () => void;
  onReject: (reason: string) => Promise<void>; busy: boolean;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [preset, setPreset] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const waited = daysSince(u.createdAt);
  return (
    <li className="border-b border-line px-5 py-4 last:border-b-0 hover:bg-paper-sunken">
      <div className="flex flex-wrap items-center gap-4">
        <Checkbox aria-label={`Select ${u.name}`} checked={picked} onChange={onPick} />
        <Person name={u.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-semibold">{u.name}</span>
            {waited >= 1 && <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">Waiting {dayLabel(waited)}</span>}
          </div>
          <div className="truncate text-[12.8px] text-ink-faint">{u.email}</div>
          <div className="truncate text-[12px] text-ink-faint">
            Requested {formatWhen(u.createdAt)} · {u.homeCurrencyCode ?? "—"}{u.timezone ? ` · ${u.timezone}` : ""}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={onApprove}>Approve</Button>
          <Button size="sm" variant="secondary" aria-expanded={rejecting} onClick={() => setRejecting((v) => !v)}>Reject…</Button>
        </div>
      </div>
      {rejecting && (
        <div className="mt-4 ml-8 rounded-[12px] border border-line bg-paper p-4 max-[640px]:ml-0">
          <div className="mb-2 text-[13px] font-medium">Why are you rejecting this request?</div>
          <div className="mb-3 flex flex-wrap gap-2">
            {REJECT_REASONS.map((r) => (
              <button key={r} type="button" aria-pressed={preset === r} onClick={() => setPreset(preset === r ? null : r)}
                className={cn("rounded-full border border-line px-3 py-1.5 text-[12.5px] font-medium",
                  preset === r ? "border-ink bg-ink text-paper" : "bg-paper-raised text-ink-soft")}>
                {r}
              </button>
            ))}
          </div>
          <label className="mb-1 block text-[12px] text-ink-faint" htmlFor={`note-${u.id}`}>Note (saved with the decision, visible to admins)</label>
          <Textarea id={`note-${u.id}`} rows={2} maxLength={250} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="danger" disabled={busy}
              onClick={async () => {
                await onReject([preset, note.trim()].filter(Boolean).join(": "));
                setRejecting(false);
              }}>Confirm rejection</Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Sign-up requests waiting for a decision, oldest first so nobody is left waiting. */
export function AdminPendingPage() {
  const q = useAdminUsers({ status: "pending_approval", limit: 100 });
  const rejected = useAdminUsers({ status: "rejected", limit: 5 });
  const toast = useToast();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const act = useAdminMutation(async (job: () => Promise<unknown>) => job());
  const bulk = useAdminMutation((v: { action: BulkAction; ids: number[] }) => adminService.bulk(v.action, v.ids));
  const items = [...(q.data?.items ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const attempt = async (job: () => Promise<unknown>, message: string) => {
    try {
      await act.mutateAsync(job);
      toast.show(message, { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  };
  const toggle = (id: number) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = items.length > 0 && items.every((u) => picked.has(u.id));
  async function runBulk(action: BulkAction) {
    try {
      const r = await bulk.mutateAsync({ action, ids: [...picked] });
      toast.show(`${r.succeeded} done${r.failed ? `, ${r.failed} skipped` : ""}.`, { variant: r.failed ? "error" : "success" });
      setPicked(new Set());
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <p role="alert" className="text-danger">Couldn&apos;t load the requests.</p>;

  return (
    <div className="flex flex-col gap-6">
      <PageIntro>People who signed up and are waiting for a decision, oldest first. They can&apos;t sign in until you approve them.</PageIntro>

      {items.length === 0 ? (
        <Card className="p-0"><EmptyState icon={UserCheck} title="No pending requests" description="New sign-ups appear here for you to approve or reject." /></Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-4 border-b border-line bg-paper-sunken px-5 py-3 text-[13px]">
            <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[12px] font-semibold text-warn">{items.length} waiting</span>
            <label className="flex items-center gap-2 text-ink-soft">
              <Checkbox checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(items.map((u) => u.id)))} />
              select all
            </label>
            <span className="flex-1" />
            {picked.size > 0 && (
              <span role="toolbar" aria-label="Bulk actions" className="flex gap-2">
                <Button size="sm" disabled={bulk.isPending} onClick={() => runBulk("approve")}>Approve selected</Button>
                <Button size="sm" variant="secondary" disabled={bulk.isPending} onClick={() => runBulk("reject")}>Reject selected</Button>
              </span>
            )}
          </div>
          <ul>
            {items.map((u) => (
              <RequestRow key={u.id} u={u} picked={picked.has(u.id)} onPick={() => toggle(u.id)} busy={act.isPending}
                onApprove={() => attempt(() => adminService.approve(u.id), `${u.name} approved.`)}
                onReject={(reason) => attempt(() => adminService.reject(u.id, reason), `${u.name} rejected.`)} />
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-5 max-[980px]:grid-cols-1">
        <Card>
          <h2 className="mb-4 text-[15px] font-semibold">What each choice does</h2>
          <dl className="flex flex-col gap-3 text-[13px]">
            <div><dt className="font-semibold">Approve</dt><dd className="text-ink-soft">The account becomes active and they can sign in. Their own ledger is created on first sign-in.</dd></div>
            <div><dt className="font-semibold">Reject</dt><dd className="text-ink-soft">They can&apos;t sign in. You can reopen the request later from here.</dd></div>
          </dl>
        </Card>
        <Card className="p-0">
          <div className="border-b border-line px-5 py-4 text-[15px] font-semibold">Recently rejected</div>
          {(rejected.data?.items.length ?? 0) === 0 ? (
            <p className="px-5 py-6 text-[13px] text-ink-faint">No rejected requests.</p>
          ) : (
            <ul>
              {rejected.data!.items.map((u) => (
                <li key={u.id} className="flex items-center gap-3 border-b border-line px-5 py-3 text-[13px] last:border-b-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-[12px] text-ink-faint">{u.email}{u.statusReason ? ` · ${u.statusReason}` : ""}</span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => attempt(() => adminService.reopen(u.id), `${u.name}'s request is pending again.`)}>Reopen</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
