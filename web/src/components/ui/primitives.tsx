import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { AlertCircle, RefreshCw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function IconButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center w-8.5 h-8.5 pointer-coarse:h-11 pointer-coarse:w-11 rounded-control text-ink-soft hover:bg-paper-sunken hover:text-ink transition-colors",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Badge({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-micro font-semibold", className)}>
      {children}
    </span>
  );
}

export function Chip({
  active,
  onRemove,
  className,
  children,
}: {
  active?: boolean;
  onRemove?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-caption font-medium",
        active ? "bg-ink text-paper border-ink" : "bg-paper-raised text-ink-soft",
        className,
      )}
    >
      {children}
      {onRemove && (
        <button aria-label="Remove" onClick={onRemove} className="flex">
          <span className="text-micro">✕</span>
        </button>
      )}
    </span>
  );
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("min-w-0 rounded-card border border-line bg-paper-raised p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function ProgressBar({ pct, color = "var(--accent)" }: { pct: number; color?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="h-2 rounded-full bg-paper-sunken overflow-hidden">
      <div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${clamped}%`, background: color }} />
    </div>
  );
}

export function Avatar({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}

export function IconChip({ icon: Icon, color, size = 38 }: { icon: LucideIcon; color: string; size?: number }) {
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-control text-white"
      style={{ width: size, height: size, background: color }}
    >
      <Icon size={Math.round(size * 0.46)} />
    </span>
  );
}

/** The small uppercase label above a group of fields or rows. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-micro font-bold uppercase tracking-wide text-ink-faint", className)}>{children}</div>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center px-5 py-14 text-ink-soft">
      <span className="flex h-13 w-13 items-center justify-center rounded-full bg-paper-sunken text-ink-faint">
        <Icon size={24} />
      </span>
      <div className="text-[15px] font-semibold text-ink">{title}</div>
      <div className="max-w-80 text-body">{description}</div>
      {action}
    </div>
  );
}

/** The standard "this did not load" state: what failed, the reason when there is one, and a Retry. */
export function LoadFailed({ what, error, onRetry, icon = AlertCircle }: { what: string; error?: unknown; onRetry?: () => void; icon?: LucideIcon }) {
  return (
    <EmptyState
      icon={icon}
      title={`Couldn't load ${what}`}
      description={error instanceof Error && error.message ? error.message : "Try again in a moment."}
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-paper-sunken px-4 text-body font-semibold text-ink hover:border-line-strong">
            <RefreshCw size={14} /> Retry
          </button>
        )
      }
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-control", className)} />;
}
