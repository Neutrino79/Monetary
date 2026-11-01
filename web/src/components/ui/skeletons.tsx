import { cn } from "@/lib/utils/cn";
import { Skeleton } from "./primitives";

/**
 * Loading placeholders shaped like the content they stand in for (rows, cards, stat tiles, charts), so the
 * page does not jump when the data arrives. Each is marked busy for assistive technology.
 */
const busy = { "aria-busy": true, "aria-label": "Loading" } as const;

/** A row of a list: a round or square icon, two lines of text and an amount on the right. */
export function SkeletonRow({ withIcon = true }: { withIcon?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      {withIcon && <Skeleton className="h-9 w-9 flex-none" />}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3.5 w-2/5" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <div className="space-y-2">
        <Skeleton className="ml-auto h-3.5 w-16" />
        <Skeleton className="ml-auto h-3 w-12" />
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 5, withIcon = true, className }: { rows?: number; withIcon?: boolean; className?: string }) {
  return (
    <div {...busy} className={cn("divide-y divide-dashed divide-line", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} withIcon={withIcon} />
      ))}
    </div>
  );
}

/** A statement: a date label, then rows, twice. */
export function SkeletonStatement() {
  return (
    <div {...busy} className="space-y-4">
      {[3, 2].map((n, g) => (
        <div key={g}>
          <Skeleton className="mb-2 h-3 w-28" />
          <div className="divide-y divide-dashed divide-line border-t border-dashed border-line">
            {Array.from({ length: n }, (_, i) => (
              <SkeletonRow key={i} withIcon={false} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const cardShell = "rounded-card border border-line bg-paper-raised p-5";

/** A figure tile: a small label, a big number and a hint line. */
export function SkeletonStat() {
  return (
    <div className={cardShell}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-20" />
    </div>
  );
}

export function SkeletonStats({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div {...busy} className={cn("grid grid-cols-4 gap-5 max-[900px]:grid-cols-2 max-[480px]:grid-cols-1", className)}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStat key={i} />
      ))}
    </div>
  );
}

/** A card with an avatar or icon, a name, a figure and a footer line (accounts, friends). */
export function SkeletonEntityCard({ avatarRound }: { avatarRound?: boolean }) {
  return (
    <div className={cardShell}>
      <div className="flex items-center gap-3">
        <Skeleton className={cn("h-10 w-10 flex-none", avatarRound && "rounded-full")} />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
      <Skeleton className="mt-4 h-14 w-full" />
      <Skeleton className="mt-3 h-3 w-1/3" />
    </div>
  );
}

export function SkeletonCardGrid({ count = 3, avatarRound }: { count?: number; avatarRound?: boolean }) {
  return (
    <div {...busy} className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonEntityCard key={i} avatarRound={avatarRound} />
      ))}
    </div>
  );
}

/** A chart card: a title line and a row of bars of uneven height. */
export function SkeletonChart({ height = 260 }: { height?: number }) {
  const bars = [55, 80, 40, 90, 65, 75, 50, 85, 60, 70, 45, 95];
  return (
    <div {...busy} className={cardShell}>
      <Skeleton className="h-4 w-40" />
      <div className="mt-5 flex items-end gap-2" style={{ height }}>
        {bars.map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

/** The usual report: a row of figures, a chart, a list. */
export function SkeletonReport() {
  return (
    <div {...busy} className="space-y-5">
      <SkeletonStats count={4} />
      <SkeletonChart height={240} />
      <div className={cardShell}>
        <SkeletonList rows={4} withIcon={false} />
      </div>
    </div>
  );
}

export function SkeletonPageHeader() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-3.5 w-72 max-w-full" />
    </div>
  );
}
