import type { Account, Category, IncomeSource, Transaction } from "@/types";
import { IconChip, Badge } from "@/components/ui/primitives";
import { accountIcon, accountIconColor, categoryIcon, incomeSourceIcon, TXN_TYPE_META } from "@/lib/utils/entityVisuals";
import { formatCurrency, formatSigned } from "@/lib/utils/format";
import { txnAmountDisplay } from "@/lib/utils/entityVisuals";
import { cn } from "@/lib/utils/cn";

export function AccountChip({ account, size = 38 }: { account: Account; size?: number }) {
  return <IconChip icon={accountIcon(account)} color={accountIconColor(account)} size={size} />;
}

export function CategoryChip({ category, size = 38 }: { category: Category; size?: number }) {
  return <IconChip icon={categoryIcon(category)} color={category.color} size={size} />;
}

export function IncomeSourceChip({ source, size = 38 }: { source: IncomeSource; size?: number }) {
  return <IconChip icon={incomeSourceIcon(source)} color={source.color} size={size} />;
}

export function TxnIconChip({ txn, size = 38 }: { txn: Transaction; size?: number }) {
  const meta = TXN_TYPE_META[txn.type];
  return (
    <span className="inline-flex flex-none items-center justify-center rounded-[10px]" style={{ width: size, height: size, background: meta.bgVar, color: meta.colorVar }}>
      <meta.icon size={Math.round(size * 0.46)} />
    </span>
  );
}

export function TxnBadge({ txn }: { txn: Transaction }) {
  const meta = TXN_TYPE_META[txn.type];
  return <Badge className={meta.badgeClass}>{meta.label}</Badge>;
}

export function TxnAmount({ txn, className }: { txn: Transaction; className?: string }) {
  const display = txnAmountDisplay(txn, formatSigned, formatCurrency);
  if (!display.sub) return <span className={cn("ledger-figure", display.className, className)}>{display.text}</span>;
  return (
    <span className="inline-flex flex-col items-end">
      <span className={cn("ledger-figure", display.className, className)}>{display.text}</span>
      <span className="text-[11.5px] font-normal text-ink-faint">{display.sub}</span>
    </span>
  );
}
