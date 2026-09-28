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
} as const;

export type AppConfig = typeof appConfig;
