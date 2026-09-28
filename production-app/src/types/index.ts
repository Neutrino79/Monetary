export type AccountType = "ASSET" | "LIABILITY" | "EXPENSE" | "INCOME" | "DUE" | "EQUITY";
export type AccountSubtype = "bank" | "cash" | "credit_card" | "wallet" | "system";

export interface Account {
  id: string;
  name: string;
  accountType: AccountType;
  subtype: AccountSubtype;
  icon?: string;
  openingBalance: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
  archivedAt?: string;
  creditLimit?: number;
  statementDay?: number;
}

export interface Category {
  id: string;
  name: string;
  icon?: string;
  color: string;
  budgetLimit: number | null;
  parentId: string | null;
}

export interface IncomeSource {
  id: string;
  name: string;
  icon?: string;
  color: string;
}

export interface Friend {
  id: string;
  name: string;
  initials: string;
  email: string;
  phone?: string | null;
  color: string;
  createdAt: string;
}

export interface SplitParticipant {
  friendId: string;
  share: number;
  settled: number;
}

export type TransactionType = "income" | "expense" | "transfer" | "split" | "settlement" | "refund" | "adjustment";
export type TransactionStatus = "posted" | "reversed";
export type SettlementDirection = "receive" | "pay";
export type AdjustmentDirection = "increase" | "decrease";

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  memo: string | null;
  date: string; // YYYY-MM-DD
  currency: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt?: string;

  // income / expense / split / refund
  accountId?: string;
  categoryId?: string;
  amount: number;

  // transfer
  toAccountId?: string;

  // split
  yourShare?: number;
  splits?: SplitParticipant[];

  // settlement
  friendId?: string;
  direction?: SettlementDirection | AdjustmentDirection;

  // refund
  refundOfId?: string;

  // adjustment
  // (reuses `direction`, typed loosely as string union above covers both cases at the type level via widening)

  // correction bookkeeping (STRICT ledger mode)
  correctionOf?: string;
  reversalOf?: string;
}

export type LedgerMode = "STRICT" | "DIRECT";

export interface UserSettings {
  theme: "light" | "dark";
  ledgerMode: LedgerMode;
  ownerName: string;
  ownerEmail: string;
  currency: string;
  timezone: string;
  homeCurrencyCode: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  isSuperuser: boolean;
  timezone: string;
  homeCurrencyCode: string;
  ledgerMode: LedgerMode;
  passwordHash: string;
  securityQuestionId: number;
  securityAnswerHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  tokenHash: string;
  userId: number;
  createdAt: string;
  expiresAt: string;
}

export interface DateRange {
  from: string;
  to: string;
}

export interface MonthBucket extends DateRange {
  label: string;
  key: string;
}

export interface BudgetUsage {
  category: Category;
  spent: number;
  limit: number;
  pct: number;
}

export interface NetWorth {
  assets: number;
  liabilities: number;
  net: number;
}
