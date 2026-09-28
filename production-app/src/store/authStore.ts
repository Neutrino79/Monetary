import { create } from "zustand";
import type { User } from "@/types";
import * as authApi from "@/lib/api/auth";
import type { SignupPayload } from "@/lib/api/auth";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  hydrate: () => void;
  login: (email: string, password: string) => Promise<User>;
  signup: (payload: SignupPayload) => Promise<User>;
  logout: () => void;
  updateProfile: (patch: Partial<User>) => void;
}

// A small artificial delay so auth actions read as "real" network calls,
// consistent with the rest of the mock API layer's simulated latency.
function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,

  hydrate: () => {
    const user = authApi.currentUser();
    set({ user, isAuthenticated: !!user });
  },

  login: async (email, password) => {
    await delay(300);
    const user = authApi.login(email, password);
    set({ user, isAuthenticated: true });
    return user;
  },

  signup: async (payload) => {
    await delay(300);
    const user = authApi.signup(payload);
    set({ user, isAuthenticated: true });
    return user;
  },

  logout: () => {
    authApi.logout();
    set({ user: null, isAuthenticated: false });
  },

  updateProfile: (patch) => {
    const updated = authApi.updateCurrentUser(patch);
    if (updated) set({ user: updated });
  },
}));
