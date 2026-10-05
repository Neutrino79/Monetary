/**
 * The app's single idea of "today". The mock backend is anchored to a fixed
 * date (see `lib/api/mock/mockSeedData.ts`) so its generated history stays
 * deterministic; this module is the one place that distinction lives, so
 * every page/form/component just imports `today()` without caring whether
 * it's running against the mock or a real backend.
 */
import { appConfig } from "@/config/app";
import { MOCK_ANCHOR_DATE } from "@/lib/api/mock/mockSeedData";

export function today(): string {
  if (appConfig.useMockApi) return appConfig.fixedToday || MOCK_ANCHOR_DATE;
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseISODate(s: string): Date {
  return new Date(s + "T00:00:00");
}
