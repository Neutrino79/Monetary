/**
 * Shapes exchanged with the backend (real or mock) that aren't themselves
 * domain entities — request payloads and auth responses. Kept separate from
 * `types/index.ts` (the domain model) so it's obvious which types describe
 * "what's stored" vs. "what's sent over the wire".
 */
import type { Account, Category, Friend, LedgerMode, SettlementDirection, Transaction, TransactionType, User } from "@/types";

export interface AuthResponse {
  user: User;
  /** Bearer token for the real backend. The mock backend issues a stand-in value. */
  token: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  timezone?: string;
  homeCurrencyCode?: string;
  securityQuestionId: number;
  securityAnswer: string;
}

export interface ProfilePatch {
  name?: string;
  timezone?: string;
  homeCurrencyCode?: string;
  ledgerMode?: LedgerMode;
}

export type NewTransactionInput = Partial<Transaction> & Pick<Transaction, "type" | "description" | "date" | "amount" | "currency">;

export interface SettlementInput {
  friendId: string;
  accountId: string;
  amount: number;
  direction: SettlementDirection;
  memo?: string | null;
  date?: string;
}

export interface PasswordResetQuestion {
  email: string;
  questionId: number;
}

export type NewAccountInput = Partial<Account> & Pick<Account, "name" | "accountType" | "subtype">;
export type NewCategoryInput = Partial<Category> & Pick<Category, "name">;
export type NewFriendInput = Partial<Friend> & Pick<Friend, "name" | "email">;

export type { TransactionType };
