import { create } from "zustand";
import type { PlatformAccount, User } from "@/types";
import type { ProfilePatch, SetupInput } from "@/types/api";
import { authService } from "@/lib/api/services/authService";
import { tokenStorage } from "@/lib/api/tokenStorage";
import { setUnauthorizedHandler } from "@/lib/api/http";
import { ApiError } from "@/lib/api/errors";
import { queryClient } from "@/lib/queryClient";
import { setDisplayCurrency } from "@/lib/utils/format";

interface AuthState {
  user: User | null;
  /** The platform account: role, state and whether a temporary password must be replaced first. */
  account: PlatformAccount | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  /** Set when the stored session couldn't be verified because the server was unreachable (not because it was rejected). */
  hydrateError: string | null;
  /** Set when a previously valid session was rejected by the server (expired / revoked). */
  sessionExpired: boolean;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<PlatformAccount>;
  demoLogin: () => Promise<PlatformAccount>;
  setup: (payload: SetupInput) => Promise<PlatformAccount>;
  logout: () => Promise<void>;
  /** After a forced password change the server signs the account out everywhere: drop the local session too. */
  finishPasswordChange: () => void;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
}

function applySignIn({ user, account }: { user: User | null; account: PlatformAccount }) {
  if (user) setDisplayCurrency(user.homeCurrencyCode);
  return { user, account, isAuthenticated: true, hydrateError: null, sessionExpired: false };
}

function applyUser(user: User) {
  setDisplayCurrency(user.homeCurrencyCode);
  return { user, isAuthenticated: true, hydrateError: null, sessionExpired: false };
}

/** True for an admin or the superuser (the Admin area is available). */
export const selectIsAdmin = (s: { account: PlatformAccount | null }) => s.account?.role === "superuser" || s.account?.role === "admin";

/** True only for the single superuser: deleting accounts, changing roles and creating admins. */
export const selectIsSuperuser = (s: { account: PlatformAccount | null }) => s.account?.role === "superuser";

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  account: null,
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
      const account = await authService.fetchAccount();
      const user = account.mustChangePassword ? null : await authService.fetchOwner();
      set({ ...applySignIn({ user, account }), isHydrating: false });
    } catch (err) {
      if (ApiError.isApiError(err) && err.status === 401) {
        // the stored token was rejected: drop it so we don't keep presenting a dead session
        // (the global 401 handler only fires for an already-authenticated session, not during startup)
        tokenStorage.clear();
        queryClient.clear();
        set({ user: null, account: null, isAuthenticated: false, isHydrating: false, sessionExpired: true });
      } else {
        // can't tell -- keep the token and let the user retry instead of silently logging them out
        set({ isHydrating: false, hydrateError: err instanceof Error ? err.message : "Couldn't reach the server." });
      }
    }
  },

  login: async (email, password) => {
    const result = await authService.login(email, password);
    tokenStorage.set(result.token);
    queryClient.clear();
    set(applySignIn(result));
    return result.account;
  },

  demoLogin: async () => {
    const result = await authService.demoLogin();
    tokenStorage.set(result.token);
    queryClient.clear();
    set(applySignIn(result));
    return result.account;
  },

  setup: async (payload) => {
    const result = await authService.setup(payload);
    tokenStorage.set(result.token);
    queryClient.clear();
    set(applySignIn(result));
    return result.account;
  },

  logout: async () => {
    await authService.logout();
    tokenStorage.clear();
    queryClient.clear();
    set({ user: null, account: null, isAuthenticated: false, sessionExpired: false });
  },

  finishPasswordChange: () => {
    tokenStorage.clear();
    queryClient.clear();
    set({ user: null, account: null, isAuthenticated: false, sessionExpired: false });
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
  useAuthStore.setState({ user: null, account: null, isAuthenticated: false, sessionExpired: true });
});
