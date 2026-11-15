/**
 * Build-time configuration: locale/currency defaults, the backend URL, and the
 * *fallback* product name.
 *
 * The product name itself is owned by the backend (MONETARY_APP_NAME, served by
 * `GET /meta`) and read at runtime through `useBranding()`. `name`/`tagline`
 * here are only what is shown before that response arrives (or if the backend
 * is unreachable) -- change the backend setting to rename the app, not this.
 */

function env(key: string, fallback: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return value && value.trim() !== "" ? value : fallback;
}

export const appConfig = {
  /** Fallback product name (pre-load / backend unreachable). The backend's `GET /meta` wins. */
  name: env("VITE_APP_NAME", "Monetary"),
  /** Fallback tagline, same rule as `name`. */
  tagline: env("VITE_APP_TAGLINE", "Personal expense ledger"),
  /** Default home currency offered at first-run setup. */
  currencyCode: env("VITE_CURRENCY_CODE", "INR"),
  /** BCP 47 locale used for number/date formatting via Intl. */
  locale: env("VITE_LOCALE", "en-IN"),
  /** IANA timezone offered as the default choice at first-run setup. */
  defaultTimezone: env("VITE_DEFAULT_TIMEZONE", "Asia/Kolkata"),
  /** Contact/support line shown in a few places (e.g. error states). */
  supportEmail: env("VITE_SUPPORT_EMAIL", "support@example.com"),
  /** Base URL of the API including the version prefix, e.g. http://localhost:8000/api/v0.5 */
  apiBaseUrl: env("VITE_API_BASE_URL", "http://localhost:8000/api/v0.5").replace(/\/+$/, ""),
  /** Request timeout (ms) for the HTTP client. */
  apiTimeoutMs: Number(env("VITE_API_TIMEOUT_MS", "15000")) || 15000,
} as const;

export type AppConfig = typeof appConfig;
