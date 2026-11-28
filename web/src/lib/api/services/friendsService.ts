import type { Bill, BillMatch, Friend, FriendBalance, Id, StatementRow, Transaction } from "@/types";
import type { BillDto, FriendDto, FriendPatch, MatchDto, NewFriendInput, TransactionDto } from "@/types/api";
import { http } from "@/lib/api/http";
import { toBill, toFriend, toFriendBalance, toMatch, toStatementRows, toTransaction, type StatementRowDto } from "@/lib/api/mappers";

export const friendsService = {
  async list(): Promise<Friend[]> {
    return (await http.get<FriendDto[]>("/friends")).map(toFriend);
  },

  async create(input: NewFriendInput): Promise<Friend> {
    return toFriend(await http.post<FriendDto>("/friends", input));
  },

  async update(id: Id, patch: FriendPatch): Promise<Friend> {
    return toFriend(await http.patch<FriendDto>(`/friends/${id}`, patch));
  },

  /** The backend refuses (409) when the friend has any transaction history. */
  async remove(id: Id): Promise<void> {
    await http.delete(`/friends/${id}`);
  },

  /** Positive = they owe you; negative = you owe them. Computed by the backend. */
  async balances(): Promise<FriendBalance[]> {
    const rows = await http.get<Parameters<typeof toFriendBalance>[0][]>("/friends/balances");
    return rows.map(toFriendBalance);
  },

  /** Every shared expense and settlement with one friend, oldest first, each with the balance after it. */
  async statement(id: Id): Promise<StatementRow[]> {
    return toStatementRows(await http.get<StatementRowDto[]>(`/friends/${id}/statement`));
  },

  /** What a payment is made against: splits they owe you and expenses they paid for you. */
  async bills(id: Id, onlyOpen = false): Promise<Bill[]> {
    return (await http.get<BillDto[]>(`/friends/${id}/bills`, { open: onlyOpen ? "true" : undefined })).map(toBill);
  },

  async matches(id: Id): Promise<BillMatch[]> {
    return (await http.get<MatchDto[]>(`/friends/${id}/matches`)).map(toMatch);
  },

  /** Payments recorded before bills were settled one by one; they must be tied to bills by hand. */
  async unassignedPayments(id: Id): Promise<Transaction[]> {
    return (await http.get<TransactionDto[]>(`/friends/${id}/unassigned-payments`)).map(toTransaction);
  },
};
