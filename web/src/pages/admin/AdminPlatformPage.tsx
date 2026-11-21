import { Card, Skeleton } from "@/components/ui/primitives";
import { usePlatform } from "@/hooks/admin";
import { formatBytes } from "@/lib/format/bytes";

/** Settings and size of this installation. Superuser only and read-only: settings live in the server's environment. */
export function AdminPlatformPage() {
  const q = usePlatform();
  if (q.isLoading) return <Skeleton className="h-48 w-full" />;
  if (q.isError || !q.data) return <p role="alert" className="text-danger">Couldn&apos;t load the platform details.</p>;
  const p = q.data;
  const facts: [string, string][] = [
    ["Version", `${p.version} (API ${p.apiVersion})`],
    ["Environment", p.environment],
    ["Demo mode", p.demoMode ? "On" : "Off"],
    ["Control database", formatBytes(p.controlDbBytes)],
    ["Ledger files", `${p.ledgerCount} · ${formatBytes(p.ledgerBytes)} in total`],
  ];
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="text-[14px] font-semibold">Installation</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] max-[640px]:grid-cols-1">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[12px] text-ink-faint">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="p-0">
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-semibold">Sign-in and access</h2>
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
    </div>
  );
}
