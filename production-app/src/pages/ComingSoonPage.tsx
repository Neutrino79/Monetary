import { EmptyState } from "@/components/ui/primitives";
import { Hammer } from "lucide-react";

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">This page is being ported to React next.</p>
      </div>
      <div className="rounded-2xl border border-line bg-paper-raised">
        <EmptyState icon={Hammer} title="Coming in the next pass" description="Dashboard and Transactions are fully ported first for review — this page follows shortly after." />
      </div>
    </div>
  );
}
