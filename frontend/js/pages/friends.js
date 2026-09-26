(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR, formatDate, uid } = global.fmt;
  const V = global.Visuals;
  const { rules, runValidation } = global.Validate;

  let filterState = { search: "" };

  function render(container) {
    filterState = { search: "" };
    paint(container);
  }

  function paint(container) {
    const allFriends = S.state.friends.map((f) => ({ f, bal: S.calcFriendOutstanding(f.id) }));
    const owedToYou = allFriends.filter((x) => x.bal > 0).reduce((a, x) => a + x.bal, 0);
    const youOwe = allFriends.filter((x) => x.bal < 0).reduce((a, x) => a - x.bal, 0);
    const q = filterState.search.trim().toLowerCase();
    const friends = q ? allFriends.filter((x) => (x.f.name + " " + x.f.email).toLowerCase().includes(q)) : allFriends;

    container.innerHTML = `
      <div class="page-head">
        <div><h1 class="page-head__title">Friends</h1><p class="page-head__desc">People you share expenses with — each one is a running balance, not a per-bill tally.</p></div>
        <div class="page-head__actions"><button class="btn btn--primary" id="fr-add">${global.Icons.icon("plus", { size: 15 })} Add friend</button></div>
      </div>

      <div class="grid grid-cols-3" style="margin-bottom:20px">
        <div class="card stat-card"><div class="stat-card__label">Owed to you</div><div class="stat-card__value ledger-figure num text-pos">${formatINR(owedToYou)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">You owe</div><div class="stat-card__value ledger-figure num text-neg">${formatINR(youOwe)}</div></div>
        <div class="card stat-card"><div class="stat-card__label">Net position</div><div class="stat-card__value ledger-figure num ${owedToYou - youOwe >= 0 ? "text-pos" : "text-neg"}">${formatINR(owedToYou - youOwe)}</div></div>
      </div>

      <div class="filter-bar" style="margin-bottom:16px">
        <div class="filter-bar__row">
          <div class="topbar__search filter-bar__search" style="background:var(--paper-sunken);max-width:340px">
            ${global.Icons.icon("search", { size: 15 })}
            <input type="text" placeholder="Search by name or email…" id="fr-search" value="${filterState.search}" />
          </div>
        </div>
      </div>

      ${friends.length ? `<div class="grid grid-cols-3" id="fr-grid">${friends.map((x) => friendCard(x)).join("")}</div>` : `
        <div class="card"><div class="empty-state"><div class="empty-state__icon">${global.Icons.icon("users", { size: 22 })}</div><div class="empty-state__title">${allFriends.length ? "No friends match your search" : "No friends added"}</div><div class="empty-state__desc">${allFriends.length ? "Try a different name or email." : "Add a friend to start splitting expenses with them."}</div></div></div>`}
    `;

    container.querySelector("#fr-search").addEventListener("input", (e) => {
      const caret = e.target.selectionStart;
      filterState.search = e.target.value;
      paint(container);
      const revived = container.querySelector("#fr-search");
      revived.focus();
      revived.setSelectionRange(caret, caret);
    });

    container.querySelectorAll("[data-friend-id]").forEach((card) => card.addEventListener("click", (e) => {
      if (e.target.closest("[data-settle]")) return;
      openDetail(card.dataset.friendId, container);
    }));
    container.querySelectorAll("[data-settle]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openSettle(btn.dataset.settle, () => paint(container));
    }));
    container.querySelector("#fr-add").addEventListener("click", () => openAddFriend(() => paint(container)));
  }

  function friendCard(x) {
    const settled = x.bal === 0;
    return `<div class="card" data-friend-id="${x.f.id}" style="cursor:pointer">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        ${V.friendAvatar(x.f, 44)}
        <div style="flex:1;min-width:0">
          <div class="row-primary">${x.f.name}</div>
          <div class="row-secondary">${x.f.email}</div>
        </div>
      </div>
      <div class="kv-row"><span class="kv-row__label">${x.bal >= 0 ? "Owes you" : "You owe"}</span>
        <span class="ledger-figure num ${x.bal > 0 ? "text-pos" : x.bal < 0 ? "text-neg" : ""}">${formatINR(Math.abs(x.bal))}</span></div>
      ${!settled ? `<button class="btn btn--secondary btn--sm btn--block" style="margin-top:10px" data-settle="${x.f.id}">Settle up</button>` : `<span class="badge badge--income" style="margin-top:10px">All settled</span>`}
    </div>`;
  }

  function openDetail(friendId, parentContainer) {
    const f = S.getFriend(friendId);
    const bal = S.calcFriendOutstanding(friendId);
    const history = S.state.transactions.filter((t) => t.status !== "reversed" && (t.friendId === friendId || (t.splits || []).some((s) => s.friendId === friendId))).sort((a, b) => (a.date < b.date ? 1 : -1));
    const splitCount = history.filter((t) => t.type === "split").length;
    const lifetimeSettled = history.reduce((a, t) => {
      if (t.type === "settlement") return a + t.amount;
      if (t.type === "split") { const s = t.splits.find((sp) => sp.friendId === friendId); return a + (s ? s.settled : 0); }
      return a;
    }, 0);

    global.Modal.drawer({
      title: f.name,
      subtitle: `Friend since ${global.fmt.formatDate(f.createdAt, "long")}`,
      bodyHTML: `<div id="fr-detail"></div>`,
      footerHTML: `<button class="btn btn--ghost" data-close>Close</button>
        <button class="btn btn--secondary" id="fr-edit">Edit</button>
        ${bal !== 0 ? `<button class="btn btn--primary" id="fr-settle">Settle up</button>` : ""}`,
      onMount(overlay) {
        overlay.querySelector("#fr-detail").innerHTML = `
          <div class="detail-amount-hero">
            <div>
              <div class="detail-meta-row__label">${bal >= 0 ? "Owes you" : "You owe them"}</div>
              <span class="ledger-figure detail-amount-hero__figure ${bal > 0 ? "text-pos" : bal < 0 ? "text-neg" : ""}">${formatINR(Math.abs(bal))}</span>
            </div>
            ${V.friendAvatar(f, 48)}
          </div>

          <div class="detail-stat-grid">
            <div class="detail-stat"><div class="detail-stat__label">Split expenses</div><div class="detail-stat__value">${splitCount}</div></div>
            <div class="detail-stat"><div class="detail-stat__label">Lifetime settled</div><div class="detail-stat__value text-pos">${formatINR(lifetimeSettled)}</div></div>
          </div>

          <div class="detail-section"><div class="detail-section__title">Contact</div><div class="detail-card">
            ${metaRow("user", "Email", f.email)}
            ${f.phone ? metaRow("user", "Phone", f.phone) : ""}
          </div></div>

          <div class="detail-section">
            <div class="detail-section__title">History</div>
            ${history.length ? history.map((t) => historyRow(t, friendId)).join("") : `<div class="empty-state"><div class="empty-state__desc">No shared history yet</div></div>`}
          </div>
        `;
        overlay.querySelectorAll(".recent-txn-row[data-id]").forEach((row) => row.addEventListener("click", () => {
          global.Modal.close();
          global.TxnDetail.open(S.state.transactions.find((t) => t.id === row.dataset.id), { onChange: () => paint(parentContainer) });
        }));
        overlay.querySelector("#fr-edit").addEventListener("click", () => { global.Modal.close(); openAddFriend(() => paint(parentContainer), f); });
        const settleBtn = overlay.querySelector("#fr-settle");
        if (settleBtn) settleBtn.addEventListener("click", () => { global.Modal.close(); openSettle(friendId, () => paint(parentContainer)); });
      },
    });
  }

  function metaRow(icon, label, value) {
    return `<div class="detail-meta-row">
      <span class="detail-meta-row__icon">${global.Icons.icon(icon, { size: 15 })}</span>
      <div class="detail-meta-row__body"><div class="detail-meta-row__label">${label}</div><div class="detail-meta-row__value">${value}</div></div>
    </div>`;
  }

  function historyRow(t, friendId) {
    if (t.type === "settlement") {
      return `<div class="recent-txn-row" data-id="${t.id}">
        ${V.txnIconChip(t)}
        <div class="recent-txn-row__meta"><div class="recent-txn-row__title">${t.description}</div><div class="recent-txn-row__sub">${formatDate(t.date, "short")}</div></div>
        <div class="recent-txn-row__amt ${t.direction === "receive" ? "text-pos" : "text-neg"}">${t.direction === "receive" ? "+" : "−"}${formatINR(t.amount)}</div>
      </div>`;
    }
    const s = t.splits.find((sp) => sp.friendId === friendId);
    const due = Math.round((s.share - s.settled) * 100) / 100;
    return `<div class="recent-txn-row" data-id="${t.id}">
      ${V.txnIconChip(t)}
      <div class="recent-txn-row__meta"><div class="recent-txn-row__title">${t.description}</div><div class="recent-txn-row__sub">${formatDate(t.date, "short")} · share ${formatINR(s.share)}</div></div>
      <div class="recent-txn-row__amt ${due > 0 ? "text-neg" : "text-pos"}">${due > 0 ? formatINR(due) + " due" : "Settled"}</div>
    </div>`;
  }

  function openSettle(friendId, onDone) {
    const f = S.getFriend(friendId);
    const bal = S.calcFriendOutstanding(friendId);
    const suggestedDirection = bal >= 0 ? "receive" : "pay";
    global.Modal.open({
      title: `Settle up with ${f.name}`,
      size: "sm",
      bodyHTML: `
        <div class="segmented" id="settle-dir" style="margin-bottom:14px">
          <button type="button" data-dir="receive" class="${suggestedDirection === "receive" ? "is-active" : ""}">They paid you</button>
          <button type="button" data-dir="pay" class="${suggestedDirection === "pay" ? "is-active" : ""}">You paid them</button>
        </div>
        <div class="form-grid">
          <div class="form-field form-field--full">
            <label>Amount</label>
            <div class="amount-input"><input class="input" id="settle-amt" type="number" step="0.01" min="0" value="${Math.abs(bal) || ""}" /></div>
            <span class="form-field__error" id="settle-err"></span>
          </div>
          <div class="form-field">
            <label>Date</label>
            <input class="input" type="date" id="settle-date" max="2026-09-23" value="2026-09-23" />
          </div>
          <div class="form-field">
            <label>Into / from account</label>
            <select class="select" id="settle-acc">
              <option value="" selected disabled>Select account…</option>
              ${S.state.accounts.filter((a) => a.isActive && a.accountType === "ASSET").map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}
            </select>
            <span class="form-field__error" id="settle-acc-err"></span>
          </div>
          <div class="form-field form-field--full">
            <label>Memo (optional)</label>
            <textarea class="textarea" id="settle-memo" rows="2"></textarea>
          </div>
        </div>
      `,
      footerHTML: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" id="settle-save">Record settlement</button>`,
      onMount(overlay) {
        let dir = suggestedDirection;
        overlay.querySelectorAll("#settle-dir button").forEach((btn) => btn.addEventListener("click", () => {
          dir = btn.dataset.dir;
          overlay.querySelectorAll("#settle-dir button").forEach((b) => b.classList.toggle("is-active", b === btn));
        }));
        overlay.querySelector("#settle-save").addEventListener("click", async () => {
          overlay.querySelector("#settle-err").textContent = "";
          overlay.querySelector("#settle-acc-err").textContent = "";
          const amt = parseFloat(overlay.querySelector("#settle-amt").value);
          const account = overlay.querySelector("#settle-acc").value;
          const date = overlay.querySelector("#settle-date").value;
          let ok = true;
          if (!(amt > 0)) { overlay.querySelector("#settle-err").textContent = "Enter an amount greater than ₹0."; ok = false; }
          if (!account) { overlay.querySelector("#settle-acc-err").textContent = "Select an account."; ok = false; }
          if (!ok) return;
          await global.mockApi.settleFriend({ friendId, accountId: account, amount: amt, direction: dir, date, memo: overlay.querySelector("#settle-memo").value.trim() || null });
          global.Modal.close();
          global.Toast.show("Settlement recorded.", { variant: "success" });
          onDone();
        });
      },
    });
  }

  function openAddFriend(onDone, existing) {
    global.Modal.open({
      title: existing ? "Edit friend" : "Add a friend",
      size: "sm",
      bodyHTML: `
        <div class="form-field" style="margin-bottom:12px"><label>Name</label><input class="input" id="af-name" value="${existing ? existing.name : ""}" placeholder="Full name" /><span class="form-field__error" id="af-name-err"></span></div>
        <div class="form-field" style="margin-bottom:12px"><label>Email</label><input class="input" id="af-email" value="${existing ? existing.email : ""}" placeholder="name@example.com" /><span class="form-field__error" id="af-email-err"></span></div>
        <div class="form-field"><label>Phone (optional)</label><input class="input" id="af-phone" value="${existing ? existing.phone || "" : ""}" /></div>
      `,
      footerHTML: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" id="af-save">${existing ? "Save" : "Add friend"}</button>`,
      onMount(overlay) {
        overlay.querySelector("#af-save").addEventListener("click", async () => {
          const name = overlay.querySelector("#af-name").value.trim();
          const email = overlay.querySelector("#af-email").value.trim();
          let ok = true;
          if (!name) { overlay.querySelector("#af-name-err").textContent = "Name is required."; ok = false; }
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { overlay.querySelector("#af-email-err").textContent = "Enter a valid email."; ok = false; }
          if (!ok) return;
          const payload = { name, email, phone: overlay.querySelector("#af-phone").value.trim() || null };
          if (existing) {
            await global.mockApi.updateFriend(existing.id, payload);
          } else {
            const colors = ["#1F6D4C", "#7A2E3A", "#2E6B8A", "#8A6B2E", "#4A4A8A"];
            await global.mockApi.createFriend(Object.assign(payload, { initials: global.fmt.initialsOf(name), color: colors[Math.floor(Math.random() * colors.length)] }));
          }
          global.Modal.close();
          global.Toast.show(existing ? "Friend updated." : "Friend added.", { variant: "success" });
          onDone();
        });
      },
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.friends = { render };
})(window);
