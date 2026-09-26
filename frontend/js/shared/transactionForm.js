(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR } = global.fmt;

  function accountOptions(selected, includeLiability) {
    const placeholder = `<option value="" ${!selected ? "selected" : ""} disabled>Select account…</option>`;
    const opts = S.state.accounts.filter((a) => a.isActive && !a.isSystem && (includeLiability !== false || a.accountType !== "LIABILITY"))
      .map((a) => `<option value="${a.id}" ${a.id === selected ? "selected" : ""}>${a.name}</option>`).join("");
    return placeholder + opts;
  }
  function expenseCategoryOptions(selected) {
    const placeholder = `<option value="" ${!selected ? "selected" : ""} disabled>Select category…</option>`;
    const opts = S.categoryRoots().map((root) => {
      const kids = S.categoryChildren(root.id);
      const o = [`<option value="${root.id}" ${root.id === selected ? "selected" : ""}>${root.name}</option>`]
        .concat(kids.map((k) => `<option value="${k.id}" ${k.id === selected ? "selected" : ""}>&nbsp;&nbsp;↳ ${k.name}</option>`));
      return o.join("");
    }).join("");
    return placeholder + opts;
  }
  function incomeSourceOptions(selected) {
    const placeholder = `<option value="" ${!selected ? "selected" : ""} disabled>Select income source…</option>`;
    const opts = S.state.incomeSources.map((s) => `<option value="${s.id}" ${s.id === selected ? "selected" : ""}>${s.name}</option>`).join("");
    return placeholder + opts;
  }
  function friendCheckboxes(selectedIds) {
    return S.state.friends.map((f) => `
      <label class="chip" style="cursor:pointer">
        <input type="checkbox" class="split-friend-cb" value="${f.id}" ${selectedIds.includes(f.id) ? "checked" : ""} style="margin-right:4px" />
        ${f.name}
      </label>`).join(" ");
  }

  function open({ type = "expense", txn = null, onSaved }) {
    const isEdit = !!txn;
    const t = txn || {};
    let currentType = t.type || type;
    const today = "2026-09-23";

    const render = (overlay, activeType) => {
      const body = overlay.querySelector(".overlay__body");
      body.innerHTML = formBody(activeType, t);
      wireBody(overlay, activeType);
    };

    const overlay = global.Modal.open({
      title: isEdit ? "Edit transaction" : "Add transaction",
      subtitle: isEdit ? "Changes follow your current ledger mode." : "Record a new income, expense, transfer or split.",
      size: "md",
      bodyHTML: `<div></div>`,
      footerHTML: `
        <button class="btn btn--ghost" data-close>Cancel</button>
        <button class="btn btn--primary" id="txn-save">${isEdit ? "Save changes" : "Add transaction"}</button>
      `,
      onMount(ov) {
        render(ov, currentType);
        ov.querySelector("#txn-save").addEventListener("click", () => submit(ov));
      },
    });

    function formBody(activeType, t) {
      const typeTabs = ["income", "expense", "transfer", "split"];
      const typeLabels = { income: "Income", expense: "Expense", transfer: "Transfer", split: "Split" };
      return `
        ${!isEdit ? `<div class="segmented" id="type-segmented" style="margin-bottom:16px">
          ${typeTabs.map((tt) => `<button type="button" data-type="${tt}" class="${tt === activeType ? "is-active" : ""}">${typeLabels[tt]}</button>`).join("")}
        </div>` : `<div style="margin-bottom:16px"><span class="badge ${global.Visuals.TXN_TYPE_META[activeType].badge}">${typeLabels[activeType] || activeType}</span></div>`}
        <div class="form-grid" id="txn-fields">
          ${fieldsFor(activeType, t)}
        </div>
      `;
    }

    function fieldsFor(activeType, t) {
      const common = `
        <div class="form-field form-field--full" data-field="description">
          <label for="f-desc">Description</label>
          <input class="input" id="f-desc" placeholder="e.g. ${activeType === "income" ? "Monthly salary" : activeType === "transfer" ? "Cash withdrawal" : "Dinner at Truffles"}" value="${t.description || ""}" />
          <span class="form-field__error"></span>
        </div>
        <div class="form-field" data-field="date">
          <label for="f-date">Date</label>
          <input class="input" type="date" id="f-date" max="${today}" value="${t.date || today}" />
          <span class="form-field__error"></span>
        </div>`;

      if (activeType === "income") {
        return common + `
          <div class="form-field" data-field="category">
            <label for="f-cat">Income source</label>
            <select class="select" id="f-cat">${incomeSourceOptions(t.categoryId)}</select>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field" data-field="account">
            <label for="f-acc">Deposit to account</label>
            <select class="select" id="f-acc">${accountOptions(t.accountId, false)}</select>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field" data-field="amount">
            <label for="f-amt">Amount</label>
            <div class="amount-input"><input class="input" type="number" min="0" step="0.01" id="f-amt" placeholder="0.00" value="${t.amount || ""}" /></div>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field form-field--full">
            <label for="f-memo">Memo (optional)</label>
            <textarea class="textarea" id="f-memo" rows="2">${t.memo || ""}</textarea>
          </div>`;
      }

      if (activeType === "expense") {
        return common + `
          <div class="form-field" data-field="category">
            <label for="f-cat">Category</label>
            <select class="select" id="f-cat">${expenseCategoryOptions(t.categoryId)}</select>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field" data-field="account">
            <label for="f-acc">Paid from</label>
            <select class="select" id="f-acc">${accountOptions(t.accountId)}</select>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field" data-field="amount">
            <label for="f-amt">Amount</label>
            <div class="amount-input"><input class="input" type="number" min="0" step="0.01" id="f-amt" placeholder="0.00" value="${t.amount || ""}" /></div>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field form-field--full">
            <label for="f-memo">Memo (optional)</label>
            <textarea class="textarea" id="f-memo" rows="2">${t.memo || ""}</textarea>
          </div>`;
      }

      if (activeType === "transfer") {
        return common + `
          <div class="form-field" data-field="account">
            <label for="f-acc">From account</label>
            <select class="select" id="f-acc">${accountOptions(t.accountId)}</select>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field" data-field="toAccount">
            <label for="f-to">To account</label>
            <select class="select" id="f-to">${accountOptions(t.toAccountId)}</select>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field" data-field="amount">
            <label for="f-amt">Amount</label>
            <div class="amount-input"><input class="input" type="number" min="0" step="0.01" id="f-amt" placeholder="0.00" value="${t.amount || ""}" /></div>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field form-field--full">
            <label for="f-memo">Memo (optional)</label>
            <textarea class="textarea" id="f-memo" rows="2">${t.memo || ""}</textarea>
          </div>`;
      }

      // split
      const selectedFriends = (t.splits || []).map((s) => s.friendId);
      return common + `
          <div class="form-field" data-field="category">
            <label for="f-cat">Category</label>
            <select class="select" id="f-cat">${expenseCategoryOptions(t.categoryId)}</select>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field" data-field="account">
            <label for="f-acc">Paid from</label>
            <select class="select" id="f-acc">${accountOptions(t.accountId)}</select>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field form-field--full" data-field="amount">
            <label for="f-amt">Total bill amount</label>
            <div class="amount-input"><input class="input" type="number" min="0" step="0.01" id="f-amt" placeholder="0.00" value="${t.amount || ""}" /></div>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field form-field--full" data-field="friends">
            <label>Split with</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">${friendCheckboxes(selectedFriends)}</div>
            <span class="form-field__error"></span>
          </div>
          <div class="form-field form-field--full" data-field="shares" id="split-breakdown"></div>
          <div class="form-field form-field--full">
            <label for="f-memo">Memo (optional)</label>
            <textarea class="textarea" id="f-memo" rows="2">${t.memo || "Split evenly"}</textarea>
          </div>`;
    }

    // Renders (or re-suggests) the share breakdown.
    // mode "initial": on first open, seed from the existing transaction if editing one.
    // mode "reseed": the bill amount or friend selection changed — recompute an equal split.
    // mode "keep" (default): a re-render triggered by something else — preserve whatever's in the inputs.
    function renderSplitBreakdown(overlay, t, mode) {
      const holder = overlay.querySelector("#split-breakdown");
      if (!holder) return;
      const amount = parseFloat(overlay.querySelector("#f-amt").value) || 0;
      const checked = [...overlay.querySelectorAll(".split-friend-cb:checked")].map((c) => c.value);
      if (!checked.length) { holder.innerHTML = `<label>Share breakdown</label><p class="form-hint">Select at least one friend to split this with.</p>`; return; }

      const shareCount = checked.length + 1;
      const equalShare = amount ? Math.round((amount / shareCount) * 100) / 100 : 0;

      let yourShareSeed = null;
      const friendShareSeed = {};
      if (mode === "initial" && isEdit && t.splits && t.splits.length) {
        yourShareSeed = t.yourShare;
        t.splits.forEach((s) => { friendShareSeed[s.friendId] = s.share; });
      } else if (mode === "keep" && holder.dataset.built) {
        const ys = overlay.querySelector('[data-role="your-share"]');
        if (ys) yourShareSeed = parseFloat(ys.value);
        overlay.querySelectorAll(".split-share-input[data-friend]").forEach((inp) => { friendShareSeed[inp.dataset.friend] = parseFloat(inp.value); });
      }

      holder.innerHTML = `
        <label>Share breakdown <span class="text-faint" style="font-weight:400">— editable, your share can be ₹0</span></label>
        <div class="split-row" style="border-bottom:1px solid var(--line)">
          <span></span><span>You</span>
          <input class="input num split-share-input" data-role="your-share" type="number" step="0.01" min="0" value="${yourShareSeed != null && !isNaN(yourShareSeed) ? yourShareSeed : equalShare}" style="width:100px;text-align:right" />
          <span class="text-faint" style="font-size:11px">your share</span>
        </div>
        ${checked.map((fid) => {
          const f = S.getFriend(fid);
          const seed = friendShareSeed[fid];
          return `<div class="split-row">
            ${global.Visuals.friendAvatar(f, 26)}
            <span>${f.name}</span>
            <input class="input num split-share-input" data-friend="${fid}" type="number" step="0.01" min="0" value="${seed != null && !isNaN(seed) ? seed : equalShare}" style="width:100px;text-align:right" />
            <span class="text-faint" style="font-size:11px">share</span>
          </div>`;
        }).join("")}
        <p class="form-hint" id="split-total-hint" style="margin-top:8px"></p>
      `;
      holder.dataset.built = "1";
      updateSplitTotalHint(overlay);
      holder.querySelectorAll(".split-share-input").forEach((inp) => inp.addEventListener("input", () => updateSplitTotalHint(overlay)));
    }

    function updateSplitTotalHint(overlay) {
      const hint = overlay.querySelector("#split-total-hint");
      if (!hint) return;
      const amount = parseFloat(overlay.querySelector("#f-amt").value) || 0;
      const yourShareInput = overlay.querySelector('[data-role="your-share"]');
      const yourShare = yourShareInput ? parseFloat(yourShareInput.value) || 0 : 0;
      const friendInputs = [...overlay.querySelectorAll(".split-share-input[data-friend]")].map((i) => parseFloat(i.value) || 0);
      const total = friendInputs.reduce((a, b) => a + b, yourShare);
      const diff = Math.round((amount - total) * 100) / 100;
      hint.textContent = Math.abs(diff) < 0.01
        ? `Your share ${formatINR(yourShare)} + friends' shares = ${formatINR(total)} — matches the total.`
        : `Shares add up to ${formatINR(total)}, but the bill is ${formatINR(amount)} (${diff > 0 ? "short by" : "over by"} ${formatINR(Math.abs(diff))}).`;
      hint.className = "form-hint " + (Math.abs(diff) < 0.01 ? "text-pos" : "text-neg");
    }

    function wireBody(overlay, activeType) {
      overlay.querySelectorAll("#type-segmented button").forEach((btn) => {
        btn.addEventListener("click", () => {
          currentType = btn.dataset.type;
          render(overlay, currentType);
        });
      });
      if (activeType === "split") {
        overlay.querySelectorAll(".split-friend-cb").forEach((cb) => cb.addEventListener("change", () => renderSplitBreakdown(overlay, t, "reseed")));
        overlay.querySelector("#f-amt").addEventListener("input", () => renderSplitBreakdown(overlay, t, "reseed"));
        renderSplitBreakdown(overlay, t, "initial");
      }
    }

    function clearErrors(overlay) {
      overlay.querySelectorAll(".form-field").forEach((f) => { f.classList.remove("has-error"); const e = f.querySelector(".form-field__error"); if (e) e.textContent = ""; });
    }
    function showError(overlay, field, msg) {
      const el = overlay.querySelector(`[data-field="${field}"]`);
      if (!el) return;
      el.classList.add("has-error");
      const e = el.querySelector(".form-field__error");
      if (e) e.textContent = msg;
    }

    async function submit(overlay) {
      clearErrors(overlay);
      const desc = overlay.querySelector("#f-desc").value.trim();
      const date = overlay.querySelector("#f-date").value;
      const amount = parseFloat(overlay.querySelector("#f-amt").value);
      const errors = {};
      if (!desc) errors.description = "Description is required.";
      if (!date) errors.date = "Pick a date.";
      else if (date > today) errors.date = "Date can't be in the future.";
      if (!(amount > 0)) errors.amount = "Enter an amount greater than ₹0.";

      let payload = { description: desc, date, amount, currency: "INR", memo: overlay.querySelector("#f-memo") ? overlay.querySelector("#f-memo").value.trim() || null : null };

      if (currentType === "income") {
        const account = overlay.querySelector("#f-acc").value;
        const category = overlay.querySelector("#f-cat").value;
        if (!category) errors.category = "Select an income source.";
        if (!account) errors.account = "Select an account.";
        Object.assign(payload, { type: "income", accountId: account, categoryId: category });
      } else if (currentType === "expense") {
        const account = overlay.querySelector("#f-acc").value;
        const category = overlay.querySelector("#f-cat").value;
        if (!category) errors.category = "Select a category.";
        if (!account) errors.account = "Select an account.";
        Object.assign(payload, { type: "expense", accountId: account, categoryId: category });
      } else if (currentType === "transfer") {
        const from = overlay.querySelector("#f-acc").value;
        const to = overlay.querySelector("#f-to").value;
        if (!from) errors.account = "Select a source account.";
        if (!to) errors.toAccount = "Select a destination account.";
        else if (from === to) errors.toAccount = "Pick a different destination account.";
        Object.assign(payload, { type: "transfer", accountId: from, toAccountId: to });
      } else if (currentType === "split") {
        const account = overlay.querySelector("#f-acc").value;
        const category = overlay.querySelector("#f-cat").value;
        if (!category) errors.category = "Select a category.";
        if (!account) errors.account = "Select an account.";
        const checked = [...overlay.querySelectorAll(".split-friend-cb:checked")].map((c) => c.value);
        if (!checked.length) errors.friends = "Select at least one friend.";
        const shareInputs = [...overlay.querySelectorAll(".split-share-input[data-friend]")];
        const yourShareInput = overlay.querySelector('[data-role="your-share"]');
        const yourShare = yourShareInput ? Math.round((parseFloat(yourShareInput.value) || 0) * 100) / 100 : 0;
        const shares = checked.map((fid, i) => ({ friendId: fid, share: Math.round((parseFloat(shareInputs[i].value) || 0) * 100) / 100, settled: 0 }));
        if (yourShare < 0) errors.shares = "Your share can't be negative — it can be ₹0, though.";
        else if (shares.some((s) => s.share < 0)) errors.shares = "A friend's share can't be negative.";
        else {
          const total = shares.reduce((a, s) => a + s.share, yourShare);
          if (amount > 0 && Math.abs(amount - total) > 0.02) errors.shares = `Shares add up to ${formatINR(total)}, not the ${formatINR(amount)} total — adjust them to match.`;
        }
        Object.assign(payload, { type: "split", accountId: account, categoryId: category, splits: shares, yourShare });
      }

      if (Object.keys(errors).length) {
        Object.keys(errors).forEach((f) => showError(overlay, f, errors[f]));
        return;
      }

      const saveBtn = overlay.querySelector("#txn-save");
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      try {
        let result;
        if (isEdit) result = await global.mockApi.updateTransaction(t.id, payload);
        else result = await global.mockApi.createTransaction(payload);
        global.Modal.close();
        global.Toast.show(isEdit ? "Transaction updated." : "Transaction added.", { variant: "success" });
        if (onSaved) onSaved(result);
      } catch (e) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? "Save changes" : "Add transaction";
        global.Toast.show(e.message || "Something went wrong.", { variant: "error" });
      }
    }
  }

  global.TransactionForm = { open };
})(window);
