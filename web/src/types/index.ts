/**
 * Domain types the UI works with. The wire format (camelCase JSON with
 * `{points, major, currency}` money objects) is translated into these at the
 * service boundary by `lib/api/mappers.ts`; money here is a plain number
 * *for display and form input only* -- every total, balance and report is
 * computed by the backend.
 */
export type Id = number;

export type AccountType = "ASSET" | "LIABILITY";
export type AccountSubtype = "bank" | "cash" | "wallet" | "credit_card";

export interface Account {
  id: Id;
  name: string;
  accountType: AccountType;
  subtype: AccountSubtype;
  currency: string;
  isActive: boolean;
  /** Server-computed. For a LIABILITY this is the amount owed. */
  balance: number;
  creditLimit: number | null;
  statementDay: number | null;
  /** Local date (YYYY-MM-DD) of the newest transaction on the account; null when it has none. */
  lastActivity: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A tag and how many live transactions carry it. */
export interface Tag {
  id: Id;
  name: string;
  uses: number;
}

export type CategoryType = "EXPENSE" | "INCOME";

/** Expense categories and income sources share one shape (an income source is an INCOME category). */
export interface Category {
  id: Id;
  name: string;
  type: CategoryType;
  color: string;
  budgetLimit: number | null;
  parentId: Id | null;
  isActive: boolean;
}
export type IncomeSource = Category;

export interface Friend {
  id: Id;
  name: string;
  initials: string;
  email: string;
  phone: string | null;
  color: string;
  createdAt: string;
}

export interface SplitParticipant {
  friendId: Id;
  share: number;
}

export type TransactionType = "income" | "expense" | "transfer" | "split" | "fronted" | "settlement" | "refund" | "adjustment";
export type TransactionStatus = "posted" | "reversed";
export type SettlementDirection = "receive" | "pay";
export type AdjustmentDirection = "increase" | "decrease";

export interface Transaction {
  id: Id;
  type: TransactionType;
  description: string;
  memo: string | null;
  date: string; // YYYY-MM-DD, the owner's local date
  currency: string;
  status: TransactionStatus;
  createdAt: string;
  updatedAt: string;
  /** Total amount (for a split: the whole bill). */
  amount: number;
  accountId?: Id;
  toAccountId?: Id;
  categoryId?: Id;
  friendId?: Id;
  direction?: SettlementDirection | AdjustmentDirection;
  /** split: your own share */
  yourShare?: number;
  splits?: SplitParticipant[];
  refundOfId?: Id;
  /** Free-form labels, sorted; empty when untagged. */
  tags: string[];
  /** STRICT mode: the entry this one replaced / the entry that replaced this one. */
  correctionOf?: Id;
  replacedBy?: Id;
  /** Friend-fronted only: how much of it you have not repaid yet. */
  unpaid?: number;
  /** Set only on rows listed with `groupBy`. */
  groupKey?: string;
}

/** A group header of a grouped transaction list. Totals are per currency. */
export interface TransactionGroup {
  key: string;
  label: string;
  count: number;
  totals: { currency: string; moneyIn: number; moneyOut: number }[];
}

export type LedgerMode = "STRICT" | "DIRECT";

/** The signed-in owner. */
export interface User {
  id: Id;
  name: string;
  email: string;
  isSuperuser: boolean;
  timezone: string | null;
  homeCurrencyCode: string;
  ledgerMode: LedgerMode;
  securityQuestionId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SecurityQuestion {
  id: number;
  text: string;
}

export interface Branding {
  name: string;
  tagline: string;
  /** True when the server runs in demo mode (sample data, one-click sign-in). */
  demo?: boolean;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------- reports
export interface BudgetStatus {
  categoryId: Id;
  categoryName: string;
  budget: number;
  spent: number;
  remaining: number;
  percentageUsed: number;
  overBudget: boolean;
  /** Friend-fronted spend this month that you have not repaid yet. */
  notPaidBack: number;
}

export interface CategoryTotal {
  categoryId: Id;
  categoryName: string;
  total: number;
  children: { categoryId: Id; categoryName: string; total: number }[];
}

export interface FriendBalance {
  friendId: Id;
  friendName: string;
  /** positive = they owe you; negative = you owe them */
  balance: number;
  /** What they paid for you that you have not repaid yet. */
  frontedUnpaid: number;
}

/** One line of a friend's statement: what moved the balance, and the balance after it. */
export interface StatementRow {
  entryId: Id;
  description: string;
  /** The ledger entry type: SPLIT, FRONTED, SETTLEMENT, ... */
  entryType: string;
  date: string;
  /** positive = they owe you more; negative = they owe you less (or you owe them more) */
  delta: number;
  runningBalance: number;
}

export interface Dashboard {
  year: number;
  month: number;
  currency: string;
  netWorth: number;
  assets: number;
  liabilities: number;
  income: number;
  expense: number;
  savings: number;
  budgets: BudgetStatus[];
  topSpending: CategoryTotal[];
  incomeSummary: CategoryTotal[];
  friendBalances: FriendBalance[];
  owedToYou: number;
  youOwe: number;
}

export interface CashflowPoint {
  year: number;
  month: number;
  label: string;
  income: number;
  expense: number;
  net: number;
}

export interface PaceProjectionDay {
  day: number;
  expected: number;
  low: number;
  high: number;
}

/** Day-by-day cumulative spend for a month, the month before it, and (this month only) where it should end. */
export interface SpendingPace {
  year: number;
  month: number;
  daysInMonth: number;
  /** Days that count: today for this month, every day for a past one, none for a future one. */
  elapsedDays: number;
  isCurrentMonth: boolean;
  days: { day: number; spent: number; cumulative: number }[];
  /** 'YYYY-MM' of the month the `previous` line belongs to. */
  previousMonth: string;
  /** The month before, one running total per day. */
  previous: number[];
  /** The sum of every category budget, or null when none are set. */
  budgetTotal: number | null;
  projection: null | {
    method: "history" | "pace";
    basisMonths: number;
    expected: number;
    low: number;
    high: number;
    days: PaceProjectionDay[];
  };
}

export interface DateRange {
  from: string;
  to: string;
}
export * from "./reports";
