import type { Account, Id, StatementRow } from "@/types";
import type { AccountDto, AccountPatch, NewAccountInput } from "@/types/api";
import { http } from "@/lib/api/http";
import { toAccount, toMajor, toStatementRows, fromMoney, type StatementRowDto } from "@/lib/api/mappers";
import type { MoneyDto } from "@/types/api";

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

  /** Every posting on the account, oldest first, each with the balance after it (a card's balance is what is owed). */
  async statement(id: Id): Promise<StatementRow[]> {
    return toStatementRows(await http.get<StatementRowDto[]>(`/accounts/${id}/statement`));
  },

  /** Tell the ledger what the bank shows; any difference is posted as one adjustment. */
  async reconcile(id: Id, balance: number, date?: string): Promise<{ difference: number; entryId: number | null }> {
    const r = await http.post<{ difference: MoneyDto; entryId: number | null }>(`/accounts/${id}/reconcile`, { balance: toMajor(balance), date });
    return { difference: fromMoney(r.difference), entryId: r.entryId };
  },

  async restore(id: Id): Promise<Account> {
    return toAccount(await http.post<AccountDto>(`/accounts/${id}/reactivate`));
  },
};
