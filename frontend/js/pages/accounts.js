(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR, formatDate } = global.fmt;
  const V = global.Visuals;

  let filterState = { search: "", type: "", status: "" };

  function render(container) {
    filterState = { search: "", type: "", status: "" };
    paint(container);
  }

  function paint(container) {
    const netWorth = S.calcNetWorth();
    const q = filterState.search.trim().toLowerCase();
    const matches = (a) => {
      if (q && !a.name.toLowerCase().includes(q)) return false;
      if (filterState.type && a.accountType !== filterState.type) return false;
      if (filterState.status === "active" && !a.isActive) return false;
      if (filterState.status === "archived" && a.isActive) return false;
      return true;
    };
    const allNonSystem = S.state.accounts.filter((a) => !a.isSystem);
    const active = allNonSystem.filter((a) => a.isActive && matches(a));
    const archived = allNonSystem.filter((a) => !a.isActive && matches(a));
    const noMatches = !active.length && !archived.length;

    container.innerHTML = `
      <div class="page-head">
        <div><h1 class="page-head__title">Accounts</h1><p class="page-head__desc">Every bank account, wallet and credit card you track.</p></div>
        <div class="page-head__actions"><button class="btn btn--primary" id="ac-add">${global.Icons.icon("plus", { size: 15 })} Add account</button></div>
      </div>

      <div class="grid grid-cols-3" style="margin-bottom:20px">
        <div class="card stat-card"><div class="stat-card__label">Total assets</div><div class="stat-card__value ledger-figure num text-pos">${formatINR(netWorth.assets)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Total owed</div><div class="stat-card__value ledger-figure num text-neg">${formatINR(netWorth.liabilities)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Net worth</div><div class="stat-card__value ledger-figure num">${formatINR(netWorth.net)}</div></div>
      </div>

      <div class="filter-bar" style="margin-bottom:16px">
        <div class="filter-bar__row">
          <div class="topbar__search filter-bar__search" style="background:var(--paper-sunken)">
            ${global.Icons.icon("search", { size: 15 })}
            <input type="text" placeholder="Search accounts…" id="ac-search" value="${filterState.search}" />
          </div>
          <select class="select" id="ac-type">
            <option value="">All types</option>
            <option value="ASSET" ${filterState.type === "ASSET" ? "selected" : ""}>Asset</option>
            <option value="LIABILITY" ${filterState.type === "LIABILITY" ? "selected" : ""}>Liability</option>
          </select>
          <select class="select" id="ac-status">
            <option value="">Any status</option>
            <option value="active" ${filterState.status === "active" ? "selected" : ""}>Active</option>
            <option value="archived" ${filterState.status === "archived" ? "selected" : ""}>Archived</option>
          </select>
        </div>
      </div>

      ${noMatches ? `<div class="card"><div class="empty-state"><div class="empty-state__icon">${global.Icons.icon("landmark", { size: 22 })}</div><div class="empty-state__title">No accounts match</div><div class="empty-state__desc">Try clearing filters, or add a new account.</div></div></div>` : `
        ${active.length ? `<div class="grid grid-cols-3" id="ac-grid">${active.map(accountCard).join("")}</div>` : ""}
        ${archived.length ? `
          <div class="section-title" style="margin-top:28px">Archived accounts</div>
          <div class="grid grid-cols-3">${archived.map(accountCard).join("")}</div>` : ""}
      `}
    `;
    container.querySelector("#ac-search").addEventListener("input", (e) => {
      const caret = e.target.selectionStart;
      filterState.search = e.target.value;
      paint(container);
      const revived = container.querySelector("#ac-search");
      revived.focus();
      revived.setSelectionRange(caret, caret);
    });
    container.querySelector("#ac-type").addEventListener("change", (e) => { filterState.type = e.target.value; paint(container); });
    container.querySelector("#ac-status").addEventListener("change", (e) => { filterState.status = e.target.value; paint(container); });
    container.querySelectorAll("[data-account-id]").forEach((card) => card.addEventListener("click", (e) => {
      if (e.target.closest("[data-menu]")) return;
      openDetail(card.dataset.accountId, container);
    }));
    container.querySelector("#ac-add").addEventListener("click", () => openForm(null, () => paint(container)));
  }

  function accountCard(a) {
    const bal = S.calcAccountBalance(a.id);
    const isLiability = a.accountType === "LIABILITY";
    return `<div class="card" data-account-id="${a.id}" style="cursor:pointer;${!a.isActive ? "opacity:.6" : ""}">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        ${V.accountChip(a, 42)}
        <div style="flex:1;min-width:0">
          <div class="row-primary">${a.name}</div>
          <div class="row-secondary">${a.accountType === "ASSET" ? "Asset" : "Liability"}${!a.isActive ? " · Archived" : ""}</div>
        </div>
      </div>
      <div class="kv-row"><span class="kv-row__label">${isLiability ? "Amount owed" : "Balance"}</span>
        <span class="ledger-figure num ${isLiability ? (bal > 0 ? "text-neg" : "") : ""}">${formatINR(bal)}</span></div>
      ${isLiability && a.creditLimit ? `<div class="progress-bar" style="margin-top:8px"><div class="progress-bar__fill" style="width:${Math.min(100, (bal / a.creditLimit) * 100)}%;background:var(--negative)"></div></div><div class="row-secondary" style="margin-top:4px">${formatINR(a.creditLimit - bal)} available of ${formatINR(a.creditLimit)}</div>` : ""}
    </div>`;
  }

  function openDetail(accountId, parentContainer) {
    const a = S.getAccount(accountId);
    const bal = S.calcAccountBalance(accountId);
    const activity = S.state.transactions.filter((t) => t.status !== "reversed" && (t.accountId === accountId || t.toAccountId === accountId)).sort((a2, b2) => (a2.date < b2.date ? 1 : -1)).slice(0, 20);
    const subtypeLabel = { bank: "Bank account", cash: "Cash", credit_card: "Credit card", wallet: "Digital wallet", system: "System" }[a.subtype] || "Account";

    global.Modal.drawer({
      title: a.name,
      subtitle: `${a.accountType === "ASSET" ? "Asset account" : "Liability account"} · opened ${formatDate(a.createdAt, "long")}`,
      bodyHTML: `<div id="ac-detail"></div>`,
      footerHTML: `
        <button class="btn btn--ghost" data-close>Close</button>
        <button class="btn btn--secondary" id="ac-adjust">Adjust balance</button>
        <button class="btn btn--secondary" id="ac-edit">Edit</button>
        ${a.isActive ? `<button class="btn btn--danger" id="ac-archive">Archive</button>` : `<button class="btn btn--primary" id="ac-restore">Restore</button>`}
      `,
      onMount(overlay) {
        overlay.querySelector("#ac-detail").innerHTML = `
          <div class="detail-amount-hero">
            <div>
              <div class="detail-meta-row__label">${a.accountType === "LIABILITY" ? "Amount owed" : "Current balance"}</div>
              <span class="ledger-figure detail-amount-hero__figure ${a.accountType === "LIABILITY" && bal > 0 ? "text-neg" : ""}">${formatINR(bal)}</span>
            </div>
            ${V.accountChip(a, 48)}
          </div>

          ${a.accountType === "LIABILITY" && a.creditLimit ? `
            <div class="detail-section"><div class="detail-card">
              <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:8px"><span class="text-soft">Credit used</span><span>${formatINR(bal)} of ${formatINR(a.creditLimit)}</span></div>
              <div class="progress-bar"><div class="progress-bar__fill" style="width:${Math.min(100, (bal / a.creditLimit) * 100)}%;background:var(--negative)"></div></div>
              <div class="row-secondary" style="margin-top:6px">${formatINR(a.creditLimit - bal)} available</div>
            </div></div>` : ""}

          <div class="detail-section"><div class="detail-section__title">Account details</div><div class="detail-card">
            ${metaRow(a.accountType === "LIABILITY" ? "creditCard" : "landmark", "Type", `${subtypeLabel} · ${a.accountType === "ASSET" ? "Asset" : "Liability"}`)}
            ${metaRow("calendar", "Opened", formatDate(a.createdAt, "long"))}
            ${a.statementDay ? metaRow("calendar", "Statement day", `${a.statementDay}${ordinal(a.statementDay)} of each month`) : ""}
            ${metaRow("check", "Status", a.isActive ? `<span class="badge badge--income">Active</span>` : `<span class="badge badge--neutral">Archived${a.archivedAt ? " · " + formatDate(a.archivedAt) : ""}</span>`)}
          </div></div>

          <div class="detail-section">
            <div class="detail-section__title">Recent activity</div>
            ${activity.length ? activity.map((t) => {
              return `<div class="recent-txn-row" data-id="${t.id}">
                ${V.txnIconChip(t)}
                <div class="recent-txn-row__meta"><div class="recent-txn-row__title">${t.description}</div><div class="recent-txn-row__sub">${formatDate(t.date, "short")}</div></div>
                <div class="recent-txn-row__amt">${V.txnAmountDisplay(t).text}</div>
              </div>`;
            }).join("") : `<div class="empty-state"><div class="empty-state__desc">No activity yet</div></div>`}
          </div>
        `;
        overlay.querySelectorAll(".recent-txn-row[data-id]").forEach((row) => row.addEventListener("click", () => {
          global.Modal.close();
          global.TxnDetail.open(S.state.transactions.find((t) => t.id === row.dataset.id), { onChange: () => paint(parentContainer) });
        }));
        overlay.querySelector("#ac-edit").addEventListener("click", () => { global.Modal.close(); openForm(a, () => paint(parentContainer)); });
        overlay.querySelector("#ac-adjust").addEventListener("click", () => { global.Modal.close(); openAdjust(a, () => paint(parentContainer)); });
        const archBtn = overlay.querySelector("#ac-archive");
        if (archBtn) archBtn.addEventListener("click", () => {
          global.Modal.confirmDialog({
            title: "Archive this account?", message: "It'll be hidden from new transactions but its history stays intact.",
            confirmLabel: "Archive", onConfirm: async () => { await global.mockApi.archiveAccount(a.id); global.Toast.show("Account archived.", { variant: "success" }); paint(parentContainer); },
          });
        });
        const restBtn = overlay.querySelector("#ac-restore");
        if (restBtn) restBtn.addEventListener("click", async () => { await global.mockApi.restoreAccount(a.id); global.Modal.close(); global.Toast.show("Account restored.", { variant: "success" }); paint(parentContainer); });
      },
    });
  }

  function metaRow(icon, label, value) {
    return `<div class="detail-meta-row">
      <span class="detail-meta-row__icon">${global.Icons.icon(icon, { size: 15 })}</span>
      <div class="detail-meta-row__body"><div class="detail-meta-row__label">${label}</div><div class="detail-meta-row__value">${value}</div></div>
    </div>`;
  }

  function ordinal(n) { return ["th", "st", "nd", "rd"][(n % 100 >> 3 ^ 1) && n % 10] || "th"; }

  function openForm(existing, onDone) {
    global.Modal.open({
      title: existing ? "Edit account" : "Add account",
      size: "sm",
      bodyHTML: `
        <div class="form-field" style="margin-bottom:12px"><label>Account name</label><input class="input" id="af-name" value="${existing ? existing.name : ""}" placeholder="e.g. SBI Savings" /><span class="form-field__error" id="af-err"></span></div>
        <div class="form-field" style="margin-bottom:12px"><label>Type</label>
          <select class="select" id="af-type" ${existing ? "disabled" : ""}>
            <option value="ASSET" ${existing && existing.accountType === "ASSET" ? "selected" : ""}>Asset (bank, cash, wallet)</option>
            <option value="LIABILITY" ${existing && existing.accountType === "LIABILITY" ? "selected" : ""}>Liability (credit card)</option>
          </select>
        </div>
        <div class="form-field"><label>${existing ? "Current balance is calculated from history — use “Adjust balance” to correct it." : "Opening balance"}</label>
          ${existing ? "" : `<div class="amount-input"><input class="input" id="af-open" type="number" step="0.01" value="0" /></div>`}
        </div>
      `,
      footerHTML: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" id="af-save">${existing ? "Save" : "Add account"}</button>`,
      onMount(overlay) {
        overlay.querySelector("#af-save").addEventListener("click", async () => {
          const name = overlay.querySelector("#af-name").value.trim();
          if (!name) { overlay.querySelector("#af-err").textContent = "Name is required."; return; }
          if (existing) {
            await global.mockApi.updateAccount(existing.id, { name });
          } else {
            const type = overlay.querySelector("#af-type").value;
            await global.mockApi.createAccount({ name, accountType: type, subtype: type === "LIABILITY" ? "credit_card" : "bank", openingBalance: parseFloat(overlay.querySelector("#af-open").value) || 0 });
          }
          global.Modal.close();
          global.Toast.show(existing ? "Account updated." : "Account added.", { variant: "success" });
          onDone();
        });
      },
    });
  }

  function openAdjust(account, onDone) {
    global.Modal.open({
      title: `Adjust — ${account.name}`,
      subtitle: "Posts a correction against the system Adjustments account, matching a real reconciliation.",
      size: "sm",
      bodyHTML: `
        <div class="segmented" id="adj-dir" style="margin-bottom:14px">
          <button type="button" data-dir="increase" class="is-active">Increase</button>
          <button type="button" data-dir="decrease">Decrease</button>
        </div>
        <div class="form-grid">
          <div class="form-field form-field--full"><label>Amount</label><div class="amount-input"><input class="input" id="adj-amt" type="number" step="0.01" min="0" /></div><span class="form-field__error" id="adj-err"></span></div>
          <div class="form-field"><label>Date</label><input class="input" type="date" id="adj-date" max="2026-09-23" value="2026-09-23" /></div>
          <div class="form-field form-field--full"><label>Reason</label><textarea class="textarea" id="adj-memo" rows="2" placeholder="e.g. Physical cash count differed"></textarea></div>
        </div>
      `,
      footerHTML: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" id="adj-save">Post adjustment</button>`,
      onMount(overlay) {
        let dir = "increase";
        overlay.querySelectorAll("#adj-dir button").forEach((btn) => btn.addEventListener("click", () => {
          dir = btn.dataset.dir;
          overlay.querySelectorAll("#adj-dir button").forEach((b) => b.classList.toggle("is-active", b === btn));
        }));
        overlay.querySelector("#adj-save").addEventListener("click", async () => {
          const amt = parseFloat(overlay.querySelector("#adj-amt").value);
          if (!(amt > 0)) { overlay.querySelector("#adj-err").textContent = "Enter an amount greater than ₹0."; return; }
          await global.mockApi.createTransaction({
            type: "adjustment", description: `Balance Adjustment — ${account.name}`,
            memo: overlay.querySelector("#adj-memo").value.trim() || null, date: overlay.querySelector("#adj-date").value || "2026-09-23", currency: "INR",
            accountId: account.id, amount: amt, direction: dir,
          });
          global.Modal.close();
          global.Toast.show("Adjustment posted.", { variant: "success" });
          onDone();
        });
      },
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.accounts = { render };
})(window);
