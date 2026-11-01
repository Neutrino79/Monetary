import { Link } from "react-router-dom";
import { Fragment, useState } from "react";
import type { Transaction } from "@/types";
import { Drawer, ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { AmountInput, FormField, Textarea } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/DatePicker";
import { Avatar, SectionLabel } from "@/components/ui/primitives";
import { AccountChip, CategoryChip, IncomeSourceChip, TxnBadge, TxnAmount, TxnIconChip } from "./chips";
import { useAccounts, useCategories, useFriendBalances, useFriends, useIncomeSources, useTransaction, useTransactions } from "@/hooks/queries";
import { ApiError } from "@/lib/api/errors";
import { useDeleteTransaction, useCreateTransaction } from "@/hooks/mutations";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { today } from "@/lib/utils/clock";
import { TransactionForm } from "./TransactionForm";
import { SettleForm } from "./SettleForm";
import { Trash2 } from "lucide-react";
import { useFormError } from "@/lib/hooks/useFormErrors";

interface ReceiptRow {
  label: string;
  value: React.ReactNode;
}

/** Label-left, value-right lines, like the itemised part of a receipt. */
function ReceiptRows({ rows }: { rows: ReceiptRow[] }) {
  return (
    <dl>
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 border-t border-dashed border-line px-5 py-2.5 text-body first:border-t-0">
          <dt className="flex-none text-ink-faint">{r.label}</dt>
          <dd className="min-w-0 text-right font-medium">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 last:mb-0">
      <SectionLabel className="mb-3">{title}</SectionLabel>
      {children}
    </div>
  );
}

/** The cut between the headline of a receipt and its itemised lines: a dashed rule with a notch at each edge. */
function Perforation() {
  return (
    <div className="relative h-0 border-t border-dashed border-line-strong" aria-hidden="true">
      <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border border-line bg-paper-raised" />
      <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full border border-line bg-paper-raised" />
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
  const [payBackOpen, setPayBackOpen] = useState(false);
  /** Deleting a split friends have settled against needs an explicit OK. */
  const [forceDelete, setForceDelete] = useState<string | null>(null);

  if (!txn) return null;

  const account = accounts.find((a) => a.id === txn.accountId);
  const toAccount = accounts.find((a) => a.id === txn.toAccountId);
  const category = [...categories, ...incomeSources].find((c) => c.id === txn.categoryId);
  const friend = friends.find((f) => f.id === txn.friendId);
  // Linked transactions, fetched by id / by link rather than filtered out of a full in-browser list.
  const related = [...(refundsQuery.data?.items ?? []), refundOf.data, correctionOf.data, replacedBy.data].filter((t): t is Transaction => !!t && t.id !== txn.id);

  const editable = ["income", "expense", "transfer", "split", "fronted"].includes(txn.type) && txn.status === "posted";

  // settlements are delete-only: undoing one makes the friend owe (or you owe) that amount again
  const deletable = editable || (txn.type === "settlement" && txn.status === "posted");

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

  const unpaidText = txn.unpaid == null ? "—" : txn.unpaid === 0 ? "Yes, fully paid back" : `Not yet: ${formatCurrency(txn.unpaid, true)} still owed`;
  const rows: ReceiptRow[] = [{ label: "Date", value: formatDate(txn.date, "long") }];
  if (txn.type === "transfer") {
    rows.push({ label: "From account", value: account?.name ?? "—" }, { label: "To account", value: toAccount?.name ?? "—" }, { label: "Amount moved", value: formatCurrency(txn.amount) });
  } else if (txn.type === "split") {
    rows.push(
      { label: "Category", value: category?.name ?? "—" },
      { label: "Paid from", value: account?.name ?? "—" },
      { label: "Total bill", value: formatCurrency(txn.amount, true) },
      { label: "Your share", value: formatCurrency(txn.yourShare ?? 0, true) },
    );
  } else if (txn.type === "fronted") {
    rows.push(
      { label: "Paid by", value: friend?.name ?? "—" },
      { label: "Category", value: category?.name ?? "—" },
      { label: "Your share (you owe them)", value: formatCurrency(txn.amount, true) },
      { label: "Paid back", value: unpaidText },
    );
  } else if (txn.type === "settlement") {
    rows.push({ label: "Account", value: account?.name ?? "—" }, { label: "Direction", value: txn.direction === "receive" ? "Received from friend" : "Paid to friend" });
  } else if (txn.type === "refund") {
    rows.push({ label: "Refunded to", value: account?.name ?? "—" }, { label: "Category", value: category?.name ?? "—" });
    if (refundOf.data) rows.push({ label: "Original expense", value: `${refundOf.data.description} (${formatCurrency(refundOf.data.amount)})` });
  } else if (txn.type === "adjustment") {
    rows.push(
      { label: "Account", value: account?.name ?? "—" },
      { label: "Direction", value: txn.direction === "increase" ? "Balance increased" : "Balance decreased" },
      { label: "Posted against", value: "Adjustments (system account)" },
    );
  } else {
    rows.push({ label: "Category", value: category?.name ?? "—" }, { label: txn.type === "income" ? "Deposited to" : "Paid from", value: account?.name ?? "—" });
  }
  const catRow = categories.find((c) => c.id === txn.categoryId);
  const srcRow = incomeSources.find((c) => c.id === txn.categoryId);
  const flowCategory = catRow ? { name: catRow.name, chip: <CategoryChip category={catRow} size={44} /> } : srcRow ? { name: srcRow.name, chip: <IncomeSourceChip source={srcRow} size={44} /> } : null;
  const canRefund = txn.type === "expense" && txn.status === "posted";
  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={txn.description}
        hideTitle
        eyebrow="Transaction"
        footer={
          editable || canRefund || deletable ? (
            <>
              {editable && <Button onClick={() => setEditOpen(true)}>Edit</Button>}
              {canRefund && (
                <Button variant="secondary" onClick={() => setRefundOpen(true)}>
                  Record refund
                </Button>
              )}
              {deletable && (
                <Button variant="secondary" aria-label="Delete" title="Delete" className="flex-none! w-11 px-0 text-danger" onClick={() => setConfirmDelete(true)}>
                  <Trash2 size={17} />
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        <div className="mb-5 overflow-hidden rounded-card border border-line bg-paper-sunken">
          <div className="flex flex-col items-center px-5 pb-5 pt-5 text-center">
            <div className="max-w-full break-words text-[15px] font-semibold leading-snug">{txn.description}</div>
            <div className="mt-1 leading-tight">
              <TxnAmount txn={txn} className="text-[38px]" />
            </div>
            <div className="mt-3">
              <TxnBadge txn={txn} />
            </div>
          </div>
          <Perforation />
          <div className="pb-1 pt-1">
            <ReceiptRows rows={rows} />
          </div>
        </div>

        {(txn.type === "income" || txn.type === "expense") && account && (
          <DetailSection title={txn.type === "income" ? "Where it came from" : "Where it went"}>
            <div className="flex items-center gap-3 rounded-control border border-line bg-paper-sunken p-4">
              {[txn.type === "income" ? flowCategory : { name: account.name, chip: <AccountChip account={account} size={44} /> }, txn.type === "income" ? { name: account.name, chip: <AccountChip account={account} size={44} /> } : flowCategory].map((end, i) => (
                <Fragment key={i}>
                  {i === 1 && <div className="h-0.5 flex-1 bg-line-strong" />}
                  <div className="flex flex-1 flex-col items-center gap-1.5 text-center text-caption text-ink-soft">
                    {end?.chip ?? <span className="h-11 w-11 rounded-control bg-line" />}
                    <span className="max-w-full truncate">{end?.name ?? "Uncategorised"}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          </DetailSection>
        )}

        {txn.type === "transfer" && account && toAccount && (
          <DetailSection title="Transfer">
            <div className="rounded-control border border-line bg-paper-sunken p-4">
              <div className="flex items-center gap-3">
                <div className="flex flex-1 flex-col items-center gap-1.5 text-center text-caption text-ink-soft">
                  <AccountChip account={account} size={44} />
                  <span className="truncate">{account.name}</span>
                </div>
                <div className="h-0.5 flex-1 bg-line-strong" />
                <div className="flex flex-1 flex-col items-center gap-1.5 text-center text-caption text-ink-soft">
                  <AccountChip account={toAccount} size={44} />
                  <span className="truncate">{toAccount.name}</span>
                </div>
              </div>
            </div>
          </DetailSection>
        )}

        {txn.type === "split" && txn.splits && (
          <DetailSection title="Participants">
            <div className="rounded-control border border-line bg-paper-sunken px-4">
              {txn.splits.map((sp) => {
                const f = friends.find((x) => x.id === sp.friendId);
                if (!f) return null;
                const overall = balances.find((b) => b.friendId === sp.friendId)?.balance ?? 0;
                return (
                  <div key={sp.friendId} className="flex items-center gap-3 border-b border-line py-3 last:border-b-0">
                    <Avatar name={f.name} color={f.color} />
                    <div className="min-w-0 flex-1">
                      <div className="text-body font-semibold">{f.name}</div>
                      <div className="text-caption text-ink-faint">Share {formatCurrency(sp.share, true)}</div>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-micro font-semibold ${overall === 0 ? "bg-accent-soft text-accent" : overall > 0 ? "bg-danger-soft text-danger" : "bg-info-soft text-info"}`}
                      title="Their running balance with you across all transactions"
                    >
                      {overall === 0 ? "Settled up" : overall > 0 ? `Owes you ${formatCurrency(overall, true)}` : `You owe ${formatCurrency(-overall, true)}`}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-micro text-ink-faint">Balances are each friend's overall running balance with you — settlements apply across all shared expenses, not to a single bill.</p>
          </DetailSection>
        )}

        {txn.type === "fronted" && txn.unpaid != null && txn.unpaid > 0 && friend && (
          <Button className="mb-5" variant="secondary" onClick={() => setPayBackOpen(true)}>
            Pay back {friend.name}
          </Button>
        )}

        {txn.type === "settlement" && friend && (
          <DetailSection title="Settlement">
            <div className="flex items-center gap-3 rounded-control border border-line bg-paper-sunken p-4">
              <Avatar name={friend.name} color={friend.color} size={44} />
              <div>
                <div className="text-body font-semibold">{friend.name}</div>
                <div className="text-caption text-ink-faint">{txn.direction === "receive" ? "Paid you back" : "You paid them back"}</div>
              </div>
            </div>
          </DetailSection>
        )}

        {txn.tags.length > 0 && (
          <DetailSection title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {txn.tags.map((tag) => (
                <Link key={tag} to={`/transactions?tag=${encodeURIComponent(tag)}`} className="inline-flex min-h-8 items-center rounded-full bg-paper-sunken px-3 text-caption text-ink-soft hover:text-ink">
                  {tag}
                </Link>
              ))}
            </div>
          </DetailSection>
        )}

        {txn.memo && (
          <DetailSection title="Memo">
            <p className="text-body leading-relaxed text-ink-soft">{txn.memo}</p>
          </DetailSection>
        )}

        {related.length > 0 && (
          <DetailSection title="Related transactions">
            {related.map((r) => (
              <div key={r.id} className="flex items-center gap-3 py-3">
                <TxnIconChip txn={r} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold">{r.description}</div>
                  <div className="text-caption text-ink-faint">{formatDate(r.date)}</div>
                </div>
                <TxnAmount txn={r} />
              </div>
            ))}
          </DetailSection>
        )}

        <DetailSection title="Record">
          <div className="rounded-control border border-line bg-paper-sunken py-1">
            <ReceiptRows
              rows={[
                { label: "Recorded", value: formatDate(txn.createdAt, "long") },
                ...(txn.correctionOf ? [{ label: "Replaces", value: `#${txn.correctionOf} (reversed by this correction)` }] : []),
                ...(txn.updatedAt && txn.updatedAt !== txn.createdAt ? [{ label: "Last updated", value: formatDate(txn.updatedAt, "long") }] : []),
                {
                  label: "Status",
                  value:
                    txn.status === "reversed" ? (
                      <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-micro font-semibold text-danger">Reversed</span>
                    ) : (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-micro font-semibold text-accent">Posted</span>
                    ),
                },
              ]}
            />
          </div>
        </DetailSection>
      </Drawer>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={txn.type === "settlement" ? "Delete this settlement?" : "Delete this transaction?"}
        message={
          txn.type === "settlement"
            ? `${friend?.name ?? "This friend"}'s balance goes back to what it was before this ${txn.direction === "receive" ? "payment" : "repayment"}, and ${account?.name ?? "the account"} is ${txn.direction === "receive" ? "reduced" : "increased"} by ${formatCurrency(txn.amount, true)}. ${ledgerMode === "STRICT" ? "A reversal stays in history." : "It is removed permanently."}`
            : ledgerMode === "STRICT"
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

      {txn.type === "fronted" && friend && <SettleForm friend={friend} open={payBackOpen} onOpenChange={setPayBackOpen} defaultAmount={txn.unpaid} />}
      {txn.type === "expense" && <RefundForm original={txn} open={refundOpen} onOpenChange={setRefundOpen} onDone={() => onOpenChange(false)} />}
    </>
  );
}


function RefundForm({ original, open, onOpenChange, onDone }: { original: Transaction; open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const createTxn = useCreateTransaction();
  const toast = useToast();
  const [amount, setAmount] = useState(String(original.amount));
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [error, setError] = useFormError([amount, date]);

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
          <DatePicker max={today()} value={date} onChange={setDate} />
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
