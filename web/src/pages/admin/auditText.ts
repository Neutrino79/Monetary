import type { AuditEntry } from "@/types/admin";

const ACTIONS: Record<string, string> = {
  "user.create": "created an account",
  "user.approve": "approved an account",
  "user.reject": "rejected an account request",
  "user.suspend": "suspended an account",
  "user.reactivate": "reactivated an account",
  "user.reset_password": "reset a password",  // pragma: allowlist secret
  "user.revoke_sessions": "signed an account out everywhere",
  "user.delete": "scheduled an account for deletion",
  "user.restore": "restored an account",
  "user.edit": "edited an account",
  "user.revoke_session": "ended one sign-in",
  "admin.purge": "purged overdue accounts",
  "user.set_role": "changed a role",
};

export const actionLabel = (action: string) => ACTIONS[action] ?? action;

/** The audit detail is a small JSON object; show it as `key: value` pairs, never raw JSON. */
export function detailPairs(detail: string | null): [string, string][] {
  if (!detail) return [];
  try {
    const parsed: unknown = JSON.parse(detail);
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k.replace(/_/g, " "), String(v)]);
    }
  } catch {
    /* not JSON: show it as is below */
  }
  return [["detail", detail]];
}

const label = (id: number, names: Map<number, string>) => names.get(id) ?? `user #${id}`;

export function auditSummary(e: AuditEntry, names: Map<number, string>): string {
  const who = e.actorUserId === null ? "The system" : label(e.actorUserId, names);
  const target = e.targetUserId === null || e.targetUserId === e.actorUserId ? "" : `: ${label(e.targetUserId, names)}`;
  return `${who} ${actionLabel(e.action)}${target}`;
}
