import { http } from "@/lib/api/http";
import type { AdminPage, AdminSession, AdminStats, BulkAction, BulkResult, ProfileChanges, AdminUser, AdminUserFilters, AuditEntry, IssuedPassword, NewUserInput, PlatformInfo } from "@/types/admin";
import { saveBlob } from "@/lib/utils/saveBlob";
import type { AccountRole } from "@/types";

const user = (id: number, action: string) => `/admin/users/${id}/${action}`;

/** Superuser-only account administration. The server enforces every rule; the UI only offers what it allows. */
export const adminService = {
  stats: () => http.get<AdminStats>("/admin/stats"),

  /** Superuser only: how the installation is configured and how big it is. */
  platform: () => http.get<PlatformInfo>("/admin/platform"),

  /** The whole audit log as a CSV file, saved through the browser. */
  async exportAuditLog(): Promise<string> {
    const { blob, filename } = await http.download("/admin/audit-log/export", "audit-log.csv");
    saveBlob(blob, filename);
    return filename;
  },

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
  unlock: (id: number) => http.post<AdminUser>(user(id, "unlock")),
  reopen: (id: number) => http.post<AdminUser>(user(id, "reopen")),
  resetPassword: (id: number) => http.post<IssuedPassword>(user(id, "reset-password")),
  revokeSessions: (id: number) => http.post<{ detail: string }>(user(id, "revoke-sessions")),
  remove: (id: number) => http.post<AdminUser>(user(id, "delete")),
  restore: (id: number) => http.post<AdminUser>(user(id, "restore")),
  setRole: (id: number, role: AccountRole) => http.put<AdminUser>(`/admin/users/${id}/role`, { role }),

  getUser: (id: number) => http.get<AdminUser>(`/admin/users/${id}`),
  updateUser: (id: number, changes: ProfileChanges) => http.patch<AdminUser>(`/admin/users/${id}`, changes),
  sessions: (id: number) => http.get<AdminSession[]>(`/admin/users/${id}/sessions`),
  revokeSession: (id: number, sessionId: number) => http.delete<{ detail: string }>(`/admin/users/${id}/sessions/${sessionId}`),
  bulk: (action: BulkAction, userIds: number[], reason?: string) =>
    http.post<BulkResult>("/admin/users/bulk", { action, userIds, reason: reason?.trim() || null }),
  purge: () => http.post<{ purged: number }>("/admin/purge"),
  purgeSelected: (userIds: number[]) => http.post<{ purged: number }>("/admin/purge-selected", { userIds }),

  auditLog: (opts: { limit?: number; offset?: number; userId?: number } = {}) =>
    http.get<AdminPage<AuditEntry>>("/admin/audit-log", { limit: opts.limit ?? 50, offset: opts.offset ?? 0, user_id: opts.userId }),
};
