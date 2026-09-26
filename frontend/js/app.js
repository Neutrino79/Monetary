(function (global) {
  "use strict";
  const S = global.Store;

  const NAV = [
    { section: "Overview", items: [
      { path: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { path: "/transactions", label: "Transactions", icon: "list" },
      { path: "/reports", label: "Reports & Trends", icon: "barChart" },
    ] },
    { section: "Money", items: [
      { path: "/income", label: "Income", icon: "trendingUp" },
      { path: "/expenses", label: "Expenses", icon: "trendingDown" },
      { path: "/transfers", label: "Transfers", icon: "shuffle" },
    ] },
    { section: "Shared", items: [
      { path: "/splits", label: "Splits", icon: "users" },
      { path: "/friends", label: "Friends", icon: "user" },
    ] },
    { section: "Setup", items: [
      { path: "/accounts", label: "Accounts", icon: "landmark" },
      { path: "/categories", label: "Categories", icon: "tag" },
      { path: "/settings", label: "Settings", icon: "settings" },
    ] },
  ];
  const MOBILE_TABS = ["/dashboard", "/transactions", "/friends", "/reports", "/settings"];
  const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];
  let shellBooted = false;

  function applyTheme() {
    const t = S.state.settings.theme;
    if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.setAttribute("data-theme", "light");
  }

  function shellHTML() {
    return `
      <a href="#main" class="skip-link">Skip to content</a>
      <div class="app-shell" id="app-shell">
        <div class="nav-scrim" id="nav-scrim"></div>
        <aside class="sidebar" id="sidebar" aria-label="Primary navigation">
          <div class="sidebar__brand">
            <span class="sidebar__brand-mark">₹</span>
            <div>
              <div class="sidebar__brand-text">Khata</div>
              <div class="sidebar__brand-sub">Personal ledger</div>
            </div>
          </div>
          <nav id="nav-links">
            ${NAV.map((sec) => `
              <div class="sidebar__section-label">${sec.section}</div>
              ${sec.items.map((item) => `
                <a href="#${item.path}" class="nav-link" data-path="${item.path}">
                  ${global.Icons.icon(item.icon, { size: 17 })}
                  <span class="nav-link__label">${item.label}</span>
                  <span class="nav-link__badge" data-badge="${item.path}" hidden></span>
                </a>`).join("")}
            `).join("")}
          </nav>
          <div class="sidebar__footer">
            <button class="sidebar__collapse-btn" id="sidebar-collapse">${global.Icons.icon("chevronRight", { size: 15 })} <span class="nav-link__label">Collapse</span></button>
          </div>
        </aside>
        <div class="app-main">
          <header class="topbar">
            <button class="hamburger" id="hamburger" aria-label="Open navigation">${global.Icons.icon("menu", { size: 18 })}</button>
            <span class="topbar__title" id="topbar-title">Dashboard</span>
            <div class="topbar__search" id="topbar-search" role="button" tabindex="0" aria-label="Search or run a command">
              ${global.Icons.icon("search", { size: 15 })}
              <input type="text" placeholder="Search transactions, friends, accounts…" readonly />
              <span class="topbar__kbd">⌘K</span>
            </div>
            <span class="topbar__spacer"></span>
            <div class="topbar__actions">
              <button class="icon-btn" id="theme-toggle" aria-label="Toggle theme"></button>
              <button class="icon-btn" id="notif-btn" aria-label="Notifications">${global.Icons.icon("bell", { size: 18 })}</button>
              <button class="btn btn--primary btn--sm" id="quick-add">${global.Icons.icon("plus", { size: 14 })} Add</button>
              <button class="icon-btn" id="logout-btn" aria-label="Log out" title="Log out">${global.Icons.icon("logout", { size: 17 })}</button>
            </div>
          </header>
          <main class="content" id="main">
            <div id="page-root"></div>
          </main>
        </div>
      </div>
      <nav class="mobile-tabbar" aria-label="Primary navigation">
        ${MOBILE_TABS.map((p) => {
          const item = NAV.flatMap((s) => s.items).find((i) => i.path === p);
          return `<button class="mobile-tabbar__item" data-path="${p}">${global.Icons.icon(item.icon, { size: 19 })}<span>${item.label.split(" ")[0]}</span></button>`;
        }).join("")}
      </nav>
      <button class="fab" id="fab-add" aria-label="Add transaction">${global.Icons.icon("plus", { size: 22 })}</button>
    `;
  }

  function setActiveRoute(path) {
    const base = "/" + path.split("/")[1];
    document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("is-active", a.dataset.path === base));
    document.querySelectorAll(".mobile-tabbar__item").forEach((a) => a.classList.toggle("is-active", a.dataset.path === base));
    const navItem = NAV.flatMap((s) => s.items).find((i) => i.path === base);
    const titleEl = document.getElementById("topbar-title");
    if (titleEl) titleEl.textContent = navItem ? navItem.label : "Khata";
  }

  function refreshBadges() {
    const outstanding = S.state.friends.filter((f) => Math.abs(S.calcFriendOutstanding(f.id)) > 0.5).length;
    const badge = document.querySelector('[data-badge="/friends"]');
    if (badge) {
      if (outstanding > 0) { badge.hidden = false; badge.textContent = outstanding; }
      else badge.hidden = true;
    }
  }

  function updateThemeIcon() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;
    btn.innerHTML = global.Icons.icon(S.state.settings.theme === "dark" ? "sun" : "moon", { size: 17 });
  }

  function wireShell() {
    document.getElementById("sidebar-collapse").addEventListener("click", () => {
      const shell = document.getElementById("app-shell");
      shell.classList.toggle("is-collapsed");
      S.state.ui.sidebarCollapsed = shell.classList.contains("is-collapsed");
    });
    document.getElementById("hamburger").addEventListener("click", () => document.getElementById("app-shell").classList.add("is-nav-open"));
    document.getElementById("nav-scrim").addEventListener("click", () => document.getElementById("app-shell").classList.remove("is-nav-open"));
    document.querySelectorAll(".nav-link").forEach((a) => a.addEventListener("click", () => document.getElementById("app-shell").classList.remove("is-nav-open")));
    document.querySelectorAll(".mobile-tabbar__item").forEach((btn) => btn.addEventListener("click", () => global.Router.go(btn.dataset.path)));

    document.getElementById("theme-toggle").addEventListener("click", async () => {
      const next = S.state.settings.theme === "dark" ? "light" : "dark";
      await global.mockApi.updateSettings({ theme: next });
      applyTheme(); updateThemeIcon();
    });
    updateThemeIcon();

    document.getElementById("notif-btn").addEventListener("click", () => openNotifications());

    const openQuickAdd = () => global.TransactionForm.open({ type: "expense", onSaved: () => { global.Router.rerenderCurrent(); refreshBadges(); } });
    document.getElementById("quick-add").addEventListener("click", openQuickAdd);
    document.getElementById("fab-add").addEventListener("click", openQuickAdd);

    document.getElementById("topbar-search").addEventListener("click", openCommandPalette);
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openCommandPalette(); }
    });

    document.getElementById("logout-btn").addEventListener("click", () => {
      global.Modal.confirmDialog({
        title: "Log out?", message: "You'll need to sign in again to see your ledger.",
        confirmLabel: "Log out", variant: "danger", onConfirm: () => logout(),
      });
    });
  }

  function openNotifications() {
    const dueFriends = S.state.friends.filter((f) => S.calcFriendOutstanding(f.id) > 0.5);
    const overBudget = S.calcBudgetUsage(S.monthRange(1)).filter((b) => b.pct > 90);
    global.Modal.drawer({
      title: "Notifications",
      bodyHTML: `<div id="notif-body"></div>`,
      onMount(overlay) {
        const items = [];
        dueFriends.forEach((f) => items.push({ icon: "handCoins", text: `${f.name} owes you ${global.fmt.formatINR(S.calcFriendOutstanding(f.id))}`, color: "var(--info)" }));
        overBudget.forEach((b) => items.push({ icon: "alert", text: `${b.category.name} is at ${b.pct}% of its monthly budget`, color: "var(--warn)" }));
        overlay.querySelector("#notif-body").innerHTML = items.length ? items.map((i) => `
          <div class="insight-card"><span class="insight-card__icon" style="background:color-mix(in srgb, ${i.color} 15%, transparent);color:${i.color}">${global.Icons.icon(i.icon, { size: 16 })}</span><div style="font-size:13px">${i.text}</div></div>
        `).join("") : `<div class="empty-state"><div class="empty-state__desc">You're all caught up.</div></div>`;
      },
    });
  }

  function openCommandPalette() {
    const overlay = global.Modal.open({
      kind: "modal", title: "", size: "md",
      bodyHTML: `
        <div class="cmdk-input-row">${global.Icons.icon("search", { size: 16 })}<input id="cmdk-input" placeholder="Search pages, friends, accounts, or type a command…" /></div>
        <div class="cmdk-results" id="cmdk-results"></div>
      `,
      onMount(ov) {
        ov.querySelector(".overlay__header").style.display = "none";
        const input = ov.querySelector("#cmdk-input");
        input.focus();
        renderResults(ov, "");
        input.addEventListener("input", () => renderResults(ov, input.value));
      },
    });
  }

  function commandItems() {
    const pages = NAV.flatMap((s) => s.items).map((i) => ({ type: "page", label: i.label, hint: "Go to page", icon: i.icon, action: () => global.Router.go(i.path) }));
    const friends = S.state.friends.map((f) => ({ type: "friend", label: f.name, hint: "Friend", icon: "user", action: () => global.Router.go("/friends") }));
    const accounts = S.state.accounts.filter((a) => !a.isSystem).map((a) => ({ type: "account", label: a.name, hint: "Account", icon: "landmark", action: () => global.Router.go("/accounts") }));
    const commands = [
      { type: "cmd", label: "Add transaction", hint: "Command", icon: "plus", action: () => global.TransactionForm.open({ type: "expense", onSaved: () => global.Router.rerenderCurrent() }) },
      { type: "cmd", label: "Add friend", hint: "Command", icon: "user", action: () => global.Router.go("/friends") },
      { type: "cmd", label: "Toggle theme", hint: "Command", icon: "sun", action: () => document.getElementById("theme-toggle").click() },
    ];
    return [...commands, ...pages, ...friends, ...accounts];
  }

  function renderResults(overlay, query) {
    const q = query.toLowerCase();
    const items = commandItems().filter((i) => i.label.toLowerCase().includes(q)).slice(0, 8);
    const holder = overlay.querySelector("#cmdk-results");
    holder.innerHTML = items.length ? items.map((i, idx) => `
      <div class="cmdk-item ${idx === 0 ? "is-active" : ""}" data-idx="${idx}">${global.Icons.icon(i.icon, { size: 16 })}<span>${i.label}</span><span class="cmdk-item__hint">${i.hint}</span></div>
    `).join("") : `<div class="empty-state"><div class="empty-state__desc">No matches</div></div>`;
    holder.querySelectorAll(".cmdk-item").forEach((el, idx) => el.addEventListener("click", () => { global.Modal.close(); items[idx].action(); }));
  }

  function openExportModal() {
    const data = { accounts: S.state.accounts, categories: S.state.categories, incomeSources: S.state.incomeSources, friends: S.state.friends, transactions: S.state.transactions };
    const json = JSON.stringify(data, null, 2);
    global.Modal.open({
      title: "Export data", subtitle: "A JSON snapshot of everything in this prototype", size: "md",
      bodyHTML: `<textarea class="textarea" style="height:280px;font-family:var(--font-mono);font-size:12px" readonly>${json.slice(0, 20000)}</textarea>`,
      footerHTML: `<button class="btn btn--ghost" data-close>Close</button><button class="btn btn--primary" id="export-download">Download JSON</button>`,
      onMount(overlay) {
        overlay.querySelector("#export-download").addEventListener("click", () => {
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "expense-data-export.json"; a.click();
          URL.revokeObjectURL(url);
          global.Toast.show("Export downloaded.", { variant: "success" });
        });
      },
    });
  }

  function syncSettingsFromUser(user) {
    S.state.settings.ownerName = user.name;
    S.state.settings.ownerEmail = user.email;
    S.state.settings.ledgerMode = user.ledgerMode || "DIRECT";
    S.state.settings.timezone = user.timezone || "Asia/Kolkata";
    S.state.settings.homeCurrencyCode = user.homeCurrencyCode || "INR";
  }

  function renderAuthPage(path) {
    const root = document.getElementById("app-root");
    root.innerHTML = `<div id="auth-root"></div>`;
    const authRoot = document.getElementById("auth-root");
    if (path === "/signup") global.Pages.signup.render(authRoot);
    else if (path === "/forgot-password") global.Pages.forgotPassword.render(authRoot);
    else global.Pages.login.render(authRoot);
  }

  function bootShell() {
    const user = global.Auth.currentUser();
    if (user) syncSettingsFromUser(user);
    applyTheme();
    document.getElementById("app-root").innerHTML = shellHTML();
    wireShell();
    refreshBadges();

    global.Router.register("/dashboard", global.Pages.dashboard);
    global.Router.register("/transactions", global.Pages.transactions);
    global.Router.register("/income", global.Pages.income);
    global.Router.register("/expenses", global.Pages.expenses);
    global.Router.register("/transfers", global.Pages.transfers);
    global.Router.register("/splits", global.Pages.splits);
    global.Router.register("/friends", global.Pages.friends);
    global.Router.register("/accounts", global.Pages.accounts);
    global.Router.register("/categories", global.Pages.categories);
    global.Router.register("/reports", global.Pages.reports);
    global.Router.register("/settings", global.Pages.settings);

    global.Router.init(document.getElementById("page-root"));
  }

  function logout() {
    global.Auth.logout();
    shellBooted = false;
    location.hash = "#/login";
    boot();
  }

  function onAuthenticated() {
    const target = "/dashboard";
    if (location.hash.slice(1) === target) boot();
    else location.hash = "#" + target;
  }

  function boot() {
    const rawHash = (location.hash || "").slice(1);
    const path = rawHash.split("?")[0];
    const authed = !!global.Auth.getSession();

    if (!authed) {
      const target = AUTH_ROUTES.includes(path) ? path : "/login";
      if (target !== path) { location.hash = "#" + target; return; }
      renderAuthPage(target);
      return;
    }

    if (AUTH_ROUTES.includes(path) || !path) {
      location.hash = "#/dashboard";
      return;
    }

    if (!shellBooted) {
      shellBooted = true;
      bootShell();
    }
  }

  function init() {
    window.addEventListener("hashchange", boot);
    boot();
  }

  global.App = { init, applyTheme, setActiveRoute, refreshBadges, openExportModal, onAuthenticated, logout };
})(window);
