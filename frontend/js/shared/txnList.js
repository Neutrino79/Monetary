(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR, formatDate, clamp } = global.fmt;
  const V = global.Visuals;

  function accountOptionsAll() {
    return `<option value="">All accounts</option>` + S.state.accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join("");
  }
  function categoryOptionsAll() {
    return `<option value="">All categories</option>` + S.categoryRoots().map((r) =>
      `<optgroup label="${r.name}"><option value="${r.id}">${r.name} (all)</option>${S.categoryChildren(r.id).map((k) => `<option value="${k.id}">${k.name}</option>`).join("")}</optgroup>`).join("");
  }
  function friendOptionsAll() {
    return `<option value="">All friends</option>` + S.state.friends.map((f) => `<option value="${f.id}">${f.name}</option>`).join("");
  }

  function matchesCategory(txn, catId) {
    if (!catId) return true;
    if (txn.categoryId === catId) return true;
    const cat = S.state.categories.find((c) => c.id === catId);
    return !!(cat && S.categoryChildren(catId).some((k) => k.id === txn.categoryId));
  }

  function render(container, config) {
    const cfg = Object.assign({
      allowedTypes: ["income", "expense", "transfer", "split", "refund", "adjustment", "settlement"],
      title: "Transactions", description: "",
      showTypeFilter: true, showCategoryFilter: true, showAccountFilter: true, showFriendFilter: false,
      addType: "expense", emptyTitle: "No transactions found", emptyDesc: "Try adjusting your filters, or add a new transaction.",
      pageSize: 12,
    }, config);

    const state = { search: "", from: "", to: "", accountId: "", categoryId: "", type: "", friendId: "", sortKey: "date", sortDir: "desc", page: 1 };

    container.innerHTML = `
      <div class="page-head">
        <div><h1 class="page-head__title">${cfg.title}</h1><p class="page-head__desc">${cfg.description}</p></div>
        <div class="page-head__actions">
          <button class="btn btn--primary" id="tl-add">${global.Icons.icon("plus", { size: 16 })} Add ${cfg.title === "Transactions" ? "transaction" : cfg.addType}</button>
        </div>
      </div>
      <div class="card">
        <div class="filter-bar" id="tl-filters"></div>
        <div id="tl-chips" style="margin-bottom:12px"></div>
        <div id="tl-table-holder"></div>
        <div id="tl-pagination" style="display:flex;justify-content:space-between;align-items:center;margin-top:14px"></div>
      </div>
    `;

    renderFilters();
    renderTable();

    container.querySelector("#tl-add").addEventListener("click", () => {
      global.TransactionForm.open({ type: cfg.addType, onSaved: () => { renderTable(); global.App.refreshBadges(); } });
    });

    function renderFilters() {
      const bar = container.querySelector("#tl-filters");
      bar.innerHTML = `
        <div class="filter-bar__row">
          <div class="topbar__search filter-bar__search" style="background:var(--paper-sunken)">
            ${global.Icons.icon("search", { size: 15 })}
            <input type="text" placeholder="Search description or memo…" id="tl-search" />
          </div>
          ${cfg.showTypeFilter ? `<select class="select" id="tl-type">
            <option value="">All types</option>
            ${cfg.allowedTypes.map((t) => `<option value="${t}">${V.TXN_TYPE_META[t].label}</option>`).join("")}
          </select>` : ""}
        </div>
        <div class="filter-bar__row">
          <input type="date" class="input filter-bar__date" id="tl-from" max="2026-09-23" title="From date" placeholder="From" />
          <input type="date" class="input filter-bar__date" id="tl-to" max="2026-09-23" title="To date" placeholder="To" />
          ${cfg.showAccountFilter ? `<select class="select" id="tl-account">${accountOptionsAll()}</select>` : ""}
          ${cfg.showCategoryFilter ? `<select class="select" id="tl-category">${categoryOptionsAll()}</select>` : ""}
          ${cfg.showFriendFilter ? `<select class="select" id="tl-friend">${friendOptionsAll()}</select>` : ""}
          <button class="btn btn--ghost btn--sm filter-bar__clear" id="tl-clear">Clear filters</button>
        </div>
      `;
      bar.querySelector("#tl-search").addEventListener("input", (e) => { state.search = e.target.value; state.page = 1; renderTable(); });
      bar.querySelector("#tl-from").addEventListener("change", (e) => { state.from = e.target.value; state.page = 1; renderTable(); });
      bar.querySelector("#tl-to").addEventListener("change", (e) => { state.to = e.target.value; state.page = 1; renderTable(); });
      const acc = bar.querySelector("#tl-account"); if (acc) acc.addEventListener("change", (e) => { state.accountId = e.target.value; state.page = 1; renderTable(); });
      const cat = bar.querySelector("#tl-category"); if (cat) cat.addEventListener("change", (e) => { state.categoryId = e.target.value; state.page = 1; renderTable(); });
      const frnd = bar.querySelector("#tl-friend"); if (frnd) frnd.addEventListener("change", (e) => { state.friendId = e.target.value; state.page = 1; renderTable(); });
      const typ = bar.querySelector("#tl-type"); if (typ) typ.addEventListener("change", (e) => { state.type = e.target.value; state.page = 1; renderTable(); });
      bar.querySelector("#tl-clear").addEventListener("click", () => {
        Object.assign(state, { search: "", from: "", to: "", accountId: "", categoryId: "", type: "", friendId: "", page: 1 });
        renderFilters(); renderTable();
      });
    }

    function activeChips() {
      const chips = [];
      if (state.search) chips.push(["search", `"${state.search}"`]);
      if (state.from) chips.push(["from", `From ${formatDate(state.from)}`]);
      if (state.to) chips.push(["to", `To ${formatDate(state.to)}`]);
      if (state.accountId) chips.push(["accountId", S.getAccount(state.accountId).name]);
      if (state.categoryId) chips.push(["categoryId", (S.getCategory(state.categoryId) || {}).name]);
      if (state.type) chips.push(["type", V.TXN_TYPE_META[state.type].label]);
      if (state.friendId) chips.push(["friendId", S.getFriend(state.friendId).name]);
      return chips;
    }

    function filteredSorted() {
      let rows = S.activeTxns((t) => cfg.allowedTypes.includes(t.type));
      if (state.search) {
        const q = state.search.toLowerCase();
        rows = rows.filter((t) => (t.description + " " + (t.memo || "")).toLowerCase().includes(q));
      }
      if (state.from) rows = rows.filter((t) => t.date >= state.from);
      if (state.to) rows = rows.filter((t) => t.date <= state.to);
      if (state.accountId) rows = rows.filter((t) => t.accountId === state.accountId || t.toAccountId === state.accountId);
      if (state.categoryId) rows = rows.filter((t) => matchesCategory(t, state.categoryId));
      if (state.type) rows = rows.filter((t) => t.type === state.type);
      if (state.friendId) rows = rows.filter((t) => t.friendId === state.friendId || (t.splits || []).some((s) => s.friendId === state.friendId));
      rows.sort((a, b) => {
        let av, bv;
        if (state.sortKey === "amount") { av = a.yourShare != null ? a.yourShare : a.amount; bv = b.yourShare != null ? b.yourShare : b.amount; }
        else if (state.sortKey === "description") { av = a.description; bv = b.description; }
        else { av = a.date; bv = b.date; }
        const cmp = av > bv ? 1 : av < bv ? -1 : 0;
        return state.sortDir === "asc" ? cmp : -cmp;
      });
      return rows;
    }

    function renderTable() {
      const chipsHolder = container.querySelector("#tl-chips");
      const chips = activeChips();
      chipsHolder.innerHTML = chips.length ? chips.map(([key, label]) => `<span class="chip" style="margin-right:6px;margin-bottom:6px" data-chip="${key}">${label} <button aria-label="Remove filter" data-remove="${key}">${global.Icons.icon("x", { size: 11 })}</button></span>`).join("") : "";
      chipsHolder.querySelectorAll("[data-remove]").forEach((btn) => btn.addEventListener("click", () => {
        state[btn.dataset.remove === "from" ? "from" : btn.dataset.remove === "to" ? "to" : btn.dataset.remove] = "";
        renderFilters(); renderTable();
      }));

      const holder = container.querySelector("#tl-table-holder");
      const rows = filteredSorted();
      const totalPages = Math.max(1, Math.ceil(rows.length / cfg.pageSize));
      state.page = clamp(state.page, 1, totalPages);
      const pageRows = rows.slice((state.page - 1) * cfg.pageSize, state.page * cfg.pageSize);

      if (!rows.length) {
        holder.innerHTML = `<div class="empty-state">
          <div class="empty-state__icon">${global.Icons.icon("search", { size: 24 })}</div>
          <div class="empty-state__title">${cfg.emptyTitle}</div>
          <div class="empty-state__desc">${cfg.emptyDesc}</div>
        </div>`;
        container.querySelector("#tl-pagination").innerHTML = "";
        return;
      }

      const sortArrow = (key) => state.sortKey === key ? `<span class="sort-arrow">${state.sortDir === "asc" ? "↑" : "↓"}</span>` : "";
      holder.innerHTML = `
        <div class="table-wrap"><table class="data-table">
          <thead><tr>
            <th data-sort="date" class="${state.sortKey === "date" ? "is-sorted" : ""}">Date ${sortArrow("date")}</th>
            <th data-sort="description" class="${state.sortKey === "description" ? "is-sorted" : ""}">Description ${sortArrow("description")}</th>
            <th>Category / Account</th>
            <th>Type</th>
            <th class="num" data-sort="amount" style="text-align:right">Amount ${sortArrow("amount")}</th>
          </tr></thead>
          <tbody>
            ${pageRows.map((t) => rowHTML(t)).join("")}
          </tbody>
        </table></div>
      `;
      holder.querySelectorAll("thead th[data-sort]").forEach((th) => th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else { state.sortKey = key; state.sortDir = "desc"; }
        renderTable();
      }));
      holder.querySelectorAll("tbody tr").forEach((tr) => tr.addEventListener("click", () => {
        const txn = rows.find((t) => t.id === tr.dataset.id);
        global.TxnDetail.open(txn, { onChange: () => { renderTable(); global.App.refreshBadges(); } });
      }));

      renderPagination(totalPages, rows.length);
    }

    function rowHTML(t) {
      const amt = V.txnAmountDisplay(t);
      let sub;
      if (t.type === "transfer") sub = `${S.getAccount(t.accountId).name} → ${S.getAccount(t.toAccountId).name}`;
      else if (t.type === "settlement") sub = S.getFriend(t.friendId).name;
      else if (t.categoryId) sub = (S.getCategory(t.categoryId) || {}).name || "—";
      else sub = S.getAccount(t.accountId).name;
      return `<tr data-id="${t.id}">
        <td>${formatDate(t.date)}</td>
        <td><div class="row-primary">${t.description}</div>${t.memo ? `<div class="row-secondary">${t.memo}</div>` : ""}</td>
        <td>${sub}</td>
        <td>${V.txnBadge(t)}</td>
        <td class="num" style="text-align:right"><span class="ledger-figure ${amt.cls}">${amt.text}</span></td>
      </tr>`;
    }

    function renderPagination(totalPages, total) {
      const p = container.querySelector("#tl-pagination");
      p.innerHTML = `
        <span class="text-faint" style="font-size:12.5px">${total} transaction${total === 1 ? "" : "s"}</span>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn--ghost btn--sm" id="tl-prev" ${state.page <= 1 ? "disabled" : ""}>Previous</button>
          <span class="text-soft" style="font-size:12.5px">Page ${state.page} of ${totalPages}</span>
          <button class="btn btn--ghost btn--sm" id="tl-next" ${state.page >= totalPages ? "disabled" : ""}>Next</button>
        </div>
      `;
      const prev = p.querySelector("#tl-prev"); if (prev) prev.addEventListener("click", () => { state.page--; renderTable(); });
      const next = p.querySelector("#tl-next"); if (next) next.addEventListener("click", () => { state.page++; renderTable(); });
    }
  }

  global.TxnList = { render };
})(window);
