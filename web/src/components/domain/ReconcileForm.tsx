import { useState } from "react";
import type { Account } from "@/types";
import { useReconcileAccount } from "@/hooks/mutations";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { AmountInput, FormField } from "@/components/ui/form";
import { formatCurrency } from "@/lib/utils/format";

/** "What does your bank say?" -- any difference is recorded as one adjustment so the ledger matches the bank. */
export function ReconcileForm(props: { account: Account | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  // a fresh form every time it opens
  return <ReconcileDialog key={String(props.open)} {...props} />;
}

function ReconcileDialog({ account, open, onOpenChange }: { account: Account | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const reconcile = useReconcileAccount();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  if (!account) return null;
  const isCard = account.accountType === "LIABILITY";
  const entered = value.trim() === "" ? null : Number(value);
  const valid = entered != null && Number.isFinite(entered) && entered >= 0;
  const diff = valid ? Math.round((entered - account.balance) * 100) / 100 : null;

  async function submit() {
    if (!account) return;
    if (!valid) return setError(isCard ? "Enter the amount owed on your statement." : "Enter the balance your bank shows.");
    try {
      const r = await reconcile.mutateAsync({ id: account.id, balance: entered });
      toast.show(r.entryId == null ? "Already matched — nothing to change." : "Balance matched to your bank.", { variant: "success" });
      onOpenChange(false);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : "Something went wrong.", { variant: "error" });
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Reconcile ${account.name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={reconcile.isPending}>{reconcile.isPending ? "Saving…" : "Match to bank"}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-ink-soft">
          Monetary currently shows <strong className="ledger-figure">{formatCurrency(account.balance, true)}</strong>{isCard ? " owed" : ""}. Enter what your {isCard ? "card statement" : "bank"} says and any difference is recorded as an adjustment.
        </p>
        <FormField label={isCard ? "Amount owed per statement" : "Balance per bank"} error={error}>
          <AmountInput value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" />
        </FormField>
        {diff != null && (
          <div role="status" className="rounded-[10px] bg-paper-sunken px-3 py-2.5 text-[13px]">
            {diff === 0
              ? "Already matched — nothing to record."
              : `A ${formatCurrency(Math.abs(diff), true)} adjustment will be recorded (${isCard ? (diff > 0 ? "more owed" : "less owed") : diff > 0 ? "balance goes up" : "balance goes down"}).`}
          </div>
        )}
      </div>
    </Modal>
  );
}
