import { useState } from "react";
import type { Transaction } from "@/types";
import { Drawer, ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { AmountInput, FormField, Textarea, Input } from "@/components/ui/form";
import { Avatar } from "@/components/ui/primitives";
import { AccountChip, TxnBadge, TxnAmount, TxnIconChip } from "./chips";
import { useAccounts, useCategories, useFriendBalances, useFriends, useIncomeSources, useTransaction, useTransactions } from "@/hooks/queries";
import { ApiError } from "@/lib/api/errors";
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
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: balances = [] } = useFriendBalances();
  const refundsQuery = useTransactions({ type: ["refund"], refundOfId: txn?.type === "expense" ? txn.id : undefined, limit: 50 }, txn?.type === "expense");
  const refundOf = useTransaction(txn?.refundOfId);
  const correctionOf = useTransaction(txn?.correctionOf);
  const replacedBy = useTransaction(txn?.replacedBy);
  const ledgerMode = useAuthStore((s) => s.user?.ledgerMode ?? "DIRECT");
  const deleteTxn = useDeleteTransaction();
  const toast = useToast();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  /** Deleting a split friends have settled against needs an explicit OK. */
  const [forceDelete, setForceDelete] = useState<string | null>(null);

  if (!txn) return null;

  const account = accounts.find((a) => a.id === txn.accountId);
  const toAccount = accounts.find((a) => a.id === txn.toAccountId);
  const category = [...categories, ...incomeSources].find((c) => c.id === txn.categoryId);
  const friend = friends.find((f) => f.id === txn.friendId);
  // Linked transactions, fetched by id / by link rather than filtered out of a full in-browser list.
  const related = [...(refundsQuery.data?.items ?? []), refundOf.data, correctionOf.data, replacedBy.data].filter((t): t is Transaction => !!t && t.id !== txn.id);

  const editable = ["income", "expense", "transfer", "split"].includes(txn.type) && txn.status === "posted";

  async function handleDelete(force = false) {
    if (!txn) return;
    try {
      await deleteTxn.mutateAsync({ id: txn.id, opts: force ? { force: true } : undefined });
      toast.show("Transaction deleted.", { variant: "success" });
      onOpenChange(false);
    } catch (e) {
      if (ApiError.isApiError(e) && e.status === 409 && txn.type === "split" && /settlement/i.test(e.message)) {
        setForceDelete(e.message);
      } else {
        toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
      }
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
            {txn.type === "expense" && txn.status === "posted" && (
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
            <div className="mb-5 grid grid-cols-2 gap-3">
              <Stat label="Total bill" value={formatCurrency(txn.amount, true)} />
              <Stat label="Your share" value={formatCurrency(txn.yourShare ?? 0, true)} />
            </div>
            <DetailSection title="Participants">
              <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
                {txn.splits.map((sp) => {
                  const f = friends.find((x) => x.id === sp.friendId);
                  if (!f) return null;
                  const overall = balances.find((b) => b.friendId === sp.friendId)?.balance ?? 0;
                  return (
                    <div key={sp.friendId} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                      <Avatar name={f.name} color={f.color} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.3px] font-semibold">{f.name}</div>
                        <div className="text-[12px] text-ink-faint">Share {formatCurrency(sp.share, true)}</div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${overall === 0 ? "bg-accent-soft text-accent" : overall > 0 ? "bg-danger-soft text-danger" : "bg-info-soft text-info"}`}
                        title="Their running balance with you across all transactions"
                      >
                        {overall === 0 ? "Settled up" : overall > 0 ? `Owes you ${formatCurrency(overall, true)}` : `You owe ${formatCurrency(-overall, true)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11.5px] text-ink-faint">Balances are each friend's overall running balance with you — settlements apply across all shared expenses, not to a single bill.</p>
            </DetailSection>
            <DetailSection title="Details">
              <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
                <MetaRow icon={Tag} label="Category" value={category?.name ?? "—"} />
                <MetaRow icon={Landmark} label="Paid from" value={account?.name ?? "—"} />
              </div>
            </DetailSection>
          </>
        )}

        {txn.type === "fronted" && (
          <DetailSection title="Details">
            <div className="rounded-[10px] border border-line bg-paper-sunken px-4">
              <MetaRow icon={HandCoins} label="Paid by" value={friend?.name ?? "—"} />
              <MetaRow icon={Tag} label="Category" value={category?.name ?? "—"} />
              <MetaRow icon={Banknote} label="You owe them" value={formatCurrency(txn.amount, true)} />
            </div>
          </DetailSection>
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
              {refundOf.data && <MetaRow icon={TrendingDown} label="Original expense" value={`${refundOf.data.description} (${formatCurrency(refundOf.data.amount)})`} />}
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
            {txn.correctionOf && <MetaRow icon={Edit} label="Replaces" value={`#${txn.correctionOf} (reversed by this correction)`} />}
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
        onConfirm={() => handleDelete()}
      />
      <ConfirmDialog
        open={forceDelete !== null}
        onOpenChange={(o) => !o && setForceDelete(null)}
        title="Friends have settled against this split"
        message={`${forceDelete ?? ""} Deleting it anyway keeps their settlements on record and recalculates what each friend owes.`}
        confirmLabel="Delete anyway"
        onConfirm={() => {
          setForceDelete(null);
          handleDelete(true);
        }}
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
  const createTxn = useCreateTransaction();
  const toast = useToast();
  const [amount, setAmount] = useState(String(original.amount));
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");

  async function submit() {
    const amt = Number(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || !(amt > 0)) {
      setError("Enter an amount above 0 with at most 2 decimals.");
      return;
    }
    setError("");
    try {
      await createTxn.mutateAsync({
        type: "refund",
        description: `Refund — ${original.description}`,
        memo: memo.trim() || null,
        date,
        accountId: original.accountId,
        categoryId: original.categoryId,
        amount: amt,
        refundOfId: original.id,
      });
      toast.show("Refund recorded.", { variant: "success" });
      onOpenChange(false);
      onDone();
    } catch (e) {
      // the server knows what's already been refunded and says how much is left
      const message = e instanceof Error ? e.message : "Something went wrong.";
      if (ApiError.isApiError(e) && e.status < 500 && e.status !== 0) setError(message);
      toast.show(message, { variant: "error" });
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
      <FormField label="Refund amount" hint={`Up to the original ${formatCurrency(original.amount, true)}, minus anything already refunded.`} error={error}>
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
