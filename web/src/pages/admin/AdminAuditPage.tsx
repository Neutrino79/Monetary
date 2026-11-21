import { useMemo, useState } from "react";
import { Download, ScrollText } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { adminService } from "@/lib/api/services/adminService";
import { useAuditLog, useUserNames } from "@/hooks/admin";
import { PageIntro } from "@/components/admin/adminUi";
import { cn } from "@/lib/utils/cn";
import { AUDIT_CATEGORIES, auditParts, categoryOf, type AuditCategory } from "./auditText";

const PAGE = 9;
const LOADED = 200;
type Range = "7" | "30" | "";

const GRID = "min-[981px]:grid min-[981px]:grid-cols-[8.5rem_minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1.4fr)_7rem] min-[981px]:items-center min-[981px]:gap-3";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? { day: iso, time: "" }
    : { day: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) };
};

/** Everything an administrator did, newest first. There are never passwords in it. */
export function AdminAuditPage() {
  const [page, setPage] = useState(0);
  const [who, setWho] = useState("");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [range, setRange] = useState<Range>("");
  const q = useAuditLog(0, LOADED);
  const names = useUserNames();
  const toast = useToast();

  async function exportCsv() {
    try {
      await adminService.exportAuditLog();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't export the audit log.", { variant: "error" });
    }
  }

  const all = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const actors = useMemo(() => {
    const seen = new Map<number, string>();
    for (const e of all) if (e.actorUserId !== null) seen.set(e.actorUserId, auditParts(e, names).actor);
    return [...seen.entries()];
  }, [all, names]);
  const rows = useMemo(() => {
    const since = range ? Date.now() - Number(range) * 86_400_000 : 0;
    return all.filter((e) =>
      (!who || String(e.actorUserId) === who)
      && (!category || categoryOf(e.action) === category)
      && (!since || new Date(e.at).getTime() >= since));
  }, [all, who, category, range]);
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE);
  const filtered = who !== "" || category !== "" || range !== "";

  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.isError) return <p role="alert" className="text-danger">Couldn&apos;t load the audit log.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageIntro>Everything an administrator did, newest first. Passwords are never recorded.</PageIntro>
        <Button size="sm" variant="secondary" onClick={exportCsv}><Download size={14} /> Export CSV</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select aria-label="Administrator" value={who} className="w-52" onChange={(e) => { setWho(e.target.value); setPage(0); }}>
          <option value="">All administrators</option>
          {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </Select>
        <Select aria-label="Action type" value={category} className="w-44" onChange={(e) => { setCategory(e.target.value as AuditCategory | ""); setPage(0); }}>
          <option value="">All actions</option>
          {AUDIT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </Select>
        <Select aria-label="Time range" value={range} className="w-40" onChange={(e) => { setRange(e.target.value as Range); setPage(0); }}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="">All time</option>
        </Select>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={ScrollText} title={filtered ? "Nothing matches" : "Nothing logged yet"} description={filtered ? "Try a wider time range or another filter." : "Account actions appear here."} /></Card>
      ) : (
        <Card className="p-0">
          <div className={cn("hidden border-b border-line px-4 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint", GRID)} aria-hidden>
            <span>When</span><span>Administrator</span><span>Action</span><span>Account</span><span>Details</span><span>Address</span>
          </div>
          <ul>
            {shown.map((e) => {
              const p = auditParts(e, names);
              const w = when(e.at);
              return (
                <li key={e.id} className={cn("max-[980px]:flex max-[980px]:flex-col max-[980px]:gap-0.5 border-b border-line px-4 py-3 text-[13px] last:border-0", GRID)}>
                  <span className="text-ink-faint"><span className="font-medium text-ink">{w.day}</span> {w.time}</span>
                  <span className="font-medium">{p.actor}</span>
                  <span>{p.verb}</span>
                  <span>{p.target || "—"}</span>
                  <span className="truncate text-[12.5px] text-ink-faint" title={p.extra}>{p.extra || "—"}</span>
                  <span className="text-[12px] text-ink-faint">{e.ip ?? "—"}</span>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-faint">
            <span>
              {page * PAGE + 1}–{Math.min(page * PAGE + PAGE, rows.length)} of {filtered ? rows.length : total}
              {total > LOADED && " · filters apply to the latest 200; export has everything"}
            </span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Newer</Button>
              <Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Older</Button>
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
