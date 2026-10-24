import { useEffect, useState } from "react";
import type { Id, Transaction, TransactionType } from "@/types";
import type { NewTransactionInput, TransactionPatch } from "@/types/api";
import { Modal, ConfirmDialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea, AmountInput, FormField } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/DatePicker";
import { Avatar } from "@/components/ui/primitives";
import { useAccounts, useIncomeSources, useFriends, useDashboard } from "@/hooks/queries";
import { useCreateTransaction, useUpdateTransaction } from "@/hooks/mutations";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils/format";
import { today } from "@/lib/utils/clock";
import { useLookups } from "@/hooks/useLookups";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";

/** The three things you can add. Splits and friend-paid expenses are expenses with a different "Paid by". */
type FormKind = "income" | "expense" | "transfer";
const KIND_TABS: { value: FormKind; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "expense", label: "Expense" },
  { value: "transfer", label: "Transfer" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "split" and "fronted" open the expense form already set up as a split / paid by a friend. */
  initialType?: TransactionType;
  editingTxn?: Transaction | null;
  onSaved?: (txn: Transaction) => void;
}

type ShareMap = Record<number, string>;
type SplitMode = "equal" | "custom";

/** Money in whole minor units, so share totals are compared exactly (no float drift). */
const toCents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => String(c / 100);
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const fieldName = (k: string) => ({ accountId: "account", categoryId: "category", toAccountId: "toAccount", friendId: "friends", splits: "shares", yourShare: "shares" } as Record<string, string>)[k] ?? k;

const kindOf = (t: TransactionType): FormKind => (t === "income" ? "income" : t === "transfer" ? "transfer" : "expense");

/** Equal shares to the cent; the odd cents go to you, so the shares always add up exactly. */
function equalShares(total: number, friendIds: Id[]): { yours: string; friends: ShareMap } {
  const n = friendIds.length + 1;
  const cents = toCents(total);
  const base = Math.floor(cents / n);
  const friends: ShareMap = {};
  friendIds.forEach((id) => (friends[id] = fromCents(base)));
  return { yours: fromCents(cents - base * friendIds.length), friends };
}

