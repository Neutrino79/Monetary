import type { BillMatch, Id, Transaction } from "@/types";
import type { MatchDto, PaymentDto, SettlementInput } from "@/types/api";
import { http } from "@/lib/api/http";
import { toMajor, toMatch, toTransaction } from "@/lib/api/mappers";

const allocations = (a: SettlementInput["allocations"]) => a.map((x) => ({ billId: x.billId, amount: toMajor(x.amount) }));

export const settlementsService = {
  /** Pay specific bills (one direction). One settlement entry is created per bill. */
  async create(input: SettlementInput): Promise<Transaction[]> {
    const res = await http.post<PaymentDto>("/settlements", {
      friendId: input.friendId, accountId: input.accountId, allocations: allocations(input.allocations),
      date: input.date, note: input.note ?? undefined,
    });
    return res.transactions.map(toTransaction);
  },

  /** Tie a payment recorded before bills were settled one by one to the bills it paid. */
  async assign(entryId: Id, items: SettlementInput["allocations"]): Promise<Transaction[]> {
    const res = await http.post<PaymentDto>(`/settlements/${entryId}/assign`, { allocations: allocations(items) });
    return res.transactions.map(toTransaction);
  },

  /** Only the note of a payment can change. */
  async editNote(entryId: Id, note: string | null): Promise<Transaction> {
    return toTransaction(await http.patch(`/settlements/${entryId}`, { note }));
  },
};

export const matchesService = {
  async create(input: { friendId: Id; owedToMeId: Id; owedByMeId: Id; amount: number }): Promise<BillMatch> {
    return toMatch(await http.post<MatchDto>("/matches", { ...input, amount: toMajor(input.amount) }));
  },

  async update(id: Id, amount: number, removeLinked = false): Promise<BillMatch> {
    return toMatch(await http.patch<MatchDto>(`/matches/${id}`, { amount: toMajor(amount), removeLinked }));
  },

  async remove(id: Id, removeLinked = false): Promise<void> {
    await http.delete(`/matches/${id}`, { removeLinked: removeLinked ? "true" : undefined });
  },
};
