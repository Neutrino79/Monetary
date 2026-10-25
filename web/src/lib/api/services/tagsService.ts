import type { Id, Tag } from "@/types";
import { http } from "@/lib/api/http";

export const tagsService = {
  /** Every tag, alphabetical, with how many transactions use it. */
  async list(): Promise<Tag[]> {
    return http.get<Tag[]>("/tags");
  },
  /** Tags are created here, then picked on transactions; the server rejects a name that already exists (409). */
  async create(name: string): Promise<Tag> {
    return http.post<Tag>("/tags", { name });
  },
  /** Renaming onto an existing tag merges the two. */
  async rename(id: Id, name: string): Promise<Tag> {
    return http.patch<Tag>(`/tags/${id}`, { name });
  },
  /** Removes the tag from every transaction; the transactions stay. */
  async remove(id: Id): Promise<void> {
    await http.delete(`/tags/${id}`);
  },
};
