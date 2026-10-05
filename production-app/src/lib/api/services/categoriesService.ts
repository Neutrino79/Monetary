/**
 * Category endpoints. Real REST shape this stands in for:
 *   GET    /categories
 *   POST   /categories
 *   PATCH  /categories/:id
 *   DELETE /categories/:id
 */
import type { Category } from "@/types";
import type { NewCategoryInput } from "@/types/api";
import { appConfig } from "@/config/app";
import { http } from "@/lib/api/http";
import { mockDataApi } from "@/lib/api/mock/mockDataApi";

export const categoriesService = {
  list(): Promise<Category[]> {
    return appConfig.useMockApi ? mockDataApi.getCategories() : http.get<Category[]>("/categories");
  },
  create(payload: NewCategoryInput): Promise<Category> {
    return appConfig.useMockApi ? mockDataApi.createCategory(payload) : http.post<Category>("/categories", payload);
  },
  update(id: string, patch: Partial<Category>): Promise<Category> {
    return appConfig.useMockApi ? mockDataApi.updateCategory(id, patch) : http.patch<Category>(`/categories/${id}`, patch);
  },
  remove(id: string): Promise<true> {
    return appConfig.useMockApi ? mockDataApi.deleteCategory(id) : http.delete<true>(`/categories/${id}`);
  },
};
