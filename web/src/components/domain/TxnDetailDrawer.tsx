import { Link } from "react-router-dom";
import { Fragment, useEffect, useState } from "react";
import type { Transaction } from "@/types";
import { Drawer, ConfirmDialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Avatar, ProgressBar } from "@/components/ui/primitives";
import { AccountChip, CategoryChip, IncomeSourceChip, TxnBadge, TxnAmount, TxnIconChip } from "./chips";
import { useAccounts, useCategories, useFriendBalances, useFriends, useIncomeSources, useTransaction, useTransactions } from "@/hooks/queries";
import { ApiError } from "@/lib/api/errors";
import { useDeleteTransaction } from "@/hooks/mutations";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { TransactionForm } from "./TransactionForm";
import { SettleForm } from "./SettleForm";
import { ArrowLeft, ChevronRight, Trash2 } from "lucide-react";
import { RefundEditForm, RefundForm } from "./RefundForms";
import { summariseRefunds } from "@/lib/utils/refunds";

interface ReceiptRow {
  label: string;
  value: React.ReactNode;
}

/** Label-left, value-right lines, like the itemised part of a receipt. */
function ReceiptRows({ rows }: { rows: ReceiptRow[] }) {
  return (
    <dl>
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 border-t border-dashed border-line px-5 py-2.5 text-[13.3px] first:border-t-0">
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
      <div className="mb-3 text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">{title}</div>
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
/** One row of "go to that transaction": a refund's purchase, a purchase's refund, a correction. */
function LinkedTxnRow({ t, hint, onOpen }: { t: Transaction; hint?: string; onOpen: (t: Transaction) => void }) {
  return (
    <button type="button" onClick={() => onOpen(t)} className="flex w-full items-center gap-3 rounded-[10px] px-2 py-2.5 text-left transition-colors hover:bg-paper-sunken focus-visible:bg-paper-sunken">
      <TxnIconChip txn={t} size={32} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.3px] font-semibold">{t.description}</div>
        <div className="text-[12px] text-ink-faint">{formatDate(t.date)}{hint ? ` · ${hint}` : ""}</div>
      </div>
      <TxnAmount txn={t} />
      <ChevronRight size={16} className="flex-none text-ink-faint" aria-hidden="true" />
    </button>
  );
}

export function TxnDetailDrawer({ txn: base, open, onOpenChange }: { txn: Transaction | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  // Following a link (a refund's purchase, a purchase's refund) stacks transactions on top of the one first opened.
  const [trail, setTrail] = useState<Transaction[]>([]);
  useEffect(() => setTrail([]), [base?.id, open]);
  const txn = trail.length ? trail[trail.length - 1]! : base;
  const previous = trail.length > 1 ? trail[trail.length - 2]! : base;
  const { data: accounts = [] } = useAccounts();
  const { data: categories = [] } = useCategories();
  const { data: friends = [] } = useFriends();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: balances = [] } = useFriendBalances();
  // The purchase a refund belongs to, and every refund recorded against a purchase (seen from either side).
  const purchaseId = txn?.type === "expense" ? txn.id : txn?.type === "refund" ? txn.refundOfId : undefined;
  const refundsQuery = useTransactions({ type: ["refund"], refundOfId: purchaseId, limit: 200 }, purchaseId != null);
  const refundOf = useTransaction(txn?.refundOfId);
  const correctionOf = useTransaction(txn?.correctionOf);
  const replacedBy = useTransaction(txn?.replacedBy);
  const ledgerMode = useAuthStore((s) => s.user?.ledgerMode ?? "DIRECT");
  const deleteTxn = useDeleteTransaction();
  const toast = useToast();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundEditOpen, setRefundEditOpen] = useState(false);
  const [refundsBlockDelete, setRefundsBlockDelete] = useState(false);
  const [payBackOpen, setPayBackOpen] = useState(false);
  /** Deleting a split friends have settled against needs an explicit OK. */
  const [forceDelete, setForceDelete] = useState<string | null>(null);

  if (!txn) return null;

  const account = accounts.find((a) => a.id === txn.accountId);
  const toAccount = accounts.find((a) => a.id === txn.toAccountId);
  const category = [...categories, ...incomeSources].find((c) => c.id === txn.categoryId);
  const friend = friends.find((f) => f.id === txn.friendId);
  // Linked transactions, fetched by id / by link rather than filtered out of a full in-browser list.
  const refunds = refundsQuery.data?.items ?? [];
  const purchase = txn.type === "expense" ? txn : refundOf.data;
  const summary = purchase ? summariseRefunds(purchase.amount, refunds) : null;
  const otherRefunds = refunds.filter((r) => r.id !== txn.id);
  const corrections = [correctionOf.data, replacedBy.data].filter((t): t is Transaction => !!t && t.id !== txn.id);
  // Opening something already on the path goes back to it instead of stacking a loop (purchase -> refund -> purchase ...).
  const openLinked = (t: Transaction) =>
    setTrail((prev) => {
      if (base && t.id === base.id) return [];
      const at = prev.findIndex((x) => x.id === t.id);
      return at >= 0 ? prev.slice(0, at + 1) : [...prev, t];
    });
  const backLabel = previous ? (previous.type === "refund" ? "Back to refund" : previous.type === "expense" ? "Back to purchase" : `Back to ${previous.description}`) : "";

  const editable = ["income", "expense", "transfer", "split", "fronted"].includes(txn.type) && txn.status === "posted";
  const isRefund = txn.type === "refund" && txn.status === "posted";

  // settlements are delete-only: undoing one makes the friend owe (or you owe) that amount again
  const deletable = editable || isRefund || (txn.type === "settlement" && txn.status === "posted");

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
    if (refundOf.data) {
      rows.push({
        label: "Refund of",
        value: (
          <button type="button" onClick={() => openLinked(refundOf.data!)} className="inline-flex max-w-full items-center gap-1 font-medium text-accent hover:underline">
            <span className="truncate">{refundOf.data.description} ({formatCurrency(refundOf.data.amount)})</span>
            <ChevronRight size={14} className="flex-none" aria-hidden="true" />
          </button>
        ),
      });
    }
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
  const fullyRefunded = canRefund && !!summary && summary.complete && summary.count > 0;
  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        title={txn.description}
        hideTitle
        eyebrow="Transaction"
        footer={
          editable || isRefund || canRefund || deletable ? (
            <>
              {(editable || isRefund) && <Button onClick={() => (isRefund ? setRefundEditOpen(true) : setEditOpen(true))}>{isRefund ? "Edit refund" : "Edit"}</Button>}
              {canRefund && (
                <Button variant="secondary" disabled={fullyRefunded} onClick={() => setRefundOpen(true)}>
                  {fullyRefunded ? "Fully refunded" : "Record refund"}
                </Button>
              )}
              {deletable && (
                <Button variant="secondary" aria-label="Delete" title="Delete" className="flex-none! w-11 px-0 text-danger" onClick={() => (txn.type === "expense" && refunds.length > 0 ? setRefundsBlockDelete(true) : setConfirmDelete(true))}>
                  <Trash2 size={17} />
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        {trail.length > 0 && previous && (
          <button type="button" onClick={() => setTrail((prev) => prev.slice(0, -1))} className="mb-3 inline-flex items-center gap-1.5 text-[12.8px] font-medium text-accent hover:underline">
            <ArrowLeft size={14} aria-hidden="true" /> {backLabel}
          </button>
        )}
        <div className="mb-5 overflow-hidden rounded-2xl border border-line bg-paper-sunken">
          <div className="flex flex-col items-center px-5 pb-6 pt-6 text-center">
            <TxnIconChip txn={txn} size={52} />
            <div className="mt-3 max-w-full break-words text-[15px] font-semibold leading-snug">{txn.description}</div>
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
            <div className="flex items-center gap-3 rounded-[10px] border border-line bg-paper-sunken p-4">
              {[txn.type === "income" ? flowCategory : { name: account.name, chip: <AccountChip account={account} size={44} /> }, txn.type === "income" ? { name: account.name, chip: <AccountChip account={account} size={44} /> } : flowCategory].map((end, i) => (
                <Fragment key={i}>
                  {i === 1 && <div className="h-0.5 flex-1 bg-line-strong" />}
                  <div className="flex flex-1 flex-col items-center gap-1.5 text-center text-[12px] text-ink-soft">
                    {end?.chip ?? <span className="h-11 w-11 rounded-[10px] bg-line" />}
                    <span className="max-w-full truncate">{end?.name ?? "Uncategorised"}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          </DetailSection>
        )}

        {txn.type === "transfer" && account && toAccount && (
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
        )}

        {txn.type === "split" && txn.splits && (
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
        )}

        {txn.type === "fronted" && txn.unpaid != null && txn.unpaid > 0 && friend && (
          <Button className="mb-5" variant="secondary" onClick={() => setPayBackOpen(true)}>
            Pay back {friend.name}
          </Button>
        )}

        {txn.type === "settlement" && friend && (
          <DetailSection title="Settlement">
            <div className="flex items-center gap-3 rounded-[10px] border border-line bg-paper-sunken p-4">
              <Avatar name={friend.name} color={friend.color} size={44} />
              <div>
                <div className="text-[13.3px] font-semibold">{friend.name}</div>
                <div className="text-[12px] text-ink-faint">{txn.direction === "receive" ? "Paid you back" : "You paid them back"}</div>
              </div>
            </div>
          </DetailSection>
        )}

        {txn.tags.length > 0 && (
          <DetailSection title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {txn.tags.map((tag) => (
                <Link key={tag} to={`/transactions?tag=${encodeURIComponent(tag)}`} className="inline-flex min-h-8 items-center rounded-full bg-paper-sunken px-3 text-[12.5px] text-ink-soft hover:text-ink">
                  {tag}
                </Link>
              ))}
            </div>
          </DetailSection>
        )}

        {txn.memo && (
          <DetailSection title="Memo">
            <p className="text-[13.3px] leading-relaxed text-ink-soft">{txn.memo}</p>
          </DetailSection>
        )}

        {summary && summary.count > 0 && (
          <DetailSection title="Refunds">
            <div className="mb-2 rounded-[10px] border border-line bg-paper-sunken p-4">
              <div className="mb-2 flex items-baseline justify-between gap-3 text-[13.3px]">
                <span className="font-semibold">{formatCurrency(summary.refunded, true)} of {formatCurrency(summary.original, true)} refunded</span>
                <span className="text-ink-faint">{summary.count} refund{summary.count === 1 ? "" : "s"}</span>
              </div>
              <ProgressBar pct={summary.pct} />
              <div className="mt-2 text-[12px] text-ink-soft">
                {summary.complete ? "Nothing left to refund." : `${formatCurrency(summary.remaining, true)} can still be refunded.`} Net cost {formatCurrency(summary.net, true)}.
              </div>
            </div>
            {txn.type === "expense" && refunds.map((r) => <LinkedTxnRow key={r.id} t={r} onOpen={openLinked} />)}
            {txn.type === "refund" && otherRefunds.length > 0 && (
              <>
                <div className="mb-1 mt-3 text-[12px] text-ink-faint">Other refunds on this purchase</div>
                {otherRefunds.map((r) => <LinkedTxnRow key={r.id} t={r} onOpen={openLinked} />)}
              </>
            )}
          </DetailSection>
        )}

        {corrections.length > 0 && (
          <DetailSection title="Related transactions">
            {corrections.map((r) => <LinkedTxnRow key={r.id} t={r} hint={r.id === txn.correctionOf ? "Replaced by this" : "Replaced this"} onOpen={openLinked} />)}
          </DetailSection>
        )}

        <DetailSection title="Record">
          <div className="rounded-[10px] border border-line bg-paper-sunken py-1">
            <ReceiptRows
              rows={[
                { label: "Recorded", value: formatDate(txn.createdAt, "long") },
                ...(txn.correctionOf ? [{ label: "Replaces", value: `#${txn.correctionOf} (reversed by this correction)` }] : []),
                ...(txn.updatedAt && txn.updatedAt !== txn.createdAt ? [{ label: "Last updated", value: formatDate(txn.updatedAt, "long") }] : []),
                {
                  label: "Status",
                  value:
                    txn.status === "reversed" ? (
                      <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-danger">Reversed</span>
                    ) : (
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-accent">Posted</span>
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
        title={txn.type === "settlement" ? "Delete this settlement?" : txn.type === "refund" ? "Delete this refund?" : "Delete this transaction?"}
        message={
          txn.type === "refund"
            ? `The ${formatCurrency(txn.amount, true)} refund is removed: ${account?.name ?? "the account"} is reduced by that amount and it can be refunded again on the purchase. ${ledgerMode === "STRICT" ? "A reversal stays in history." : "It is removed permanently."}`
            : txn.type === "settlement"
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
      <ConfirmDialog
        open={refundsBlockDelete}
        onOpenChange={setRefundsBlockDelete}
        variant="primary"
        title="This purchase has refunds"
        message={`${summary?.count ?? 0} refund${summary?.count === 1 ? "" : "s"} totalling ${formatCurrency(summary?.refunded ?? 0, true)} ${summary?.count === 1 ? "is" : "are"} linked to it. Delete the refund${summary?.count === 1 ? "" : "s"} first (open one from the Refunds list), then delete the purchase.`}
        confirmLabel="Got it"
        onConfirm={() => undefined}
      />

      {txn.type === "expense" && summary && <RefundForm original={txn} summary={summary} open={refundOpen} onOpenChange={setRefundOpen} />}
      {isRefund && purchase && summary && <RefundEditForm refund={txn} original={purchase} summary={summary} open={refundEditOpen} onOpenChange={setRefundEditOpen} onSaved={() => onOpenChange(false)} />}
    </>
  );
}

