import { useEffect, useState } from "react";
import { CheckCircle2, CloudOff, RefreshCw, ServerCrash, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { checkConnectionNow, useConnectionMonitor } from "@/hooks/useConnectionMonitor";
import { useConnectionStore, type ConnectionStatus } from "@/lib/api/connection";
import { cn } from "@/lib/utils/cn";

const COPY: Record<Exclude<ConnectionStatus, "online">, { icon: typeof WifiOff; title: string; detail: string }> = {
  offline: {
    icon: WifiOff,
    title: "You're offline",
    detail: "Changes can't be saved until your device is back online. What you see may be out of date.",
  },
  unreachable: {
    icon: CloudOff,
    title: "Can't reach the server",
    detail: "Your connection may be weak, or the server may be down. Changes can't be saved right now.",
  },
  server_error: {
    icon: ServerCrash,
    title: "The server is temporarily unavailable",
    detail: "It is restarting or under maintenance. Your data is safe; changes can't be saved right now.",
  },
};

/** Seconds until `at`, counting down once a second; null when there is no scheduled re-check. */
function useCountdown(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [at]);
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/**
 * A strip across the top that says what is happening with the connection, so a failed save or an empty
 * screen is never a mystery: offline, server not answering, server unavailable, and a short "back online".
 * It renders nothing while everything works.
 */
export function ConnectionBanner() {
  useConnectionMonitor();
  const { status, nextRetryAt, checking, recovered } = useConnectionStore();
  const seconds = useCountdown(nextRetryAt);

  if (status === "online") {
    if (!recovered) return null;
    return (
      <div role="status" className="sticky top-0 z-[90] flex items-center justify-center gap-2 bg-accent px-4 py-2 text-[13px] font-medium text-accent-ink">
        <CheckCircle2 size={15} /> Back online. Your data is up to date.
      </div>
    );
  }

  const { icon: Icon, title, detail } = COPY[status];
  return (
    <div
      role="alert"
      className={cn(
        "sticky top-0 z-[90] flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[13px]",
        status === "offline" ? "bg-ink text-paper" : "bg-danger text-paper",
      )}
    >
      <Icon size={16} className="flex-none" />
      <span className="font-semibold">{title}</span>
      <span className="min-w-0 flex-1 opacity-90">
        {detail}{" "}
        {checking ? "Checking…" : seconds !== null ? `Trying again in ${seconds}s.` : ""}
      </span>
      <Button size="sm" variant="secondary" disabled={checking} onClick={() => void checkConnectionNow()}>
        <RefreshCw size={13} className={cn(checking && "animate-spin")} /> Retry now
      </Button>
    </div>
  );
}
