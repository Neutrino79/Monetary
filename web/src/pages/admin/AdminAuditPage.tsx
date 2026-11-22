import { useMemo, useState } from "react";
import { Download, ScrollText } from "lucide-react";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/Toast";
import { ControlStrip, FilterField, StripFilters } from "@/components/list/ControlStrip";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { adminService } from "@/lib/api/services/adminService";
import { useAuditLog, useUserNames } from "@/hooks/admin";
import { PageIntro, Person } from "@/components/admin/adminUi";
import { Pager, Table, TableCard, Th, tdClass, trClass } from "@/components/admin/adminTable";
import { AUDIT_CATEGORIES, auditParts, categoryOf, type AuditCategory } from "./auditText";

const PAGE = 10;
const LOADED = 200;
type Range = "7" | "30" | "";

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? { day: iso, time: "" }
    : { day: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) };
};

/** Everything an administrator did, newest first. There are never passwords in it. */
export function AdminAuditPage() {
  const isPhone = useMediaQuery("(max-width: 640px)");
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
  const filterCount = (who ? 1 : 0) + (category ? 1 : 0) + (range ? 1 : 0);
  const reset = () => { setWho(""); setCategory(""); setRange(""); setPage(0); };

  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.isError) return <p role="alert" className="text-danger">Couldn&apos;t load the audit log.</p>;

  return (
    <div className="flex flex-col gap-5">
      <PageIntro>Everything an administrator did, newest first. Passwords are never recorded.</PageIntro>

      <div className="flex flex-wrap items-center gap-3">
        <ControlStrip>
          <StripFilters count={filterCount} resultCount={rows.length} onReset={reset}>
            <FilterField label="Administrator">
              <Select aria-label="Administrator" className="w-full" value={who} onChange={(e) => { setWho(e.target.value); setPage(0); }}>
                <option value="">All administrators</option>
                {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Action type">
              <Select aria-label="Action type" className="w-full" value={category} onChange={(e) => { setCategory(e.target.value as AuditCategory | ""); setPage(0); }}>
                <option value="">All actions</option>
                {AUDIT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </Select>
            </FilterField>
            <FilterField label="Time range">
              <Select aria-label="Time range" className="w-full" value={range} onChange={(e) => { setRange(e.target.value as Range); setPage(0); }}>
                <option value="">All time</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
              </Select>
            </FilterField>
          </StripFilters>
        </ControlStrip>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={exportCsv}><Download size={14} /> Export CSV</Button>
      </div>

      <TableCard>
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={ScrollText} title={filterCount ? "Nothing matches" : "Nothing logged yet"} description={filterCount ? "Try a wider time range or another filter." : "Account actions appear here."} /></div>
        ) : (
          <>
            {isPhone ? (
              <ul aria-label="Audit log" className="px-4">
                {shown.map((e) => {
                  const p = auditParts(e, names);
                  const w = when(e.at);
                  return (
                    <li key={e.id} className="flex items-start gap-3 border-b border-line py-3 last:border-b-0">
                      <Person name={p.actor} size={30} />
                      <div className="min-w-0 flex-1 text-[13px]">
                        <div><b className="font-semibold">{p.actor}</b> {p.verb}{p.target && <>: <b className="font-semibold">{p.target}</b></>}</div>
                        {p.extra && <div className="truncate text-[12px] text-ink-faint">{p.extra}</div>}
                        <div className="text-[12px] text-ink-faint">{w.day} {w.time}{e.ip ? ` · ${e.ip}` : ""}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Table label="Audit log" head={<><Th>When</Th><Th>Administrator</Th><Th>Action</Th><Th>Account</Th><Th>Details</Th><Th>Address</Th></>}>
                {shown.map((e) => {
                  const p = auditParts(e, names);
                  const w = when(e.at);
                  return (
                    <tr key={e.id} className={trClass}>
                      <td className={`${tdClass} whitespace-nowrap`}><span className="font-medium">{w.day}</span> <span className="text-ink-soft">{w.time}</span></td>
                      <td className={tdClass}><span className="flex items-center gap-2.5"><Person name={p.actor} size={26} /><span className="font-medium">{p.actor}</span></span></td>
                      <td className={tdClass}>{p.verb}</td>
                      <td className={tdClass}>{p.target || <span className="text-ink-faint">—</span>}</td>
                      <td className={`${tdClass} max-w-64 truncate text-ink-soft`} title={p.extra}>{p.extra || "—"}</td>
                      <td className={`${tdClass} whitespace-nowrap text-ink-soft`}>{e.ip ?? "—"}</td>
                    </tr>
                  );
                })}
              </Table>
            )}
            <Pager total={rows.length} page={page} pageSize={PAGE} noun="entry" plural="entries" onPage={setPage} />
          </>
        )}
      </TableCard>
      {total > LOADED && <p className="text-[12.5px] text-ink-faint">Filters apply to the latest {LOADED} of {total} entries. The CSV export has everything.</p>}
    </div>
  );
}
