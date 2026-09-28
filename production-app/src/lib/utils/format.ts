import { appConfig } from "@/config/app";
import { MOCK_TODAY } from "@/lib/db/store";

const currencyFormatter = new Intl.NumberFormat(appConfig.locale, {
  style: "currency",
  currency: appConfig.currencyCode,
  maximumFractionDigits: 0,
});
const currencyFormatterPrecise = new Intl.NumberFormat(appConfig.locale, {
  style: "currency",
  currency: appConfig.currencyCode,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number | null | undefined, precise = false): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return (precise ? currencyFormatterPrecise : currencyFormatter).format(amount);
}

export function formatSigned(amount: number, kind: "positive" | "negative" | "neutral"): string {
  const abs = formatCurrency(Math.abs(amount));
  if (kind === "positive") return `+${abs}`;
  if (kind === "negative") return `\u2212${abs}`;
  return abs;
}

type DateStyle = "short" | "long" | "weekday" | "monthYear" | undefined;

export function formatDate(dateStr: string, style?: DateStyle): string {
  const d = new Date(dateStr + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  if (style === "short") return d.toLocaleDateString(appConfig.locale, { day: "2-digit", month: "short" });
  if (style === "long") return d.toLocaleDateString(appConfig.locale, { day: "2-digit", month: "long", year: "numeric" });
  if (style === "weekday") return d.toLocaleDateString(appConfig.locale, { weekday: "short", day: "2-digit", month: "short" });
  if (style === "monthYear") return d.toLocaleDateString(appConfig.locale, { month: "long", year: "numeric" });
  return d.toLocaleDateString(appConfig.locale, { day: "2-digit", month: "short", year: "numeric" });
}

export function relativeDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(MOCK_TODAY + "T00:00:00");
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return formatDate(dateStr);
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
