/** Request payloads (domain -> wire) and raw wire shapes (DTOs) the mappers read. */
import type { Id, LedgerMode, SettlementDirection, AdjustmentDirection, TransactionType } from "@/types";

// ------------------------------------------------------------------ wire
export interface MoneyDto {
  points: number;
  major: string;
  currency: string;
}

export interface PageDto<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface OwnerDto {
  id: number;
  name: string;
  email: string;
  timezone: string | null;
  homeCurrencyCode: string;
  ledgerMode: LedgerMode;
  isSuperuser: boolean;
  securityQuestionId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountDto {
  id: number;
  name: string;
  accountType: "ASSET" | "LIABILITY";
  currencyCode: string;
  isActive: boolean;
  subtype: "bank" | "cash" | "wallet" | "credit_card";
  creditLimit: MoneyDto | null;
  statementDay: number | null;
  balance: MoneyDto;
  lastActivity: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryDto {
  id: number;
  name: string;
  accountType: "EXPENSE" | "INCOME";
  currencyCode: string;
  parentId: number | null;
  budgetLimit: MoneyDto | null;
  color: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FriendDto {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  dueAccountId: number;
  createdAt: string;
}

export interface TransactionDto {
  id: number;
  type: TransactionType;
  description: string;
  memo: string | null;
  date: string;
  currency: string;
  status: "posted" | "reversed";
  amount: MoneyDto;
  accountId: number | null;
  toAccountId: number | null;
  categoryId: number | null;
  friendId: number | null;
  direction: SettlementDirection | AdjustmentDirection | null;
  yourShare: MoneyDto | null;
  splits: { friendId: number; share: MoneyDto }[] | null;
  refundOfId: number | null;
  tags: string[];
  correctionOf: number | null;
  replacedBy: number | null;
  createdAt: string;
  updatedAt: string;
  /** Friend-fronted only: the part not repaid to the friend yet. */
  unpaid: MoneyDto | null;
  /** Present only when listed with `groupBy`. */
  groupKey: string | null;
}

export type TransactionGroupBy = "date" | "month" | "category" | "account" | "type" | "tag";

export interface TransactionGroupDto {
  key: string;
  label: string;
  count: number;
  totals: { currency: string; moneyIn: MoneyDto; moneyOut: MoneyDto }[];
}

export interface TransactionGroupsDto {
  groupBy: TransactionGroupBy;
  groups: TransactionGroupDto[];
}

// -------------------------------------------------------------- requests
export interface SetupInput {
  name: string;
  email: string;
  password: string;
  timezone?: string;
  homeCurrencyCode: string;
  securityQuestionId: number;
  securityAnswer: string;
  seedDefaults?: boolean;
}

export interface ProfilePatch {
  name?: string;
  timezone?: string;
  ledgerMode?: LedgerMode;
}

export interface NewAccountInput {
  name: string;
  accountType: "ASSET" | "LIABILITY";
  subtype: "bank" | "cash" | "wallet" | "credit_card";
  currency: string;
  /** LIABILITY only */
  creditLimit?: number | null;
  /** LIABILITY only */
  statementDay?: number | null;
  /** Create-only; posted as an "Opening balance" adjustment. */
  openingBalance?: number;
}

export interface AccountPatch {
  name?: string;
  subtype?: "bank" | "cash" | "wallet" | "credit_card";
  creditLimit?: number | null;
  statementDay?: number | null;
}

export interface NewCategoryInput {
  name: string;
  type: "EXPENSE" | "INCOME";
  parentId?: Id | null;
  budgetLimit?: number | null;
  color?: string;
}

export interface CategoryPatch {
  name?: string;
  color?: string | null;
  budgetLimit?: number | null;
  parentId?: Id | null;
}

export interface NewFriendInput {
  name: string;
  email: string;
  phone?: string | null;
}

export interface FriendPatch {
  name?: string;
  email?: string;
  phone?: string | null;
}

export interface TransactionFilters {
  type?: TransactionType[];
  accountId?: Id;
  categoryId?: Id;
  friendId?: Id;
  /** Refunds recorded against this expense. */
  refundOfId?: Id;
  /** Only transactions with any of these tags. */
  tag?: string[];
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "date" | "amount" | "description" | "category" | "account";
  direction?: "asc" | "desc";
  status?: "posted" | "reversed" | "all";
  /** Cluster rows by group; rows then carry `groupKey`. */
  groupBy?: TransactionGroupBy;
  limit?: number;
  offset?: number;
}

export interface NewTransactionInput {
  type: TransactionType;
  /** Required for everything except a settlement, which the server titles from what it covers. */
  description?: string;
  date: string;
  amount: number;
  memo?: string | null;
  accountId?: Id;
  toAccountId?: Id;
  categoryId?: Id;
  friendId?: Id;
  direction?: SettlementDirection | AdjustmentDirection;
  yourShare?: number;
  splits?: { friendId: Id; share: number }[];
  refundOfId?: Id;
  /** The complete tag set; on an edit, [] clears and absent leaves them alone. */
  tags?: string[];
}

export type TransactionPatch = Partial<Omit<NewTransactionInput, "type">>;

export interface TransactionWriteOptions {
  /** Split edit/delete when friends have already settled against it. */
  force?: boolean;
  removeSettlements?: boolean;
}

export interface SettlementInput {
  friendId: Id;
  accountId: Id;
  amount: number;
  /** Shown to the user; the server derives and verifies the real direction. */
  direction?: SettlementDirection;
  memo?: string | null;
  date?: string;
}

export interface PasswordResetQuestion {
  email: string;
  questionId: number;
  question: string;
}
