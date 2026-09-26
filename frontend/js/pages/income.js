(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR } = global.fmt;

  function render(container) {
    container.innerHTML = `<div id="income-summary"></div><div id="income-list"></div>`;
    paintSummary(container.querySelector("#income-summary"));
    global.TxnList.render(container.querySelector("#income-list"), {
      allowedTypes: ["income"], title: "Income entries",
      description: "Every credit to your accounts, grouped by source.",
      showTypeFilter: false, showCategoryFilter: true, showAccountFilter: true, showFriendFilter: false,
      addType: "income", emptyTitle: "No income recorded", emptyDesc: "Add your salary, freelance payments or other income to see it here.",
    });
  }

  function paintSummary(el) {
    const buckets = S.lastNMonthsBuckets(6);
    const series = buckets.map((b) => S.calcTotalIncome(b));
    const range = S.monthRange(1);
    const bySource = S.state.incomeSources.map((src) => {
      const total = S.activeTxns((t) => t.type === "income" && t.categoryId === src.id && t.date >= range.from && t.date <= range.to)
        .reduce((a, t) => a + t.amount, 0);
      return { src, total };
    }).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
    const totalThisMonth = bySource.reduce((a, x) => a + x.total, 0);

    el.innerHTML = `
      <div class="page-head"><div><h1 class="page-head__title">Income</h1><p class="page-head__desc">Track where your money comes from.</p></div></div>
      <div class="grid grid-2-1" style="margin-bottom:20px">
        <div class="card">
          <div class="card__title">Income trend — last 6 months</div>
          <div class="card__subtitle" style="margin-bottom:10px">Total credited per month</div>
          ${global.Chart.bar({
            categories: buckets.map((b) => b.label),
            series: [{ label: "Income", color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), values: series }],
            yFormat: (v) => "₹" + Math.round(v / 1000) + "k",
          })}
        </div>
        <div class="card">
          <div class="card__title">By source (30d)</div>
          <div class="card__subtitle" style="margin-bottom:10px">${formatINR(totalThisMonth)} total</div>
          ${bySource.length ? bySource.map((x) => `
            <div class="insight-card">
              ${global.Visuals.incomeChip(x.src, 32)}
              <div style="flex:1"><div class="row-primary" style="font-size:13px">${x.src.name}</div>
              <div class="progress-bar" style="margin-top:6px"><div class="progress-bar__fill" style="width:${(x.total / totalThisMonth) * 100}%;background:${x.src.color}"></div></div></div>
              <div class="ledger-figure num" style="font-size:13.5px">${formatINR(x.total)}</div>
            </div>`).join("") : `<div class="empty-state"><div class="empty-state__desc">No income this month yet</div></div>`}
        </div>
      </div>
    `;
  }

  global.Pages = global.Pages || {};
  global.Pages.income = { render };
})(window);
