import { useState } from "react";
import type { Transaction } from "@/types";
import { Drawer, ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { AmountInput, FormField, Textarea, Input } from "@/components/ui/form";
import { Avatar } from "@/components/ui/primitives";
import { AccountChip, TxnBadge, TxnAmount, TxnIconChip } from "./chips";
import { useAccounts, useCategories, useFriends, useTransactions } from "@/hooks/queries";
import { useDeleteTransaction, useCreateTransaction } from "@/hooks/mutations";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { today } from "@/lib/utils/clock";
import { TransactionForm } from "./TransactionForm";
import { Landmark, Tag, Banknote, HandCoins, TrendingDown, Scale, SlidersHorizontal, Calendar, Edit, Check } from "lucide-react";

function MetaRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-line py-3 last:border-b-0">
      <span className="flex h-7.5 w-7.5 flex-none items-center justify-center rounded-[10px] bg-paper-sunken text-ink-soft">
        <Icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] text-ink-faint">{label}</div>
        <div className="text-[13.3px] font-medium">{value}</div>
      </div>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-3 text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">{title}</div>
      {children}
    </div>
  );
}

export function TxnDetailDrawer({ txn, open, onOpenChange }: { txn: Transaction | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: friends = [] } = useFriends();
  const { data: transactions = [] } = useTransactions();
  const ledgerMode = useAuthStore((s) => s.user?.ledgerMode ?? "DIRECT");
  const deleteTxn = useDeleteTransaction();
  const toast = useToast();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);

  if (!txn) return null;

  const account = accounts.find((a) => a.id === txn.accountId);
  const toAccount = accounts.find((a) => a.id === txn.toAccountId);
  const category = categories.find((c) => c.id === txn.categoryId);
  const friend = friends.find((f) => f.id === txn.friendId);
  const related = transactions.filter((t) => t.id !== txn.id && (t.refundOfId === txn.id || t.id === txn.refundOfId || t.correctionOf === txn.id || t.id === txn.correctionOf));

  const editable = ["income", "expense", "transfer", "split"].includes(txn.type);

  async function handleDelete() {
    if (!txn) return;
    try {
      await deleteTxn.mutateAsync(txn.id);
      toast.show("Transaction deleted.", { variant: "success" });
      onOpenChange(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={txn.description}
        subtitle={formatDate(txn.date, "long")}
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {txn.type === "expense" && !txn.refundOfId && (
              <Button variant="secondary" onClick={() => setRefundOpen(true)}>
                Record refund
              </Button>
            )}
            {editable && (
              <>
                <Button variant="secondary" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </>
            )}
          </>
        }
      >
        <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl bg-paper-sunken p-5">
          <TxnAmount txn={txn} className="text-[26px]" />
          <TxnBadge txn={txn} />
        </div>

        {txn.type === "transfer" && account && toAccount && (
          <>
            <DetailSection title="Transfer">
              <div className="rounded-[10px] border border-line bg-paper-sunken p-4">
                <div className="flex items-center gap-3">
                  <div className="flex flex-1 flex-col items-center gap-1.5 text-center text-[12px] text-ink-soft">
                    <AccountChip account={account} size={44} />
                    <span className="truncate">{account.name}</span>
                  </div>
                  <div className="h-0.5 flex-1 bg-line-strong" />
                  <div className="flex flex-1 flex-col items-center gap-1.5 text-center text-[12px] text-ink-soft">
                    <AccountChip account={toAccount} size={44} />
                    <span className="truncate">{toAccount.name}</span>
                  </div>
                </div>
              </div>
            </DetailSection>
            <DetailSection title="Details">
              <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
                <MetaRow icon={Landmark} label="From account" value={account.name} />
                <MetaRow icon={Landmark} label="To account" value={toAccount.name} />
                <MetaRow icon={Banknote} label="Amount moved" value={formatCurrency(txn.amount)} />
              </div>
            </DetailSection>
          </>
        )}

        {txn.type === "split" && txn.splits && (
          <>
            <div className="mb-5 grid grid-cols-4 gap-3 max-[760px]:grid-cols-2">
              <Stat label="Total bill" value={formatCurrency(txn.amount)} />
              <Stat label="Your share" value={formatCurrency(txn.yourShare ?? 0)} />
              <Stat label="Settled" value={formatCurrency(txn.splits.reduce((a, s) => a + s.settled, 0))} className="text-accent" />
              <Stat label="Outstanding" value={formatCurrency(txn.splits.reduce((a, s) => a + (s.share - s.settled), 0))} className="text-negative" />
            </div>
            <DetailSection title="Participants">
              <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
                {txn.splits.map((s) => {
                  const f = friends.find((x) => x.id === s.friendId);
                  const due = Math.round((s.share - s.settled) * 100) / 100;
                  if (!f) return null;
                  return (
                    <div key={s.friendId} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                      <Avatar name={f.name} color={f.color} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.3px] font-semibold">{f.name}</div>
                        <div className="text-[12px] text-ink-faint">Share {formatCurrency(s.share)}</div>
                      </div>
                      {due <= 0 ? (
                        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-accent">Settled</span>
                      ) : (
                        <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-danger">{formatCurrency(due)} due</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </DetailSection>
            <DetailSection title="Details">
              <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
                <MetaRow icon={Tag} label="Category" value={category?.name ?? "—"} />
                <MetaRow icon={Landmark} label="Paid from" value={account?.name ?? "—"} />
              </div>
            </DetailSection>
          </>
        )}

        {txn.type === "settlement" && friend && (
          <>
            <DetailSection title="Settlement">
              <div className="flex items-center gap-3 rounded-[10px] border border-line bg-paper-sunken p-4">
                <Avatar name={friend.name} color={friend.color} size={44} />
                <div>
                  <div className="text-[13.3px] font-semibold">{friend.name}</div>
                  <div className="text-[12px] text-ink-faint">{txn.direction === "receive" ? "Paid you back" : "You paid them back"}</div>
                </div>
              </div>
            </DetailSection>
            <DetailSection title="Details">
              <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
                <MetaRow icon={Landmark} label="Account" value={account?.name ?? "—"} />
                <MetaRow icon={HandCoins} label="Direction" value={txn.direction === "receive" ? "Received from friend" : "Paid to friend"} />
              </div>
            </DetailSection>
          </>
        )}

        {txn.type === "refund" && (
          <DetailSection title="Details">
            <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
              <MetaRow icon={Landmark} label="Refunded to" value={account?.name ?? "—"} />
              <MetaRow icon={Tag} label="Category" value={category?.name ?? "—"} />
              {(() => {
                const orig = transactions.find((t) => t.id === txn.refundOfId);
                return orig ? <MetaRow icon={TrendingDown} label="Original expense" value={`${orig.description} (${formatCurrency(orig.amount)})`} /> : null;
              })()}
            </div>
          </DetailSection>
        )}

        {txn.type === "adjustment" && (
          <DetailSection title="Details">
            <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
              <MetaRow icon={Landmark} label="Account" value={account?.name ?? "—"} />
              <MetaRow icon={Scale} label="Direction" value={txn.direction === "increase" ? "Balance increased" : "Balance decreased"} />
              <MetaRow icon={SlidersHorizontal} label="Posted against" value="Adjustments (system account)" />
            </div>
          </DetailSection>
        )}

        {(txn.type === "income" || txn.type === "expense") && (
          <DetailSection title="Details">
            <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
              <MetaRow icon={Tag} label="Category" value={category?.name ?? "—"} />
              <MetaRow icon={Landmark} label={txn.type === "income" ? "Deposited to" : "Paid from"} value={account?.name ?? "—"} />
            </div>
          </DetailSection>
        )}

        {txn.memo && (
          <DetailSection title="Memo">
            <p className="text-[13.3px] leading-relaxed text-ink-soft">{txn.memo}</p>
          </DetailSection>
        )}

        {related.length > 0 && (
          <DetailSection title="Related transactions">
            {related.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <TxnIconChip txn={r} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.3px] font-semibold">{r.description}</div>
                  <div className="text-[12px] text-ink-faint">{formatDate(r.date)}</div>
                </div>
                <TxnAmount txn={r} />
              </div>
            ))}
          </DetailSection>
        )}

        <DetailSection title="Record">
          <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
            <MetaRow icon={Calendar} label="Recorded" value={formatDate(txn.createdAt, "long")} />
            {txn.updatedAt && txn.updatedAt !== txn.createdAt && <MetaRow icon={Edit} label="Last updated" value={formatDate(txn.updatedAt, "long")} />}
            <MetaRow
              icon={Check}
              label="Status"
              value={
                txn.status === "reversed" ? (
                  <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-danger">Reversed</span>
                ) : (
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-accent">Posted</span>
                )
              }
            />
          </div>
        </DetailSection>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this transaction?"
        message={
          ledgerMode === "STRICT"
            ? "In STRICT mode this posts a reversal — the original stays in history but no longer affects balances."
            : "In DIRECT mode this permanently removes the entry with no trace left behind."
        }
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />

      {editable && <TransactionForm open={editOpen} onOpenChange={setEditOpen} editingTxn={txn} onSaved={() => onOpenChange(false)} />}

      {txn.type === "expense" && <RefundForm original={txn} open={refundOpen} onOpenChange={setRefundOpen} onDone={() => onOpenChange(false)} />}
    </>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-[10px] border border-line p-3">
      <div className="text-[11px] text-ink-faint">{label}</div>
      <div className={`ledger-figure text-[17px] ${className ?? ""}`}>{value}</div>
    </div>
  );
}

function RefundForm({ original, open, onOpenChange, onDone }: { original: Transaction; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const { data: transactions = [] } = useTransactions();
  const createTxn = useCreateTransaction();
  const toast = useToast();
  const [amount, setAmount] = useState(String(original.amount));
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");

  const alreadyRefunded = transactions.filter((t) => t.refundOfId === original.id).reduce((a, t) => a + t.amount, 0);
  const maxRefund = original.amount - alreadyRefunded;

  async function submit() {
    const amt = parseFloat(amount);
    if (!(amt > 0) || amt > maxRefund + 0.001) {
      setError(`Enter an amount up to ${formatCurrency(maxRefund)}.`);
      return;
    }
    try {
      await createTxn.mutateAsync({
        type: "refund",
        description: `Refund — ${original.description}`,
        memo: memo.trim() || null,
        date,
        currency: "INR",
        accountId: original.accountId,
        categoryId: original.categoryId,
        amount: amt,
        refundOfId: original.id,
      });
      toast.show("Refund recorded.", { variant: "success" });
      onOpenChange(false);
      onDone();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Record a refund"
      subtitle={`Linked to "${original.description}"`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Record refund</Button>
        </>
      }
    >
      <FormField label="Refund amount" hint={`Can't exceed the unrefunded remainder (${formatCurrency(maxRefund)}).`} error={error}>
        <AmountInput value={amount} max={original.amount} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <div className="mt-3">
        <FormField label="Date">
          <Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
      </div>
      <div className="mt-3">
        <FormField label="Memo">
          <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Why was this refunded?" />
        </FormField>
      </div>
    </Modal>
  );
}
