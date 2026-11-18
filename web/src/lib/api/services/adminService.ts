import { http } from "@/lib/api/http";
import type { AdminPage, AdminStats, AdminUser, AdminUserFilters, AuditEntry, IssuedPassword, NewUserInput } from "@/types/admin";
import type { AccountRole } from "@/types";

const user = (id: number, action: string) => `/admin/users/${id}/${action}`;

/** Superuser-only account administration. The server enforces every rule; the UI only offers what it allows. */
export const adminService = {
  stats: () => http.get<AdminStats>("/admin/stats"),

  listUsers: (f: AdminUserFilters = {}) =>
    http.get<AdminPage<AdminUser>>("/admin/users", { status: f.status || undefined, q: f.q?.trim() || undefined, limit: f.limit ?? 50, offset: f.offset ?? 0 }),

  createUser: (input: NewUserInput) =>
    http.post<IssuedPassword>("/admin/users", {
      name: input.name, email: input.email, currency: input.homeCurrencyCode, timezone: input.timezone || undefined, role: input.role,
    }),

  approve: (id: number) => http.post<AdminUser>(user(id, "approve")),
  reject: (id: number, reason?: string) => http.post<AdminUser>(user(id, "reject"), { reason: reason?.trim() || null }),
  suspend: (id: number, reason?: string) => http.post<AdminUser>(user(id, "suspend"), { reason: reason?.trim() || null }),
  reactivate: (id: number) => http.post<AdminUser>(user(id, "reactivate")),
  resetPassword: (id: number) => http.post<IssuedPassword>(user(id, "reset-password")),
  revokeSessions: (id: number) => http.post<{ detail: string }>(user(id, "revoke-sessions")),
  remove: (id: number) => http.post<AdminUser>(user(id, "delete")),
  restore: (id: number) => http.post<AdminUser>(user(id, "restore")),
  setRole: (id: number, role: AccountRole) => http.put<AdminUser>(`/admin/users/${id}/role`, { role }),

  auditLog: (opts: { limit?: number; offset?: number; userId?: number } = {}) =>
    http.get<AdminPage<AuditEntry>>("/admin/audit-log", { limit: opts.limit ?? 50, offset: opts.offset ?? 0, user_id: opts.userId }),
};
