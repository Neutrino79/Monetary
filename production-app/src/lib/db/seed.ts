import type { Account, Category, IncomeSource, Friend, Transaction } from "@/types";

// ---- deterministic PRNG (mulberry32) so the mock backend is stable ----
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(87291);
const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
const between = (min: number, max: number) => min + rnd() * (max - min);
const round2 = (n: number) => Math.round(n * 100) / 100;

export const ACCOUNTS: Account[] = [
  { id: "acc_hdfc_sav", name: "HDFC Bank Savings", accountType: "ASSET", subtype: "bank", icon: "landmark", openingBalance: 42000, isActive: true, isSystem: false, createdAt: "2025-01-04" },
  { id: "acc_icici_sal", name: "ICICI Salary Account", accountType: "ASSET", subtype: "bank", icon: "briefcase", openingBalance: 8000, isActive: true, isSystem: false, createdAt: "2025-01-04" },
  { id: "acc_cash", name: "Cash Wallet", accountType: "ASSET", subtype: "cash", icon: "wallet", openingBalance: 3200, isActive: true, isSystem: false, createdAt: "2025-01-04" },
  { id: "acc_hdfc_cc", name: "HDFC Regalia Credit Card", accountType: "LIABILITY", subtype: "credit_card", icon: "credit-card", openingBalance: 0, isActive: true, isSystem: false, createdAt: "2025-01-04", creditLimit: 150000, statementDay: 18 },
  { id: "acc_paytm", name: "Paytm Wallet", accountType: "ASSET", subtype: "wallet", icon: "smartphone", openingBalance: 0, isActive: false, isSystem: false, createdAt: "2025-01-10", archivedAt: "2025-06-01" },
  { id: "acc_equity", name: "Adjustments", accountType: "EQUITY", subtype: "system", icon: "sliders", openingBalance: 0, isActive: true, isSystem: true, createdAt: "2025-01-04" },
];

export const CATEGORIES: Category[] = [
  { id: "cat_food", name: "Food & Dining", icon: "utensils", color: "#1F6D4C", budgetLimit: 12000, parentId: null },
  { id: "cat_food_groceries", name: "Groceries", icon: "shopping-basket", color: "#1F6D4C", budgetLimit: null, parentId: "cat_food" },
  { id: "cat_food_restaurants", name: "Restaurants", icon: "utensils", color: "#1F6D4C", budgetLimit: null, parentId: "cat_food" },
  { id: "cat_food_delivery", name: "Food Delivery", icon: "package", color: "#1F6D4C", budgetLimit: null, parentId: "cat_food" },

  { id: "cat_transport", name: "Transportation", icon: "car", color: "#8A5A00", budgetLimit: 5000, parentId: null },
  { id: "cat_transport_fuel", name: "Fuel", icon: "fuel", color: "#8A5A00", budgetLimit: null, parentId: "cat_transport" },
  { id: "cat_transport_cab", name: "Cab & Auto", icon: "car-taxi-front", color: "#8A5A00", budgetLimit: null, parentId: "cat_transport" },
  { id: "cat_transport_public", name: "Public Transport", icon: "bus", color: "#8A5A00", budgetLimit: null, parentId: "cat_transport" },

  { id: "cat_housing", name: "Housing", icon: "home", color: "#7A2E3A", budgetLimit: 19000, parentId: null },
  { id: "cat_housing_rent", name: "Rent", icon: "key", color: "#7A2E3A", budgetLimit: null, parentId: "cat_housing" },
  { id: "cat_housing_utilities", name: "Utilities", icon: "plug", color: "#7A2E3A", budgetLimit: null, parentId: "cat_housing" },
  { id: "cat_housing_maintenance", name: "Maintenance", icon: "wrench", color: "#7A2E3A", budgetLimit: null, parentId: "cat_housing" },

  { id: "cat_entertainment", name: "Entertainment", icon: "clapperboard", color: "#4A4A8A", budgetLimit: 4000, parentId: null },
  { id: "cat_entertainment_movies", name: "Movies & Shows", icon: "film", color: "#4A4A8A", budgetLimit: null, parentId: "cat_entertainment" },
  { id: "cat_entertainment_subs", name: "Subscriptions", icon: "repeat", color: "#4A4A8A", budgetLimit: null, parentId: "cat_entertainment" },

  { id: "cat_shopping", name: "Shopping", icon: "shopping-bag", color: "#2E6B8A", budgetLimit: 6000, parentId: null },
  { id: "cat_shopping_clothing", name: "Clothing", icon: "shirt", color: "#2E6B8A", budgetLimit: null, parentId: "cat_shopping" },
  { id: "cat_shopping_electronics", name: "Electronics", icon: "laptop", color: "#2E6B8A", budgetLimit: null, parentId: "cat_shopping" },

  { id: "cat_health", name: "Health & Fitness", icon: "heart-pulse", color: "#8A2E6B", budgetLimit: 3000, parentId: null },
  { id: "cat_health_pharmacy", name: "Pharmacy", icon: "pill", color: "#8A2E6B", budgetLimit: null, parentId: "cat_health" },
  { id: "cat_health_gym", name: "Gym", icon: "dumbbell", color: "#8A2E6B", budgetLimit: null, parentId: "cat_health" },

  { id: "cat_travel", name: "Travel", icon: "plane", color: "#2E8A6B", budgetLimit: 8000, parentId: null },
  { id: "cat_personal", name: "Personal Care", icon: "sparkles", color: "#8A6B2E", budgetLimit: 2000, parentId: null },
  { id: "cat_misc", name: "Miscellaneous", icon: "more-horizontal", color: "#5A5A5A", budgetLimit: 2000, parentId: null },
];

