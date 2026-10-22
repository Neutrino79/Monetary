import type { Friend, FriendBalance, Id } from "@/types";
import type { FriendDto, FriendPatch, NewFriendInput } from "@/types/api";
import { http } from "@/lib/api/http";
import { toFriend, toFriendBalance } from "@/lib/api/mappers";

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
};
