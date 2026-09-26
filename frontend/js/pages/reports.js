(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR } = global.fmt;

  const TABS = [
    { id: "cashflow", label: "Cash Flow" },
    { id: "categories", label: "Category Analysis" },
    { id: "accounts", label: "Account Analysis" },
    { id: "dues", label: "Splits & Dues" },
  ];

  function render(container) {
    let active = "cashflow";
    container.innerHTML = `
      <div class="page-head"><div><h1 class="page-head__title">Reports & Trends</h1><p class="page-head__desc">A deeper look at how your money moves.</p></div></div>
      <div class="tabs" id="rp-tabs">${TABS.map((t) => `<button class="tab ${t.id === active ? "is-active" : ""}" data-tab="${t.id}">${t.label}</button>`).join("")}</div>
      <div id="rp-body"></div>
    `;
    const body = container.querySelector("#rp-body");
    paint(body, active);
    container.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => {
      active = tab.dataset.tab;
      container.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === active));
      paint(body, active);
    }));
  }

  function paint(body, tab) {
    if (tab === "cashflow") return cashflowTab(body);
    if (tab === "categories") return categoriesTab(body);
    if (tab === "accounts") return accountsTab(body);
    if (tab === "dues") return duesTab(body);
  }

  function color(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }

  function cashflowTab(body) {
    const buckets = S.lastNMonthsBuckets(6);
    const income = buckets.map((b) => S.calcTotalIncome(b));
    const expense = buckets.map((b) => S.calcTotalExpenses(b));
    const net = income.map((v, i) => Math.round((v - expense[i]) * 100) / 100);
    const totalIncome = income.reduce((a, b) => a + b, 0);
    const totalExpense = expense.reduce((a, b) => a + b, 0);
    const savingsRate = totalIncome ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

    body.innerHTML = `
      <div class="grid grid-cols-3" style="margin-bottom:20px">
        <div class="card stat-card"><div class="stat-card__label">Total income (6mo)</div><div class="stat-card__value ledger-figure num text-pos">${formatINR(totalIncome)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Total expenses (6mo)</div><div class="stat-card__value ledger-figure num text-neg">${formatINR(totalExpense)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Savings rate</div><div class="stat-card__value ledger-figure num ${savingsRate >= 0 ? "text-pos" : "text-neg"}">${savingsRate}%</div></div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card__title">Income vs. expenses</div>
        <div class="card__subtitle" style="margin-bottom:10px">Monthly comparison</div>
        ${global.Chart.bar({ categories: buckets.map((b) => b.label), series: [
          { label: "Income", color: color("--accent"), values: income },
          { label: "Expenses", color: color("--negative"), values: expense },
        ], yFormat: (v) => "₹" + Math.round(v / 1000) + "k" })}
        <div class="legend"><span class="legend__item"><span class="legend__dot" style="background:${color("--accent")}"></span>Income</span><span class="legend__item"><span class="legend__dot" style="background:${color("--negative")}"></span>Expenses</span></div>
      </div>
      <div class="card">
        <div class="card__title">Net cash flow trend</div>
        ${global.Chart.line({ series: [{ label: "Net", color: color("--info"), points: buckets.map((b, i) => ({ x: i, y: net[i], label: b.label })) }], yFormat: (v) => "₹" + Math.round(v / 1000) + "k" })}
      </div>
    `;
  }

  function categoriesTab(body) {
    const range = S.monthRange(1);
    const range6 = S.monthRange(6);
    const roots = S.categoryRoots().map((c) => ({ cat: c, spent30: S.calcCategorySpend(c.id, range), spent6mo: S.calcCategorySpend(c.id, range6) })).sort((a, b) => b.spent30 - a.spent30);
    const total30 = roots.reduce((a, x) => a + x.spent30, 0);
    body.innerHTML = `
      <div class="grid grid-2-1" style="margin-bottom:20px">
        <div class="card">
          <div class="card__title">Category breakdown (30d)</div>
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Category</th><th class="num">30 days</th><th class="num">6 months</th><th class="num">Share</th></tr></thead>
            <tbody>${roots.map((x) => `<tr>
              <td><span style="display:inline-flex;align-items:center;gap:8px"><span style="width:9px;height:9px;border-radius:3px;background:${x.cat.color}"></span>${x.cat.name}</span></td>
              <td class="num">${formatINR(x.spent30)}</td>
              <td class="num">${formatINR(x.spent6mo)}</td>
              <td class="num">${total30 ? Math.round((x.spent30 / total30) * 100) : 0}%</td>
            </tr>`).join("")}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card__title">Share of spend (30d)</div>
          ${total30 ? global.Chart.donut({ segments: roots.filter((x) => x.spent30 > 0).map((x) => ({ label: x.cat.name, value: x.spent30, color: x.cat.color })), size: 180, thickness: 26, centerLabel: formatINR(total30), centerSub: "total" }) : `<div class="empty-state"><div class="empty-state__desc">No spend yet</div></div>`}
        </div>
      </div>
      <div class="card">
        <div class="card__title">Category trend — top 4 (6 months)</div>
        ${global.Chart.line({
          series: roots.slice(0, 4).map((x) => ({ label: x.cat.name, color: x.cat.color, points: S.lastNMonthsBuckets(6).map((b, i) => ({ x: i, y: S.calcCategorySpend(x.cat.id, b), label: b.label })) })),
          yFormat: (v) => "₹" + Math.round(v / 1000) + "k",
        })}
        <div class="legend">${roots.slice(0, 4).map((x) => `<span class="legend__item"><span class="legend__dot" style="background:${x.cat.color}"></span>${x.cat.name}</span>`).join("")}</div>
      </div>
    `;
  }

  function accountsTab(body) {
    const accounts = S.state.accounts.filter((a) => !a.isSystem);
    body.innerHTML = `
      <div class="card">
        <div class="card__title">Account balances</div>
        <div class="table-wrap"><table class="data-table">
          <thead><tr><th>Account</th><th>Type</th><th>Status</th><th class="num">Balance</th></tr></thead>
          <tbody>${accounts.map((a) => `<tr>
            <td>${a.name}</td><td>${a.accountType === "ASSET" ? "Asset" : "Liability"}</td>
            <td>${a.isActive ? `<span class="badge badge--income">Active</span>` : `<span class="badge badge--neutral">Archived</span>`}</td>
            <td class="num ledger-figure">${formatINR(S.calcAccountBalance(a.id))}</td>
          </tr>`).join("")}</tbody>
        </table></div>
      </div>
      <div class="card" style="margin-top:20px">
        <div class="card__title">Spend by account (30d)</div>
        ${global.Chart.bar({
          categories: accounts.filter((a) => a.isActive).map((a) => a.name.split(" ")[0]),
          series: [{ label: "Spent", color: color("--warn"), values: accounts.filter((a) => a.isActive).map((a) => S.activeTxns((t) => (t.type === "expense" || t.type === "split") && t.accountId === a.id && t.date >= S.monthRange(1).from).reduce((s, t) => s + (t.yourShare != null ? t.yourShare : t.amount), 0)) }],
          yFormat: (v) => "₹" + Math.round(v),
        })}
      </div>
    `;
  }

  function duesTab(body) {
    const friends = S.state.friends.map((f) => ({ f, bal: S.calcFriendOutstanding(f.id) }));
    const owed = friends.filter((x) => x.bal > 0).reduce((a, x) => a + x.bal, 0);
    const owe = friends.filter((x) => x.bal < 0).reduce((a, x) => a - x.bal, 0);
    body.innerHTML = `
      <div class="grid grid-2-1">
        <div class="card">
          <div class="card__title">Outstanding by friend</div>
          <div class="table-wrap"><table class="data-table">
            <thead><tr><th>Friend</th><th class="num">Balance</th></tr></thead>
            <tbody>${friends.map((x) => `<tr><td>${x.f.name}</td><td class="num ledger-figure ${x.bal > 0 ? "text-pos" : x.bal < 0 ? "text-neg" : ""}">${x.bal === 0 ? "Settled" : formatINR(Math.abs(x.bal)) + (x.bal > 0 ? " owed to you" : " you owe")}</td></tr>`).join("")}</tbody>
          </table></div>
        </div>
        <div class="card">
          <div class="card__title">Net position</div>
          ${global.Chart.donut({ segments: [{ label: "Owed to you", value: owed || 0.01, color: color("--accent") }, { label: "You owe", value: owe || 0.01, color: color("--negative") }], size: 170, thickness: 24, centerLabel: formatINR(owed - owe), centerSub: "net" })}
          <div class="legend"><span class="legend__item"><span class="legend__dot" style="background:${color("--accent")}"></span>Owed to you</span><span class="legend__item"><span class="legend__dot" style="background:${color("--negative")}"></span>You owe</span></div>
        </div>
      </div>
    `;
  }

  global.Pages = global.Pages || {};
  global.Pages.reports = { render };
})(window);
