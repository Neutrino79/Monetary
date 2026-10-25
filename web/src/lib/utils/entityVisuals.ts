import type { LucideIcon } from "lucide-react";
import {
  Utensils, ShoppingBasket, Car, Home, Clapperboard, ShoppingBag, HeartPulse, Plane, Sparkles,
  MoreHorizontal, Landmark, Wallet, CreditCard, Smartphone, SlidersHorizontal, Laptop, TrendingUp,
  Gift, PlusCircle, Briefcase, Fuel, Bus, Key, Plug, Wrench, Film, Repeat, Shirt, Pill, Dumbbell,
  Package, Tag, Users, TrendingDown, Shuffle, HandCoins, ArrowRight, Scale, Car as CarTaxi,
} from "lucide-react";
import type { Account, Category, IncomeSource, Transaction, TransactionType } from "@/types";

/** Stable palette colour for entities that have no user-chosen colour (friends, uncoloured categories). */
const PALETTE = ["#2F6F4F", "#2C6683", "#B4572B", "#7B2E3A", "#6B5B95", "#A07C1C", "#3B7A78", "#8A4F7D", "#5A6F2E", "#4A5F8A"];
export function colorForId(id: number): string {
  return PALETTE[Math.abs(id) % PALETTE.length]!;
}

const ICON_MAP: Record<string, LucideIcon> = {
  utensils: Utensils,
  "shopping-basket": ShoppingBasket,
  car: Car,
  home: Home,
  clapperboard: Clapperboard,
  "shopping-bag": ShoppingBag,
  "heart-pulse": HeartPulse,
  plane: Plane,
  sparkles: Sparkles,
  "more-horizontal": MoreHorizontal,
  landmark: Landmark,
  wallet: Wallet,
  "credit-card": CreditCard,
  smartphone: Smartphone,
  sliders: SlidersHorizontal,
  laptop: Laptop,
  "trending-up": TrendingUp,
  gift: Gift,
  "plus-circle": PlusCircle,
  briefcase: Briefcase,
  fuel: Fuel,
  "car-taxi-front": CarTaxi,
  bus: Bus,
  key: Key,
  plug: Plug,
  wrench: Wrench,
  film: Film,
  repeat: Repeat,
  shirt: Shirt,
  pill: Pill,
  dumbbell: Dumbbell,
  package: Package,
  tag: Tag,
};

export function resolveIcon(name: string | undefined, fallback: LucideIcon = Tag): LucideIcon {
  if (!name) return fallback;
  return ICON_MAP[name] ?? fallback;
}

/** Category chips always use a tag glyph, colored per-category — consistent and simple. */
export function categoryIcon(_category: Category): LucideIcon {
  return Tag;
}
export function incomeSourceIcon(_source: IncomeSource): LucideIcon {
  return TrendingUp;
}

const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  bank: Landmark,
  cash: Wallet,
  credit_card: CreditCard,
  wallet: Wallet,
};
export function accountIcon(account: Account): LucideIcon {
  return ACCOUNT_ICONS[account.subtype] ?? Landmark;
}
export function accountIconColor(account: Account): string {
  if (account.accountType === "LIABILITY") return "#7B2E3A";
  return "#2C6683";
}

export interface TxnTypeMeta {
  label: string;
  icon: LucideIcon;
  badgeClass: string;
  colorVar: string;
  bgVar: string;
}

export const TXN_TYPE_META: Record<TransactionType, TxnTypeMeta> = {
  income: { label: "Income", icon: TrendingUp, badgeClass: "bg-accent-soft text-accent", colorVar: "var(--accent)", bgVar: "var(--accent-soft)" },
  expense: { label: "Expense", icon: TrendingDown, badgeClass: "bg-negative-soft text-negative", colorVar: "var(--negative)", bgVar: "var(--negative-soft)" },
  transfer: { label: "Transfer", icon: Shuffle, badgeClass: "bg-warn-soft text-warn", colorVar: "var(--warn)", bgVar: "var(--warn-soft)" },
  split: { label: "Split Expense", icon: Users, badgeClass: "bg-info-soft text-info", colorVar: "var(--info)", bgVar: "var(--info-soft)" },
  fronted: { label: "Paid by friend", icon: Users, badgeClass: "bg-info-soft text-info", colorVar: "var(--info)", bgVar: "var(--info-soft)" },
  settlement: { label: "Settlement", icon: HandCoins, badgeClass: "bg-info-soft text-info", colorVar: "var(--info)", bgVar: "var(--info-soft)" },
  refund: { label: "Refund", icon: ArrowRight, badgeClass: "bg-accent-soft text-accent", colorVar: "var(--accent)", bgVar: "var(--accent-soft)" },
  adjustment: { label: "Adjustment", icon: Scale, badgeClass: "bg-paper-sunken text-ink-soft", colorVar: "var(--ink-soft)", bgVar: "var(--paper-sunken)" },
};

export interface TxnAmountDisplay {
  text: string;
  className: string;
  /** A second, quieter line: for a split, how much of the bill is yours. */
  sub?: string;
}

export function txnAmountDisplay(txn: Transaction, formatSigned: (n: number, k: "positive" | "negative" | "neutral") => string, formatCurrency: (n: number) => string): TxnAmountDisplay {
  if (txn.type === "income" || txn.type === "refund") return { text: formatSigned(txn.amount, "positive"), className: "text-accent" };
  if (txn.type === "expense") return { text: formatSigned(txn.amount, "negative"), className: "text-negative" };
  // a split shows the whole bill (what left your account, even when your own share is 0), with your share beneath
  if (txn.type === "split") return { text: formatSigned(txn.amount, "negative"), className: "text-negative", sub: `Your share ${formatCurrency(txn.yourShare ?? 0)}` };
  if (txn.type === "fronted") return { text: formatSigned(txn.amount, "negative"), className: "text-negative" };
  if (txn.type === "transfer") return { text: formatCurrency(txn.amount), className: "text-warn" };
  if (txn.type === "settlement") return { text: formatSigned(txn.amount, txn.direction === "receive" ? "positive" : "negative"), className: txn.direction === "receive" ? "text-accent" : "text-negative" };
  if (txn.type === "adjustment") return { text: formatSigned(txn.amount, txn.direction === "increase" ? "positive" : "negative"), className: txn.direction === "increase" ? "text-accent" : "text-negative" };
  return { text: formatCurrency(txn.amount), className: "" };
}
