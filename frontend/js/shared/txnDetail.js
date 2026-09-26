(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR, formatDate, uid } = global.fmt;
  const V = global.Visuals;

  function relatedTransactions(txn) {
    return S.state.transactions.filter((t) =>
      t.id !== txn.id && ((t.refundOfId === txn.id) || (t.id === txn.refundOfId) || (t.correctionOf === txn.id) || (t.id === txn.correctionOf))
    );
  }

  function open(txn, opts) {
    opts = opts || {};
    const meta = V.TXN_TYPE_META[txn.type];
    const related = relatedTransactions(txn);

    global.Modal.drawer({
      title: txn.description,
      subtitle: `${meta.label} · ${formatDate(txn.date, "long")}`,
      bodyHTML: `<div id="txn-detail-body"></div>`,
      footerHTML: footerFor(txn),
      onMount(overlay) {
        overlay.querySelector("#txn-detail-body").innerHTML = bodyFor(txn, related);
        wire(overlay, txn, opts);
      },
    });
  }

  function metaRow(icon, label, value) {
    return `<div class="detail-meta-row">
      <span class="detail-meta-row__icon">${global.Icons.icon(icon, { size: 15 })}</span>
      <div class="detail-meta-row__body"><div class="detail-meta-row__label">${label}</div><div class="detail-meta-row__value">${value}</div></div>
    </div>`;
  }

  function bodyFor(txn, related) {
    const amt = V.txnAmountDisplay(txn);
    const meta = V.TXN_TYPE_META[txn.type];
    let specific = "";

    if (txn.type === "transfer") {
      const from = S.getAccount(txn.accountId), to = S.getAccount(txn.toAccountId);
      specific = `
        <div class="detail-section">
          <div class="detail-card">
            <div class="transfer-flow">
              <div class="transfer-flow__node">${V.accountChip(from, 44)}<span>${from.name}</span></div>
              <div class="transfer-flow__arrow"></div>
              <div class="transfer-flow__node">${V.accountChip(to, 44)}<span>${to.name}</span></div>
            </div>
          </div>
        </div>
        <div class="detail-section"><div class="detail-section__title">Details</div><div class="detail-card">
          ${metaRow("landmark", "From account", from.name)}
          ${metaRow("landmark", "To account", to.name)}
          ${metaRow("banknote", "Amount moved", formatINR(txn.amount))}
        </div></div>
      `;
    } else if (txn.type === "split") {
      const cat = S.getCategory(txn.categoryId);
      const settled = txn.splits.reduce((a, s) => a + s.settled, 0);
      const outstanding = txn.splits.reduce((a, s) => a + (s.share - s.settled), 0);
      specific = `
        <div class="detail-stat-grid">
          <div class="detail-stat"><div class="detail-stat__label">Total bill</div><div class="detail-stat__value">${formatINR(txn.amount)}</div></div>
          <div class="detail-stat"><div class="detail-stat__label">Your share</div><div class="detail-stat__value">${formatINR(txn.yourShare)}</div></div>
          <div class="detail-stat"><div class="detail-stat__label">Settled</div><div class="detail-stat__value text-pos">${formatINR(settled)}</div></div>
          <div class="detail-stat"><div class="detail-stat__label">Outstanding</div><div class="detail-stat__value text-neg">${formatINR(outstanding)}</div></div>
        </div>
        <div class="detail-section">
          <div class="detail-section__title">Participants</div>
          <div class="detail-card" style="padding:0 var(--sp-4)">
            ${txn.splits.map((s) => {
              const f = S.getFriend(s.friendId);
              const due = Math.round((s.share - s.settled) * 100) / 100;
              return `<div class="split-participant-row">
                ${V.friendAvatar(f, 34)}
                <div class="split-participant-row__meta"><div class="row-primary">${f.name}</div><div class="row-secondary">Share ${formatINR(s.share)}${s.settled > 0 ? ` · ${formatINR(s.settled)} settled` : ""}</div></div>
                <div class="split-participant-row__status">${due <= 0 ? `<span class="badge badge--income">Settled</span>` : `<span class="badge badge--danger">${formatINR(due)} due</span>`}</div>
              </div>`;
            }).join("")}
          </div>
        </div>
        <div class="detail-section"><div class="detail-section__title">Details</div><div class="detail-card">
          ${metaRow("tag", "Category", cat ? cat.name : "—")}
          ${metaRow("landmark", "Paid from", S.getAccount(txn.accountId).name)}
        </div></div>
      `;
    } else if (txn.type === "settlement") {
      const f = S.getFriend(txn.friendId);
      specific = `
        <div class="detail-section"><div class="detail-card" style="display:flex;align-items:center;gap:12px">
          ${V.friendAvatar(f, 44)}
          <div><div class="row-primary">${f.name}</div><div class="row-secondary">${txn.direction === "receive" ? "Paid you back" : "You paid them back"}</div></div>
        </div></div>
        <div class="detail-section"><div class="detail-section__title">Details</div><div class="detail-card">
          ${metaRow("landmark", "Account", S.getAccount(txn.accountId).name)}
          ${metaRow("handCoins", "Direction", txn.direction === "receive" ? "Received from friend" : "Paid to friend")}
        </div></div>
      `;
    } else if (txn.type === "refund") {
      const orig = S.state.transactions.find((t) => t.id === txn.refundOfId);
      specific = `
        <div class="detail-section"><div class="detail-section__title">Details</div><div class="detail-card">
          ${metaRow("wallet", "Refunded to", S.getAccount(txn.accountId).name)}
          ${metaRow("tag", "Category", S.getCategory(txn.categoryId) ? S.getCategory(txn.categoryId).name : "—")}
          ${orig ? metaRow("trendingDown", "Original expense", `${orig.description} (${formatINR(orig.amount)})`) : ""}
        </div></div>
      `;
    } else if (txn.type === "adjustment") {
      specific = `
        <div class="detail-section"><div class="detail-section__title">Details</div><div class="detail-card">
          ${metaRow("landmark", "Account", S.getAccount(txn.accountId).name)}
          ${metaRow("scale", "Direction", txn.direction === "increase" ? "Balance increased" : "Balance decreased")}
          ${metaRow("sliders", "Posted against", "Adjustments (system account)")}
        </div></div>
      `;
    } else {
      const cat = S.getCategory(txn.categoryId);
      specific = `
        <div class="detail-section"><div class="detail-section__title">Details</div><div class="detail-card">
          ${metaRow("tag", "Category", cat ? cat.name : "—")}
          ${metaRow("landmark", txn.type === "income" ? "Deposited to" : "Paid from", S.getAccount(txn.accountId).name)}
        </div></div>
      `;
    }

    return `
      <div class="detail-amount-hero">
        <span class="ledger-figure detail-amount-hero__figure ${amt.cls}">${amt.text}</span>
        ${V.txnBadge(txn)}
      </div>
      ${specific}
      ${txn.memo ? `<div class="detail-section"><div class="detail-section__title">Memo</div><p class="text-soft" style="font-size:13.3px;line-height:1.6">${txn.memo}</p></div>` : ""}
      ${related.length ? `<div class="detail-section"><div class="detail-section__title">Related transactions</div>${related.map((r) => `
        <div class="recent-txn-row" style="cursor:default">
          ${V.txnIconChip(r, 32)}
          <div class="recent-txn-row__meta"><div class="recent-txn-row__title">${r.description}</div><div class="recent-txn-row__sub">${formatDate(r.date)}</div></div>
          <div class="recent-txn-row__amt ${V.txnAmountDisplay(r).cls}">${V.txnAmountDisplay(r).text}</div>
        </div>`).join("")}</div>` : ""}
      <div class="detail-section"><div class="detail-section__title">Record</div><div class="detail-card">
        ${metaRow("calendar", "Recorded", formatDate(txn.createdAt || txn.date, "long"))}
        ${txn.updatedAt && txn.updatedAt !== txn.createdAt ? metaRow("edit", "Last updated", formatDate(txn.updatedAt, "long")) : ""}
        ${metaRow("check", "Status", txn.status === "reversed" ? `<span class="badge badge--danger">Reversed</span>` : `<span class="badge badge--income">Posted</span>`)}
      </div></div>
    `;
  }

  function footerFor(txn) {
    const editable = ["income", "expense", "transfer", "split"].includes(txn.type);
    let btns = `<button class="btn btn--ghost" data-close>Close</button>`;
    if (txn.type === "expense" && !txn.refundOfId) {
      btns += `<button class="btn btn--secondary" id="txn-refund-btn">Record refund</button>`;
    }
    if (editable) {
      btns += `<button class="btn btn--secondary" id="txn-edit-btn">Edit</button>
               <button class="btn btn--danger" id="txn-delete-btn">Delete</button>`;
    }
    return btns;
  }

  function wire(overlay, txn, opts) {
    const editBtn = overlay.querySelector("#txn-edit-btn");
    if (editBtn) editBtn.addEventListener("click", () => {
      global.Modal.close();
      global.TransactionForm.open({ type: txn.type, txn, onSaved: () => opts.onChange && opts.onChange() });
    });
    const delBtn = overlay.querySelector("#txn-delete-btn");
    if (delBtn) delBtn.addEventListener("click", () => {
      global.Modal.confirmDialog({
        title: "Delete this transaction?",
        message: S.state.settings.ledgerMode === "STRICT"
          ? "In STRICT mode this posts a reversal — the original stays in history but no longer affects balances."
          : "In DIRECT mode this permanently removes the entry with no trace left behind.",
        confirmLabel: "Delete",
        onConfirm: async () => {
          await global.mockApi.deleteTransaction(txn.id);
          global.Toast.show("Transaction deleted.", { variant: "success" });
          opts.onChange && opts.onChange();
        },
      });
    });
    const refundBtn = overlay.querySelector("#txn-refund-btn");
    if (refundBtn) refundBtn.addEventListener("click", () => {
      global.Modal.close();
      openRefundForm(txn, opts);
    });
  }

  function openRefundForm(original, opts) {
    global.Modal.open({
      title: "Record a refund",
      subtitle: `Linked to "${original.description}"`,
      size: "sm",
      bodyHTML: `
        <div class="form-field">
          <label>Refund amount</label>
          <div class="amount-input"><input class="input" type="number" id="rf-amt" step="0.01" min="0" max="${original.amount}" value="${original.amount}" /></div>
          <p class="form-hint">Can't exceed the unrefunded remainder of the original (${formatINR(original.amount)}).</p>
          <span class="form-field__error" id="rf-error"></span>
        </div>
        <div class="form-field" style="margin-top:12px">
          <label>Date</label>
          <input class="input" type="date" id="rf-date" max="2026-09-23" value="2026-09-23" />
        </div>
        <div class="form-field" style="margin-top:12px">
          <label>Memo</label>
          <textarea class="textarea" id="rf-memo" rows="2" placeholder="Why was this refunded?"></textarea>
        </div>
      `,
      footerHTML: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" id="rf-save">Record refund</button>`,
      onMount(overlay) {
        overlay.querySelector("#rf-save").addEventListener("click", async () => {
          const amt = parseFloat(overlay.querySelector("#rf-amt").value);
          const alreadyRefunded = S.state.transactions.filter((t) => t.refundOfId === original.id).reduce((a, t) => a + t.amount, 0);
          if (!(amt > 0) || amt > original.amount - alreadyRefunded + 0.001) {
            overlay.querySelector("#rf-error").textContent = `Enter an amount up to ${formatINR(original.amount - alreadyRefunded)}.`;
            return;
          }
          await global.mockApi.createTransaction({
            type: "refund", description: `Refund — ${original.description}`,
            memo: overlay.querySelector("#rf-memo").value.trim() || null,
            date: overlay.querySelector("#rf-date").value || "2026-09-23", currency: "INR", accountId: original.accountId,
            categoryId: original.categoryId, amount: amt, refundOfId: original.id,
          });
          global.Modal.close();
          global.Toast.show("Refund recorded.", { variant: "success" });
          opts.onChange && opts.onChange();
        });
      },
    });
  }

  global.TxnDetail = { open };
})(window);
