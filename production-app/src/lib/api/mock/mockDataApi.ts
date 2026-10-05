/**
 * The mock backend's data endpoints — accounts, categories, income sources,
 * friends, transactions. Mirrors the shape a real REST API would have
 * (see the comments in `lib/api/services/*Service.ts` for the endpoints
 * this stands in for). Nothing outside `lib/api/mock` and the service
 * layer should import this directly.
 */
import type { Account, Category, Friend, Transaction } from "@/types";
import type { NewAccountInput, NewCategoryInput, NewFriendInput, NewTransactionInput, SettlementInput } from "@/types/api";
import { mockDb, mockGetFriend } from "./mockDb";
import { MOCK_ANCHOR_DATE } from "./mockSeedData";
import { appConfig } from "@/config/app";
import { uid } from "@/lib/utils/format";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const LATENCY = appConfig.mockLatencyMs;

function today() {
  return MOCK_ANCHOR_DATE;
}

export const mockDataApi = {
  // ---------------------------------------------------------- read side
  async getAccounts(): Promise<Account[]> {
    await delay(LATENCY);
    return mockDb.accounts;
  },
  async getCategories(): Promise<Category[]> {
    await delay(LATENCY);
    return mockDb.categories;
  },
  async getIncomeSources() {
    await delay(LATENCY);
    return mockDb.incomeSources;
  },
  async getFriends(): Promise<Friend[]> {
    await delay(LATENCY);
    return mockDb.friends;
  },
  async getTransactions(): Promise<Transaction[]> {
    await delay(LATENCY);
    return mockDb.transactions;
  },

  // ------------------------------------------------------- transactions
  async createTransaction(payload: NewTransactionInput): Promise<Transaction> {
    await delay(LATENCY);
    const txn: Transaction = {
      id: uid("txn"),
      status: "posted",
      createdAt: today(),
      updatedAt: today(),
      memo: null,
      ...payload,
    } as Transaction;
    mockDb.transactions.unshift(txn);
    return txn;
  },
  async updateTransaction(id: string, patch: Partial<Transaction>, ledgerMode: "STRICT" | "DIRECT"): Promise<Transaction> {
    await delay(LATENCY);
    const idx = mockDb.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Transaction not found");
    if (ledgerMode === "STRICT") {
      const original = mockDb.transactions[idx];
      original.status = "reversed";
      original.updatedAt = today();
      const reposted: Transaction = {
        ...original,
        ...patch,
        id: uid("txn"),
        status: "posted",
        createdAt: today(),
        updatedAt: today(),
        reversalOf: undefined,
        correctionOf: original.id,
      };
      mockDb.transactions.unshift(reposted);
      return reposted;
    }
    const updated = Object.assign(mockDb.transactions[idx], patch, { updatedAt: today() });
    return updated;
  },
  async deleteTransaction(id: string, ledgerMode: "STRICT" | "DIRECT"): Promise<true> {
    await delay(LATENCY);
    const idx = mockDb.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Transaction not found");
    if (ledgerMode === "STRICT") {
      mockDb.transactions[idx].status = "reversed";
      mockDb.transactions[idx].updatedAt = today();
    } else {
      mockDb.transactions.splice(idx, 1);
    }
    return true;
  },
  async settleFriend(args: SettlementInput): Promise<Transaction> {
    return this.createTransaction({
      type: "settlement",
      description: `Settlement — ${mockGetFriend(args.friendId)?.name ?? "Friend"}`,
      memo: args.memo || null,
      date: args.date || today(),
      currency: "INR",
      accountId: args.accountId,
      friendId: args.friendId,
      amount: args.amount,
      direction: args.direction,
    });
  },

  // ------------------------------------------------------------ accounts
  async createAccount(payload: NewAccountInput): Promise<Account> {
    await delay(LATENCY);
    const acc: Account = { id: uid("acc"), isActive: true, isSystem: false, createdAt: today(), openingBalance: 0, ...payload };
    mockDb.accounts.push(acc);
    return acc;
  },
  async updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
    await delay(LATENCY);
    const acc = mockDb.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("Account not found");
    Object.assign(acc, patch);
    return acc;
  },
  async archiveAccount(id: string): Promise<Account> {
    await delay(LATENCY);
    const acc = mockDb.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("Account not found");
    acc.isActive = false;
    acc.archivedAt = today();
    return acc;
  },
  async restoreAccount(id: string): Promise<Account> {
    await delay(LATENCY);
    const acc = mockDb.accounts.find((a) => a.id === id)!;
    acc.isActive = true;
    delete acc.archivedAt;
    return acc;
  },

  // ---------------------------------------------------------- categories
  async createCategory(payload: NewCategoryInput): Promise<Category> {
    await delay(LATENCY);
    const cat: Category = { id: uid("cat"), parentId: null, budgetLimit: null, color: "#5A5A5A", ...payload };
    mockDb.categories.push(cat);
    return cat;
  },
  async updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
    await delay(LATENCY);
    const cat = mockDb.categories.find((c) => c.id === id)!;
    Object.assign(cat, patch);
    return cat;
  },
  async deleteCategory(id: string): Promise<true> {
    await delay(LATENCY);
    mockDb.categories = mockDb.categories.filter((c) => c.id !== id && c.parentId !== id);
    return true;
  },

  // ------------------------------------------------------------- friends
  async createFriend(payload: NewFriendInput): Promise<Friend> {
    await delay(LATENCY);
    const f: Friend = { id: uid("frnd"), createdAt: today(), initials: "", color: "#1F6D4C", ...payload };
    mockDb.friends.push(f);
    return f;
  },
  async updateFriend(id: string, patch: Partial<Friend>): Promise<Friend> {
    await delay(LATENCY);
    const f = mockDb.friends.find((x) => x.id === id)!;
    Object.assign(f, patch);
    return f;
  },
  async deleteFriend(id: string): Promise<true> {
    await delay(LATENCY);
    const hasHistory = mockDb.transactions.some((t) => t.friendId === id || (t.splits ?? []).some((s) => s.friendId === id));
    if (hasHistory) throw new Error("This friend has ledger history and can't be deleted — archive instead.");
    mockDb.friends = mockDb.friends.filter((f) => f.id !== id);
    return true;
  },
};
