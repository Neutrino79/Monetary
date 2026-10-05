/**
 * Auth endpoints. Real REST shape this stands in for:
 *   POST /auth/login
 *   POST /auth/signup
 *   GET  /auth/me
 *   PATCH /auth/me
 *   POST /auth/password-reset/request
 *   POST /auth/password-reset/confirm
 *   POST /auth/logout
 */
import type { User } from "@/types";
import type { AuthResponse, PasswordResetQuestion, ProfilePatch, SignupInput } from "@/types/api";
import { appConfig } from "@/config/app";
import { http } from "@/lib/api/http";
import { tokenStorage } from "@/lib/api/tokenStorage";
import { mockAuthApi } from "@/lib/api/mock/mockAuthApi";

export const authService = {
  async login(email: string, password: string): Promise<AuthResponse> {
    const result = appConfig.useMockApi ? await mockAuthApi.login(email, password) : await http.post<AuthResponse>("/auth/login", { email, password });
    tokenStorage.set(result.token);
    return result;
  },

  async signup(payload: SignupInput): Promise<AuthResponse> {
    const result = appConfig.useMockApi ? await mockAuthApi.signup(payload) : await http.post<AuthResponse>("/auth/signup", payload);
    tokenStorage.set(result.token);
    return result;
  },

  async currentUser(): Promise<User | null> {
    const token = tokenStorage.get();
    if (!token) return null;
    try {
      return appConfig.useMockApi ? await mockAuthApi.currentUser(token) : await http.get<User>("/auth/me");
    } catch {
      return null;
    }
  },

  async updateProfile(patch: ProfilePatch): Promise<User | null> {
    if (appConfig.useMockApi) {
      const token = tokenStorage.get();
      if (!token) return null;
      return mockAuthApi.updateCurrentUser(token, patch);
    }
    return http.patch<User>("/auth/me", patch);
  },

  async requestPasswordReset(email: string): Promise<PasswordResetQuestion> {
    return appConfig.useMockApi ? mockAuthApi.requestReset(email) : http.post<PasswordResetQuestion>("/auth/password-reset/request", { email });
  },

  async resetPassword(email: string, answer: string, newPassword: string): Promise<true> {
    return appConfig.useMockApi
      ? mockAuthApi.resetPassword(email, answer, newPassword)
      : http.post<true>("/auth/password-reset/confirm", { email, answer, newPassword });
  },

  async logout(): Promise<void> {
    if (!appConfig.useMockApi) {
      try {
        await http.post("/auth/logout");
      } catch {
        /* best-effort — clear the local token regardless */
      }
    }
    tokenStorage.clear();
  },
};
