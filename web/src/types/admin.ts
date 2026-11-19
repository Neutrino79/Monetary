/** Wire shapes of the Admin API (superusers only). */
import type { AccountRole, AccountStatus } from "@/types";

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: AccountRole;
  status: AccountStatus;
  statusReason: string | null;
  mustChangePassword: boolean;
  timezone: string | null;
  homeCurrencyCode: string | null;
  plan: string | null;
  accessUntil: string | null;
  deleteAfter: string | null;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  passwordExpiresAt: string | null;
  rerequestCount: number;
  approvedAt: string | null;
  approvedBy: number | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string | null;
  storageBytes: number | null;
}

export interface AdminPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminStats {
  totalUsers: number;
  byStatus: Record<string, number>;
  pendingApproval: number;
  activeSuperusers: number;
  activeAdmins: number;
  overdueForPurge: number;
  ledgerCount: number;
  ledgerBytes: number;
}

export interface AuditEntry {
  id: number;
  at: string;
  actorUserId: number | null;
  action: string;
  targetUserId: number | null;
  /** A small JSON object as text (never a password), or null. */
  detail: string | null;
  ip: string | null;
}

/** A newly issued temporary password. It is shown once and cannot be fetched again. */
export interface IssuedPassword {
  user: AdminUser;
  temporaryPassword: string;
}

export interface NewUserInput {
  name: string;
  email: string;
  homeCurrencyCode: string;
  timezone?: string;
  role: AccountRole;
}

export interface AdminUserFilters {
  status?: AccountStatus | "";
  q?: string;
  limit?: number;
  offset?: number;
}

export interface AdminSession {
  id: number;
  createdAt: string;
  expiresAt: string;
  lastSeenAt: string | null;
  ip: string | null;
  userAgent: string | null;
}

export type BulkAction = "approve" | "reject" | "suspend" | "reactivate";

export interface BulkResult {
  action: BulkAction;
  succeeded: number;
  failed: number;
  results: { userId: number; ok: boolean; error: string | null }[];
}

export interface ProfileChanges {
  name?: string;
  email?: string;
  timezone?: string;
}
