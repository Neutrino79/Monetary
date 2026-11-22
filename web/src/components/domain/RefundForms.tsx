import { useEffect, useState } from "react";
import type { Transaction } from "@/types";
import { Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { AmountInput, FormField, Select, Textarea } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/DatePicker";
import { useToast } from "@/components/ui/Toast";
import { useAccounts } from "@/hooks/queries";
import { useCreateTransaction, useUpdateTransaction } from "@/hooks/mutations";
import { ApiError } from "@/lib/api/errors";
import { useFormError } from "@/lib/hooks/useFormErrors";
import { today } from "@/lib/utils/clock";
import { formatCurrency } from "@/lib/utils/format";
import type { RefundSummary } from "@/lib/utils/refunds";

const MONEY_RE = /^\d+(\.\d{1,2})?$/;

/** Accounts a refund can be paid into: same currency as the purchase, active (the current one is always kept). */
function useRefundAccounts(original: Transaction, currentAccountId: number | undefined) {
  const { data: accounts = [] } = useAccounts();
  return accounts.filter((a) => a.currency === original.currency && (a.isActive || a.id === currentAccountId));
}

function describe(summary: RefundSummary): string {
  if (summary.count === 0) return `This purchase was ${formatCurrency(summary.original, true)} and has no refunds yet.`;
  return `This purchase was ${formatCurrency(summary.original, true)}. ${formatCurrency(summary.refunded, true)} has already been refunded (${summary.count} refund${summary.count === 1 ? "" : "s"}), so up to ${formatCurrency(summary.remaining, true)} can still be refunded.`;
}

interface FormProps {
  original: Transaction;
  summary: RefundSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Record a refund against a purchase. It starts from what is still refundable and says what was refunded already. */
export function RefundForm({ original, summary, open, onOpenChange }: FormProps) {
  const createTxn = useCreateTransaction();
  const toast = useToast();
  const [amount, setAmount] = useState(String(summary.remaining));
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState<number>(original.accountId ?? 0);
  const [memo, setMemo] = useState("");
  const [error, setError] = useFormError([amount, date]);
  const accounts = useRefundAccounts(original, original.accountId);

  // Every time the dialog opens it starts afresh from what is left to refund.
  useEffect(() => {
    if (!open) return;
    setAmount(String(summary.remaining));
    setDate(today());
    setAccountId(original.accountId ?? 0);
    setMemo("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, summary.remaining, original.id]);

  async function submit() {
    const amt = Number(amount);
    if (!MONEY_RE.test(amount.trim()) || !(amt > 0)) return setError("Enter an amount above 0 with at most 2 decimals.");
    if (Math.round(amt * 100) > Math.round(summary.remaining * 100)) return setError(`Only ${formatCurrency(summary.remaining, true)} can still be refunded.`);
    if (date < original.date) return setError("A refund can't be dated before the purchase.");
    setError("");
    try {
      await createTxn.mutateAsync({
        type: "refund",
        description: `Refund — ${original.description}`,
        memo: memo.trim() || null,
        date,
        accountId: accountId || original.accountId,
        categoryId: original.categoryId,
        amount: amt,
        refundOfId: original.id,
      });
      toast.show("Refund recorded.", { variant: "success" });
      onOpenChange(false);
    } catch (e) {
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
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createTxn.isPending}>Record refund</Button>
        </>
      }
    >
      <p className="mb-4 rounded-[10px] bg-paper-sunken px-3.5 py-3 text-[12.8px] leading-relaxed text-ink-soft">{describe(summary)}</p>
      <FormField label="Refund amount" hint={`Enter the next refund, up to ${formatCurrency(summary.remaining, true)}.`} error={error}>
        <AmountInput value={amount} max={summary.remaining} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <div className="mt-3">
        <FormField label="Refunded into">
          <Select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </FormField>
      </div>
      <div className="mt-3">
        <FormField label="Date">
          <DatePicker min={original.date} max={today()} value={date} onChange={setDate} />
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

/** Change an existing refund: how much, when, into which account, and its memo. */
export function RefundEditForm({ refund, original, summary, open, onOpenChange, onSaved }: FormProps & { refund: Transaction; onSaved: () => void }) {
  const updateTxn = useUpdateTransaction();
  const toast = useToast();
  // What this refund could be raised to: everything not refunded by the *other* refunds.
  const ceiling = Math.round((summary.remaining + refund.amount) * 100) / 100;
  const [amount, setAmount] = useState(String(refund.amount));
  const [date, setDate] = useState(refund.date);
  const [accountId, setAccountId] = useState<number>(refund.accountId ?? 0);
  const [memo, setMemo] = useState(refund.memo ?? "");
  const [error, setError] = useFormError([amount, date]);
  const accounts = useRefundAccounts(refund, refund.accountId);

  useEffect(() => {
    if (!open) return;
    setAmount(String(refund.amount));
    setDate(refund.date);
    setAccountId(refund.accountId ?? 0);
    setMemo(refund.memo ?? "");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refund.id]);

  async function submit() {
    const amt = Number(amount);
    if (!MONEY_RE.test(amount.trim()) || !(amt > 0)) return setError("Enter an amount above 0 with at most 2 decimals.");
    if (Math.round(amt * 100) > Math.round(ceiling * 100)) return setError(`This refund can be at most ${formatCurrency(ceiling, true)}.`);
    if (date < original.date) return setError("A refund can't be dated before the purchase.");
    setError("");
    try {
      await updateTxn.mutateAsync({ id: refund.id, patch: { amount: amt, date, accountId: accountId || refund.accountId, memo: memo.trim() || null } });
      toast.show("Refund updated.", { variant: "success" });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      if (ApiError.isApiError(e) && e.status < 500 && e.status !== 0) setError(message);
      toast.show(message, { variant: "error" });
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Edit refund"
      subtitle={`Linked to "${original.description}"`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={updateTxn.isPending}>Save changes</Button>
        </>
      }
    >
      <p className="mb-4 rounded-[10px] bg-paper-sunken px-3.5 py-3 text-[12.8px] leading-relaxed text-ink-soft">
        The purchase was {formatCurrency(original.amount, true)}. The other refunds total {formatCurrency(Math.round((summary.refunded - refund.amount) * 100) / 100, true)}, so this one can be up to {formatCurrency(ceiling, true)}.
      </p>
      <FormField label="Refund amount" error={error}>
        <AmountInput value={amount} max={ceiling} onChange={(e) => setAmount(e.target.value)} />
      </FormField>
      <div className="mt-3">
        <FormField label="Refunded into">
          <Select value={accountId} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </FormField>
      </div>
      <div className="mt-3">
        <FormField label="Date">
          <DatePicker min={original.date} max={today()} value={date} onChange={setDate} />
        </FormField>
      </div>
      <div className="mt-3">
        <FormField label="Memo">
          <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
