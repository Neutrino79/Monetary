import type { Account, Category, Friend, IncomeSource, Transaction } from "@/types";
import { ACCOUNTS, CATEGORIES, INCOME_SOURCES, FRIENDS, buildTransactions } from "./mockSeedData";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The in-memory mock "database" — mutated only by `mockDataApi`/`mockAuthApi`,
 * read by `hooks/queries.ts` through the service layer. This is an
 * implementation detail of the mock backend; nothing outside `lib/api/mock`
 * should import it directly.
 */
class MockDatabase {
  accounts: Account[] = clone(ACCOUNTS);
  categories: Category[] = clone(CATEGORIES);
  incomeSources: IncomeSource[] = clone(INCOME_SOURCES);
  friends: Friend[] = clone(FRIENDS);
  transactions: Transaction[] = buildTransactions();

  reset() {
    this.accounts = clone(ACCOUNTS);
    this.categories = clone(CATEGORIES);
    this.incomeSources = clone(INCOME_SOURCES);
    this.friends = clone(FRIENDS);
    this.transactions = buildTransactions();
  }
}

export const mockDb = new MockDatabase();

export function mockGetFriend(id: string | undefined): Friend | undefined {
  return id ? mockDb.friends.find((f) => f.id === id) : undefined;
}
