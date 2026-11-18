import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import type { AccountStatus } from "@/types";
import { Badge } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/form";
import { FormField } from "@/components/ui/form";

const STATUS: Record<AccountStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-accent-soft text-accent" },
  pending_approval: { label: "Pending approval", className: "bg-warn-soft text-warn" },
  rejected: { label: "Rejected", className: "bg-paper-sunken text-ink-soft" },
  suspended: { label: "Suspended", className: "bg-danger-soft text-danger" },
  pending_delete: { label: "Pending deletion", className: "bg-danger-soft text-danger" },
};

export function StatusBadge({ status }: { status: AccountStatus }) {
  const s = STATUS[status] ?? { label: status, className: "bg-paper-sunken text-ink-soft" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

export const statusLabel = (status: string) => STATUS[status as AccountStatus]?.label ?? status;

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Shows a temporary password exactly once. The server never returns it again and never logs it, so
 * the administrator has to pass it on before closing this.
 */
export function TemporaryPasswordDialog({
  email, password, onClose,
}: { email: string; password: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(password ?? "");
      setCopied(true);
    } catch {
      /* clipboard blocked: the password is still on screen to copy by hand */
    }
  }
  return (
    <Modal
      open={password !== null}
      onOpenChange={(o) => { if (!o) { setCopied(false); onClose(); } }}
      title="Temporary password"
      subtitle={email}
      size="sm"
      footer={<Button onClick={() => { setCopied(false); onClose(); }}>I have passed it on</Button>}
    >
      <div className="mb-3 flex items-start gap-2 rounded-[10px] bg-warn-soft px-3 py-3 text-[12.8px] text-warn">
        <TriangleAlert size={15} className="mt-0.5 flex-none" />
        This is shown only once. Share it with the user privately; they must choose their own password at first sign-in.
      </div>
      <div className="flex items-center gap-2">
        <code data-testid="temporary-password" className="flex-1 select-all rounded-[10px] bg-paper-sunken px-3 py-2.5 font-mono text-[14px]">
          {password}
        </code>
        <Button variant="secondary" size="sm" onClick={copy} aria-label="Copy password">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </Modal>
  );
}

/** Asks for an optional reason before a reject or suspend. */
export function ReasonDialog({
  open, title, subtitle, confirmLabel, onCancel, onConfirm,
}: {
  open: boolean; title: string; subtitle: string; confirmLabel: string;
  onCancel: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal
      open={open}
      onOpenChange={(o) => { if (!o) { setReason(""); onCancel(); } }}
      title={title}
      subtitle={subtitle}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => { setReason(""); onCancel(); }}>Cancel</Button>
          <Button variant="danger" onClick={() => { onConfirm(reason); setReason(""); }}>{confirmLabel}</Button>
        </>
      }
    >
      <FormField label="Reason (optional)" htmlFor="admin-reason" hint="Shown to the user and kept in the audit log">
        <Textarea id="admin-reason" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </FormField>
    </Modal>
  );
}