export function TransactionForm({ open, onOpenChange, initialType = "expense", editingTxn = null, onSaved }: Props) {
  const isEdit = !!editingTxn;
  const { data: accounts = [] } = useAccounts();
  const { data: incomeSources = [] } = useIncomeSources();
  const { data: friends = [] } = useFriends();
  const { data: dashboard } = useDashboard();
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const toast = useToast();
  const lookups = useLookups();
  const { rootCategories, childrenOf } = lookups;
  const todayStr = today();

  const [kind, setKind] = useState<FormKind>(kindOf(editingTxn?.type ?? initialType));
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayStr);
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<Id | "">("");
  const [toAccountId, setToAccountId] = useState<Id | "">("");
  const [categoryId, setCategoryId] = useState<Id | "">("");
  const [memo, setMemo] = useState("");
  /** Who paid: you (optionally splitting with friends) or a friend (a friend-fronted expense). */
  const [payer, setPayer] = useState<"me" | "friend">("me");
  const [payerFriendId, setPayerFriendId] = useState<Id | "">("");
  const [checkedFriends, setCheckedFriends] = useState<Id[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [yourShare, setYourShare] = useState("");
  const [friendShares, setFriendShares] = useState<ShareMap>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  /** A guarded split edit the server refused (friends already settled against it); asks the user before forcing it. */
  const [forcePrompt, setForcePrompt] = useState<{ message: string; retry: () => void } | null>(null);

  const editingType = editingTxn?.type;

  // Reset all fields whenever the modal opens (either fresh, or seeded from editingTxn)
  useEffect(() => {
    if (!open) return;
    const t = editingTxn;
    setKind(kindOf(t?.type ?? initialType));
    setDescription(t?.description ?? "");
    setDate(t?.date ?? todayStr);
    setAmount(t?.amount != null ? String(t.amount) : "");
    setAccountId(t?.accountId ?? "");
    setToAccountId(t?.toAccountId ?? "");
    setCategoryId(t?.categoryId ?? "");
    setMemo(t?.memo ?? "");
    setErrors({});
    const fronted = (t?.type ?? initialType) === "fronted";
    setPayer(fronted ? "friend" : "me");
    setPayerFriendId(t?.type === "fronted" ? (t.friendId ?? "") : "");
    if (t?.type === "split" && t.splits) {
      setCheckedFriends(t.splits.map((s) => s.friendId));
      setSplitMode("custom");
      setYourShare(String(t.yourShare ?? ""));
      const map: ShareMap = {};
      t.splits.forEach((s) => (map[s.friendId] = String(s.share)));
      setFriendShares(map);
    } else {
      setCheckedFriends([]);
      setSplitMode("equal");
      setYourShare("");
      setFriendShares({});
    }
  }, [open, editingTxn, initialType]);

  const amountNum = parseFloat(amount) || 0;
  const splitting = kind === "expense" && payer === "me" && checkedFriends.length > 0;
  const friendPaid = kind === "expense" && payer === "friend";

  // In "equal" mode the shares follow the bill and the chosen friends.
  const seedKey = `${amountNum}|${checkedFriends.join(",")}|${splitMode}`;
  useEffect(() => {
    if (splitMode !== "equal" || !checkedFriends.length) return;
    const eq = equalShares(amountNum, checkedFriends);
    setYourShare(eq.yours);
    setFriendShares(eq.friends);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  const shareTotal = checkedFriends.reduce((a, fid) => a + (parseFloat(friendShares[fid]) || 0), parseFloat(yourShare) || 0);
  const shareDiff = Math.round((amountNum - shareTotal) * 100) / 100;

  function toggleFriend(fid: Id) {
    setCheckedFriends((prev) => (prev.includes(fid) ? prev.filter((x) => x !== fid) : [...prev, fid]));
    setSplitMode("equal"); // a changed group is re-divided equally; "Custom" is one tap away
  }

  function applyServerError(e: unknown) {
    if (ApiError.isApiError(e) && Object.keys(e.fieldErrors).length) {
      setErrors(Object.fromEntries(Object.entries(e.fieldErrors).map(([k, v]) => [fieldName(k), v])));
    } else if (ApiError.isApiError(e) && e.status === 422) {
      // domain validation (e.g. "Shares must add up...") -- show it inline on the most relevant field
      const m = e.message.toLowerCase();
      setErrors({ [m.includes("add up") || m.includes("share") ? "shares" : m.includes("future") ? "date" : m.includes("amount") || m.includes("exceed") || m.includes("refund") ? "amount" : "form"]: e.message });
    }
  }

  async function handleSubmit(force = false) {
    const newErrors: Record<string, string> = {};
    if (!description.trim()) newErrors.description = "Description is required.";
    if (!date) newErrors.date = "Pick a date.";
    else if (date > todayStr) newErrors.date = "Date can't be in the future.";
    if (!MONEY_RE.test(amount.trim()) || !(amountNum > 0)) newErrors.amount = "Enter an amount above 0 with at most 2 decimals.";

    const common = { description: description.trim(), date, amount: amountNum, memo: memo.trim() || null };
    let input: NewTransactionInput;

    if (kind === "income") {
      if (!categoryId) newErrors.category = "Select an income source.";
      if (!accountId) newErrors.account = "Select an account.";
      input = { type: "income", ...common, accountId: accountId || undefined, categoryId: categoryId || undefined };
    } else if (kind === "transfer") {
      if (!accountId) newErrors.account = "Select a source account.";
      if (!toAccountId) newErrors.toAccount = "Select a destination account.";
      else if (accountId === toAccountId) newErrors.toAccount = "Pick a different destination account.";
      input = { type: "transfer", ...common, accountId: accountId || undefined, toAccountId: toAccountId || undefined };
    } else if (friendPaid) {
      // a friend paid: record only your share, against no account of yours
      if (!categoryId) newErrors.category = "Select a category.";
      if (!payerFriendId) newErrors.friends = "Pick the friend who paid.";
      input = { type: "fronted", ...common, categoryId: categoryId || undefined, friendId: payerFriendId || undefined };
    } else if (splitting) {
      if (!categoryId) newErrors.category = "Select a category.";
      if (!accountId) newErrors.account = "Select an account.";
      const share = parseFloat(yourShare) || 0;
      const splits = checkedFriends.map((fid) => ({ friendId: fid, share: parseFloat(friendShares[fid] ?? "") || 0 }));
      if (share < 0 || splits.some((x) => x.share < 0)) newErrors.shares = "Shares can't be negative — they can be 0, though.";
      else if (splits.some((x) => x.share <= 0)) newErrors.shares = "Each friend's share must be above 0.";
      else if (amountNum > 0 && toCents(share) + splits.reduce((acc, x) => acc + toCents(x.share), 0) !== toCents(amountNum)) {
        // exact to the cent -- the backend enforces the same rule
        newErrors.shares = `Shares must add up to exactly ${formatCurrency(amountNum, true)}.`;
      }
      input = { type: "split", ...common, accountId: accountId || undefined, categoryId: categoryId || undefined, yourShare: share, splits };
    } else {
      if (!categoryId) newErrors.category = "Select a category.";
      if (!accountId) newErrors.account = "Select an account.";
      input = { type: "expense", ...common, accountId: accountId || undefined, categoryId: categoryId || undefined };
      // every friend taken off a split turns it back into a plain expense for the whole bill
      if (isEdit && editingType === "split") input = { ...input, splits: [] };
    }

    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }

    setSaving(true);
    try {
      let result: Transaction;
      if (isEdit && editingTxn) {
        const { type: _type, ...patch } = input; // type can't change
        result = await updateTxn.mutateAsync({ id: editingTxn.id, patch: patch as TransactionPatch, opts: force ? { force: true } : undefined });
      } else {
        result = await createTxn.mutateAsync(input);
      }
      toast.show(isEdit ? "Transaction updated." : "Transaction added.", { variant: "success" });
      onOpenChange(false);
      onSaved?.(result);
    } catch (e) {
      if (isEdit && ApiError.isApiError(e) && e.status === 409 && /settlement/i.test(e.message)) {
        setForcePrompt({ message: e.message, retry: () => handleSubmit(true) });
      } else {
        applyServerError(e);
        toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
      }
    } finally {
      setSaving(false);
    }
  }

  const accountOptions = (filter: (a: (typeof accounts)[number]) => boolean = () => true) => (
    <>
      <option value="" disabled>
        Select account…
      </option>
      {accounts.filter((a) => a.isActive && filter(a)).map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </>
  );

  const expenseCategoryOptions = (
    <>
      <option value="" disabled>
        Select category…
      </option>
      {rootCategories.map((root) => (
        <optgroup key={root.id} label={root.name}>
          <option value={root.id}>{root.name}</option>
          {childrenOf(root.id).map((k) => (
            <option key={k.id} value={k.id}>
              {"  ↳ " + k.name}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );

  // Whether the payer can be changed: only when adding (an entry's type can't change afterwards).
  const canChoosePayer = kind === "expense" && !isEdit;
  const amountLabel = splitting || (isEdit && editingType === "split") ? "Total bill" : friendPaid ? "Your share" : "Amount";
  const friendName = (id: Id | "") => friends.find((f) => f.id === id)?.name ?? "your friend";
  const modalTitle = isEdit ? "Edit transaction" : "Add transaction";

  const preview = (
    <Preview
      kind={kind}
      friendPaid={friendPaid}
      splitting={splitting}
      amount={amountNum}
      yourShare={parseFloat(yourShare) || 0}
      date={date}
      categoryId={categoryId}
      accountName={lookups.getAccount(accountId === "" ? undefined : accountId)?.name}
      toAccountName={lookups.getAccount(toAccountId === "" ? undefined : toAccountId)?.name}
      payerName={friendName(payerFriendId)}
      checkedFriends={checkedFriends}
      friendShares={friendShares}
      budgets={dashboard?.budgets ?? []}
    />
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="xl"
      title={modalTitle}
      subtitle={isEdit ? "Changes follow your current ledger mode." : "Record income, an expense, or a transfer. Say who paid and who shares it."}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => handleSubmit()} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add transaction"}
          </Button>
        </>
      }
    >
      {!isEdit && (
        <div role="tablist" aria-label="Transaction type" className="mb-4 flex border-b border-line">
          {KIND_TABS.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={kind === t.value}
              onClick={() => setKind(t.value)}
              className={cn(
                "border-b-2 border-transparent px-4 py-2 text-[13.5px] font-semibold text-ink-soft hover:text-ink",
                kind === t.value && "border-ink text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-5">
        <div className="min-w-0 flex-[999_1_380px]">
          <div className="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1">
            <FormField label="Description" htmlFor="f-desc" error={errors.description}>
              <Input id="f-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Dinner at Truffles" />
            </FormField>
            <FormField label={amountLabel} error={errors.amount}>
              <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </FormField>

            {kind === "income" && (
              <>
                <FormField label="Income source" error={errors.category}>
                  <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}>
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
                  <Select value={accountId} onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))}>
                    {accountOptions((a) => a.accountType !== "LIABILITY")}
                  </Select>
                </FormField>
              </>
            )}

            {kind === "transfer" && (
              <>
                <FormField label="From account" error={errors.account}>
                  <Select value={accountId} onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))}>
                    {accountOptions()}
                  </Select>
                </FormField>
                <FormField label="To account" error={errors.toAccount}>
                  <Select value={toAccountId} onChange={(e) => setToAccountId(e.target.value === "" ? "" : Number(e.target.value))}>
                    {accountOptions()}
                  </Select>
                </FormField>
              </>
            )}

            {kind === "expense" && (
              <>
                <FormField label="Category" error={errors.category} full>
                  <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}>
                    {expenseCategoryOptions}
                  </Select>
                </FormField>

                {canChoosePayer && (
                  <div className="col-span-full flex flex-col gap-1.5">
                    <span id="paid-by-label" className="text-[12.5px] font-semibold text-ink-soft">
                      Paid by
                    </span>
                    <div role="group" aria-labelledby="paid-by-label" className="flex flex-wrap items-center gap-2">
                      <PayerChip active={payer === "me"} onClick={() => setPayer("me")}>
                        You
                      </PayerChip>
                      <PayerChip active={payer === "friend"} onClick={() => setPayer("friend")} disabled={friends.length === 0} title={friends.length === 0 ? "Add a friend first" : undefined}>
                        A friend
                      </PayerChip>
                      {payer === "friend" && (
                        <Select aria-label="Friend who paid" className="w-auto min-w-40 py-1.5" value={payerFriendId} onChange={(e) => setPayerFriendId(e.target.value === "" ? "" : Number(e.target.value))}>
                          <option value="" disabled>
                            Who paid?
                          </option>
                          {friends.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                    {errors.friends && payer === "friend" && <p className="text-[12px] text-danger">{errors.friends}</p>}
                  </div>
                )}
                {isEdit && editingType === "fronted" && (
                  <FormField label="Paid by" error={errors.friends}>
                    <Select value={payerFriendId} onChange={(e) => setPayerFriendId(e.target.value === "" ? "" : Number(e.target.value))}>
                      {friends.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}

                {friendPaid ? (
                  <div className="col-span-full rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-soft">
                    <b className="text-ink">Pay from:</b> not needed. {friendName(payerFriendId)} paid, so none of your accounts change. Enter only your own share.
                  </div>
                ) : (
                  <FormField label="Pay from" error={errors.account}>
                    <Select value={accountId} onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))}>
                      {accountOptions()}
                    </Select>
                  </FormField>
                )}
              </>
            )}

            <FormField label="Date" htmlFor="f-date" error={errors.date}>
              <DatePicker id="f-date" max={todayStr} value={date} onChange={setDate} />
            </FormField>

            {kind === "expense" && payer === "me" && (
              <SplitCard
                friends={friends}
                checked={checkedFriends}
                onToggle={toggleFriend}
                locked={false}
                mode={splitMode}
                onMode={setSplitMode}
                yourShare={yourShare}
                onYourShare={(v) => {
                  setSplitMode("custom");
                  setYourShare(v);
                }}
                friendShares={friendShares}
                onFriendShare={(fid, v) => {
                  setSplitMode("custom");
                  setFriendShares((prev) => ({ ...prev, [fid]: v }));
                }}
                amount={amountNum}
                shareTotal={shareTotal}
                shareDiff={shareDiff}
                error={errors.shares ?? (errors.friends && payer === "me" ? errors.friends : undefined)}
              />
            )}

            <FormField label="Note (optional)" full>
              <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={splitting ? "Split evenly" : undefined} />
            </FormField>
          </div>
          {errors.form && <p className="mt-3 text-[12.5px] text-danger">{errors.form}</p>}
        </div>

        {preview}
      </div>

      <ConfirmDialog
        open={!!forcePrompt}
        onOpenChange={(o) => !o && setForcePrompt(null)}
        title="Friends have already settled against this split"
        message={`${forcePrompt?.message ?? ""} Saving anyway keeps their settlements and recalculates what each friend owes.`}
        confirmLabel="Save anyway"
        variant="primary"
        onConfirm={() => {
          const retry = forcePrompt?.retry;
          setForcePrompt(null);
          retry?.();
        }}
      />
    </Modal>
  );
}

function PayerChip({ active, children, ...rest }: { active: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...rest}
      className={cn(
        "inline-flex h-9 items-center rounded-full border px-4 text-[13.5px] font-medium disabled:opacity-40",
        active ? "border-ink bg-ink text-paper dark:border-accent dark:bg-accent dark:text-accent-ink" : "border-line-strong bg-paper-raised text-ink hover:bg-paper-sunken",
      )}
    >
      {children}
    </button>
  );
}

/** "Split with" -- pick friends and set shares. Also used when editing: an expense can be split later, or un-split. */
function SplitCard({
  friends, checked, onToggle, locked, mode, onMode, yourShare, onYourShare, friendShares, onFriendShare, amount, shareTotal, shareDiff, error,
}: {
  friends: ReturnType<typeof useFriends>["data"] & object;
  checked: Id[];
  onToggle: (id: Id) => void;
  locked: boolean;
  mode: SplitMode;
  onMode: (m: SplitMode) => void;
  yourShare: string;
  onYourShare: (v: string) => void;
  friendShares: ShareMap;
  onFriendShare: (id: Id, v: string) => void;
  amount: number;
  shareTotal: number;
  shareDiff: number;
  error?: string;
}) {
  const balanced = Math.abs(shareDiff) < 0.01;
  return (
    <section aria-label="Split with friends" className="col-span-full rounded-[14px] border border-line-strong bg-paper-raised p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] font-semibold">
          Split with <span className="text-[12.5px] font-normal text-ink-soft">(optional)</span>
        </div>
        {checked.length > 0 && (
          <div role="group" aria-label="Split mode" className="inline-flex overflow-hidden rounded-[9px] border border-line-strong">
            {(["equal", "custom"] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onMode(m)}
                className={cn("px-3 py-1 text-[12.5px] font-medium", mode === m ? "bg-ink text-paper dark:bg-accent dark:text-accent-ink" : "text-ink-soft hover:bg-paper-sunken")}
              >
                {m === "equal" ? "Equally" : "Custom"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {friends.length === 0 && <span className="text-[12.5px] text-ink-soft">Add a friend on the Friends page to split with them.</span>}
        {friends.map((f) => {
          const on = checked.includes(f.id);
          return (
            <button
              key={f.id}
              type="button"
              aria-pressed={on}
              disabled={locked}
              onClick={() => onToggle(f.id)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium disabled:cursor-default",
                on ? "border-info bg-info-soft text-info" : "border-line-strong bg-paper-raised text-ink hover:bg-paper-sunken",
              )}
            >
              {f.name}
              {on && <span aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>

      {checked.length > 0 && (
        <div className="mt-3">
          <ShareRow label="You" avatar={null} value={yourShare} onChange={onYourShare} />
          {checked.map((fid) => {
            const f = friends.find((x) => x.id === fid);
            return f ? <ShareRow key={fid} label={f.name} avatar={<Avatar name={f.name} color={f.color} size={26} />} value={friendShares[fid] ?? ""} onChange={(v) => onFriendShare(fid, v)} /> : null;
          })}
          <p className={cn("mt-2 text-[12.5px]", balanced ? "text-accent" : "text-negative")}>
            {balanced
              ? `✓ Shares add up to ${formatCurrency(amount, true)}`
              : `Shares total ${formatCurrency(shareTotal, true)}, but the bill is ${formatCurrency(amount, true)} (${shareDiff > 0 ? "short by" : "over by"} ${formatCurrency(Math.abs(shareDiff), true)}).`}
          </p>
        </div>
      )}
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </section>
  );
}

function ShareRow({ label, avatar, value, onChange }: { label: string; avatar: React.ReactNode; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-2 last:border-b-0">
      <span className="flex w-6.5 justify-center">{avatar}</span>
      <span className="flex-1 text-[13.5px]">{label}</span>
      <Input type="number" step={0.01} min={0} aria-label={`${label} share`} value={value} onChange={(e) => onChange(e.target.value)} className="w-28 text-right" />
    </div>
  );
}

/** "What this will do": a plain-language preview of the effect, from the amounts being entered. */
function Preview({
  kind, friendPaid, splitting, amount, yourShare, date, categoryId, accountName, toAccountName, payerName, checkedFriends, friendShares, budgets,
}: {
  kind: FormKind;
  friendPaid: boolean;
  splitting: boolean;
  amount: number;
  yourShare: number;
  date: string;
  categoryId: Id | "";
  accountName?: string;
  toAccountName?: string;
  payerName: string;
  checkedFriends: Id[];
  friendShares: ShareMap;
  budgets: { categoryId: Id; spent: number; budget: number; categoryName: string }[];
}) {
  const lookups = useLookups();
  const { data: friends = [] } = useFriends();
  const fmt = (n: number) => formatCurrency(n, true);
  const spend = kind !== "expense" ? 0 : splitting ? yourShare : amount;
  const thisMonth = date.slice(0, 7) === today().slice(0, 7);

  // budgets are tracked on the root category, subcategories roll up into it
  const cat = categoryId === "" ? undefined : lookups.getCategory(categoryId);
  const rootId = cat ? (cat.parentId ?? cat.id) : undefined;
  const budget = rootId != null && thisMonth ? budgets.find((b) => b.categoryId === rootId) : undefined;
  const pct = (n: number) => (budget && budget.budget > 0 ? Math.round((n / budget.budget) * 100) : 0);

  const rows: { label: string; value: React.ReactNode }[] = [];
  const out = (t: string) => <b className="ledger-figure text-negative">{t}</b>;
  const inn = (t: string) => <b className="ledger-figure text-accent">{t}</b>;
  const mute = (t: string) => <span className="ledger-figure text-ink-soft">{t}</span>;

  if (kind === "income") {
    rows.push({ label: accountName ?? "Account", value: inn(`+${fmt(amount)}`) });
    rows.push({ label: "Spending", value: mute("unchanged") });
  } else if (kind === "transfer") {
    rows.push({ label: accountName ?? "From account", value: out(`−${fmt(amount)}`) });
    rows.push({ label: toAccountName ?? "To account", value: inn(`+${fmt(amount)}`) });
    rows.push({ label: "Spending", value: mute("unchanged") });
  } else {
    rows.push({ label: splitting ? "Spending (your share)" : "Spending", value: out(`+${fmt(spend)}`) });
    if (budget) {
      rows.push({
        label: `${budget.categoryName} budget`,
        value: <span className="ledger-figure"><b>{pct(budget.spent)}%</b> → <b>{pct(budget.spent + spend)}%</b></span>,
      });
    }
    if (friendPaid) {
      rows.push({ label: "Your accounts", value: mute("unchanged") });
      rows.push({ label: `You owe ${payerName}`, value: out(`+${fmt(amount)}`) });
    } else {
      rows.push({ label: accountName ?? "Account", value: out(`−${fmt(amount)}`) });
      if (splitting) {
        checkedFriends.forEach((fid) => {
          const name = friends.find((f) => f.id === fid)?.name ?? "Friend";
          rows.push({ label: `${name} owes you`, value: inn(`+${fmt(parseFloat(friendShares[fid] ?? "") || 0)}`) });
        });
      }
    }
  }

  const note =
    kind === "income" ? "Income adds to the account you deposit it to."
    : kind === "transfer" ? "Moving money between your accounts doesn't count as spending."
    : friendPaid ? `${payerName} paid, so nothing leaves your accounts today. This counts toward your budget now and is marked "not paid back yet" until you settle up.`
    : splitting ? `You pay the full ${fmt(amount)} today. Only your ${fmt(yourShare)} counts as spending; the rest is money friends owe you.`
    : "This counts toward your budget for the category on the date you pick.";

  return (
    <aside aria-label="What this will do" className="flex min-w-0 flex-[1_1_260px] flex-col gap-3 rounded-[14px] bg-paper-sunken p-4 self-start">
      <div className="text-[11.5px] font-semibold uppercase tracking-wider text-ink-soft">What this will do</div>
      <div className="rounded-[12px] bg-paper-raised px-3.5 py-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 border-b border-line py-2 text-[13px] last:border-b-0">
            <span>{r.label}</span>
            {r.value}
          </div>
        ))}
      </div>
      <p className="text-[12.5px] leading-relaxed text-ink-soft">{note}</p>
    </aside>
  );
}
