/**
 * Friend endpoints. Real REST shape this stands in for:
 *   GET    /friends
 *   POST   /friends
 *   PATCH  /friends/:id
 *   DELETE /friends/:id
 */
import type { Friend } from "@/types";
import type { NewFriendInput } from "@/types/api";
import { appConfig } from "@/config/app";
import { http } from "@/lib/api/http";
import { mockDataApi } from "@/lib/api/mock/mockDataApi";

export const friendsService = {
  list(): Promise<Friend[]> {
    return appConfig.useMockApi ? mockDataApi.getFriends() : http.get<Friend[]>("/friends");
  },
  create(payload: NewFriendInput): Promise<Friend> {
    return appConfig.useMockApi ? mockDataApi.createFriend(payload) : http.post<Friend>("/friends", payload);
  },
  update(id: string, patch: Partial<Friend>): Promise<Friend> {
    return appConfig.useMockApi ? mockDataApi.updateFriend(id, patch) : http.patch<Friend>(`/friends/${id}`, patch);
  },
  remove(id: string): Promise<true> {
    return appConfig.useMockApi ? mockDataApi.deleteFriend(id) : http.delete<true>(`/friends/${id}`);
  },
};
