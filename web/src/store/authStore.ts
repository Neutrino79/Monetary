import { create } from "zustand";
import type { User } from "@/types";
import type { ProfilePatch, SetupInput } from "@/types/api";
import { authService } from "@/lib/api/services/authService";
import { tokenStorage } from "@/lib/api/tokenStorage";
import { setUnauthorizedHandler } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { queryClient } from "@/lib/queryClient";
import { setDisplayCurrency } from "@/lib/utils/format";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  /** Set when the stored session couldn't be verified because the server was unreachable (not because it was rejected). */
  hydrateError: string | null;
  /** Set when a previously valid session was rejected by the server (expired / revoked). */
  sessionExpired: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  demoLogin: () => Promise<User>;
  setup: (payload: SetupInput) => Promise<User>;
  logout: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
}

function applyUser(user: User) {
  setDisplayCurrency(user.homeCurrencyCode);
  return { user, isAuthenticated: true, hydrateError: null, sessionExpired: false };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isHydrating: true,
  hydrateError: null,
  sessionExpired: false,

  hydrate: async () => {
    if (!tokenStorage.get()) {
      set({ isHydrating: false, hydrateError: null });
      return;
    }
    set({ isHydrating: true, hydrateError: null });
    try {
      const user = await authService.fetchOwner();
      set({ ...applyUser(user), isHydrating: false });
    } catch (err) {
      if (ApiError.isApiError(err) && err.status === 401) {
        // the stored token was rejected: drop it so we don't keep presenting a dead session
        // (the global 401 handler only fires for an already-authenticated session, not during startup)
        tokenStorage.clear();
        queryClient.clear();
        set({ user: null, isAuthenticated: false, isHydrating: false, sessionExpired: true });
      } else {
        // can't tell -- keep the token and let the user retry instead of silently logging them out
        set({ isHydrating: false, hydrateError: err instanceof Error ? err.message : "Couldn't reach the server." });
      }
    }
  },

  login: async (email, password) => {
    const { user, token } = await authService.login(email, password);
    tokenStorage.set(token);
    queryClient.clear();
    set(applyUser(user));
    return user;
  },

  demoLogin: async () => {
    const { user, token } = await authService.demoLogin();
    tokenStorage.set(token);
    queryClient.clear();
    set(applyUser(user));
    return user;
  },

  setup: async (payload) => {
    const { user, token } = await authService.setup(payload);
    tokenStorage.set(token);
    queryClient.clear();
    set(applyUser(user));
    return user;
  },

  logout: async () => {
    await authService.logout();
    tokenStorage.clear();
    queryClient.clear();
    set({ user: null, isAuthenticated: false, sessionExpired: false });
  },

  updateProfile: async (patch) => {
    const updated = await authService.updateProfile(patch);
    set(applyUser(updated));
  },
}));

// A 401 on any authenticated request means the session is gone: log out everywhere, once.
setUnauthorizedHandler(() => {
  if (!useAuthStore.getState().isAuthenticated) return;
  tokenStorage.clear();
  queryClient.clear();
  useAuthStore.setState({ user: null, isAuthenticated: false, sessionExpired: true });
});
