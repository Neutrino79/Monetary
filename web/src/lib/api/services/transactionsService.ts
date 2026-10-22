import type { Id, Page, Transaction, TransactionGroup } from "@/types";
import type {
  NewTransactionInput, PageDto, SettlementInput, TransactionDto, TransactionFilters, TransactionGroupsDto, TransactionPatch, TransactionWriteOptions,
} from "@/types/api";
import { http } from "@/lib/api/http";
import { toMajor, toPage, toTransaction, toTransactionGroup } from "@/lib/api/mappers";

function body(input: Partial<NewTransactionInput>) {
  const { amount, yourShare, splits, ...rest } = input;
  return {
    ...rest,
    ...(amount !== undefined ? { amount: toMajor(amount) } : {}),
    ...(yourShare !== undefined ? { yourShare: toMajor(yourShare) } : {}),
    ...(splits ? { splits: splits.map((s) => ({ friendId: s.friendId, share: toMajor(s.share) })) } : {}),
  };
}

export const transactionsService = {
  /** Filtering, sorting and paging all happen on the server. */
  async list(filters: TransactionFilters = {}): Promise<Page<Transaction>> {
    const page = await http.get<PageDto<TransactionDto>>("/transactions", { ...filters });
    return toPage(page, toTransaction);
  },

  /** Header data (count, money in/out) for each group of a grouped list; same filters as `list`. */
  async groups(filters: TransactionFilters & { groupBy: NonNullable<TransactionFilters["groupBy"]> }): Promise<TransactionGroup[]> {
    const { limit: _l, offset: _o, sort: _s, ...rest } = filters;
    const res = await http.get<TransactionGroupsDto>("/transactions/groups", { ...rest });
    return res.groups.map(toTransactionGroup);
  },

  async get(id: Id): Promise<Transaction> {
    return toTransaction(await http.get<TransactionDto>(`/transactions/${id}`));
  },

  async create(input: NewTransactionInput): Promise<Transaction> {
    return toTransaction(await http.post<TransactionDto>("/transactions", body(input)));
  },

  /** In STRICT mode the result is a *new* transaction (`correctionOf` points at the original). */
  async update(id: Id, patch: TransactionPatch, opts: TransactionWriteOptions = {}): Promise<Transaction> {
    return toTransaction(await http.patch<TransactionDto>(`/transactions/${id}`, { ...body(patch), ...opts }));
  },

  async remove(id: Id, opts: TransactionWriteOptions = {}): Promise<void> {
    await http.delete(`/transactions/${id}`, { force: opts.force, removeSettlements: opts.removeSettlements });
  },

  /** Settle up with a friend. The server derives the direction from the balance and rejects a mismatch. */
  async settle(input: SettlementInput): Promise<Transaction> {
    return transactionsService.create({
      type: "settlement", description: "Settlement", date: input.date ?? "", amount: input.amount,
      friendId: input.friendId, accountId: input.accountId, direction: input.direction, memo: input.memo,
    });
  },
};

export type { TransactionFilters };
