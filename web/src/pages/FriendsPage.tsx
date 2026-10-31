import { ListToolbar } from "@/components/list/ListToolbar";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Mail, Phone, HandCoins, Pencil, Trash2, ScrollText } from "lucide-react";
import type { Friend } from "@/types";
import { useFriendBalances, useFriends } from "@/hooks/queries";
import { useCreateFriend, useUpdateFriend, useDeleteFriend } from "@/hooks/mutations";
import { ApiError } from "@/lib/api/errors";
import { SettleForm } from "@/components/domain/SettleForm";
import { FriendStatement } from "@/components/domain/FriendStatement";
import { useToast } from "@/components/ui/Toast";
import { Card, Avatar, EmptyState, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Dialog";
import { Input, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils/format";
import { useFormErrors } from "@/lib/hooks/useFormErrors";

export function FriendsPage() {
  const { data: friends = [], isLoading } = useFriends();
  const { data: balances = [] } = useFriendBalances();
  const balanceOf = (id: number) => balances.find((b) => b.friendId === id)?.balance ?? 0;
  const frontedUnpaidOf = (id: number) => balances.find((b) => b.friendId === id)?.frontedUnpaid ?? 0;
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [settlingFriend, setSettlingFriend] = useState<Friend | null>(null);
  const [statementFriend, setStatementFriend] = useState<Friend | null>(null);
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
            <Skeleton key={i} className="h-40 rounded-card" />
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
          <p className="mt-1 text-body text-ink-soft">People you split expenses with, and your net position with each.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add friend
        </Button>
      </div>

      <ListToolbar search={{ value: search, onChange: setSearch, placeholder: "Search friends…" }} />

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No friends found" description="Try a different search, or add your first friend." />
        </Card>
      ) : (
        <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
          {filtered.map((f) => {
            const bal = balanceOf(f.id); // computed by the backend; positive = they owe you
            const pending = frontedUnpaidOf(f.id); // what they paid for you that you have not repaid
            return (
              <Card key={f.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={f.name} color={f.color} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{f.name}</div>
                      <div className="flex items-center gap-1 truncate text-micro text-ink-faint">
                        <Mail size={11} /> {f.email}
                      </div>
                      {f.phone && (
                        <div className="flex items-center gap-1 truncate text-micro text-ink-faint">
                          <Phone size={11} /> {f.phone}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button aria-label="Edit friend" onClick={() => setEditingFriend(f)} className="rounded-control p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink">
                      <Pencil size={14} />
                    </button>
                    <button aria-label="Delete friend" onClick={() => setDeletingFriend(f)} className="rounded-control p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="rounded-control bg-paper-sunken p-3">
                  <div className="text-micro text-ink-faint">{bal === 0 ? "Settled up" : bal > 0 ? "Owes you" : "You owe"}</div>
                  <div className={`ledger-figure text-[18px] ${bal > 0 ? "text-accent" : bal < 0 ? "text-negative" : ""}`}>{formatCurrency(Math.abs(bal), true)}</div>
                  {pending > 0 && (
                    <div className="mt-1.5 inline-flex items-center rounded-full bg-info-soft px-2 py-0.5 text-micro font-semibold text-info">
                      Paid for you, not paid back: {formatCurrency(pending, true)}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1" variant={bal < 0 ? "primary" : "secondary"} size="sm" onClick={() => setSettlingFriend(f)} disabled={bal === 0}>
                    <HandCoins size={14} /> {bal < 0 ? `Pay back ${formatCurrency(Math.abs(bal), true)}` : "Settle up"}
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Statement with ${f.name}`} onClick={() => setStatementFriend(f)}>
                    <ScrollText size={14} /> Statement
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <FriendForm open={addOpen} onOpenChange={setAddOpen} />
      <FriendForm open={!!editingFriend} onOpenChange={(o) => !o && setEditingFriend(null)} editingFriend={editingFriend} />
      <FriendStatement friend={statementFriend} open={!!statementFriend} onOpenChange={(o) => !o && setStatementFriend(null)} />
      <SettleForm friend={settlingFriend} open={!!settlingFriend} onOpenChange={(o) => !o && setSettlingFriend(null)} />
      <ConfirmDialog
        open={!!deletingFriend}
        onOpenChange={(o) => !o && setDeletingFriend(null)}
        title="Remove this friend?"
        message={`This only works if ${deletingFriend?.name ?? "they"} has no transaction history. Otherwise the server will refuse — you can rename them instead.`}
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
  const { errors, setErrors } = useFormErrors({ name, email, phone, "*": [name, email, phone] });
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
      if (ApiError.isApiError(e) && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
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
        <FormField label="Phone (optional)" error={errors.phone}>
          <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} placeholder="+91 …" />
        </FormField>
      </div>
    </Modal>
  );
}
