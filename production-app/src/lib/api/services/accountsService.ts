import type { Account, Id } from "@/types";
import type { AccountDto, AccountPatch, NewAccountInput } from "@/types/api";
import { http } from "@/lib/api/http";
import { toAccount, toMajor } from "@/lib/api/mappers";

const money = (n: number | null | undefined) => (n == null ? n : toMajor(n));

export const accountsService = {
  async list(includeInactive = true): Promise<Account[]> {
    return (await http.get<AccountDto[]>("/accounts", { includeInactive })).map(toAccount);
  },

  async create(input: NewAccountInput): Promise<Account> {
    return toAccount(await http.post<AccountDto>("/accounts", {
      name: input.name, type: input.accountType, currency: input.currency, subtype: input.subtype,
      creditLimit: money(input.creditLimit) ?? undefined, statementDay: input.statementDay ?? undefined,
      openingBalance: input.openingBalance ? toMajor(input.openingBalance) : undefined,
    }));
  },

  async update(id: Id, patch: AccountPatch): Promise<Account> {
    const body: Record<string, unknown> = { ...patch };
    if ("creditLimit" in patch) body.creditLimit = money(patch.creditLimit);
    return toAccount(await http.patch<AccountDto>(`/accounts/${id}`, body));
  },

  async archive(id: Id): Promise<Account> {
    return toAccount(await http.post<AccountDto>(`/accounts/${id}/deactivate`));
  },

  async restore(id: Id): Promise<Account> {
    return toAccount(await http.post<AccountDto>(`/accounts/${id}/reactivate`));
  },
};
