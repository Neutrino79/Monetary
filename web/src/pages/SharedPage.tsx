import { useState } from "react";
import { HandCoins, ScrollText, Users } from "lucide-react";
import type { Friend, TransactionType } from "@/types";
import { Card, Avatar, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { useFriendBalances } from "@/hooks/queries";
import { useLookups } from "@/hooks/useLookups";
import { formatCurrency } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { TransactionTable } from "@/components/domain/TransactionTable";
import { SettleForm } from "@/components/domain/SettleForm";
import { FriendStatement } from "@/components/domain/FriendStatement";

type PaidBy = "all" | "me" | "friend";
const PAID_BY: { value: PaidBy; label: string; types: TransactionType[] }[] = [
  { value: "all", label: "All", types: ["split", "fronted"] },
  { value: "me", label: "You paid", types: ["split"] },
  { value: "friend", label: "Friend paid", types: ["fronted"] },
];

/** Everything shared with friends: bills you split, and expenses a friend paid for you. */
export function SharedPage() {
  const { data: friendBalances = [] } = useFriendBalances();
  const lookups = useLookups();
  const [paidBy, setPaidBy] = useState<PaidBy>("all");
  const [settling, setSettling] = useState<Friend | null>(null);
  const [statementOf, setStatementOf] = useState<Friend | null>(null);
  // Balances are computed by the backend (running per-friend statement); only non-zero ones are listed.
  const balances = friendBalances
    .filter((b) => b.balance !== 0)
    .map((b) => ({ friend: lookups.getFriend(b.friendId), name: b.friendName, bal: b.balance, pending: b.frontedUnpaid, id: b.friendId }))
    .sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal));

  return (
    <div>
      <Card className="mb-5">
        <div className="mb-3 text-lead font-semibold">Who owes what</div>
        {balances.length ? (
          <div className="flex flex-wrap gap-3">
            {balances.map(({ friend, name, bal, pending, id }) => (
              <div key={id} className="flex min-w-60 flex-1 flex-col gap-2.5 rounded-control border border-line p-3">
                <div className="flex items-center gap-3">
                  <Avatar name={name} color={friend?.color ?? "#5A5A5A"} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-body font-semibold">{name}</div>
                    <div className={`text-caption ${bal > 0 ? "text-accent" : "text-negative"}`}>{bal > 0 ? "owes you" : "you owe"} {formatCurrency(Math.abs(bal), true)}</div>
                  </div>
                  {friend && (
                    <>
                      <Button size="sm" variant="ghost" aria-label={`Statement with ${name}`} onClick={() => setStatementOf(friend)}>
                        <ScrollText size={14} />
                      </Button>
                      <Button size="sm" variant={bal < 0 ? "primary" : "secondary"} onClick={() => setSettling(friend)}>
                        <HandCoins size={14} /> {bal < 0 ? "Pay back" : "Settle up"}
                      </Button>
                    </>
                  )}
                </div>
                {pending > 0 && (
                  <div className="rounded-full bg-info-soft px-2.5 py-1 text-micro font-semibold text-info">
                    Paid for you, not paid back: {formatCurrency(pending, true)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title="All settled up" description="Nobody owes anybody anything right now." />
        )}
      </Card>

      <TransactionTable
        allowedTypes={PAID_BY.find((p) => p.value === paidBy)!.types}
        title="Shared"
        description="Bills you split with friends, and expenses a friend paid for you."
        showTypeFilter={false}
        showFriendFilter
        addType={paidBy === "friend" ? "fronted" : "split"}
        emptyTitle="Nothing shared yet"
        emptyDescription="Try widening your date range, or add a split bill or an expense a friend paid for."
        headerExtra={
          <div role="group" aria-label="Paid by" className="mb-4 inline-flex items-center gap-2">
            <span className="text-caption font-semibold text-ink-soft">Paid by</span>
            <span className="inline-flex overflow-hidden rounded-control border border-line-strong">
              {PAID_BY.map((p, i) => (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={paidBy === p.value}
                  onClick={() => setPaidBy(p.value)}
                  className={cn(
                    "px-3.5 py-1.5 text-body font-medium",
                    i > 0 && "border-l border-line-strong",
                    paidBy === p.value ? "bg-ink text-paper dark:bg-accent dark:text-accent-ink" : "bg-paper-raised text-ink hover:bg-paper-sunken",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </span>
          </div>
        }
      />
      <FriendStatement friend={statementOf} open={!!statementOf} onOpenChange={(o) => !o && setStatementOf(null)} />
      <SettleForm friend={settling} open={!!settling} onOpenChange={(o) => !o && setSettling(null)} />
    </div>
  );
}
