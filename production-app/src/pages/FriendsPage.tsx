import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Mail, Phone, HandCoins, Pencil, Trash2 } from "lucide-react";
import type { Friend } from "@/types";
import { useFriends } from "@/hooks/queries";
import { useCreateFriend, useUpdateFriend, useDeleteFriend, useSettleFriend } from "@/hooks/mutations";
import { useLedgerCalc } from "@/hooks/useLedgerCalc";
import { useAccounts } from "@/hooks/queries";
import { useToast } from "@/components/ui/Toast";
import { Card, Avatar, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Select, AmountInput, Textarea, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils/format";
import { today } from "@/lib/utils/clock";

export function FriendsPage() {
  const { data: friends = [], isLoading } = useFriends();
  const calc = useLedgerCalc();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [settlingFriend, setSettlingFriend] = useState<Friend | null>(null);
  const [deletingFriend, setDeletingFriend] = useState<Friend | null>(null);
  const deleteFriend = useDeleteFriend();
  const toast = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((f) => (f.name + " " + f.email).toLowerCase().includes(q));
  }, [friends, search]);

  async function handleDelete() {
    if (!deletingFriend) return;
    try {
      await deleteFriend.mutateAsync(deletingFriend.id);
      toast.show("Friend removed.", { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Couldn't remove this friend.", { variant: "error" });
    }
  }

  if (isLoading) {
    return (
      <div>
        <Skeleton className="mb-6 h-7 w-40" />
        <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Friends</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">People you split expenses with, and your net position with each.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add friend
        </Button>
      </div>

      <div className="mb-5 flex items-center gap-2 rounded-[10px] bg-paper-raised border border-line px-3 py-2 max-w-sm">
        <Search size={15} className="text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search friends…" className="flex-1 bg-transparent text-[13.3px] outline-none" />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No friends found" description="Try a different search, or add your first friend." />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
          {filtered.map((f) => {
            const bal = calc.calcFriendOutstanding(f.id);
            return (
              <Card key={f.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={f.name} color={f.color} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{f.name}</div>
                      <div className="flex items-center gap-1 truncate text-[11.5px] text-ink-faint">
                        <Mail size={11} /> {f.email}
                      </div>
                      {f.phone && (
                        <div className="flex items-center gap-1 truncate text-[11.5px] text-ink-faint">
                          <Phone size={11} /> {f.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button aria-label="Edit friend" onClick={() => setEditingFriend(f)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink">
                      <Pencil size={14} />
                    </button>
                    <button aria-label="Delete friend" onClick={() => setDeletingFriend(f)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="rounded-[10px] bg-paper-sunken p-3">
                  <div className="text-[11px] text-ink-faint">{Math.abs(bal) < 0.5 ? "Settled up" : bal > 0 ? "Owes you" : "You owe"}</div>
                  <div className={`ledger-figure text-[18px] ${bal > 0.5 ? "text-accent" : bal < -0.5 ? "text-negative" : ""}`}>{formatCurrency(Math.abs(bal))}</div>
                </div>

                <Button variant="secondary" size="sm" onClick={() => setSettlingFriend(f)} disabled={Math.abs(bal) < 0.5}>
                  <HandCoins size={14} /> Settle up
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <FriendForm open={addOpen} onOpenChange={setAddOpen} />
      <FriendForm open={!!editingFriend} onOpenChange={(o) => !o && setEditingFriend(null)} editingFriend={editingFriend} />
      <SettleForm friend={settlingFriend} open={!!settlingFriend} onOpenChange={(o) => !o && setSettlingFriend(null)} />
      <ConfirmDialog
        open={!!deletingFriend}
        onOpenChange={(o) => !o && setDeletingFriend(null)}
        title="Remove this friend?"
        message={`This only works if ${deletingFriend?.name ?? "they"} have no ledger history — otherwise archive by leaving them off future splits instead.`}
        confirmLabel="Remove"
        onConfirm={handleDelete}
      />
    </div>
  );
}

function FriendForm({ open, onOpenChange, editingFriend = null }: { open: boolean; onOpenChange: (o: boolean) => void; editingFriend?: Friend | null }) {
  const isEdit = !!editingFriend;
  const createFriend = useCreateFriend();
  const updateFriend = useUpdateFriend();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editingFriend?.name ?? "");
    setEmail(editingFriend?.email ?? "");
    setPhone(editingFriend?.phone ?? "");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingFriend]);

  async function submit() {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Enter a name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = "Enter a valid email.";
    if (Object.keys(newErrors).length) return setErrors(newErrors);

    setSaving(true);
    try {
      if (isEdit && editingFriend) {
        await updateFriend.mutateAsync({ id: editingFriend.id, patch: { name: name.trim(), email: email.trim(), phone: phone.trim() || null } });
        toast.show("Friend updated.", { variant: "success" });
      } else {
        await createFriend.mutateAsync({ name: name.trim(), email: email.trim(), phone: phone.trim() || null });
        toast.show("Friend added.", { variant: "success" });
        setName("");
        setEmail("");
        setPhone("");
      }
      setErrors({});
      onOpenChange(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit friend" : "Add a friend"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add friend"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </FormField>
        <FormField label="Email" error={errors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </FormField>
        <FormField label="Phone (optional)">
          <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
        </FormField>
      </div>
    </Modal>
  );
}

function SettleForm({ friend, open, onOpenChange }: { friend: Friend | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data: accounts = [] } = useAccounts();
  const calc = useLedgerCalc();
  const settle = useSettleFriend();
  const toast = useToast();
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [memo, setMemo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountId("");
    setAmount("");
    setDate(today());
    setMemo("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, friend?.id]);

  if (!friend) return null;
  const bal = calc.calcFriendOutstanding(friend.id);
  const direction: "receive" | "pay" = bal > 0 ? "receive" : "pay";

  async function submit() {
    if (!accountId) return setError("Select an account.");
    const amt = parseFloat(amount);
    if (!(amt > 0)) return setError("Enter an amount greater than 0.");
    setSaving(true);
    try {
      await settle.mutateAsync({ friendId: friend!.id, accountId, amount: amt, direction, memo: memo.trim() || null, date });
      toast.show("Settlement recorded.", { variant: "success" });
      onOpenChange(false);
      setAmount("");
      setMemo("");
      setAccountId("");
      setError("");
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Settle up with ${friend.name}`}
      subtitle={direction === "receive" ? `They owe you ${formatCurrency(Math.abs(bal))}` : `You owe them ${formatCurrency(Math.abs(bal))}`}
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
        <FormField label={direction === "receive" ? "Deposit to account" : "Pay from account"} error={error.includes("account") ? error : undefined}>
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
        <FormField label="Amount" error={error.includes("amount") ? error : undefined}>
          <AmountInput value={amount} max={Math.abs(bal)} onChange={(e) => setAmount(e.target.value)} placeholder={String(Math.abs(bal))} />
        </FormField>
        <FormField label="Date">
          <Input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Memo (optional)">
          <Textarea rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
