import { useState } from "react";
import { HandCoins } from "lucide-react";
import type { Friend } from "@/types";
import { useFriendBalances, useFriendStatement, useTransaction } from "@/hooks/queries";
import { Drawer } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Avatar, EmptyState, Skeleton } from "@/components/ui/primitives";
import { SettleForm } from "@/components/domain/SettleForm";
import { TxnDetailDrawer } from "@/components/domain/TxnDetailDrawer";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { balanceSentence, describeStatementRow } from "@/lib/utils/statement";

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

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={`Statement with ${friend.name}`}
        subtitle={balanceSentence(balance, friend.name)}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button variant={balance < 0 ? "primary" : "secondary"} disabled={balance === 0} onClick={() => setSettleOpen(true)}>
              <HandCoins size={14} /> {balance < 0 ? `Pay back ${formatCurrency(-balance, true)}` : "Settle up"}
            </Button>
          </>
        }
      >
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-paper-sunken p-4">
          <Avatar name={friend.name} color={friend.color} size={40} />
          <div>
            <div className="text-[11px] text-ink-faint">Balance now</div>
            <div className={`ledger-figure text-[20px] ${balance > 0 ? "text-accent" : balance < 0 ? "text-negative" : ""}`}>{formatCurrency(Math.abs(balance), true)}</div>
          </div>
        </div>

        {statement.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : statement.isError ? (
          <p className="text-[13px] text-danger">Couldn't load the statement.</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={HandCoins} title="Nothing shared yet" description={`Split a bill or settle up and it will show here.`} />
        ) : (
          <ul aria-label={`Statement with ${friend.name}`} className="divide-y divide-line">
            {rows.map((r) => (
              <li key={`${r.entryId}-${r.runningBalance}-${r.delta}`}>
                <button type="button" onClick={() => setOpenId(r.entryId)} className="flex w-full items-start gap-3 py-3 text-left hover:bg-paper-sunken">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.3px] font-semibold">{r.description}</div>
                    <div className="text-[12px] text-ink-faint">
                      {formatDate(r.date)} · {describeStatementRow(r, friend.name)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`ledger-figure text-[13.3px] ${r.delta > 0 ? "text-accent" : "text-negative"}`}>
                      {r.delta > 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(r.delta), true)}
                    </div>
                    <div className="text-[11.5px] text-ink-faint">{r.runningBalance === 0 ? "Settled" : `Balance ${formatCurrency(Math.abs(r.runningBalance), true)} ${r.runningBalance > 0 ? "owed to you" : "owed by you"}`}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Drawer>

      <SettleForm friend={friend} open={settleOpen} onOpenChange={setSettleOpen} />
      <TxnDetailDrawer txn={selected.data ?? null} open={openId != null && !!selected.data} onOpenChange={(o) => !o && setOpenId(undefined)} />
    </>
  );
}
