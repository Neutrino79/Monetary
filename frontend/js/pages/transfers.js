(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR, formatDate } = global.fmt;
  const V = global.Visuals;

  function render(container) {
    const state = { search: "", from: "", to: "", accountId: "" };

    container.innerHTML = `
      <div class="page-head">
        <div><h1 class="page-head__title">Transfers</h1><p class="page-head__desc">Money moving between your own accounts — never counted as income or expense.</p></div>
        <div class="page-head__actions"><button class="btn btn--primary" id="tr-add">${global.Icons.icon("plus", { size: 15 })} Add transfer</button></div>
      </div>

      <div class="grid grid-cols-3" id="tr-stats" style="margin-bottom:20px"></div>

      <div class="card">
        <div class="filter-bar" id="tr-filters"></div>
        <div class="card__subtitle" style="margin-bottom:12px">Click any row to see full detail</div>
        <div id="tr-list"></div>
      </div>
    `;

    renderFilters();
    renderAll();

    container.querySelector("#tr-add").addEventListener("click", () => global.TransactionForm.open({ type: "transfer", onSaved: () => global.Router.rerenderCurrent() }));

    function renderFilters() {
      const bar = container.querySelector("#tr-filters");
      bar.innerHTML = `
        <div class="filter-bar__row">
          <div class="topbar__search filter-bar__search" style="background:var(--paper-sunken)">
            ${global.Icons.icon("search", { size: 15 })}
            <input type="text" placeholder="Search description or account…" id="tr-search" />
          </div>
          <select class="select" id="tr-account">
            <option value="">All accounts</option>
            ${S.state.accounts.filter((a) => !a.isSystem).map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}
          </select>
        </div>
        <div class="filter-bar__row">
          <input type="date" class="input filter-bar__date" id="tr-from" max="2026-09-23" title="From date" />
          <input type="date" class="input filter-bar__date" id="tr-to" max="2026-09-23" title="To date" />
          <button class="btn btn--ghost btn--sm filter-bar__clear" id="tr-clear">Clear filters</button>
        </div>
      `;
      bar.querySelector("#tr-search").addEventListener("input", (e) => { state.search = e.target.value; renderAll(); });
      bar.querySelector("#tr-account").addEventListener("change", (e) => { state.accountId = e.target.value; renderAll(); });
      bar.querySelector("#tr-from").addEventListener("change", (e) => { state.from = e.target.value; renderAll(); });
      bar.querySelector("#tr-to").addEventListener("change", (e) => { state.to = e.target.value; renderAll(); });
      bar.querySelector("#tr-clear").addEventListener("click", () => { Object.assign(state, { search: "", from: "", to: "", accountId: "" }); renderFilters(); renderAll(); });
    }

    function filtered() {
      let rows = S.activeTxns((t) => t.type === "transfer");
      if (state.search) {
        const q = state.search.toLowerCase();
        rows = rows.filter((t) => {
          const fromName = S.getAccount(t.accountId).name.toLowerCase();
          const toName = S.getAccount(t.toAccountId).name.toLowerCase();
          return (t.description + " " + fromName + " " + toName + " " + (t.memo || "")).toLowerCase().includes(q);
        });
      }
      if (state.accountId) rows = rows.filter((t) => t.accountId === state.accountId || t.toAccountId === state.accountId);
      if (state.from) rows = rows.filter((t) => t.date >= state.from);
      if (state.to) rows = rows.filter((t) => t.date <= state.to);
      return rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    }

    function renderAll() {
      const transfers = filtered();
      const total30 = transfers.filter((t) => t.date >= S.monthRange(1).from).reduce((a, t) => a + t.amount, 0);
      container.querySelector("#tr-stats").innerHTML = `
        <div class="card stat-card"><div class="stat-card__label">Transfers (30d)</div><div class="stat-card__value ledger-figure num">${formatINR(total30)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Matching transfers</div><div class="stat-card__value ledger-figure num">${transfers.length}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Most used route</div><div class="stat-card__value" style="font-size:15px;padding-top:4px">${topRoute(transfers)}</div></div>
      `;
      renderList(container.querySelector("#tr-list"), transfers);
    }
  }

  function topRoute(transfers) {
    if (!transfers.length) return "—";
    const counts = {};
    transfers.forEach((t) => { const k = t.accountId + "→" + t.toAccountId; counts[k] = (counts[k] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0].split("→");
    return `${S.getAccount(top[0]).name.split(" ")[0]} → ${S.getAccount(top[1]).name.split(" ")[0]}`;
  }

  function renderList(el, transfers) {
    if (!transfers.length) {
      el.innerHTML = `<div class="empty-state"><div class="empty-state__icon">${global.Icons.icon("shuffle", { size: 22 })}</div><div class="empty-state__title">No transfers found</div><div class="empty-state__desc">Try clearing filters, or add a new transfer.</div></div>`;
      return;
    }
    el.innerHTML = `<div class="transfer-list">` + transfers.map((t) => `
      <div class="transfer-row" data-id="${t.id}">
        <div class="transfer-row__node">
          ${V.accountChip(S.getAccount(t.accountId), 32)}
          <span class="transfer-row__acc" title="${S.getAccount(t.accountId).name}">${S.getAccount(t.accountId).name}</span>
        </div>
        <div class="transfer-row__arrow" aria-hidden="true">${global.Icons.icon("arrowRight", { size: 18 })}</div>
        <div class="transfer-row__node">
          ${V.accountChip(S.getAccount(t.toAccountId), 32)}
          <span class="transfer-row__acc" title="${S.getAccount(t.toAccountId).name}">${S.getAccount(t.toAccountId).name}</span>
        </div>
        <div class="transfer-row__amt">
          <div class="ledger-figure text-warn num">${formatINR(t.amount)}</div>
          <div class="row-secondary">${formatDate(t.date, "short")}</div>
        </div>
      </div>`).join("") + `</div>`;
    el.querySelectorAll(".transfer-row[data-id]").forEach((row) => row.addEventListener("click", () => {
      global.TxnDetail.open(transfers.find((t) => t.id === row.dataset.id), { onChange: () => global.Router.rerenderCurrent() });
    }));
  }

  global.Pages = global.Pages || {};
  global.Pages.transfers = { render };
})(window);
