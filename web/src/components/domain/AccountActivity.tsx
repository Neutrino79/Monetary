import { useState } from "react";
import { Scale } from "lucide-react";
import type { Account } from "@/types";
import { useAccountStatement, useTransaction } from "@/hooks/queries";
import { Drawer } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { EmptyState, Skeleton } from "@/components/ui/primitives";
import { TxnDetailDrawer } from "@/components/domain/TxnDetailDrawer";
import { ReconcileForm } from "@/components/domain/ReconcileForm";
import { formatCurrency, formatDate } from "@/lib/utils/format";

/** Everything that moved one account, newest first, with the balance after each line; tap a line for the transaction. */
export function AccountActivity({ account, open, onOpenChange }: { account: Account | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const statement = useAccountStatement(open ? account?.id : undefined);
  const [openId, setOpenId] = useState<number | undefined>();
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const selected = useTransaction(openId);

  if (!account) return null;
  const isCard = account.accountType === "LIABILITY";
  const rows = [...(statement.data ?? [])].reverse();

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={`${account.name} activity`}
        subtitle={isCard ? "Balance is the amount owed" : "Balance after each transaction"}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            <Button variant="secondary" onClick={() => setReconcileOpen(true)}>
              <Scale size={14} /> Reconcile
            </Button>
          </>
        }
      >
        <div className="mb-4 rounded-2xl bg-paper-sunken p-4">
          <div className="text-[11px] text-ink-faint">{isCard ? "Amount owed" : "Balance now"}</div>
          <div className="ledger-figure text-[22px]">{formatCurrency(account.balance, true)}</div>
        </div>
        {statement.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : statement.isError ? (
          <p className="text-[13px] text-danger">Couldn't load the activity.</p>
        ) : rows.length === 0 ? (
          <EmptyState icon={Scale} title="No activity yet" description="Transactions on this account will show here." />
        ) : (
          <ul aria-label={`${account.name} activity`} className="divide-y divide-line">
            {rows.map((r) => {
              const worse = isCard ? r.delta > 0 : r.delta < 0;
              return (
                <li key={`${r.entryId}-${r.runningBalance}-${r.delta}`}>
                  <button type="button" onClick={() => setOpenId(r.entryId)} className="flex w-full items-start gap-3 py-3 text-left hover:bg-paper-sunken">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.3px] font-semibold">{r.description}</div>
                      <div className="text-[12px] text-ink-faint">{formatDate(r.date)}</div>
                    </div>
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
          </ul>
        )}
      </Drawer>
      <ReconcileForm account={account} open={reconcileOpen} onOpenChange={setReconcileOpen} />
      <TxnDetailDrawer txn={selected.data ?? null} open={openId != null && !!selected.data} onOpenChange={(o) => !o && setOpenId(undefined)} />
    </>
  );
}
