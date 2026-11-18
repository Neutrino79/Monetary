import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminService } from "@/lib/api/services/adminService";
import type { AdminUserFilters } from "@/types/admin";

/** Admin data is account data, never ledger data: it has its own key family and is refetched together. */
export const adminKeys = {
  all: ["admin"] as const,
  stats: ["admin", "stats"] as const,
  users: (f: AdminUserFilters) => ["admin", "users", f] as const,
  audit: (offset: number, limit: number) => ["admin", "audit", offset, limit] as const,
};

/** The pending count drives the badge in the Admin header, so keep it fresh without a reload. */
export const useAdminStats = () =>
  useQuery({ queryKey: adminKeys.stats, queryFn: adminService.stats, refetchInterval: 60_000, retry: 1 });

export const useAdminUsers = (f: AdminUserFilters) =>
  useQuery({ queryKey: adminKeys.users(f), queryFn: () => adminService.listUsers(f), placeholderData: keepPreviousData });

export const useAuditLog = (offset = 0, limit = 25) =>
  useQuery({ queryKey: adminKeys.audit(offset, limit), queryFn: () => adminService.auditLog({ offset, limit }), placeholderData: keepPreviousData });

/** Any account change moves the counts, the lists and the audit trail, so refetch the whole family. */
export function useAdminMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }) });
}

/** id -> "Name (email)" for the audit log, so entries read as people rather than numbers. */
export function useUserNames(): Map<number, string> {
  const { data } = useQuery({ queryKey: [...adminKeys.all, "names"], queryFn: () => adminService.listUsers({ limit: 200 }), staleTime: 30_000 });
  return new Map((data?.items ?? []).map((u) => [u.id, `${u.name} (${u.email})`]));
}
