(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR } = global.fmt;

  function render(container) {
    container.innerHTML = `<div id="exp-summary"></div><div id="exp-list"></div>`;
    paintSummary(container.querySelector("#exp-summary"));
    global.TxnList.render(container.querySelector("#exp-list"), {
      allowedTypes: ["expense", "split", "refund"], title: "Expense entries",
      description: "Every debit against your accounts, including your share of splits.",
      showTypeFilter: true, showCategoryFilter: true, showAccountFilter: true, showFriendFilter: false,
      addType: "expense", emptyTitle: "No expenses recorded", emptyDesc: "Add an expense to start tracking your spending.",
    });
  }

  function paintSummary(el) {
    const range = S.monthRange(1);
    const buckets = S.lastNMonthsBuckets(6);
    const series = buckets.map((b) => S.calcTotalExpenses(b));
    const catSpend = S.categoryRoots().map((c) => ({ cat: c, spent: S.calcCategorySpend(c.id, range) })).filter((x) => x.spent > 0).sort((a, b) => b.spent - a.spent);
    const total = catSpend.reduce((a, x) => a + x.spent, 0);
    const budgets = S.calcBudgetUsage(range);

    el.innerHTML = `
      <div class="page-head"><div><h1 class="page-head__title">Expenses</h1><p class="page-head__desc">See where your money is going, and how it stacks against your budgets.</p></div></div>
      <div class="grid grid-cols-3" style="margin-bottom:20px">
        <div class="card" style="grid-column: span 2">
          <div class="card__title">Spending trend — last 6 months</div>
          <div class="card__subtitle" style="margin-bottom:10px">Total spent per month</div>
          ${global.Chart.bar({
            categories: buckets.map((b) => b.label),
            series: [{ label: "Expenses", color: getComputedStyle(document.documentElement).getPropertyValue("--negative").trim(), values: series }],
            yFormat: (v) => "₹" + Math.round(v / 1000) + "k",
          })}
        </div>
        <div class="card">
          <div class="card__title">By category (30d)</div>
          ${catSpend.length ? global.Chart.donut({ segments: catSpend.slice(0, 6).map((x) => ({ label: x.cat.name, value: x.spent, color: x.cat.color })), size: 150, thickness: 22, centerLabel: formatINR(total), centerSub: "total" }) : `<div class="empty-state"><div class="empty-state__desc">No spend yet</div></div>`}
        </div>
      </div>
      <div class="card" style="margin-bottom:20px">
        <div class="card__title">Budget usage (30d)</div>
        <div class="card__subtitle" style="margin-bottom:12px">Root categories with a monthly limit</div>
        <div class="grid grid-cols-3">
          ${budgets.map((b) => `
            <div class="card card--tight">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
                <span class="row-primary" style="font-size:13px">${b.category.name}</span>
                ${global.Chart.ring({ pct: b.pct, size: 40, thickness: 5, color: b.pct > 100 ? "var(--negative)" : b.pct > 80 ? "var(--warn)" : "var(--accent)" })}
              </div>
              <div style="font-size:12.5px" class="text-soft">${formatINR(b.spent)} of ${formatINR(b.limit)}</div>
              <div class="progress-bar" style="margin-top:8px"><div class="progress-bar__fill" style="width:${Math.min(100, b.pct)}%;background:${b.pct > 100 ? "var(--negative)" : b.pct > 80 ? "var(--warn)" : "var(--accent)"}"></div></div>
            </div>`).join("")}
        </div>
      </div>
    `;
  }

  global.Pages = global.Pages || {};
  global.Pages.expenses = { render };
})(window);
