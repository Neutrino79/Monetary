import { Fragment, useState } from "react";
import { ChevronRight, HandCoins } from "lucide-react";
import type { Friend } from "@/types";
import { useFriendBalances, useFriendStatement, useTransaction } from "@/hooks/queries";
import { Drawer } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Avatar, EmptyState, LoadFailed } from "@/components/ui/primitives";
import { SkeletonStatement } from "@/components/ui/skeletons";
import { SettleForm } from "@/components/domain/SettleForm";
import { TxnDetailDrawer } from "@/components/domain/TxnDetailDrawer";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { balanceSentence, describeStatementRow, groupByMonth, statementTotals } from "@/lib/utils/statement";

/**
 * The running account with one friend, like a bank statement: every shared expense and settlement, newest first,
 * with what each one did to the balance and what was owed after it. Tapping a line opens that transaction.
 */
export function FriendStatement({ friend, open, onOpenChange }: { friend: Friend | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const statement = useFriendStatement(open ? friend?.id : undefined);
  const { data: balances = [] } = useFriendBalances();
  const [openId, setOpenId] = useState<number | undefined>();
  const [settleOpen, setSettleOpen] = useState(false);
  const selected = useTransaction(openId);

  if (!friend) return null;
  const balance = balances.find((b) => b.friendId === friend.id)?.balance ?? 0;
  const rows = [...(statement.data ?? [])].reverse(); // newest first

  const totals = statementTotals(rows);
  const grand = totals.youPaid + totals.theyPaid;
  const months = groupByMonth(rows);

  const hero = (
    <div className="mx-5 mb-1 rounded-card border border-line bg-paper-sunken p-4">
      <div className="flex items-center gap-3">
        <Avatar name={friend.name} color={friend.color} size={40} />
        <div className="min-w-0 flex-1">
          <div className="text-micro text-ink-faint">{balance === 0 ? "Balance now" : balance > 0 ? "Owes you" : "You owe"}</div>
          <div className={`ledger-figure text-[28px] leading-tight ${balance > 0 ? "text-accent" : balance < 0 ? "text-negative" : ""}`}>{formatCurrency(Math.abs(balance), true)}</div>
        </div>
      </div>
      {grand > 0 && (
        <div className="mt-3 space-y-2.5">
          {[
            { label: "You paid for them", value: totals.youPaid, color: "bg-accent" },
            { label: `${friend.name} paid for you`, value: totals.theyPaid, color: "bg-warn" },
          ].map((bar) => (
            <div key={bar.label}>
              <div className="mb-1 flex justify-between text-caption text-ink-soft">
                <span>{bar.label}</span>
                <span className="ledger-figure font-semibold text-ink">{formatCurrency(bar.value, true)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${Math.max(4, Math.round((bar.value / Math.max(totals.youPaid, totals.theyPaid, 1)) * 100))}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={`Statement with ${friend.name}`}
        subtitle={balanceSentence(balance, friend.name)}
        hero={hero}
        footer={
          <Button variant={balance < 0 ? "primary" : "secondary"} disabled={balance === 0} onClick={() => setSettleOpen(true)}>
            <HandCoins size={14} /> {balance < 0 ? `Pay back ${formatCurrency(-balance, true)}` : "Settle up"}
          </Button>
        }
      >
        {statement.isLoading ? (
          <SkeletonStatement />
        ) : statement.isError ? (
          <LoadFailed what="the statement" error={statement.error} onRetry={() => statement.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon={HandCoins} title="Nothing shared yet" description={`Split a bill or settle up and it will show here.`} />
        ) : (
          <ul aria-label={`Statement with ${friend.name}`}>
            {months.map((m) => (
              <Fragment key={m.key}>
                <li role="presentation" className="flex justify-between pb-1 pt-4 text-micro font-bold uppercase tracking-wide text-ink-faint first:pt-0">
                  <span>{m.label}</span>
                  <span className="ledger-figure normal-case">{`${m.net >= 0 ? "Net " : "Net −"}${formatCurrency(Math.abs(m.net), true)}`}</span>
                </li>
                {m.rows.map((r) => (
                  <li key={`${r.entryId}-${r.runningBalance}-${r.delta}`} className="border-t border-dashed border-line">
                    <button type="button" onClick={() => setOpenId(r.entryId)} className="group -mx-2 my-1 flex min-h-(--row-h) w-[calc(100%+1rem)] items-center gap-3 rounded-control px-2 py-2 text-left transition-colors hover:bg-paper-sunken focus-visible:bg-paper-sunken">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body font-semibold">{r.description}</div>
                        <div className="text-caption text-ink-faint">
                          {formatDate(r.date)} · {describeStatementRow(r, friend.name)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`ledger-figure text-body ${r.delta > 0 ? "text-accent" : "text-negative"}`}>
                          {r.delta > 0 ? "+" : "−"}
                          {formatCurrency(Math.abs(r.delta), true)}
                        </div>
                        <div className="text-micro text-ink-faint">{r.runningBalance === 0 ? "Settled" : `Balance ${formatCurrency(Math.abs(r.runningBalance), true)} ${r.runningBalance > 0 ? "owed to you" : "owed by you"}`}</div>
                      </div>
                      <ChevronRight size={15} aria-hidden="true" className="-mr-1 flex-none text-ink-faint opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:hidden" />
                    </button>
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        )}
      </Drawer>

      <SettleForm friend={friend} open={settleOpen} onOpenChange={setSettleOpen} />
      <TxnDetailDrawer txn={selected.data ?? null} open={openId != null && !!selected.data} onOpenChange={(o) => !o && setOpenId(undefined)} />
    </>
  );
}
