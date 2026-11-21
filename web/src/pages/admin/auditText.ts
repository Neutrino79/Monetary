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
  "user.unlock": "lifted a sign-in lock",
  "user.register": "requested an account",
  "user.reopen": "reopened a request",
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

/** "Name (email)" down to "Name". */
export const shortName = (full: string) => full.replace(/\s*\(.*\)$/, "");

export type AuditCategory = "decisions" | "security" | "roles" | "profile" | "deletion";

export const AUDIT_CATEGORIES: { id: AuditCategory; label: string }[] = [
  { id: "decisions", label: "Decisions" },
  { id: "security", label: "Security" },
  { id: "roles", label: "Roles" },
  { id: "profile", label: "Profile" },
  { id: "deletion", label: "Deletion" },
];

const CATEGORY_OF: Record<string, AuditCategory> = {
  "user.approve": "decisions", "user.reject": "decisions", "user.reopen": "decisions",
  "user.suspend": "security", "user.reactivate": "security", "user.unlock": "security",
  "user.reset_password": "security", "user.revoke_sessions": "security", "user.revoke_session": "security",  // pragma: allowlist secret
  "user.set_role": "roles",
  "user.register": "decisions", "user.create": "profile", "user.edit": "profile",
  "user.delete": "deletion", "user.restore": "deletion", "admin.purge": "deletion",
};

export const categoryOf = (action: string): AuditCategory | null => CATEGORY_OF[action] ?? null;

/** The pieces of one audit line, for the activity lists: who, what they did, to whom, and the detail. */
export function auditParts(e: AuditEntry, names: Map<number, string>) {
  const actor = e.actorUserId === null ? "Sign-up form" : shortName(label(e.actorUserId, names));
  const target = e.targetUserId === null ? "" : shortName(label(e.targetUserId, names));
  return {
    actor,
    verb: actionLabel(e.action),
    target: e.targetUserId === e.actorUserId ? "" : target,
    extra: detailPairs(e.detail).filter(([k]) => k !== "actor role").map(([k, v]) => `${k}: ${v}`).join(" · "),
  };
}
