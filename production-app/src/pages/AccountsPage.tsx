import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Archive, ArchiveRestore } from "lucide-react";
import type { Account, AccountSubtype, AccountType } from "@/types";
import { useAccounts } from "@/hooks/queries";
import { useCreateAccount, useUpdateAccount, useArchiveAccount, useRestoreAccount } from "@/hooks/mutations";
import { useLedgerCalc } from "@/hooks/useLedgerCalc";
import { useToast } from "@/components/ui/Toast";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { AccountChip } from "@/components/domain/chips";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Select, AmountInput, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils/format";

const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "ASSET", label: "Asset (bank, cash, wallet)" },
  { value: "LIABILITY", label: "Liability (credit card, loan)" },
];
const SUBTYPE_OPTIONS: { value: AccountSubtype; label: string }[] = [
  { value: "bank", label: "Bank account" },
  { value: "cash", label: "Cash" },
  { value: "wallet", label: "Wallet" },
  { value: "credit_card", label: "Credit card" },
];

export function AccountsPage() {
  const { data: accounts = [], isLoading } = useAccounts();
  const calc = useLedgerCalc();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [archivingAccount, setArchivingAccount] = useState<Account | null>(null);
  const archiveAccount = useArchiveAccount();
  const restoreAccount = useRestoreAccount();
  const toast = useToast();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => !q || a.name.toLowerCase().includes(q));
  }, [accounts, search]);
  const active = filtered.filter((a) => a.isActive);
  const archived = filtered.filter((a) => !a.isActive);

  async function handleArchive() {
    if (!archivingAccount) return;
    try {
      await archiveAccount.mutateAsync(archivingAccount.id);
      toast.show("Account archived.", { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  async function handleRestore(account: Account) {
    try {
      await restoreAccount.mutateAsync(account.id);
      toast.show("Account restored.", { variant: "success" });
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  if (isLoading) {
    return (
      <div>
        <Skeleton className="mb-6 h-7 w-40" />
        <div className="grid grid-cols-3 gap-4 max-[900px]:grid-cols-1">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">Bank accounts, cash, wallets and credit cards that make up your ledger.</p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus size={15} /> Add account
        </Button>
      </div>

      <div className="mb-5 flex items-center gap-2 rounded-[10px] bg-paper-raised border border-line px-3 py-2 max-w-sm">
        <Search size={15} className="text-ink-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accounts…" className="flex-1 bg-transparent text-[13.3px] outline-none" />
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <Card>
          <EmptyState icon={Search} title="No accounts found" description="Try a different search, or add your first account." />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
            {active.map((a) => (
              <Card key={a.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <AccountChip account={a} />
                    <div className="min-w-0">
                      <div className="truncate text-[14px] font-semibold">{a.name}</div>
                      <div className="text-[11.5px] text-ink-faint">{a.accountType === "LIABILITY" ? "Liability" : "Asset"}{a.isSystem ? " · System" : ""}</div>
                    </div>
                  </div>
                  {!a.isSystem && (
                    <div className="flex gap-1">
                      <button aria-label="Edit account" onClick={() => setEditingAccount(a)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink">
                        <Pencil size={14} />
                      </button>
                      <button aria-label="Archive account" onClick={() => setArchivingAccount(a)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink">
                        <Archive size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="rounded-[10px] bg-paper-sunken p-3">
                  <div className="text-[11px] text-ink-faint">Current balance</div>
                  <div className="ledger-figure text-[18px]">{formatCurrency(calc.calcAccountBalance(a.id))}</div>
                </div>
                {a.creditLimit != null && (
                  <div className="text-[11.5px] text-ink-faint">Credit limit {formatCurrency(a.creditLimit)} · Statement day {a.statementDay}</div>
                )}
              </Card>
            ))}
          </div>

          {archived.length > 0 && (
            <div className="mt-7">
              <div className="mb-3 text-[12.5px] font-bold uppercase tracking-wide text-ink-faint">Archived</div>
              <div className="grid grid-cols-3 gap-4 max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1">
                {archived.map((a) => (
                  <Card key={a.id} className="flex items-center justify-between gap-3 opacity-70">
                    <div className="flex items-center gap-3">
                      <AccountChip account={a} />
                      <div className="truncate text-[13.5px] font-semibold">{a.name}</div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => handleRestore(a)}>
                      <ArchiveRestore size={13} /> Restore
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <AccountForm open={addOpen} onOpenChange={setAddOpen} />
      <AccountForm open={!!editingAccount} onOpenChange={(o) => !o && setEditingAccount(null)} editingAccount={editingAccount} />
      <ConfirmDialog
        open={!!archivingAccount}
        onOpenChange={(o) => !o && setArchivingAccount(null)}
        title="Archive this account?"
        message="Archived accounts stop showing up when adding new transactions, but their history stays intact and they can be restored any time."
        confirmLabel="Archive"
        variant="primary"
        onConfirm={handleArchive}
      />
    </div>
  );
}

function AccountForm({ open, onOpenChange, editingAccount = null }: { open: boolean; onOpenChange: (o: boolean) => void; editingAccount?: Account | null }) {
  const isEdit = !!editingAccount;
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();
  const toast = useToast();
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("ASSET");
  const [subtype, setSubtype] = useState<AccountSubtype>("bank");
  const [openingBalance, setOpeningBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editingAccount?.name ?? "");
    setAccountType(editingAccount?.accountType === "LIABILITY" ? "LIABILITY" : "ASSET");
    setSubtype(editingAccount?.subtype ?? "bank");
    setOpeningBalance(editingAccount ? String(editingAccount.openingBalance) : "");
    setCreditLimit(editingAccount?.creditLimit != null ? String(editingAccount.creditLimit) : "");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingAccount]);

  async function submit() {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Enter an account name.";
    if (Object.keys(newErrors).length) return setErrors(newErrors);

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        accountType,
        subtype,
        openingBalance: parseFloat(openingBalance) || 0,
        ...(accountType === "LIABILITY" && creditLimit ? { creditLimit: parseFloat(creditLimit) || 0 } : {}),
      };
      if (isEdit && editingAccount) {
        await updateAccount.mutateAsync({ id: editingAccount.id, patch: payload });
        toast.show("Account updated.", { variant: "success" });
      } else {
        await createAccount.mutateAsync(payload);
        toast.show("Account added.", { variant: "success" });
      }
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
      title={isEdit ? "Edit account" : "Add an account"}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add account"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormField label="Account name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Bank Savings" />
        </FormField>
        <FormField label="Type">
          <Select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Subtype">
          <Select value={subtype} onChange={(e) => setSubtype(e.target.value as AccountSubtype)}>
            {SUBTYPE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Opening balance" hint="What the account held before you started tracking it here.">
          <AmountInput value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
        </FormField>
        {accountType === "LIABILITY" && (
          <FormField label="Credit limit (optional)">
            <AmountInput value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0.00" />
          </FormField>
        )}
      </div>
    </Modal>
  );
}

