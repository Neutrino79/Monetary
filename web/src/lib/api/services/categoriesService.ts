import type { Category, CategoryType, Id } from "@/types";
import type { CategoryDto, CategoryPatch, NewCategoryInput } from "@/types/api";
import { http } from "@/lib/api/http";
import { toCategory, toMajor } from "@/lib/api/mappers";

export const categoriesService = {
  async list(type?: CategoryType, includeInactive = false): Promise<Category[]> {
    return (await http.get<CategoryDto[]>("/categories", { type, includeInactive })).map(toCategory);
  },

  async create(input: NewCategoryInput): Promise<Category> {
    return toCategory(await http.post<CategoryDto>("/categories", {
      name: input.name, type: input.type, parentId: input.parentId ?? undefined, color: input.color,
      budgetLimit: input.budgetLimit != null ? toMajor(input.budgetLimit) : undefined,
    }));
  },

  async update(id: Id, patch: CategoryPatch): Promise<Category> {
    const body: Record<string, unknown> = { ...patch };
    if ("budgetLimit" in patch) body.budgetLimit = patch.budgetLimit == null ? null : toMajor(patch.budgetLimit);
    return toCategory(await http.patch<CategoryDto>(`/categories/${id}`, body));
  },

  async archive(id: Id): Promise<Category> {
    return toCategory(await http.post<CategoryDto>(`/categories/${id}/deactivate`));
  },

  async restore(id: Id): Promise<Category> {
    return toCategory(await http.post<CategoryDto>(`/categories/${id}/reactivate`));
  },
};
