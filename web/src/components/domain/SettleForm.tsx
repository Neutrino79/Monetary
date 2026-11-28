import { useEffect, useMemo, useState } from "react";
import type { Bill, Friend } from "@/types";
import { useAccounts, useFriendBills, useUnassignedPayments } from "@/hooks/queries";
import { useSettleFriend } from "@/hooks/mutations";
import { ApiError } from "@/lib/api/errors";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { Select, AmountInput, Textarea, FormField } from "@/components/ui/form";
import { DatePicker } from "@/components/ui/DatePicker";
import { LinkPaymentsDialog } from "@/components/domain/LinkPaymentsDialog";
import { MatchWizard } from "@/components/domain/MatchWizard";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { today } from "@/lib/utils/clock";
import { useFormErrors } from "@/lib/hooks/useFormErrors";

type Direction = Bill["direction"];

const cents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

/**
 * Settle up with a friend by bill: tick the splits they are paying (or the expenses you are paying back), and
 * each gets an amount, at most what is left on it. Payments go one direction at a time; to net a bill you owe
 * against one they owe, match them first. "Fill amount" ticks bills oldest first for a lump sum.
 * `billId` pre-ticks one bill (e.g. from its detail view).
 */
export function SettleForm({ friend, open, onOpenChange, billId }: { friend: Friend | null; open: boolean; onOpenChange: (o: boolean) => void; billId?: number }) {
  const { data: accounts = [] } = useAccounts();
  const { data: allBills = [], isLoading } = useFriendBills(open ? friend?.id : undefined, true);
  const { data: unassigned = [] } = useUnassignedPayments(open ? friend?.id : undefined);
  const settle = useSettleFriend();
  const toast = useToast();
  const [direction, setDirection] = useState<Direction>("they_owe_you");
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [fill, setFill] = useState("");
  const [accountId, setAccountId] = useState<number | "">("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const { errors, setErrors } = useFormErrors({ account: accountId, amount: picked, "*": [accountId, picked, date] });

  const firstAccountId = accounts.find((a) => a.isActive && a.accountType !== "LIABILITY")?.id ?? "";
  const bills = useMemo(
    () => allBills.filter((b) => b.remaining > 0).sort((a, b) => a.date.localeCompare(b.date) || a.entryId - b.entryId),
    [allBills],
  );
  const theirs = bills.filter((b) => b.direction === "they_owe_you");
  const yours = bills.filter((b) => b.direction === "you_owe_them");
  const shown = direction === "they_owe_you" ? theirs : yours;
  const other = direction === "they_owe_you" ? yours : theirs;

  // Reset when opened; start in the direction of the chosen bill, else of whichever side has bills.
  useEffect(() => {
    if (!open) return;
    setAccountId(firstAccountId);
    setDate(today());
    setNote("");
    setFill("");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, friend?.id, firstAccountId]);

  useEffect(() => {
    if (!open || isLoading) return;
    const target = billId != null ? bills.find((b) => b.entryId === billId) : undefined;
    const dir: Direction = target?.direction ?? (theirs.length > 0 ? "they_owe_you" : "you_owe_them");
    setDirection(dir);
    setPicked(target ? { [target.entryId]: fromCents(cents(target.remaining)) } : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, friend?.id, billId, allBills.length]);

  if (!friend) return null;

  const total = shown.reduce((sum, b) => sum + (b.entryId in picked ? cents(Number(picked[b.entryId]) || 0) : 0), 0);

  function switchDirection(next: Direction) {
    setDirection(next);
    setPicked({});
    setFill("");
    setErrors({});
  }

  function toggle(b: Bill) {
    setPicked((p) => {
      const next = { ...p };
      if (b.entryId in next) delete next[b.entryId];
      else next[b.entryId] = fromCents(cents(b.remaining));
      return next;
    });
  }

  /** A lump sum: tick bills oldest first until it is used up. */
  function applyFill(value: string) {
    setFill(value);
    let left = cents(Number(value) || 0);
    const next: Record<number, string> = {};
    for (const b of shown) {
      if (left <= 0) break;
      const take = Math.min(left, cents(b.remaining));
      next[b.entryId] = fromCents(take);
      left -= take;
    }
    setPicked(next);
  }

  async function submit() {
    if (accountId === "") return setErrors({ account: "Select an account." });
    const allocations = shown
      .filter((b) => b.entryId in picked)
      .map((b) => ({ billId: b.entryId, amount: Number(picked[b.entryId]) }));
    if (allocations.length === 0) return setErrors({ amount: "Tick at least one bill." });
    for (const a of allocations) {
      const b = shown.find((x) => x.entryId === a.billId)!;
      if (!(a.amount > 0)) return setErrors({ amount: `Enter an amount for “${b.description}”.` });
      if (cents(a.amount) > cents(b.remaining)) return setErrors({ amount: `Only ${formatCurrency(b.remaining, true)} is left on “${b.description}”.` });
    }
    setSaving(true);
    try {
      await settle.mutateAsync({ friendId: friend!.id, accountId, allocations, note: note.trim() || null, date });
      toast.show("Payment recorded.", { variant: "success" });
      onOpenChange(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong.";
      if (ApiError.isApiError(e) && e.status < 500 && e.status !== 0) setErrors({ amount: message });
      toast.show(message, { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const blocked = unassigned.length > 0;
  const receive = direction === "they_owe_you";

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={`Settle up with ${friend.name}`}
        subtitle={isLoading ? undefined : bills.length === 0 ? "Nothing left to settle" : "Choose the bills this payment is for"}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || blocked || total <= 0}>
              {saving ? "Recording…" : total > 0 ? `Record ${formatCurrency(total / 100, true)}` : "Record payment"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {blocked && (
            <div role="alert" className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-[13px]">
              {friend.name} has {unassigned.length} earlier payment{unassigned.length === 1 ? "" : "s"} not tied to a bill yet. Link {unassigned.length === 1 ? "it" : "them"} first so each bill shows what is really left.
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => setLinkOpen(true)}>
                  Link payments
                </Button>
              </div>
            </div>
          )}

          {theirs.length > 0 && yours.length > 0 && (
            <div className="flex gap-2" role="group" aria-label="Direction">
              <Button variant={receive ? "primary" : "secondary"} size="sm" onClick={() => switchDirection("they_owe_you")}>
                {friend.name} pays you
              </Button>
              <Button variant={!receive ? "primary" : "secondary"} size="sm" onClick={() => switchDirection("you_owe_them")}>
                You pay {friend.name}
              </Button>
            </div>
          )}

          {shown.length > 0 && (
            <FormField label="Fill amount (optional)" hint="Ticks the oldest bills first until this is used up.">
              <AmountInput value={fill} onChange={(e) => applyFill(e.target.value)} placeholder="0.00" aria-label="Fill amount" />
            </FormField>
          )}

          <FormField label={receive ? "Bills they are paying" : "Bills you are paying"} error={errors.amount}>
            {isLoading ? (
              <p className="text-[13px] text-ink-faint">Loading bills…</p>
            ) : shown.length === 0 ? (
              <p className="text-[13px] text-ink-faint">No open bills in this direction.</p>
            ) : (
              <ul className="divide-y divide-dashed divide-line rounded-xl border border-line">
                {shown.map((b) => {
                  const ticked = b.entryId in picked;
                  return (
                    <li key={b.entryId} className="flex items-center gap-3 p-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0"
                        checked={ticked}
                        onChange={() => toggle(b)}
                        aria-label={`Settle ${b.description}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13.3px] font-semibold">{b.description}</div>
                        <div className="text-[12px] text-ink-faint">
                          {formatDate(b.date)} · {formatCurrency(b.remaining, true)} left{b.paid + b.matched > 0 ? ` of ${formatCurrency(b.amount, true)}` : ""}
                        </div>
                      </div>
                      {ticked && (
                        <div className="w-28 shrink-0">
                          <AmountInput
                            value={picked[b.entryId]}
                            onChange={(e) => setPicked((p) => ({ ...p, [b.entryId]: e.target.value }))}
                            aria-label={`Amount for ${b.description}`}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </FormField>

          {other.length > 0 && (
            <p className="text-[12px] text-ink-faint">
              {friend.name} also has {other.length} bill{other.length === 1 ? "" : "s"} the other way. To net them against each other,{" "}
              <button type="button" className="font-semibold text-accent underline" onClick={() => setMatchOpen(true)}>
                match them first
              </button>
              .
            </p>
          )}

          <FormField label={receive ? "Deposit to account" : "Pay from account"} error={errors.account}>
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
          <FormField label="Date">
            <DatePicker max={today()} value={date} onChange={setDate} />
          </FormField>
          <FormField label="Note (optional)">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
        </div>
      </Modal>
      <LinkPaymentsDialog friend={friend} open={linkOpen} onOpenChange={setLinkOpen} />
      <MatchWizard friend={friend} open={matchOpen} onOpenChange={setMatchOpen} />
    </>
  );
}
