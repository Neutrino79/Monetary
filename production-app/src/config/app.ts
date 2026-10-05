/**
 * Single source of truth for app branding and locale/currency settings.
 * Every value can be overridden at build time via a `.env` file (see
 * `.env.example`) without touching component code — this is what makes the
 * app name, tagline, currency, etc. genuinely configurable per deployment.
 */

function env(key: string, fallback: string): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return value && value.trim() !== "" ? value : fallback;
}

export const appConfig = {
  /** Product name shown in the sidebar, browser tab, and auth screens. */
  name: env("VITE_APP_NAME", "Khata"),
  /** Short subtitle shown under the name in the sidebar brand block. */
  tagline: env("VITE_APP_TAGLINE", "Personal ledger"),
  /** Single character/emoji used as the logo mark and favicon. */
  logoMark: env("VITE_APP_LOGO_MARK", "₹"),
  /** ISO 4217 currency code used for formatting throughout the app. */
  currencyCode: env("VITE_CURRENCY_CODE", "INR"),
  /** Currency symbol shown in amount inputs (formatting itself uses Intl). */
  currencySymbol: env("VITE_CURRENCY_SYMBOL", "₹"),
  /** BCP 47 locale used for number/date formatting via Intl. */
  locale: env("VITE_LOCALE", "en-IN"),
  /** IANA timezone offered as the default choice on signup. */
  defaultTimezone: env("VITE_DEFAULT_TIMEZONE", "Asia/Kolkata"),
  /** Contact/support line shown in a few places (e.g. error states). */
  supportEmail: env("VITE_SUPPORT_EMAIL", "support@example.com"),

  /**
   * Base URL of the real backend API, e.g. "https://api.example.com/v1".
   * This is the ONE place to point the app at a real backend — every
   * service in `lib/api/services` builds its request URLs from this value.
   * Leave empty to keep using the in-browser mock backend.
   */
  apiBaseUrl: env("VITE_API_BASE_URL", "").replace(/\/+$/, ""),

  /**
   * Whether to serve data from the in-memory mock backend instead of the
   * real API. Defaults to `true` whenever no `apiBaseUrl` is configured, so
   * the app "just works" out of the box; once a backend is ready, either
   * set VITE_API_BASE_URL (which flips this automatically) or set
   * VITE_USE_MOCK_API=false explicitly.
   */
  useMockApi: (() => {
    const flag = env("VITE_USE_MOCK_API", "").toLowerCase();
    if (flag === "true") return true;
    if (flag === "false") return false;
    return env("VITE_API_BASE_URL", "") === "";
  })(),

  /** Request timeout (ms) for the real HTTP client. */
  apiTimeoutMs: Number(env("VITE_API_TIMEOUT_MS", "15000")) || 15000,

  /** Artificial network delay (ms) the mock backend simulates. */
  mockLatencyMs: Number(env("VITE_MOCK_LATENCY_MS", "260")) || 0,

  /** Optional fixed "today" (YYYY-MM-DD) for demos/screenshots against the mock backend. */
  fixedToday: env("VITE_FIXED_TODAY", ""),
} as const;

export type AppConfig = typeof appConfig;
