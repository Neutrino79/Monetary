import { useState } from "react";
import type { Friend, Transaction } from "@/types";
import { useFriendBills, useUnassignedPayments } from "@/hooks/queries";
import { useAssignPayment } from "@/hooks/mutations";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { AmountInput } from "@/components/ui/form";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const cents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

/**
 * Payments recorded before bills were settled one by one are not tied to any bill. They are never guessed:
 * pick the bills each one paid, with amounts that add up to the payment, and it is linked (a payment for several
 * bills is split into one entry per bill).
 */
export function LinkPaymentsDialog({ friend, open, onOpenChange }: { friend: Friend | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: payments = [] } = useUnassignedPayments(open ? friend?.id : undefined);
  const { data: allBills = [] } = useFriendBills(open ? friend?.id : undefined, true);
  const assign = useAssignPayment();
  const toast = useToast();
  const [current, setCurrent] = useState<Transaction | undefined>();
  const payment = payments.find((p) => p.id === current?.id) ?? payments[0];
  const [pickedFor, setPickedFor] = useState<{ id?: number; picked: Record<number, string> }>({ picked: {} });
  // the ticks belong to one payment; switching payments starts from none
  const picked = pickedFor.id === payment?.id ? pickedFor.picked : {};
  const setPicked = (f: (p: Record<number, string>) => Record<number, string>) => setPickedFor({ id: payment?.id, picked: f(picked) });

  if (!friend) return null;
  // money in (direction "receive") pays what they owed you; money out pays what you owed them
  const wanted = payment?.direction === "receive" ? "they_owe_you" : "you_owe_them";
  const bills = allBills.filter((b) => b.direction === wanted && b.remaining > 0).sort((a, b) => a.date.localeCompare(b.date));
  const total = Object.values(picked).reduce((s, v) => s + cents(Number(v) || 0), 0);
  const target = payment ? cents(payment.amount) : 0;

  async function link() {
    if (!payment) return;
    const allocations = Object.entries(picked).map(([id, v]) => ({ billId: Number(id), amount: Number(v) }));
    try {
      await assign.mutateAsync({ id: payment.id, allocations });
      toast.show("Payment linked.", { variant: "success" });
      if (payments.length <= 1) onOpenChange(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Link ${friend.name}'s earlier payments`}
      subtitle={payment ? `${payments.length} left to link` : "All payments are linked"}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {payment && (
            <Button onClick={link} disabled={total !== target || assign.isPending}>
              Link payment
            </Button>
          )}
        </>
      }
    >
      {!payment ? (
        <p className="text-[13px] text-ink-faint">Nothing to link.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {payments.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {payments.map((p) => (
                <Button key={p.id} size="sm" variant={p.id === payment.id ? "primary" : "secondary"} onClick={() => setCurrent(p)}>
                  {formatDate(p.date)} · {formatCurrency(p.amount, true)}
                </Button>
              ))}
            </div>
          )}
          <p className="text-[13px]">
            {payment.direction === "receive" ? `${friend.name} paid you` : `You paid ${friend.name}`} <b>{formatCurrency(payment.amount, true)}</b> on {formatDate(payment.date)}. Which bills was it for?
          </p>
          {bills.length === 0 ? (
            <p className="text-[13px] text-ink-faint">There are no open bills it could pay.</p>
          ) : (
            <ul className="divide-y divide-dashed divide-line rounded-xl border border-line">
              {bills.map((b) => {
                const ticked = b.entryId in picked;
                return (
                  <li key={b.entryId} className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0"
                      checked={ticked}
                      aria-label={`Paid ${b.description}`}
                      onChange={() =>
                        setPicked((p) => {
                          const next = { ...p };
                          if (ticked) delete next[b.entryId];
                          else next[b.entryId] = fromCents(Math.max(0, Math.min(cents(b.remaining), target - total)) || cents(b.remaining));
                          return next;
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.3px] font-semibold">{b.description}</div>
                      <div className="text-[12px] text-ink-faint">
                        {formatDate(b.date)} · {formatCurrency(b.remaining, true)} left
                      </div>
                    </div>
                    {ticked && (
                      <div className="w-28 shrink-0">
                        <AmountInput value={picked[b.entryId]} onChange={(e) => setPicked((p) => ({ ...p, [b.entryId]: e.target.value }))} aria-label={`Amount for ${b.description}`} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className={`text-[12.5px] ${total === target ? "text-accent" : "text-ink-faint"}`}>
            Linked {formatCurrency(total / 100, true)} of {formatCurrency(payment.amount, true)}
          </p>
        </div>
      )}
    </Modal>
  );
}
