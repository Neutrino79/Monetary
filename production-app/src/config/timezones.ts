import { appConfig } from "@/config/app";

const FALLBACK = ["Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Australia/Sydney", "UTC"];

/** IANA zones the browser knows about (the backend validates names with the same database). */
export function timezoneOptions(current?: string | null): string[] {
  let zones: string[] = FALLBACK;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (supported?.length) zones = supported.includes("UTC") ? supported : [...supported, "UTC"];
  } catch {
    /* older browsers: fall back to the short list */
  }
  const wanted = [current, appConfig.defaultTimezone].filter((z): z is string => !!z);
  return Array.from(new Set([...wanted, ...zones]));
}
