import { ListToolbar } from "@/components/list/ListToolbar";
import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Pencil, Archive, ArchiveRestore } from "lucide-react";
import type { Account, AccountSubtype, AccountType } from "@/types";
import { useAccounts } from "@/hooks/queries";
import { useCreateAccount, useUpdateAccount, useArchiveAccount, useRestoreAccount } from "@/hooks/mutations";
import { useAuthStore } from "@/store/authStore";
import { ApiError } from "@/lib/api/errors";
import { useToast } from "@/components/ui/Toast";
import { Card, EmptyState, Skeleton } from "@/components/ui/primitives";
import { AccountChip } from "@/components/domain/chips";
import { Button } from "@/components/ui/Button";
import { Modal, ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Select, AmountInput, FormField } from "@/components/ui/form";
import { AccountActivity } from "@/components/domain/AccountActivity";
import { formatCurrency, relativeDate } from "@/lib/utils/format";
import { cardStats, statementText } from "@/lib/utils/creditCard";
import { useFormErrors } from "@/lib/hooks/useFormErrors";

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
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [archivingAccount, setArchivingAccount] = useState<Account | null>(null);
  const [activityId, setActivityId] = useState<number | null>(null);
  const [now] = useState(() => new Date());
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

      <ListToolbar search={{ value: search, onChange: setSearch, placeholder: "Search accounts…" }} />

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
                      <button type="button" onClick={() => setActivityId(a.id)} aria-label={`${a.name} activity`} className="block max-w-full truncate text-left text-[14px] font-semibold hover:underline">
                        {a.name}
                      </button>
                      <div className="text-[11.5px] text-ink-faint">{a.accountType === "LIABILITY" ? "Liability" : "Asset"}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                      <button aria-label="Edit account" onClick={() => setEditingAccount(a)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink">
                        <Pencil size={14} />
                      </button>
                      <button aria-label="Archive account" onClick={() => setArchivingAccount(a)} className="rounded-[8px] p-1.5 text-ink-faint hover:bg-paper-sunken hover:text-ink">
                        <Archive size={14} />
                      </button>
                    </div>
                </div>
                <div className="rounded-[10px] bg-paper-sunken p-3">
                  <div className="text-[11px] text-ink-faint">{a.accountType === "LIABILITY" ? "Amount owed" : "Current balance"}</div>
                  <div className="ledger-figure text-[18px]">{formatCurrency(a.balance, true)}</div>
                </div>
                {a.accountType === "LIABILITY" && <CardFigures account={a} now={now} />}
                <div className="text-[11.5px] text-ink-faint">{a.lastActivity ? `Last activity ${relativeDate(a.lastActivity).toLowerCase()}` : "No activity yet"}</div>
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

      <AccountActivity account={accounts.find((a) => a.id === activityId) ?? null} open={activityId != null} onOpenChange={(o) => !o && setActivityId(null)} />
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
  const currency = useAuthStore((s) => s.user?.homeCurrencyCode ?? "INR");
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState<AccountType>("ASSET");
  const [subtype, setSubtype] = useState<AccountSubtype>("bank");
  const [openingBalance, setOpeningBalance] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [statementDay, setStatementDay] = useState("");
  const { errors, setErrors } = useFormErrors({ name, openingBalance, creditLimit, statementDay, "*": [name, openingBalance, creditLimit, statementDay] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(editingAccount?.name ?? "");
    setAccountType(editingAccount?.accountType === "LIABILITY" ? "LIABILITY" : "ASSET");
    setSubtype(editingAccount?.subtype ?? "bank");
    setOpeningBalance("");
    setCreditLimit(editingAccount?.creditLimit != null ? String(editingAccount.creditLimit) : "");
    setStatementDay(editingAccount?.statementDay != null ? String(editingAccount.statementDay) : "");
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingAccount]);

  function changeType(next: AccountType) {
    setAccountType(next);
    // subtype must match the account type (the backend enforces the same pairing)
    setSubtype(next === "LIABILITY" ? "credit_card" : "bank");
  }

  async function submit() {
    const newErrors: Record<string, string> = {};
    const limit = creditLimit.trim() === "" ? null : Number(creditLimit);
    const day = statementDay.trim() === "" ? null : Number(statementDay);
    const opening = openingBalance.trim() === "" ? undefined : Number(openingBalance);
    if (!name.trim()) newErrors.name = "Enter an account name.";
    if (limit != null && (!Number.isFinite(limit) || limit <= 0)) newErrors.creditLimit = "Enter a credit limit above zero.";
    if (day != null && (!Number.isInteger(day) || day < 1 || day > 31)) newErrors.statementDay = "Enter a day between 1 and 31.";
    if (opening != null && (!Number.isFinite(opening) || opening < 0)) newErrors.openingBalance = "Opening balance can't be negative.";
    if (Object.keys(newErrors).length) return setErrors(newErrors);

    setSaving(true);
    try {
      if (isEdit && editingAccount) {
        await updateAccount.mutateAsync({
          id: editingAccount.id,
          patch: { name: name.trim(), subtype, ...(accountType === "LIABILITY" ? { creditLimit: limit, statementDay: day } : {}) },
        });
        toast.show("Account updated.", { variant: "success" });
      } else {
        await createAccount.mutateAsync({
          name: name.trim(), accountType, subtype, currency, openingBalance: opening,
          ...(accountType === "LIABILITY" ? { creditLimit: limit, statementDay: day } : {}),
        });
        toast.show("Account added.", { variant: "success" });
      }
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
          <Select value={accountType} disabled={isEdit} onChange={(e) => changeType(e.target.value as AccountType)}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Subtype">
          <Select value={subtype} onChange={(e) => setSubtype(e.target.value as AccountSubtype)}>
            {SUBTYPE_OPTIONS.filter((o) => (accountType === "LIABILITY") === (o.value === "credit_card")).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </FormField>
        {!isEdit && (
          <FormField
            label={accountType === "LIABILITY" ? "Amount already owed (optional)" : "Opening balance (optional)"}
            hint="Recorded once as an opening-balance entry; later corrections are made with adjustments."
            error={errors.openingBalance}
          >
            <AmountInput value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} placeholder="0.00" />
          </FormField>
        )}
        {accountType === "LIABILITY" && (
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Credit limit (optional)" error={errors.creditLimit}>
              <AmountInput value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Statement day (optional)" error={errors.statementDay}>
              <Select value={statementDay} onChange={(e) => setStatementDay(e.target.value)}>
                <option value="">Not set</option>
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {i + 1}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Available credit, how much of the limit is used, and when the next statement lands. */
function CardFigures({ account, now }: { account: Account; now: Date }) {
  const c = cardStats(account, now);
  if (c.available == null && c.daysToStatement == null) return null;
  const pct = c.utilisationPct ?? 0;
  return (
    <div className="flex flex-col gap-1.5 text-[11.5px] text-ink-soft">
      {c.available != null && c.utilisationPct != null && (
        <>
          <div className="flex justify-between">
            <span>{formatCurrency(c.available)} available of {formatCurrency(account.creditLimit)}</span>
            <span className={pct >= 80 ? "text-negative" : ""}>{Math.round(pct)}% used</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-paper-sunken" role="img" aria-label={`${Math.round(pct)}% of the credit limit used`}>
            <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: pct >= 80 ? "var(--negative)" : "var(--accent)" }} />
          </div>
        </>
      )}
      {c.daysToStatement != null && <div>{statementText(c.daysToStatement)} (day {account.statementDay})</div>}
    </div>
  );
}
