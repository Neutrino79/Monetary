import type { Id, Tag } from "@/types";
import { http } from "@/lib/api/http";

export const tagsService = {
  /** Every tag in use, most used first. */
  async list(): Promise<Tag[]> {
    return http.get<Tag[]>("/tags");
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
