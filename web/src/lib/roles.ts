import type { AccountRole } from "@/types";

/** Mirrors the server's ranking: an account may manage only accounts of a strictly lower role (the server enforces it). */
const RANK: Record<AccountRole, number> = { user: 0, admin: 1, superuser: 2 };

export const roleRank = (role: AccountRole | null | undefined): number => (role ? RANK[role] ?? 0 : 0);
export const outranks = (actor: AccountRole | null | undefined, target: AccountRole): boolean => roleRank(actor) > roleRank(target);

export const ROLE_LABEL: Record<AccountRole, string> = { user: "User", admin: "Admin", superuser: "Superuser" };
