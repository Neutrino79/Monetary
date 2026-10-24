import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useSpending } from "@/hooks/queries";
import { useUpdateCategory } from "@/hooks/mutations";
import { useLookups } from "@/hooks/useLookups";
import { formatCurrency } from "@/lib/utils/format";
import { shiftMonth } from "@/lib/utils/dateRange";
import { suggestBudget } from "@/lib/utils/budgetPace";

/** Categories you spend in but have no budget for, each with a one-tap suggested limit from recent spending. */
export function BudgetSuggestions({ month }: { month: string }) {
  const lookups = useLookups();
  const thisMonth = useSpending(month);
  const lastMonth = useSpending(shiftMonth(month, -1));
  const update = useUpdateCategory();

  const lastById = new Map((lastMonth.data ?? []).map((c) => [c.categoryId, c.total]));
  const rows = (thisMonth.data ?? [])
    .filter((c) => c.total > 0 && lookups.getCategory(c.categoryId)?.budgetLimit == null)
    .map((c) => ({ id: c.categoryId, name: c.categoryName, spent: c.total, suggestion: suggestBudget(Math.max(c.total, lastById.get(c.categoryId) ?? 0)) }))
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 5);

  if (rows.length === 0) return null;
  return (
    <Card className="mt-5">
      <div className="text-[14.5px] font-semibold">No budget yet</div>
      <div className="mb-3 text-[12.5px] text-ink-faint">You spend in these categories but haven't set a limit. The suggestion is your higher figure of this and last month, rounded up.</div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 border-b border-dashed border-line py-2.5 last:border-b-0">
          <div>
            <div className="text-[13.3px] font-medium">{r.name}</div>
            <div className="text-[12px] text-ink-faint">{formatCurrency(r.spent)} spent this month</div>
          </div>
          <Button variant="secondary" disabled={update.isPending} onClick={() => update.mutate({ id: r.id, patch: { budgetLimit: r.suggestion } })} aria-label={`Set ${r.name} budget to ${formatCurrency(r.suggestion)}`}>
            Set {formatCurrency(r.suggestion)}
          </Button>
        </div>
      ))}
    </Card>
  );
}
