import { useEffect, useState } from "react";
import type { Friend } from "@/types";
import { useAccounts, useFriendBalances } from "@/hooks/queries";
import { useSettleFriend } from "@/hooks/mutations";
import { ApiError } from "@/lib/api/errors";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { Select, AmountInput, Textarea, FormField } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/DatePicker";
import { formatCurrency } from "@/lib/utils/format";
import { today } from "@/lib/utils/clock";

/**
 * Settle up with a friend: they pay you back, or you pay them back. The amount starts as what is outstanding
 * (or `defaultAmount`, e.g. one expense they fronted) and the first active account is pre-selected, so paying
 * back is one tap to open and one to confirm. The server derives and verifies the direction.
 */
export function SettleForm({ friend, open, onOpenChange, defaultAmount }: { friend: Friend | null; open: boolean; onOpenChange: (o: boolean) => void; defaultAmount?: number }) {
  const { data: accounts = [] } = useAccounts();
  const { data: balances = [] } = useFriendBalances();
  const settle = useSettleFriend();
  const toast = useToast();
  const [accountId, setAccountId] = useState<number | "">("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const outstanding = Math.abs(balances.find((b) => b.friendId === friend?.id)?.balance ?? 0);
  const firstAccountId = accounts.find((a) => a.isActive && a.accountType !== "LIABILITY")?.id ?? "";
  const prefill = Math.min(defaultAmount ?? outstanding, outstanding);

  // Start from the outstanding amount and the first account; refreshed when the balances/accounts arrive.
  useEffect(() => {
    if (!open) return;
    setAccountId(firstAccountId);
    setAmount(prefill > 0 ? String(prefill) : "");
    setDate(today());
    setMemo("");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, friend?.id, firstAccountId, prefill]);

  if (!friend) return null;
  // the server derives (and verifies) the real direction from this balance; shown here for the user
  const bal = balances.find((b) => b.friendId === friend.id)?.balance ?? 0;
  const direction: "receive" | "pay" = bal > 0 ? "receive" : "pay";

  async function submit() {
    if (accountId === "") return setErrors({ account: "Select an account." });
    const amt = Number(amount);
    if (!(amt > 0)) return setErrors({ amount: "Enter an amount greater than 0." });
    if (amt > Math.abs(bal)) return setErrors({ amount: `That's more than the ${formatCurrency(Math.abs(bal), true)} outstanding.` });
    setSaving(true);
    try {
      await settle.mutateAsync({ friendId: friend!.id, accountId, amount: amt, direction, memo: memo.trim() || null, date });
      toast.show("Settlement recorded.", { variant: "success" });
      onOpenChange(false);
      setAmount("");
      setMemo("");
      setAccountId("");
      setErrors({});
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      if (ApiError.isApiError(e) && e.status < 500 && e.status !== 0) setErrors({ amount: message });
      toast.show(message, { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Settle up with ${friend.name}`}
      subtitle={direction === "receive" ? `They owe you ${formatCurrency(Math.abs(bal), true)}` : `You owe them ${formatCurrency(Math.abs(bal), true)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Recording…" : "Record settlement"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label={direction === "receive" ? "Deposit to account" : "Pay from account"} error={errors.account}>
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value === "" ? "" : Number(e.target.value))}>
            <option value="" disabled>
              Select account…
            </option>
            {accounts.filter((a) => a.isActive).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Amount" error={errors.amount}>
          <AmountInput value={amount} max={Math.abs(bal)} onChange={(e) => setAmount(e.target.value)} placeholder={Math.abs(bal).toFixed(2)} />
        </FormField>
        <FormField label="Date">
          <DatePicker max={today()} value={date} onChange={setDate} />
        </FormField>
        <FormField label="Memo (optional)">
          <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
