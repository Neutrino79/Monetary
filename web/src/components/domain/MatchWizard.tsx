import { useEffect, useMemo, useState } from "react";
import type { Bill, BillMatch, Friend } from "@/types";
import { useFriendBills, useFriendMatches } from "@/hooks/queries";
import { useCreateMatch, useDeleteMatch, useUpdateMatch } from "@/hooks/mutations";
import { ApiError } from "@/lib/api/errors";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { AmountInput } from "@/components/ui/form";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const cents = (n: number) => Math.round(n * 100);
const fromCents = (c: number) => (c / 100).toFixed(2);

/**
 * Net what you owe a friend against what they owe you. Pick a split they owe you and an expense they paid for
 * you, and how much to set against each other. Nothing is paid and their balance does not change: each bill just
 * shows that much less left to settle. Existing matches are listed below and can be changed or removed, unless a
 * payment already rests on them (then removing them also deletes those payments, after a confirmation).
 */
export function MatchWizard({ friend, open, onOpenChange, billId }: { friend: Friend | null; open: boolean; onOpenChange: (o: boolean) => void; billId?: number }) {
  const { data: allBills = [] } = useFriendBills(open ? friend?.id : undefined, true);
  const { data: matches = [] } = useFriendMatches(open ? friend?.id : undefined);
  const create = useCreateMatch();
  const update = useUpdateMatch();
  const remove = useDeleteMatch();
  const toast = useToast();
  const [toMe, setToMe] = useState<number | null>(null);
  const [byMe, setByMe] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [editing, setEditing] = useState<{ id: number; amount: string } | null>(null);
  /** A change the server refused because payments rest on the match; asks before deleting them. */
  const [locked, setLocked] = useState<{ message: string; retry: () => Promise<void> } | null>(null);

  const bills = useMemo(() => allBills.filter((b) => b.remaining > 0).sort((a, b) => a.date.localeCompare(b.date) || a.entryId - b.entryId), [allBills]);
  const owedToMe = bills.filter((b) => b.direction === "they_owe_you");
  const owedByMe = bills.filter((b) => b.direction === "you_owe_them");

  useEffect(() => {
    if (!open) return;
    const target = billId != null ? bills.find((b) => b.entryId === billId) : undefined;
    setToMe(target?.direction === "they_owe_you" ? target.entryId : null);
    setByMe(target?.direction === "you_owe_them" ? target.entryId : null);
    setAmount("");
    setEditing(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, billId, friend?.id]);

  if (!friend) return null;

  const left = (id: number | null) => (id == null ? 0 : cents(bills.find((b) => b.entryId === id)?.remaining ?? 0));
  const maxMatch = toMe != null && byMe != null ? Math.min(left(toMe), left(byMe)) : 0;

  function pick(b: Bill) {
    if (b.direction === "they_owe_you") setToMe(b.entryId === toMe ? null : b.entryId);
    else setByMe(b.entryId === byMe ? null : b.entryId);
    setAmount("");
  }

  async function guard(run: (removeLinked: boolean) => Promise<unknown>, okMessage: string) {
    try {
      await run(false);
      toast.show(okMessage, { variant: "success" });
    } catch (e) {
      if (ApiError.isApiError(e) && e.isBillDependency) {
        setLocked({ message: e.message, retry: async () => { await run(true); toast.show(okMessage, { variant: "success" }); } });
      } else toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  async function submit() {
    if (toMe == null || byMe == null) return;
    const value = amount === "" ? maxMatch : cents(Number(amount));
    if (!(value > 0)) return toast.show("Enter an amount greater than 0.", { variant: "error" });
    if (value > maxMatch) return toast.show(`At most ${formatCurrency(maxMatch / 100, true)} can be matched between these two.`, { variant: "error" });
    await guard(() => create.mutateAsync({ friendId: friend!.id, owedToMeId: toMe, owedByMeId: byMe, amount: value / 100 }), "Matched.");
    setToMe(null);
    setByMe(null);
    setAmount("");
  }

  /** Pair the oldest bills of each side until one side runs out. */
  async function matchOldestFirst() {
    const a = owedToMe.map((b) => ({ id: b.entryId, left: cents(b.remaining) }));
    const b = owedByMe.map((x) => ({ id: x.entryId, left: cents(x.remaining) }));
    let i = 0;
    let j = 0;
    try {
      while (i < a.length && j < b.length) {
        const take = Math.min(a[i].left, b[j].left);
        await create.mutateAsync({ friendId: friend!.id, owedToMeId: a[i].id, owedByMeId: b[j].id, amount: take / 100 });
        a[i].left -= take;
        b[j].left -= take;
        if (a[i].left === 0) i++;
        if (b[j].left === 0) j++;
      }
      toast.show("Matched oldest first.", { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  function saveEdit(m: BillMatch) {
    if (!editing) return;
    const value = Number(editing.amount);
    if (!(value > 0)) return toast.show("Enter an amount greater than 0.", { variant: "error" });
    void guard((rl) => update.mutateAsync({ id: m.id, amount: value, removeLinked: rl }), "Match updated.").then(() => setEditing(null));
  }

  const column = (title: string, list: Bill[], selected: number | null) => (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">{title}</div>
      {list.length === 0 ? (
        <p className="text-[12.5px] text-ink-faint">Nothing open.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((b) => (
            <li key={b.entryId}>
              <button
                type="button"
                aria-pressed={selected === b.entryId}
                onClick={() => pick(b)}
                className={`w-full rounded-xl border p-2.5 text-left ${selected === b.entryId ? "border-accent bg-accent/10" : "border-line hover:bg-paper-sunken"}`}
              >
                <div className="truncate text-[13px] font-semibold">{b.description}</div>
                <div className="text-[11.5px] text-ink-faint">
                  {formatDate(b.date)} · {formatCurrency(b.remaining, true)} left
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        onOpenChange={onOpenChange}
        title={`Match bills with ${friend.name}`}
        subtitle="Set what you owe them against what they owe you. No money moves."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            {owedToMe.length > 0 && owedByMe.length > 0 && (
              <Button variant="secondary" onClick={matchOldestFirst}>
                Match oldest first
              </Button>
            )}
            <Button onClick={submit} disabled={maxMatch <= 0}>
              {maxMatch > 0 ? `Match ${amount === "" ? formatCurrency(maxMatch / 100, true) : formatCurrency(Number(amount) || 0, true)}` : "Match"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            {column(`${friend.name} owes you`, owedToMe, toMe)}
            {column(`You owe ${friend.name}`, owedByMe, byMe)}
          </div>
          {maxMatch > 0 && (
            <label className="flex items-center gap-3 text-[13px]">
              <span>Amount to match</span>
              <div className="w-32">
                <AmountInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={fromCents(maxMatch)} aria-label="Amount to match" />
              </div>
              <span className="text-ink-faint">up to {formatCurrency(maxMatch / 100, true)}</span>
            </label>
          )}

          <div>
            <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-ink-faint">Matched so far</div>
            {matches.length === 0 ? (
              <p className="text-[12.5px] text-ink-faint">No matches yet.</p>
            ) : (
              <ul className="divide-y divide-dashed divide-line rounded-xl border border-line">
                {matches.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1 text-[13px]">
                      <span className="font-semibold">{m.owedToMe.description}</span> ↔ <span className="font-semibold">{m.owedByMe.description}</span>
                      {m.locked && <div className="text-[11.5px] text-ink-faint">A payment rests on this match.</div>}
                    </div>
                    {editing?.id === m.id ? (
                      <>
                        <div className="w-28">
                          <AmountInput value={editing.amount} onChange={(e) => setEditing({ id: m.id, amount: e.target.value })} aria-label="Matched amount" />
                        </div>
                        <Button size="sm" onClick={() => saveEdit(m)}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="ledger-figure text-[13px]">{formatCurrency(m.amount, true)}</span>
                        <Button size="sm" variant="secondary" onClick={() => setEditing({ id: m.id, amount: fromCents(cents(m.amount)) })}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void guard((rl) => remove.mutateAsync({ id: m.id, removeLinked: rl }), "Match removed.")}>
                          Remove
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
      <ConfirmDialog
        open={locked !== null}
        onOpenChange={(o) => !o && setLocked(null)}
        title="Payments rest on this match"
        message={`${locked?.message ?? ""} Continue to delete those payments together with this change?`}
        confirmLabel="Delete payments and continue"
        onConfirm={() => {
          const retry = locked?.retry;
          setLocked(null);
          void retry?.().catch((e) => toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" }));
        }}
      />
    </>
  );
}
