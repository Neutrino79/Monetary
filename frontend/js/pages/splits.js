(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR, formatDate } = global.fmt;
  const V = global.Visuals;

  function render(container) {
    const state = { search: "", friendId: "", status: "", from: "", to: "" };

    container.innerHTML = `
      <div class="page-head">
        <div><h1 class="page-head__title">Splits</h1><p class="page-head__desc">Shared expenses — your share is a real cost, everyone else's is a receivable.</p></div>
        <div class="page-head__actions"><button class="btn btn--primary" id="sp-add">${global.Icons.icon("plus", { size: 15 })} Add split expense</button></div>
      </div>

      <div class="split-summary-grid" id="sp-stats"></div>

      <div class="card">
        <div class="filter-bar" id="sp-filters"></div>
        <div class="card__subtitle" style="margin-bottom:12px">Click a split to see participant-level detail</div>
        <div id="sp-list"></div>
      </div>
    `;

    renderFilters();
    renderAll();
    container.querySelector("#sp-add").addEventListener("click", () => global.TransactionForm.open({ type: "split", onSaved: () => global.Router.rerenderCurrent() }));

    function renderFilters() {
      const bar = container.querySelector("#sp-filters");
      bar.innerHTML = `
        <div class="filter-bar__row">
          <div class="topbar__search filter-bar__search" style="background:var(--paper-sunken)">
            ${global.Icons.icon("search", { size: 15 })}
            <input type="text" placeholder="Search description…" id="sp-search" />
          </div>
          <select class="select" id="sp-friend">
            <option value="">All friends</option>
            ${S.state.friends.map((f) => `<option value="${f.id}">${f.name}</option>`).join("")}
          </select>
          <select class="select" id="sp-status">
            <option value="">Any status</option>
            <option value="outstanding">Outstanding</option>
            <option value="settled">Fully settled</option>
          </select>
        </div>
        <div class="filter-bar__row">
          <input type="date" class="input filter-bar__date" id="sp-from" max="2026-09-23" title="From date" />
          <input type="date" class="input filter-bar__date" id="sp-to" max="2026-09-23" title="To date" />
          <button class="btn btn--ghost btn--sm filter-bar__clear" id="sp-clear">Clear filters</button>
        </div>
      `;
      bar.querySelector("#sp-search").addEventListener("input", (e) => { state.search = e.target.value; renderAll(); });
      bar.querySelector("#sp-friend").addEventListener("change", (e) => { state.friendId = e.target.value; renderAll(); });
      bar.querySelector("#sp-status").addEventListener("change", (e) => { state.status = e.target.value; renderAll(); });
      bar.querySelector("#sp-from").addEventListener("change", (e) => { state.from = e.target.value; renderAll(); });
      bar.querySelector("#sp-to").addEventListener("change", (e) => { state.to = e.target.value; renderAll(); });
      bar.querySelector("#sp-clear").addEventListener("click", () => { Object.assign(state, { search: "", friendId: "", status: "", from: "", to: "" }); renderFilters(); renderAll(); });
    }

    function filtered() {
      let rows = S.activeTxns((t) => t.type === "split");
      if (state.search) { const q = state.search.toLowerCase(); rows = rows.filter((t) => (t.description + " " + (t.memo || "")).toLowerCase().includes(q)); }
      if (state.friendId) rows = rows.filter((t) => t.splits.some((s) => s.friendId === state.friendId));
      if (state.status) {
        rows = rows.filter((t) => {
          const outstanding = t.splits.reduce((a, s) => a + (s.share - s.settled), 0);
          return state.status === "settled" ? outstanding <= 0.5 : outstanding > 0.5;
        });
      }
      if (state.from) rows = rows.filter((t) => t.date >= state.from);
      if (state.to) rows = rows.filter((t) => t.date <= state.to);
      return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    function renderAll() {
      const splits = filtered();
      const totalBilled = splits.reduce((a, t) => a + t.amount, 0);
      const yourShare = splits.reduce((a, t) => a + t.yourShare, 0);
      const othersShare = splits.reduce((a, t) => a + t.splits.reduce((x, s) => x + s.share, 0), 0);
      const settled = splits.reduce((a, t) => a + t.splits.reduce((x, s) => x + s.settled, 0), 0);
      const outstanding = othersShare - settled;

      container.querySelector("#sp-stats").innerHTML = `
        <div class="card stat-card"><div class="stat-card__label">Total billed</div><div class="stat-card__value ledger-figure num" style="font-size:20px">${formatINR(totalBilled)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Your share</div><div class="stat-card__value ledger-figure num text-neg" style="font-size:20px">${formatINR(yourShare)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Settled by others</div><div class="stat-card__value ledger-figure num text-pos" style="font-size:20px">${formatINR(settled)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Outstanding</div><div class="stat-card__value ledger-figure num text-neg" style="font-size:20px">${formatINR(outstanding)}</div></div>
      `;
      renderList(container.querySelector("#sp-list"), splits);
    }
  }

  function renderList(el, splits) {
    if (!splits.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${global.Icons.icon("users", { size: 22 })}</div><div class="empty-state__title">No split expenses found</div><div class="empty-state__desc">Try clearing filters, or add a bill and split it with friends.</div></div>`;
      return;
    }
    el.innerHTML = splits.map((t) => {
      const outstanding = t.splits.reduce((a, s) => a + (s.share - s.settled), 0);
      return `
      <div class="recent-txn-row" data-id="${t.id}" style="align-items:flex-start">
        ${V.txnIconChip(t)}
        <div class="recent-txn-row__meta">
          <div class="recent-txn-row__title">${t.description}</div>
          <div class="recent-txn-row__sub">${formatDate(t.date, "short")} · Split with ${t.splits.map((s) => S.getFriend(s.friendId).name.split(" ")[0]).join(", ")}</div>
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            ${t.splits.map((s) => `<span class="chip" style="font-size:11px;padding:3px 8px">${S.getFriend(s.friendId).name.split(" ")[0]}: ${(s.share - s.settled) <= 0 ? "settled" : formatINR(s.share - s.settled) + " due"}</span>`).join("")}
          </div>
        </div>
        <div style="text-align:right">
          <div class="ledger-figure num" style="font-size:14px">${formatINR(t.amount)}</div>
          <div class="row-secondary">your share ${formatINR(t.yourShare)}</div>
          ${outstanding > 0.5 ? `<span class="badge badge--danger" style="margin-top:4px">${formatINR(outstanding)} pending</span>` : `<span class="badge badge--income" style="margin-top:4px">All settled</span>`}
        </div>
      </div>`;
    }).join("");
    el.querySelectorAll(".recent-txn-row[data-id]").forEach((row) => row.addEventListener("click", () => {
      global.TxnDetail.open(splits.find((t) => t.id === row.dataset.id), { onChange: () => global.Router.rerenderCurrent() });
    }));
  }

  global.Pages = global.Pages || {};
  global.Pages.splits = { render };
})(window);
