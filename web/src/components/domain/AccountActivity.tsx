import { Fragment, useState } from "react";
import { Scale } from "lucide-react";
import type { Account } from "@/types";
import { useAccountStatement, useTransaction } from "@/hooks/queries";
import { Drawer } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { TxnDetailDrawer } from "@/components/domain/TxnDetailDrawer";
import { ReconcileForm } from "@/components/domain/ReconcileForm";
import { Sparkline } from "@/components/domain/Sparkline";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { groupByDay } from "@/lib/utils/statement";

type Show = "all" | "out" | "in";

/** Everything that moved one account, newest first, with the balance after each line; tap a line for the transaction. */
export function AccountActivity({ account, open, onOpenChange }: { account: Account | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const statement = useAccountStatement(open ? account?.id : undefined);
  const [openId, setOpenId] = useState<number | undefined>();
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [show, setShow] = useState<Show>("all");
  const selected = useTransaction(openId);

  if (!account) return null;
  const isCard = account.accountType === "LIABILITY";
  const all = [...(statement.data ?? [])].reverse();
  // on a card a positive delta is money spent; on any other account a negative one is
  const isOut = (delta: number) => (isCard ? delta > 0 : delta < 0);
  const rows = all.filter((r) => (show === "all" ? true : show === "out" ? isOut(r.delta) : !isOut(r.delta)));
  const days = groupByDay(rows);
  const trend = [...all].reverse().map((r) => r.runningBalance);
  const filters: { id: Show; label: string }[] = [
    { id: "all", label: "All" },
    { id: "out", label: isCard ? "Spent" : "Out" },
    { id: "in", label: isCard ? "Paid in" : "In" },
  ];

  const hero = (
    <div className="mx-5 mb-1 rounded-2xl bg-ink p-5 text-paper dark:bg-paper-sunken dark:text-ink">
      <div className="text-[12px] opacity-75">{isCard ? "Amount owed" : "Balance now"}</div>
      <div className="ledger-figure text-[32px] leading-tight">{formatCurrency(account.balance, true)}</div>
      {trend.length > 1 && (
        <div className="mt-2 text-accent-soft dark:text-accent">
          <Sparkline values={trend} label={`${account.name} balance over its recent activity`} />
        </div>
      )}
    </div>
  );

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={`${account.name} activity`}
        subtitle={isCard ? "Balance is the amount owed" : "Balance after each transaction"}
        hero={hero}
        footer={
          <Button onClick={() => setReconcileOpen(true)}>
            <Scale size={14} /> Reconcile
          </Button>
        }
      >
        {statement.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : statement.isError ? (
          <p className="text-[13px] text-danger">Couldn't load the activity.</p>
        ) : all.length === 0 ? (
          <EmptyState icon={Scale} title="No activity yet" description="Transactions on this account will show here." />
        ) : (
          <>
            <div role="group" aria-label="Show" className="mb-2 flex gap-2">
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={show === f.id}
                  onClick={() => setShow(f.id)}
                  className={`min-h-11 rounded-full border px-4 text-[13px] font-semibold transition-colors ${show === f.id ? "border-ink bg-ink text-paper dark:border-accent dark:bg-accent dark:text-accent-ink" : "border-line bg-paper-raised text-ink-soft hover:border-line-strong"}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-faint">Nothing in this view.</p>
            ) : (
              <ul aria-label={`${account.name} activity`}>
                {days.map((d) => (
                  <Fragment key={d.date}>
                    <li role="presentation" className="pb-1 pt-4 text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">
                      {formatDate(d.date, "long")}
                    </li>
                    {d.rows.map((r) => {
                      const worse = isOut(r.delta);
                      return (
                        <li key={`${r.entryId}-${r.runningBalance}-${r.delta}`} className="border-t border-dashed border-line">
                          <button type="button" onClick={() => setOpenId(r.entryId)} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left hover:bg-paper-sunken">
                            <div className="min-w-0 flex-1 truncate text-[13.3px] font-semibold">{r.description}</div>
                            <div className="text-right">
                              <div className={`ledger-figure text-[13.3px] ${worse ? "text-negative" : "text-accent"}`}>
                                {r.delta > 0 ? "+" : "−"}
                                {formatCurrency(Math.abs(r.delta), true)}
                              </div>
                              <div className="text-[11.5px] text-ink-faint">Balance {formatCurrency(r.runningBalance, true)}</div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </Fragment>
                ))}
              </ul>
            )}
          </>
        )}
      </Drawer>
      <ReconcileForm account={account} open={reconcileOpen} onOpenChange={setReconcileOpen} />
      <TxnDetailDrawer txn={selected.data ?? null} open={openId != null && !!selected.data} onOpenChange={(o) => !o && setOpenId(undefined)} />
    </>
  );
}
