/**
 * Isolated so the storage mechanism can change later (e.g. to an httpOnly
 * cookie set by a real backend) without touching every call site that needs
 * to know "are we logged in" / "what's the bearer token".
 */
const TOKEN_KEY = "emx_token";

export const tokenStorage = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore — storage may be unavailable (private mode, SSR, etc.) */
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};
