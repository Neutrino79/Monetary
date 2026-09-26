(function (global) {
  "use strict";
  const S = global.Store;
  const { formatINR } = global.fmt;

  let filterState = { search: "" };

  function render(container) {
    filterState = { search: "" };
    paint(container);
  }

  function paint(container) {
    const range = S.monthRange(1);
    const q = filterState.search.trim().toLowerCase();
    let roots = S.categoryRoots();
    if (q) {
      roots = roots.filter((r) => r.name.toLowerCase().includes(q) || S.categoryChildren(r.id).some((k) => k.name.toLowerCase().includes(q)));
    }

    container.innerHTML = `
      <div class="page-head">
        <div><h1 class="page-head__title">Categories</h1><p class="page-head__desc">Organize spending and set monthly budgets on root categories.</p></div>
        <div class="page-head__actions"><button class="btn btn--primary" id="cat-add">${global.Icons.icon("plus", { size: 15 })} Add category</button></div>
      </div>
      <div class="filter-bar" style="margin-bottom:16px">
        <div class="filter-bar__row">
          <div class="topbar__search filter-bar__search" style="background:var(--paper-sunken);max-width:340px">
            ${global.Icons.icon("search", { size: 15 })}
            <input type="text" placeholder="Search categories…" id="cat-search" value="${filterState.search}" />
          </div>
        </div>
      </div>
      <div id="cat-tree"></div>
    `;
    const tree = container.querySelector("#cat-tree");
    tree.innerHTML = roots.length ? roots.map((r) => rootHTML(r, range, q)).join("") :
      `<div class="card"><div class="empty-state"><div class="empty-state__icon">${global.Icons.icon("tag", { size: 22 })}</div><div class="empty-state__title">No categories match</div><div class="empty-state__desc">Try a different search term.</div></div></div>`;

    if (q) tree.querySelectorAll(".category-tree__root").forEach((el) => el.classList.add("is-open"));

    container.querySelector("#cat-search").addEventListener("input", (e) => {
      const caret = e.target.selectionStart;
      filterState.search = e.target.value;
      paint(container);
      const revived = container.querySelector("#cat-search");
      revived.focus();
      revived.setSelectionRange(caret, caret);
    });

    tree.querySelectorAll(".category-tree__root-head").forEach((head) => head.addEventListener("click", (e) => {
      if (e.target.closest("[data-menu]")) return;
      head.closest(".category-tree__root").classList.toggle("is-open");
    }));
    tree.querySelectorAll("[data-edit-cat]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openForm(S.state.categories.find((c) => c.id === btn.dataset.editCat), null, () => paint(container));
    }));
    tree.querySelectorAll("[data-add-child]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openForm(null, btn.dataset.addChild, () => paint(container));
    }));
    tree.querySelectorAll("[data-delete-cat]").forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const cat = S.state.categories.find((c) => c.id === btn.dataset.deleteCat);
      global.Modal.confirmDialog({
        title: `Delete "${cat.name}"?`, message: "Existing transactions keep their record, but this category (and any subcategories) won't be selectable going forward.",
        confirmLabel: "Delete", onConfirm: async () => { await global.mockApi.deleteCategory(cat.id); global.Toast.show("Category deleted.", { variant: "success" }); paint(container); },
      });
    }));
    container.querySelector("#cat-add").addEventListener("click", () => openForm(null, null, () => paint(container)));
  }

  function rootHTML(r, range, q) {
    const allKids = S.categoryChildren(r.id);
    const rootMatches = !q || r.name.toLowerCase().includes(q);
    const kids = rootMatches ? allKids : allKids.filter((k) => k.name.toLowerCase().includes(q));
    const spent = S.calcCategorySpend(r.id, range);
    const pct = r.budgetLimit ? Math.round((spent / r.budgetLimit) * 100) : null;
    return `<div class="category-tree__root">
      <div class="category-tree__root-head">
        <span class="category-tree__chevron">${global.Icons.icon("chevronRight", { size: 16 })}</span>
        <span class="category-tree__icon" style="background:${r.color}">${global.Icons.icon("tag", { size: 17 })}</span>
        <div class="category-tree__body">
          <div class="row-primary">${r.name}</div>
          <div class="row-secondary">${allKids.length} subcategor${allKids.length === 1 ? "y" : "ies"}</div>
        </div>
        ${r.budgetLimit ? `<div class="category-tree__budget">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span>${formatINR(spent)} / ${formatINR(r.budgetLimit)}</span><span class="${pct > 100 ? "text-neg" : "text-faint"}">${pct}%</span></div>
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${Math.min(100, pct)}%;background:${pct > 100 ? "var(--negative)" : pct > 80 ? "var(--warn)" : "var(--accent)"}"></div></div>
        </div>` : `<div class="category-tree__budget"><span class="text-faint" style="font-size:12px">No budget set</span></div>`}
        <div style="display:flex;gap:4px" data-menu>
          <button class="icon-btn" data-add-child="${r.id}" title="Add subcategory">${global.Icons.icon("plus", { size: 15 })}</button>
          <button class="icon-btn" data-edit-cat="${r.id}" title="Edit">${global.Icons.icon("edit", { size: 15 })}</button>
          <button class="icon-btn" data-delete-cat="${r.id}" title="Delete">${global.Icons.icon("trash", { size: 15 })}</button>
        </div>
      </div>
      <div class="category-tree__children">
        ${kids.length ? kids.map((k) => childHTML(k, range)).join("") : `<div class="category-tree__child-row"><span class="text-faint">No subcategories yet</span></div>`}
      </div>
    </div>`;
  }

  function childHTML(k, range) {
    const spent = S.calcCategorySpend(k.id, range);
    return `<div class="category-tree__child-row">
      <div><div class="row-primary" style="font-weight:500">${k.name}</div><div class="row-secondary">${formatINR(spent)} spent (30d)</div></div>
      <div style="display:flex;gap:4px" data-menu>
        <button class="icon-btn" data-edit-cat="${k.id}" title="Edit">${global.Icons.icon("edit", { size: 15 })}</button>
        <button class="icon-btn" data-delete-cat="${k.id}" title="Delete">${global.Icons.icon("trash", { size: 15 })}</button>
      </div>
    </div>`;
  }

  function openForm(existing, parentId, onDone) {
    const isChild = !!parentId || (existing && existing.parentId);
    global.Modal.open({
      title: existing ? "Edit category" : parentId ? "Add subcategory" : "Add category",
      size: "sm",
      bodyHTML: `
        <div class="form-field" style="margin-bottom:12px"><label>Name</label><input class="input" id="cf-name" value="${existing ? existing.name : ""}" /><span class="form-field__error" id="cf-err"></span></div>
        ${!isChild ? `<div class="form-field"><label>Monthly budget (optional)</label><div class="amount-input"><input class="input" id="cf-budget" type="number" step="1" min="0" value="${existing && existing.budgetLimit ? existing.budgetLimit : ""}" /></div><p class="form-hint">Leave blank for no limit.</p></div>` : `<p class="form-hint">Subcategories inherit their parent's budget tracking automatically.</p>`}
      `,
      footerHTML: `<button class="btn btn--ghost" data-close>Cancel</button><button class="btn btn--primary" id="cf-save">${existing ? "Save" : "Add"}</button>`,
      onMount(overlay) {
        overlay.querySelector("#cf-save").addEventListener("click", async () => {
          const name = overlay.querySelector("#cf-name").value.trim();
          if (!name) { overlay.querySelector("#cf-err").textContent = "Name is required."; return; }
          if (existing) {
            const patch = { name };
            const budgetInput = overlay.querySelector("#cf-budget");
            if (budgetInput) patch.budgetLimit = budgetInput.value ? parseFloat(budgetInput.value) : null;
            await global.mockApi.updateCategory(existing.id, patch);
          } else {
            const colors = ["#1F6D4C", "#8A5A00", "#7A2E3A", "#4A4A8A", "#2E6B8A", "#8A2E6B", "#2E8A6B", "#8A6B2E"];
            const budgetInput = overlay.querySelector("#cf-budget");
            await global.mockApi.createCategory({ name, parentId: parentId || null, color: colors[Math.floor(Math.random() * colors.length)], budgetLimit: budgetInput && budgetInput.value ? parseFloat(budgetInput.value) : null });
          }
          global.Modal.close();
          global.Toast.show(existing ? "Category updated." : "Category added.", { variant: "success" });
          onDone();
        });
      },
    });
  }

  global.Pages = global.Pages || {};
  global.Pages.categories = { render };
})(window);
