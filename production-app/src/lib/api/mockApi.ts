import type { Account, Category, Friend, Transaction } from "@/types";
import { db, getFriend, MOCK_TODAY } from "@/lib/db/store";
import { uid } from "@/lib/utils/format";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const LATENCY = 260;

function today() {
  return MOCK_TODAY;
}

export const mockApi = {
  // ---------------------------------------------------------- read side
  async getAccounts(): Promise<Account[]> {
    await delay(LATENCY);
    return db.accounts;
  },
  async getCategories(): Promise<Category[]> {
    await delay(LATENCY);
    return db.categories;
  },
  async getIncomeSources() {
    await delay(LATENCY);
    return db.incomeSources;
  },
  async getFriends(): Promise<Friend[]> {
    await delay(LATENCY);
    return db.friends;
  },
  async getTransactions(): Promise<Transaction[]> {
    await delay(LATENCY);
    return db.transactions;
  },

  // ------------------------------------------------------- transactions
  async createTransaction(payload: Partial<Transaction> & Pick<Transaction, "type" | "description" | "date" | "amount" | "currency">): Promise<Transaction> {
    await delay(LATENCY);
    const txn: Transaction = {
      id: uid("txn"),
      status: "posted",
      createdAt: today(),
      updatedAt: today(),
      memo: null,
      ...payload,
    } as Transaction;
    db.transactions.unshift(txn);
    return txn;
  },
  async updateTransaction(id: string, patch: Partial<Transaction>, ledgerMode: "STRICT" | "DIRECT"): Promise<Transaction> {
    await delay(LATENCY);
    const idx = db.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Transaction not found");
    if (ledgerMode === "STRICT") {
      const original = db.transactions[idx];
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
      db.transactions.unshift(reposted);
      return reposted;
    }
    const updated = Object.assign(db.transactions[idx], patch, { updatedAt: today() });
    return updated;
  },
  async deleteTransaction(id: string, ledgerMode: "STRICT" | "DIRECT"): Promise<true> {
    await delay(LATENCY);
    const idx = db.transactions.findIndex((t) => t.id === id);
    if (idx === -1) throw new Error("Transaction not found");
    if (ledgerMode === "STRICT") {
      db.transactions[idx].status = "reversed";
      db.transactions[idx].updatedAt = today();
    } else {
      db.transactions.splice(idx, 1);
    }
    return true;
  },
  async settleFriend(args: { friendId: string; accountId: string; amount: number; direction: "receive" | "pay"; memo?: string | null; date?: string }): Promise<Transaction> {
    return this.createTransaction({
      type: "settlement",
      description: `Settlement — ${getFriend(args.friendId)?.name ?? "Friend"}`,
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
  async createAccount(payload: Partial<Account> & Pick<Account, "name" | "accountType" | "subtype">): Promise<Account> {
    await delay(LATENCY);
    const acc: Account = { id: uid("acc"), isActive: true, isSystem: false, createdAt: today(), openingBalance: 0, ...payload };
    db.accounts.push(acc);
    return acc;
  },
  async updateAccount(id: string, patch: Partial<Account>): Promise<Account> {
    await delay(LATENCY);
    const acc = db.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("Account not found");
    Object.assign(acc, patch);
    return acc;
  },
  async archiveAccount(id: string): Promise<Account> {
    await delay(LATENCY);
    const acc = db.accounts.find((a) => a.id === id);
    if (!acc) throw new Error("Account not found");
    acc.isActive = false;
    acc.archivedAt = today();
    return acc;
  },
  async restoreAccount(id: string): Promise<Account> {
    await delay(LATENCY);
    const acc = db.accounts.find((a) => a.id === id)!;
    acc.isActive = true;
    delete acc.archivedAt;
    return acc;
  },

  // ---------------------------------------------------------- categories
  async createCategory(payload: Partial<Category> & Pick<Category, "name">): Promise<Category> {
    await delay(LATENCY);
    const cat: Category = { id: uid("cat"), parentId: null, budgetLimit: null, color: "#5A5A5A", ...payload };
    db.categories.push(cat);
    return cat;
  },
  async updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
    await delay(LATENCY);
    const cat = db.categories.find((c) => c.id === id)!;
    Object.assign(cat, patch);
    return cat;
  },
  async deleteCategory(id: string): Promise<true> {
    await delay(LATENCY);
    db.categories = db.categories.filter((c) => c.id !== id && c.parentId !== id);
    return true;
  },

  // ------------------------------------------------------------- friends
  async createFriend(payload: Partial<Friend> & Pick<Friend, "name" | "email">): Promise<Friend> {
    await delay(LATENCY);
    const f: Friend = { id: uid("frnd"), createdAt: today(), initials: "", color: "#1F6D4C", ...payload };
    db.friends.push(f);
    return f;
  },
  async updateFriend(id: string, patch: Partial<Friend>): Promise<Friend> {
    await delay(LATENCY);
    const f = db.friends.find((x) => x.id === id)!;
    Object.assign(f, patch);
    return f;
  },
  async deleteFriend(id: string): Promise<true> {
    await delay(LATENCY);
    const hasHistory = db.transactions.some((t) => t.friendId === id || (t.splits ?? []).some((s) => s.friendId === id));
    if (hasHistory) throw new Error("This friend has ledger history and can't be deleted — archive instead.");
    db.friends = db.friends.filter((f) => f.id !== id);
    return true;
  },
};