export const INCOME_SOURCES: IncomeSource[] = [
  { id: "inc_salary", name: "Salary", icon: "briefcase", color: "#1F6D4C" },
  { id: "inc_freelance", name: "Freelance", icon: "laptop", color: "#2E6B8A" },
  { id: "inc_investments", name: "Investments & Dividends", icon: "trending-up", color: "#8A6B2E" },
  { id: "inc_gifts", name: "Gifts Received", icon: "gift", color: "#8A2E6B" },
  { id: "inc_other", name: "Other Income", icon: "plus-circle", color: "#5A5A5A" },
];

export const FRIENDS: Friend[] = [
  { id: "frnd_rahul", name: "Rahul Sharma", initials: "RS", email: "rahul.sharma@example.com", phone: "+91 98200 11223", color: "#1F6D4C", createdAt: "2025-02-01" },
  { id: "frnd_priya", name: "Priya Menon", initials: "PM", email: "priya.menon@example.com", phone: "+91 90040 55667", color: "#7A2E3A", createdAt: "2025-02-01" },
  { id: "frnd_amit", name: "Amit Verma", initials: "AV", email: "amit.verma@example.com", phone: "+91 99870 33445", color: "#2E6B8A", createdAt: "2025-03-12" },
  { id: "frnd_sneha", name: "Sneha Iyer", initials: "SI", email: "sneha.iyer@example.com", phone: "+91 91234 66778", color: "#8A6B2E", createdAt: "2025-03-12" },
  { id: "frnd_karthik", name: "Karthik Reddy", initials: "KR", email: "karthik.reddy@example.com", phone: "+91 89990 22110", color: "#4A4A8A", createdAt: "2025-05-20" },
];

const GROCERY_MERCHANTS = ["BigBasket", "DMart", "Reliance Fresh", "Nature's Basket", "Local Kirana Store"];
const RESTAURANT_MERCHANTS = ["Truffles", "Meghana Foods", "Empire Restaurant", "Third Wave Coffee", "Starbucks"];
const DELIVERY_MERCHANTS = ["Swiggy", "Zomato", "Swiggy Instamart", "Blinkit"];
const CAB_MERCHANTS = ["Uber", "Ola", "Rapido", "Auto fare"];

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

