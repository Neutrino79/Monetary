(function (global) {
  "use strict";
  const { uid } = global.fmt;
  const D = global.MOCK_DATA;

  // ------------------------------------------------------------- app state
  const appState = {
    accounts: JSON.parse(JSON.stringify(D.ACCOUNTS)),
    categories: JSON.parse(JSON.stringify(D.CATEGORIES)),
    incomeSources: JSON.parse(JSON.stringify(D.INCOME_SOURCES)),
    friends: JSON.parse(JSON.stringify(D.FRIENDS)),
    transactions: JSON.parse(JSON.stringify(D.TRANSACTIONS)),
    settings: {
      theme: localStorage.getItem("emx_theme") || "light",
      ledgerMode: localStorage.getItem("emx_ledger_mode") || "DIRECT",
      ownerName: "Ananya Kulkarni",
      ownerEmail: "ananya.kulkarni@example.com",
      currency: "INR",
      timezone: "Asia/Kolkata",
      homeCurrencyCode: "INR",
    },
    ui: {
      sidebarCollapsed: false,
      commandPaletteOpen: false,
    },
  };

  const listeners = new Set();
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function emit(reason) { listeners.forEach((fn) => { try { fn(reason); } catch (e) { console.error(e); } }); }

  const round2 = (n) => Math.round(n * 100) / 100;

  // --------------------------------------------------------------- lookups
  function getAccount(id) { return appState.accounts.find((a) => a.id === id); }
  function getCategory(id) { return appState.categories.find((c) => c.id === id) || D.INCOME_SOURCES.find(s => s.id === id) || appState.incomeSources.find((c) => c.id === id); }
  function getFriend(id) { return appState.friends.find((f) => f.id === id); }
  function isIncomeSource(id) { return appState.incomeSources.some((s) => s.id === id); }
  function categoryChildren(id) { return appState.categories.filter((c) => c.parentId === id); }
  function categoryRoots() { return appState.categories.filter((c) => !c.parentId); }

  function activeTxns(extra) {
    return appState.transactions.filter((t) => t.status !== "reversed" && (!extra || extra(t)));
  }

  // ---------------------------------------------------------- calculators
  function calcAccountBalance(accountId, asOfDate) {
    const acc = getAccount(accountId);
    if (!acc) return 0;
    let bal = acc.openingBalance || 0;
    activeTxns((t) => !asOfDate || t.date <= asOfDate).forEach((t) => {
      const liab = acc.accountType === "LIABILITY";
      if ((t.type === "expense" || t.type === "split") && t.accountId === accountId) bal += liab ? t.amount : -t.amount;
      if (t.type === "income" && t.accountId === accountId) bal += t.amount;
      if (t.type === "transfer") {
        if (t.accountId === accountId) bal -= t.amount;
        if (t.toAccountId === accountId) bal += liab ? -t.amount : t.amount;
      }
      if (t.type === "settlement" && t.accountId === accountId) bal += t.direction === "receive" ? t.amount : -t.amount;
      if (t.type === "refund" && t.accountId === accountId) bal += liab ? -t.amount : t.amount;
      if (t.type === "adjustment" && t.accountId === accountId) bal += t.direction === "increase" ? t.amount : -t.amount;
    });
    return round2(bal);
  }

  function calcNetWorth() {
    let assets = 0, liabilities = 0;
    appState.accounts.filter((a) => a.isActive && !a.isSystem).forEach((a) => {
      const b = calcAccountBalance(a.id);
      if (a.accountType === "ASSET") assets += b;
      if (a.accountType === "LIABILITY") liabilities += b;
    });
    return { assets: round2(assets), liabilities: round2(liabilities), net: round2(assets - liabilities) };
  }

  function calcFriendOutstanding(friendId) {
    // positive = friend owes you; negative = you owe friend
    let bal = 0;
    activeTxns().forEach((t) => {
      if (t.type === "split") {
        const s = (t.splits || []).find((sp) => sp.friendId === friendId);
        if (s) bal += round2(s.share - s.settled);
      }
      if (t.type === "settlement" && t.friendId === friendId) {
        bal += t.direction === "receive" ? -t.amount : t.amount;
      }
    });
    return round2(bal);
  }

  function calcCategorySpend(categoryId, range) {
    const kids = categoryChildren(categoryId).map((c) => c.id);
    const ids = new Set([categoryId, ...kids]);
    let total = 0;
    activeTxns((t) => (!range || (t.date >= range.from && t.date <= range.to))).forEach((t) => {
      if (t.type === "expense" && ids.has(t.categoryId)) total += t.amount;
      if (t.type === "split" && ids.has(t.categoryId)) total += t.yourShare != null ? t.yourShare : t.amount;
      if (t.type === "refund" && ids.has(t.categoryId)) total -= t.amount;
    });
    return round2(total);
  }

  function calcTotalExpenses(range) {
    let total = 0;
    activeTxns((t) => !range || (t.date >= range.from && t.date <= range.to)).forEach((t) => {
      if (t.type === "expense") total += t.amount;
      if (t.type === "split") total += t.yourShare != null ? t.yourShare : t.amount;
      if (t.type === "refund") total -= t.amount;
    });
    return round2(total);
  }

  function calcTotalIncome(range) {
    let total = 0;
    activeTxns((t) => (!range || (t.date >= range.from && t.date <= range.to)) && t.type === "income")
      .forEach((t) => (total += t.amount));
    return round2(total);
  }

  function calcBudgetUsage(range) {
    return categoryRoots().filter((c) => c.budgetLimit != null).map((c) => {
      const spent = calcCategorySpend(c.id, range);
      return { category: c, spent, limit: c.budgetLimit, pct: round2((spent / c.budgetLimit) * 100) };
    });
  }

  function monthRange(monthsBack) {
    const end = new Date("2026-09-23");
    const start = new Date(end);
    start.setMonth(start.getMonth() - monthsBack);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }

  function lastNMonthsBuckets(n) {
    const end = new Date("2026-09-23");
    const buckets = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
      const from = d.toISOString().slice(0, 10);
      const to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
      buckets.push({
        label: d.toLocaleDateString("en-IN", { month: "short" }),
        key: from.slice(0, 7),
        from, to: to > "2026-09-23" ? "2026-09-23" : to,
      });
    }
    return buckets;
  }

  global.Store = {
    state: appState, subscribe, emit, uid,
    getAccount, getCategory, getFriend, isIncomeSource, categoryChildren, categoryRoots, activeTxns,
    calcAccountBalance, calcNetWorth, calcFriendOutstanding, calcCategorySpend,
    calcTotalExpenses, calcTotalIncome, calcBudgetUsage, monthRange, lastNMonthsBuckets,
  };
})(window);
