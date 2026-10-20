import { Users } from "lucide-react";
import { Card, Avatar, EmptyState } from "@/components/ui/primitives";
import { useFriendBalances } from "@/hooks/queries";
import { useLookups } from "@/hooks/useLookups";
import { formatCurrency } from "@/lib/utils/format";
import { TransactionTable } from "@/components/domain/TransactionTable";

export function SplitsPage() {
  const { data: friendBalances = [] } = useFriendBalances();
  const lookups = useLookups();
  // Balances are computed by the backend (running per-friend statement); only non-zero ones are listed.
  const balances = friendBalances
    .filter((b) => b.balance !== 0)
    .map((b) => ({ friend: lookups.getFriend(b.friendId), name: b.friendName, bal: b.balance, id: b.friendId }))
    .sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal));

  return (
    <div>
      <Card className="mb-5">
        <div className="mb-3 text-[14.5px] font-semibold">Who owes what</div>
        {balances.length ? (
          <div className="flex flex-wrap gap-3">
            {balances.map(({ friend, name, bal, id }) => (
              <div key={id} className="flex min-w-50 flex-1 items-center gap-3 rounded-[10px] border border-line p-3">
                <Avatar name={name} color={friend?.color ?? "#5A5A5A"} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.3px] font-semibold">{name}</div>
                  <div className={`text-[12px] ${bal > 0 ? "text-accent" : "text-negative"}`}>{bal > 0 ? "owes you" : "you owe"} {formatCurrency(Math.abs(bal), true)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title="All settled up" description="Nobody owes anybody anything right now." />
        )}
      </Card>

      <TransactionTable
        allowedTypes={["split"]}
        title="Splits"
        description="Shared bills — your share, and what each friend owes toward it."
        showTypeFilter={false}
        showFriendFilter
        addType="split"
        emptyTitle="No split expenses"
        emptyDescription="Try widening your date range, or split your first bill with a friend."
      />
    </div>
  );
}