export function buildTransactions(): Transaction[] {
  const txns: Transaction[] = [];
  let counter = 1;
  const nextId = (prefix: string) => `${prefix}_${String(counter++).padStart(4, "0")}`;

  const today = new Date("2026-09-23");
  const start = new Date("2026-03-01");

  for (let m = 0; m < 7; m++) {
    const monthStart = new Date(start.getFullYear(), start.getMonth() + m, 1);
    if (monthStart > today) break;
    const y = monthStart.getFullYear();
    const mo = monthStart.getMonth();

    txns.push({
      id: nextId("txn"), type: "income", description: "Monthly Salary", memo: "Net salary credit",
      date: fmtDate(new Date(y, mo, 1)), currency: "INR", accountId: "acc_icici_sal",
      categoryId: "inc_salary", amount: round2(between(86000, 92000)), status: "posted",
      createdAt: fmtDate(new Date(y, mo, 1)),
    });

    txns.push({
      id: nextId("txn"), type: "transfer", description: "Sweep to Savings", memo: null,
      date: fmtDate(new Date(y, mo, 3)), currency: "INR", accountId: "acc_icici_sal",
      toAccountId: "acc_hdfc_sav", amount: round2(between(45000, 55000)), status: "posted",
      createdAt: fmtDate(new Date(y, mo, 3)),
    });

    txns.push({
      id: nextId("txn"), type: "expense",
      description: `Flat Rent — ${monthStart.toLocaleString("en-IN", { month: "long" })} Block`, memo: "Monthly rent, paid to landlord",
      date: fmtDate(new Date(y, mo, 5)), currency: "INR", accountId: "acc_hdfc_sav",
      categoryId: "cat_housing_rent", amount: 18500, status: "posted",
      createdAt: fmtDate(new Date(y, mo, 5)),
    });

    txns.push({
      id: nextId("txn"), type: "expense", description: "Electricity Bill — BESCOM", memo: null,
      date: fmtDate(new Date(y, mo, 8)), currency: "INR", accountId: "acc_hdfc_cc",
      categoryId: "cat_housing_utilities", amount: round2(between(1200, 2600)), status: "posted",
      createdAt: fmtDate(new Date(y, mo, 8)),
    });
    txns.push({
      id: nextId("txn"), type: "expense", description: "Broadband — ACT Fibernet", memo: null,
      date: fmtDate(new Date(y, mo, 10)), currency: "INR", accountId: "acc_hdfc_cc",
      categoryId: "cat_housing_utilities", amount: 999, status: "posted",
      createdAt: fmtDate(new Date(y, mo, 10)),
    });

    txns.push({
      id: nextId("txn"), type: "expense", description: "Netflix Subscription", memo: null,
      date: fmtDate(new Date(y, mo, 12)), currency: "INR", accountId: "acc_hdfc_cc",
      categoryId: "cat_entertainment_subs", amount: 649, status: "posted",
      createdAt: fmtDate(new Date(y, mo, 12)),
    });
    txns.push({
      id: nextId("txn"), type: "expense", description: "Spotify Premium", memo: null,
      date: fmtDate(new Date(y, mo, 12)), currency: "INR", accountId: "acc_hdfc_cc",
      categoryId: "cat_entertainment_subs", amount: 119, status: "posted",
      createdAt: fmtDate(new Date(y, mo, 12)),
    });

    txns.push({
      id: nextId("txn"), type: "expense", description: "Cult.fit Membership", memo: null,
      date: fmtDate(new Date(y, mo, 2)), currency: "INR", accountId: "acc_hdfc_sav",
      categoryId: "cat_health_gym", amount: 1499, status: "posted",
      createdAt: fmtDate(new Date(y, mo, 2)),
    });

    if (m > 0) {
      txns.push({
        id: nextId("txn"), type: "transfer", description: "Credit Card Bill Payment", memo: "HDFC Regalia statement payment",
        date: fmtDate(new Date(y, mo, 18)), currency: "INR", accountId: "acc_hdfc_sav",
        toAccountId: "acc_hdfc_cc", amount: round2(between(7000, 15000)), status: "posted",
        createdAt: fmtDate(new Date(y, mo, 18)),
      });
    }

    txns.push({
      id: nextId("txn"), type: "transfer", description: "ATM Cash Withdrawal", memo: null,
      date: fmtDate(new Date(y, mo, 15)), currency: "INR", accountId: "acc_hdfc_sav",
      toAccountId: "acc_cash", amount: round2(pick([2000, 3000, 5000])), status: "posted",
      createdAt: fmtDate(new Date(y, mo, 15)),
    });

    for (let i = 0; i < 6; i++) {
      const day = Math.min(28, 2 + i * 4 + Math.floor(rnd() * 3));
      const acc = pick(["acc_hdfc_cc", "acc_hdfc_sav", "acc_cash"]);
      const d = new Date(y, mo, day);
      if (d > today) continue;
      txns.push({
        id: nextId("txn"), type: "expense", description: pick(GROCERY_MERCHANTS), memo: null,
        date: fmtDate(d), currency: "INR", accountId: acc,
        categoryId: "cat_food_groceries", amount: round2(between(350, 2400)), status: "posted",
        createdAt: fmtDate(d),
      });
    }

    for (let i = 0; i < 8; i++) {
      const day = Math.min(28, 1 + Math.floor(rnd() * 27));
      const d = new Date(y, mo, day);
      if (d > today) continue;
      const isDelivery = rnd() > 0.5;
      txns.push({
        id: nextId("txn"), type: "expense",
        description: isDelivery ? pick(DELIVERY_MERCHANTS) : pick(RESTAURANT_MERCHANTS), memo: null,
        date: fmtDate(d), currency: "INR", accountId: pick(["acc_hdfc_cc", "acc_hdfc_sav"]),
        categoryId: isDelivery ? "cat_food_delivery" : "cat_food_restaurants",
        amount: round2(between(180, 1600)), status: "posted", createdAt: fmtDate(d),
      });
    }

    for (let i = 0; i < 6; i++) {
      const day = Math.min(28, 1 + Math.floor(rnd() * 27));
      const d = new Date(y, mo, day);
      if (d > today) continue;
      const isFuel = rnd() > 0.55;
      txns.push({
        id: nextId("txn"), type: "expense",
        description: isFuel ? "Indian Oil Petrol Pump" : pick(CAB_MERCHANTS), memo: null,
        date: fmtDate(d), currency: "INR", accountId: pick(["acc_hdfc_cc", "acc_cash"]),
        categoryId: isFuel ? "cat_transport_fuel" : "cat_transport_cab",
        amount: round2(isFuel ? between(800, 1800) : between(120, 650)), status: "posted", createdAt: fmtDate(d),
      });
    }

    if (rnd() > 0.3) {
      const day = Math.min(28, 5 + Math.floor(rnd() * 20));
      const d = new Date(y, mo, day);
      if (d <= today) {
        txns.push({
          id: nextId("txn"), type: "expense", description: pick(["Myntra", "Amazon Fashion", "H&M", "Decathlon"]),
          memo: null, date: fmtDate(d), currency: "INR", accountId: "acc_hdfc_cc",
          categoryId: "cat_shopping_clothing", amount: round2(between(800, 3500)), status: "posted", createdAt: fmtDate(d),
        });
      }
    }
    if (rnd() > 0.5) {
      const day = Math.min(28, 5 + Math.floor(rnd() * 20));
      const d = new Date(y, mo, day);
      if (d <= today) {
        txns.push({
          id: nextId("txn"), type: "expense", description: pick(["Apollo Pharmacy", "MedPlus", "1mg"]),
          memo: null, date: fmtDate(d), currency: "INR", accountId: "acc_cash",
          categoryId: "cat_health_pharmacy", amount: round2(between(150, 900)), status: "posted", createdAt: fmtDate(d),
        });
      }
    }
  }

  ["2026-04-18", "2026-06-22", "2026-08-09"].forEach((date) => {
    if (new Date(date) > today) return;
    txns.push({
      id: nextId("txn"), type: "income", description: "Freelance Project Payment", memo: "UI design contract",
      date, currency: "INR", accountId: "acc_icici_sal", categoryId: "inc_freelance",
      amount: round2(between(12000, 28000)), status: "posted", createdAt: date,
    });
  });
  ["2026-05-05", "2026-08-05"].forEach((date) => {
    if (new Date(date) > today) return;
    txns.push({
      id: nextId("txn"), type: "income", description: "Mutual Fund Dividend", memo: null,
      date, currency: "INR", accountId: "acc_hdfc_sav", categoryId: "inc_investments",
      amount: round2(between(900, 3200)), status: "posted", createdAt: date,
    });
  });

  const splitSeeds: Array<{ date: string; desc: string; account: string; category: string; total: number; friends: string[]; settledFrac: number[] }> = [
    { date: "2026-04-12", desc: "Team Dinner — Truffles Indiranagar", account: "acc_hdfc_cc", category: "cat_food_restaurants", total: 4800, friends: ["frnd_rahul", "frnd_priya"], settledFrac: [1, 0.5] },
    { date: "2026-05-30", desc: "Movie Night + Snacks", account: "acc_cash", category: "cat_entertainment_movies", total: 1600, friends: ["frnd_rahul", "frnd_sneha"], settledFrac: [1, 1] },
    { date: "2026-06-14", desc: "Weekend Getaway — Coorg", account: "acc_hdfc_cc", category: "cat_travel", total: 21600, friends: ["frnd_rahul", "frnd_priya", "frnd_amit", "frnd_sneha"], settledFrac: [1, 0.6, 0, 1] },
    { date: "2026-07-19", desc: "Birthday Dinner — Meghana Foods", account: "acc_hdfc_sav", category: "cat_food_restaurants", total: 3200, friends: ["frnd_amit", "frnd_karthik"], settledFrac: [0.4, 0] },
    { date: "2026-08-22", desc: "Grocery Run — Flatmates", account: "acc_hdfc_sav", category: "cat_food_groceries", total: 2850, friends: ["frnd_priya"], settledFrac: [1] },
    { date: "2026-09-10", desc: "Cricket Match Tickets", account: "acc_hdfc_cc", category: "cat_entertainment", total: 6000, friends: ["frnd_amit", "frnd_karthik", "frnd_sneha"], settledFrac: [0, 0, 0.5] },
  ];
  splitSeeds.forEach((s) => {
    if (new Date(s.date) > today) return;
    const shareCount = s.friends.length + 1;
    const perShare = round2(s.total / shareCount);
    const splits = s.friends.map((fid, i) => ({ friendId: fid, share: perShare, settled: round2(perShare * s.settledFrac[i]) }));
    txns.push({
      id: nextId("txn"), type: "split", description: s.desc, memo: "Split evenly", date: s.date,
      currency: "INR", accountId: s.account, categoryId: s.category, amount: s.total,
      yourShare: perShare, splits, status: "posted", createdAt: s.date,
    });
  });

  const settlementSeeds: Array<{ date: string; friendId: string; account: string; amount: number; direction: "receive" | "pay"; memo: string }> = [
    { date: "2026-05-02", friendId: "frnd_rahul", account: "acc_hdfc_sav", amount: 900, direction: "receive", memo: "UPI settle-up" },
    { date: "2026-07-28", friendId: "frnd_priya", account: "acc_cash", amount: 500, direction: "receive", memo: "Cash settle-up" },
    { date: "2026-09-02", friendId: "frnd_karthik", account: "acc_hdfc_sav", amount: 1200, direction: "pay", memo: "Paid back for concert tickets from March" },
  ];
  settlementSeeds.forEach((s) => {
    if (new Date(s.date) > today) return;
    txns.push({
      id: nextId("txn"), type: "settlement", description: `Settlement — ${FRIENDS.find((f) => f.id === s.friendId)!.name}`,
      memo: s.memo, date: s.date, currency: "INR", accountId: s.account, friendId: s.friendId,
      amount: s.amount, direction: s.direction, status: "posted", createdAt: s.date,
    });
  });

  const refundOriginal = txns.find((t) => t.description === "Myntra" || t.description === "Amazon Fashion");
  if (refundOriginal) {
    txns.push({
      id: nextId("txn"), type: "refund", description: `Refund — ${refundOriginal.description}`,
      memo: "Returned item, wrong size", date: fmtDate(addDays(new Date(refundOriginal.date), 6)),
      currency: "INR", accountId: refundOriginal.accountId, categoryId: refundOriginal.categoryId,
      amount: round2(refundOriginal.amount! * 0.6), refundOfId: refundOriginal.id, status: "posted",
      createdAt: fmtDate(addDays(new Date(refundOriginal.date), 6)),
    });
  }

  txns.push({
    id: nextId("txn"), type: "adjustment", description: "Opening Balance Correction — Cash Wallet",
    memo: "Physical cash count differed from recorded balance", date: "2026-03-02",
    currency: "INR", accountId: "acc_cash", amount: 150, direction: "increase", status: "posted",
    createdAt: "2026-03-02",
  });

  txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return txns;
}
