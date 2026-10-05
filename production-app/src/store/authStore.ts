import { create } from "zustand";
import type { User } from "@/types";
import type { ProfilePatch, SignupInput } from "@/types/api";
import { authService } from "@/lib/api/services/authService";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  signup: (payload: SignupInput) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrating: true,

  hydrate: async () => {
    try {
      const user = await authService.currentUser();
      set({ user, isAuthenticated: !!user, isHydrating: false });
    } catch {
      set({ user: null, isAuthenticated: false, isHydrating: false });
    }
  },

  login: async (email, password) => {
    const { user } = await authService.login(email, password);
    set({ user, isAuthenticated: true });
    return user;
  },

  signup: async (payload) => {
    const { user } = await authService.signup(payload);
    set({ user, isAuthenticated: true });
    return user;
  },

  logout: async () => {
    await authService.logout();
    set({ user: null, isAuthenticated: false });
  },

  updateProfile: async (patch) => {
    const updated = await authService.updateProfile(patch);
    if (updated) set({ user: updated });
  },
}));
