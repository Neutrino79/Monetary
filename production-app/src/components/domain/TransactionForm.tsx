import { useEffect, useState } from "react";
import type { Transaction, TransactionType, SplitParticipant } from "@/types";
import { Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, AmountInput, FormField } from "@/components/ui/form";
import { Avatar } from "@/components/ui/primitives";
import { useAccounts, useIncomeSources, useFriends } from "@/hooks/queries";
import { useCreateTransaction, useUpdateTransaction } from "@/hooks/mutations";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils/format";
import { today } from "@/lib/utils/clock";
import { useLedgerCalc } from "@/hooks/useLedgerCalc";
import { cn } from "@/lib/utils/cn";

const TYPE_TABS: { value: TransactionType; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
  { value: "split", label: "Split" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType?: TransactionType;
  editingTxn?: Transaction | null;
  onSaved?: (txn: Transaction) => void;
}

type ShareMap = Record<string, string>;

export function TransactionForm({ open, onOpenChange, initialType = "expense", editingTxn = null, onSaved }: Props) {
  const isEdit = !!editingTxn;
  const { data: accounts = [] } = useAccounts();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: friends = [] } = useFriends();
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const toast = useToast();
  const { categoryRoots, categoryChildren } = useLedgerCalc();
  const todayStr = today();

  const [type, setType] = useState<TransactionType>(editingTxn?.type ?? initialType);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayStr);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [memo, setMemo] = useState("");
  const [checkedFriends, setCheckedFriends] = useState<string[]>([]);
  const [yourShare, setYourShare] = useState("");
  const [friendShares, setFriendShares] = useState<ShareMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Reset all fields whenever the modal opens (either fresh, or seeded from editingTxn)
  useEffect(() => {
    if (!open) return;
    const t = editingTxn;
    setType(t?.type ?? initialType);
    setDescription(t?.description ?? "");
    setDate(t?.date ?? todayStr);
    setAmount(t?.amount != null ? String(t.amount) : "");
    setAccountId(t?.accountId ?? "");
    setToAccountId(t?.toAccountId ?? "");
    setCategoryId(t?.categoryId ?? "");
    setMemo(t?.memo ?? (t ? "" : ""));
    setErrors({});
    if (t?.type === "split" && t.splits) {
      setCheckedFriends(t.splits.map((s) => s.friendId));
      setYourShare(String(t.yourShare ?? ""));
      const map: ShareMap = {};
      t.splits.forEach((s) => (map[s.friendId] = String(s.share)));
      setFriendShares(map);
    } else {
      setCheckedFriends([]);
      setYourShare("");
      setFriendShares({});
    }
  }, [open, editingTxn, initialType]);

  const amountNum = parseFloat(amount) || 0;

  // Re-seed an equal split whenever amount or friend selection changes (but not on every keystroke of an individual share).
  const seedKey = `${amountNum}|${checkedFriends.join(",")}`;
  useEffect(() => {
    if (type !== "split") return;
    if (!checkedFriends.length) return;
    const shareCount = checkedFriends.length + 1;
    const equal = amountNum ? Math.round((amountNum / shareCount) * 100) / 100 : 0;
    setYourShare((prev) => (prev === "" ? String(equal) : prev));
    setFriendShares((prev) => {
      const next: ShareMap = {};
      checkedFriends.forEach((fid) => {
        next[fid] = prev[fid] ?? String(equal);
      });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, type]);

  function reseedEqual() {
    if (!checkedFriends.length) return;
    const shareCount = checkedFriends.length + 1;
    const equal = amountNum ? Math.round((amountNum / shareCount) * 100) / 100 : 0;
    setYourShare(String(equal));
    const next: ShareMap = {};
    checkedFriends.forEach((fid) => (next[fid] = String(equal)));
    setFriendShares(next);
  }

  const shareTotal = checkedFriends.reduce((a, fid) => a + (parseFloat(friendShares[fid]) || 0), parseFloat(yourShare) || 0);
  const shareDiff = Math.round((amountNum - shareTotal) * 100) / 100;

  function toggleFriend(fid: string) {
    setCheckedFriends((prev) => {
      const next = prev.includes(fid) ? prev.filter((x) => x !== fid) : [...prev, fid];
      return next;
    });
  }

  async function handleSubmit() {
    const newErrors: Record<string, string> = {};
    if (!description.trim()) newErrors.description = "Description is required.";
    if (!date) newErrors.date = "Pick a date.";
    else if (date > todayStr) newErrors.date = "Date can't be in the future.";
    if (!(amountNum > 0)) newErrors.amount = "Enter an amount greater than 0.";

    let payload: Partial<Transaction> & Pick<Transaction, "type" | "description" | "date" | "amount" | "currency"> = {
      type,
      description: description.trim(),
      date,
      amount: amountNum,
      currency: "INR",
      memo: memo.trim() || null,
    };

    if (type === "income") {
      if (!categoryId) newErrors.category = "Select an income source.";
      if (!accountId) newErrors.account = "Select an account.";
      payload = { ...payload, accountId, categoryId };
    } else if (type === "expense") {
      if (!categoryId) newErrors.category = "Select a category.";
      if (!accountId) newErrors.account = "Select an account.";
      payload = { ...payload, accountId, categoryId };
    } else if (type === "transfer") {
      if (!accountId) newErrors.account = "Select a source account.";
      if (!toAccountId) newErrors.toAccount = "Select a destination account.";
      else if (accountId === toAccountId) newErrors.toAccount = "Pick a different destination account.";
      payload = { ...payload, accountId, toAccountId };
    } else if (type === "split") {
      if (!categoryId) newErrors.category = "Select a category.";
      if (!accountId) newErrors.account = "Select an account.";
      if (!checkedFriends.length) newErrors.friends = "Select at least one friend.";
      const share = parseFloat(yourShare) || 0;
      const splits: SplitParticipant[] = checkedFriends.map((fid) => ({ friendId: fid, share: Math.round((parseFloat(friendShares[fid]) || 0) * 100) / 100, settled: 0 }));
      if (share < 0 || splits.some((s) => s.share < 0)) newErrors.shares = "Shares can't be negative — they can be 0, though.";
      else if (amountNum > 0 && Math.abs(amountNum - (share + splits.reduce((a, s) => a + s.share, 0))) > 0.02) {
        newErrors.shares = `Shares don't add up to the ${formatCurrency(amountNum)} total.`;
      }
      payload = { ...payload, accountId, categoryId, yourShare: share, splits };
    }

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      let result: Transaction;
      if (isEdit && editingTxn) {
        result = await updateTxn.mutateAsync({ id: editingTxn.id, patch: payload });
      } else {
        result = await createTxn.mutateAsync(payload);
      }
      toast.show(isEdit ? "Transaction updated." : "Transaction added.", { variant: "success" });
      onOpenChange(false);
      onSaved?.(result);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const expenseCategoryOptions = (
    <>
      <option value="" disabled>
        Select category…
      </option>
      {categoryRoots().map((root) => (
        <optgroup key={root.id} label={root.name}>
          <option value={root.id}>{root.name}</option>
          {categoryChildren(root.id).map((k) => (
            <option key={k.id} value={k.id}>
              {"\u00A0\u00A0\u21B3 " + k.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit transaction" : "Add transaction"}
      subtitle={isEdit ? "Changes follow your current ledger mode." : "Record a new income, expense, transfer or split."}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add transaction"}
          </Button>
        </>
      }
    >
      {!isEdit && (
        <div className="mb-4 flex rounded-[10px] border border-line-strong overflow-hidden">
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={cn(
                "flex-1 border-r border-line-strong px-2 py-2 text-[12.8px] font-semibold text-ink-soft last:border-r-0",
                type === t.value && "bg-ink text-paper",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
        <FormField label="Description" htmlFor="f-desc" error={errors.description} full>
          <Input id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dinner at Truffles" />
        </FormField>
        <FormField label="Date" htmlFor="f-date" error={errors.date}>
          <Input id="f-date" type="date" max={todayStr} value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>

        {type === "income" && (
          <>
            <FormField label="Income source" error={errors.category}>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="" disabled>
                  Select income source…
                </option>
                {incomeSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Deposit to account" error={errors.account}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="" disabled>
                  Select account…
                </option>
                {accounts.filter((a) => a.isActive && !a.isSystem && a.accountType !== "LIABILITY").map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Amount" error={errors.amount}>
              <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Memo (optional)" full>
              <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </FormField>
          </>
        )}

        {type === "expense" && (
          <>
            <FormField label="Category" error={errors.category}>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {expenseCategoryOptions}
              </Select>
            </FormField>
            <FormField label="Paid from" error={errors.account}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="" disabled>
                  Select account…
                </option>
                {accounts.filter((a) => a.isActive && !a.isSystem).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Amount" error={errors.amount}>
              <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Memo (optional)" full>
              <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </FormField>
          </>
        )}

        {type === "transfer" && (
          <>
            <FormField label="From account" error={errors.account}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="" disabled>
                  Select account…
                </option>
                {accounts.filter((a) => a.isActive && !a.isSystem).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="To account" error={errors.toAccount}>
              <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
                <option value="" disabled>
                  Select account…
                </option>
                {accounts.filter((a) => a.isActive && !a.isSystem).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Amount" error={errors.amount}>
              <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Memo (optional)" full>
              <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
            </FormField>
          </>
        )}

        {type === "split" && (
          <>
            <FormField label="Category" error={errors.category}>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {expenseCategoryOptions}
              </Select>
            </FormField>
            <FormField label="Paid from" error={errors.account}>
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="" disabled>
                  Select account…
                </option>
                {accounts.filter((a) => a.isActive && !a.isSystem).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Total bill amount" error={errors.amount} full>
              <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Split with" error={errors.friends} full>
              <div className="flex flex-wrap gap-2">
                {friends.map((f) => (
                  <label key={f.id} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12.5px]">
                    <input type="checkbox" checked={checkedFriends.includes(f.id)} onChange={() => toggleFriend(f.id)} />
                    {f.name}
                  </label>
                ))}
              </div>
            </FormField>

            {checkedFriends.length > 0 && (
              <div className="col-span-full">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-ink-soft">
                    Share breakdown <span className="font-normal text-ink-faint">— editable, your share can be 0</span>
                  </span>
                  <button onClick={reseedEqual} className="text-[11.5px] font-semibold text-info underline underline-offset-2">
                    Split equally
                  </button>
                </div>
                <div className="flex items-center gap-3 border-b border-line py-2">
                  <span className="w-6.5" />
                  <span className="flex-1 text-[13px]">You</span>
                  <Input type="number" step={0.01} min={0} value={yourShare} onChange={(e) => setYourShare(e.target.value)} className="w-25 text-right" />
                </div>
                {checkedFriends.map((fid) => {
                  const f = friends.find((x) => x.id === fid);
                  if (!f) return null;
                  return (
                    <div key={fid} className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
                      <Avatar name={f.name} color={f.color} size={26} />
                      <span className="flex-1 text-[13px]">{f.name}</span>
                      <Input
                        type="number"
                        step={0.01}
                        min={0}
                        value={friendShares[fid] ?? ""}
                        onChange={(e) => setFriendShares((prev) => ({ ...prev, [fid]: e.target.value }))}
                        className="w-25 text-right"
                      />
                    </div>
                  );
                })}
                <p className={cn("mt-2 text-[12px]", Math.abs(shareDiff) < 0.01 ? "text-accent" : "text-negative")}>
                  {Math.abs(shareDiff) < 0.01
                    ? `Shares total ${formatCurrency(shareTotal)} — matches the bill.`
                    : `Shares total ${formatCurrency(shareTotal)}, but the bill is ${formatCurrency(amountNum)} (${shareDiff > 0 ? "short by" : "over by"} ${formatCurrency(Math.abs(shareDiff))}).`}
                </p>
                {errors.shares && <p className="mt-1 text-[12px] text-danger">{errors.shares}</p>}
              </div>
            )}

            <FormField label="Memo (optional)" full>
              <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Split evenly" />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
