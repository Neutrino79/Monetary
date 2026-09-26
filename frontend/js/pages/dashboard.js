(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR, formatDate } = global.fmt;
  const V = global.Visuals;

  function render(container) {
    container.innerHTML = `<div id="dash-skel"></div>`;
    skeleton(container.querySelector("#dash-skel"));
    const token = global.Router.beginRender();
    setTimeout(() => { if (global.Router.isCurrent(token)) paint(container); }, 320);
  }

  function skeleton(el) {
    el.innerHTML = `
      <div class="page-head"><div><div class="skeleton" style="width:180px;height:26px"></div></div></div>
      <div class="grid grid-cols-4" style="margin-bottom:20px">${[1,2,3,4].map(() => `<div class="skeleton skeleton-card"></div>`).join("")}</div>
      <div class="skeleton" style="height:260px;border-radius:16px"></div>
    `;
  }

  function paint(container) {
    const range30 = S.monthRange(1);
    const rangeAll = S.monthRange(6);
    const income = S.calcTotalIncome(range30);
    const expenses = S.calcTotalExpenses(range30);
    const netFlow = Math.round((income - expenses) * 100) / 100;
    const netWorth = S.calcNetWorth();
    const buckets = S.lastNMonthsBuckets(6);
    const incomeSeries = buckets.map((b) => S.calcTotalIncome(b));
    const expenseSeries = buckets.map((b) => S.calcTotalExpenses(b));
    const budgets = S.calcBudgetUsage(range30).sort((a, b) => b.pct - a.pct).slice(0, 4);
    const dueFriends = S.state.friends.map((f) => ({ f, bal: S.calcFriendOutstanding(f.id) })).filter((x) => Math.abs(x.bal) > 0.5);
    const owedToYou = dueFriends.filter((x) => x.bal > 0).reduce((a, x) => a + x.bal, 0);
    const youOwe = dueFriends.filter((x) => x.bal < 0).reduce((a, x) => a - x.bal, 0);
    const recent = S.activeTxns().slice(0, 6);

    const catSpend = S.categoryRoots().map((c) => ({ cat: c, spent: S.calcCategorySpend(c.id, range30) })).filter((x) => x.spent > 0).sort((a, b) => b.spent - a.spent);
    const topCat = catSpend[0];

    container.innerHTML = `
      <div class="page-head">
        <div>
          <h1 class="page-head__title">Good to see you, ${S.state.settings.ownerName.split(" ")[0]}</h1>
          <p class="page-head__desc">Here's where things stand over the last 30 days.</p>
        </div>
        <div class="page-head__actions">
          <button class="btn btn--secondary" id="dash-export">${global.Icons.icon("download", { size: 15 })} Export</button>
          <button class="btn btn--primary" id="dash-add">${global.Icons.icon("plus", { size: 15 })} Add transaction</button>
        </div>
      </div>

      <div class="grid grid-cols-4" style="margin-bottom:20px">
        <div class="card stat-card">
          <div class="stat-card__label">Net worth</div>
          <div class="stat-card__value ledger-figure num">${formatINR(netWorth.net)}</div>
          <div class="text-faint" style="font-size:11.5px">${formatINR(netWorth.assets)} assets − ${formatINR(netWorth.liabilities)} owed</div>
        </div>
        <div class="card stat-card">
          <div class="stat-card__label">${global.Icons.icon("trendingUp", { size: 14 })} Income (30d)</div>
          <div class="stat-card__value ledger-figure num text-pos">${formatINR(income)}</div>
          <span class="stat-card__delta stat-card__delta--up">Salary + freelance</span>
        </div>
        <div class="card stat-card">
          <div class="stat-card__label">${global.Icons.icon("trendingDown", { size: 14 })} Expenses (30d)</div>
          <div class="stat-card__value ledger-figure num text-neg">${formatINR(expenses)}</div>
          <span class="stat-card__delta ${topCat ? "stat-card__delta--down" : ""}">${topCat ? `Top: ${topCat.cat.name}` : "No spend yet"}</span>
        </div>
        <div class="card stat-card">
          <div class="stat-card__label">Net cash flow (30d)</div>
          <div class="stat-card__value ledger-figure num ${netFlow >= 0 ? "text-pos" : "text-neg"}">${netFlow >= 0 ? "+" : "−"}${formatINR(Math.abs(netFlow))}</div>
          <span class="stat-card__delta ${netFlow >= 0 ? "stat-card__delta--up" : "stat-card__delta--down"}">${netFlow >= 0 ? "Saving this month" : "Spending more than earning"}</span>
        </div>
      </div>

      <div class="grid grid-2-1" style="margin-bottom:20px">
        <div class="card">
          <div class="card__head">
            <div><div class="card__title">Cash flow — last 6 months</div><div class="card__subtitle">Income vs. expenses, month over month</div></div>
            <div class="legend" style="margin-top:0">
              <span class="legend__item"><span class="legend__dot" style="background:var(--accent)"></span>Income</span>
              <span class="legend__item"><span class="legend__dot" style="background:var(--negative)"></span>Expenses</span>
            </div>
          </div>
          ${global.Chart.line({
            series: [
              { label: "Income", color: getComputedColor("--accent"), points: buckets.map((b, i) => ({ x: i, y: incomeSeries[i], label: b.label })) },
              { label: "Expenses", color: getComputedColor("--negative"), points: buckets.map((b, i) => ({ x: i, y: expenseSeries[i], label: b.label })) },
            ],
            yFormat: (v) => "₹" + Math.round(v / 1000) + "k",
          })}
        </div>
        <div class="card">
          <div class="card__title">Where it went</div>
          <div class="card__subtitle" style="margin-bottom:10px">Spending by category (30d)</div>
          ${catSpend.length ? global.Chart.donut({
            segments: catSpend.slice(0, 6).map((x) => ({ label: x.cat.name, value: x.spent, color: x.cat.color })),
            size: 172, thickness: 24, centerLabel: formatINR(expenses).replace("₹", "₹"), centerSub: "total spent",
          }) : emptyMini("No expenses in the last 30 days")}
          <div class="legend">
            ${catSpend.slice(0, 5).map((x) => `<span class="legend__item"><span class="legend__dot" style="background:${x.cat.color}"></span>${x.cat.name}</span>`).join("")}
          </div>
        </div>
      </div>

      <div class="grid grid-2-1">
        <div class="card">
          <div class="card__head">
            <div class="card__title">Recent activity</div>
            <a href="#/transactions" class="btn btn--ghost btn--sm">View all ${global.Icons.icon("chevronRight", { size: 14 })}</a>
          </div>
          ${recent.length ? recent.map((t) => `
            <div class="recent-txn-row" data-id="${t.id}">
              ${V.txnIconChip(t)}
              <div class="recent-txn-row__meta">
                <div class="recent-txn-row__title">${t.description}</div>
                <div class="recent-txn-row__sub">${formatDate(t.date, "short")} · ${S.getAccount(t.accountId) ? S.getAccount(t.accountId).name : ""}</div>
              </div>
              <div class="recent-txn-row__amt ${V.txnAmountDisplay(t).cls}">${V.txnAmountDisplay(t).text}</div>
            </div>`).join("") : emptyMini("Nothing recorded yet")}
        </div>

        <div style="display:flex;flex-direction:column;gap:20px">
          <div class="card">
            <div class="card__title">Budgets this month</div>
            <div class="card__subtitle" style="margin-bottom:12px">Top categories against their limit</div>
            ${budgets.length ? budgets.map((b) => `
              <div style="margin-bottom:14px">
                <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:6px">
                  <span>${b.category.name}</span>
                  <span class="${b.pct > 100 ? "text-neg" : "text-soft"}">${formatINR(b.spent)} / ${formatINR(b.limit)}</span>
                </div>
                <div class="progress-bar"><div class="progress-bar__fill" style="width:${Math.min(100, b.pct)}%;background:${b.pct > 100 ? "var(--negative)" : b.pct > 80 ? "var(--warn)" : "var(--accent)"}"></div></div>
              </div>`).join("") : emptyMini("No budgets set up")}
            <a href="#/categories" class="btn btn--ghost btn--sm btn--block" style="margin-top:4px">Manage budgets</a>
          </div>

          <div class="card">
            <div class="card__title">Splits & dues</div>
            <div class="card__subtitle" style="margin-bottom:10px">Net position with friends</div>
            <div class="due-summary-card"><span class="text-soft">Owed to you</span><span class="ledger-figure text-pos num">${formatINR(owedToYou)}</span></div>
            <div class="due-summary-card"><span class="text-soft">You owe</span><span class="ledger-figure text-neg num">${formatINR(youOwe)}</span></div>
            <a href="#/friends" class="btn btn--ghost btn--sm btn--block" style="margin-top:8px">View friends ${global.Icons.icon("chevronRight", { size: 13 })}</a>
          </div>
        </div>
      </div>
    `;

    container.querySelector("#dash-add").addEventListener("click", () => global.TransactionForm.open({ type: "expense", onSaved: () => { global.Router.rerenderCurrent(); global.App.refreshBadges(); } }));
    container.querySelector("#dash-export").addEventListener("click", () => global.App.openExportModal());
    container.querySelectorAll(".recent-txn-row[data-id]").forEach((row) => row.addEventListener("click", () => {
      const txn = S.state.transactions.find((t) => t.id === row.dataset.id);
      global.TxnDetail.open(txn, { onChange: () => global.Router.rerenderCurrent() });
    }));
  }

  function emptyMini(msg) {
    return `<div class="empty-state" style="padding:32px 12px"><div class="empty-state__desc">${msg}</div></div>`;
  }

  function getComputedColor(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || "#1F6D4C";
  }

  global.Pages = global.Pages || {};
  global.Pages.dashboard = { render };
})(window);
