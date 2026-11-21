import { Card, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/form";
import { ComingSoon, PageIntro } from "@/components/admin/adminUi";
import { usePlatform } from "@/hooks/admin";
import { formatBytes } from "@/lib/format/bytes";

/**
 * Settings and tools for the whole installation. Superuser only. Settings are read-only (they live in the
 * server's environment); backups, ledger export and the superuser transfer are planned and shown disabled.
 */
export function AdminPlatformPage() {
  const q = usePlatform();
  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.isError || !q.data) return <p role="alert" className="text-danger">Couldn&apos;t load the platform details.</p>;
  const p = q.data;
  const facts: [string, string, string?][] = [
    ["Version", `${p.version} (API ${p.apiVersion})`],
    ["Environment", p.environment],
    ["Demo mode", p.demoMode ? "On" : "Off"],
    ["Control database", formatBytes(p.controlDbBytes)],
    ["Ledger files", String(p.ledgerCount), `${formatBytes(p.ledgerBytes)} in total`],
  ];
  return (
    <div className="flex flex-col gap-5">
      <PageIntro>Settings and tools for the whole installation. Only the superuser sees this page; admins don&apos;t get the menu item.</PageIntro>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] items-start gap-5 max-[980px]:grid-cols-1">
        <Card className="p-0">
          <div className="border-b border-line px-4 py-3">
            <h2 className="text-[14px] font-semibold">Sign-up and access</h2>
            <p className="text-[12.5px] text-ink-faint">Read-only. These are set in the server configuration and need a restart to change.</p>
          </div>
          <ul>
            {p.settings.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-[13px] last:border-0">
                <span>
                  {s.label}
                  <code className="ml-2 text-[11.5px] text-ink-faint">{s.key}</code>
                </span>
                <span className="font-medium">{s.value}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-[14px] font-semibold">Installation</h2>
          <dl className="mt-3 flex flex-col gap-3 text-[13px]">
            {facts.map(([k, v, note]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-faint">{k}</dt>
                <dd className="text-right font-medium">{v}{note && <span className="block text-[12px] font-normal text-ink-faint">{note}</span>}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-faint">Integrity check</dt>
              <dd><ComingSoon /></dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-5 max-[980px]:grid-cols-1">
        <Card aria-label="Backups and exports">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold">Backups and exports</h2>
            <ComingSoon />
          </div>
          <p className="mb-3 text-[12.8px] text-ink-soft">Backups are copies of the files; nothing is opened or read. Today these exist only as command-line tools.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled>Back up all ledgers</Button>
            <Button size="sm" variant="secondary" disabled>Export one ledger…</Button>
          </div>
        </Card>

        <Card aria-label="Transfer the superuser role">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h2 className="text-[14px] font-semibold">Transfer the superuser role</h2>
            <ComingSoon />
          </div>
          <p className="mb-3 text-[12.8px] text-ink-soft">
            There is always exactly one superuser. Transferring makes someone else the superuser and turns you into an admin. You confirm with your password.
            Only admins can receive the role. Today this is a command-line tool.
          </p>
          <div className="flex flex-wrap gap-2">
            <Select aria-label="New superuser" disabled className="w-52"><option>Choose an admin…</option></Select>
            <Button size="sm" variant="secondary" disabled>Transfer…</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
