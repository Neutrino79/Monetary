(function (global) {
  "use strict";
  const S = global.Store;

  function render(container) { paint(container); }

  function paint(container) {
    const s = S.state.settings;
    container.innerHTML = `
      <div class="page-head"><div><h1 class="page-head__title">Settings</h1><p class="page-head__desc">Preferences for how the app looks and how corrections are handled.</p></div></div>

      <div class="card" style="margin-bottom:20px">
        <div class="card__title">Appearance</div>
        <div class="settings-row">
          <div><div class="settings-row__label">Theme</div><div class="settings-row__desc">Switch between light and dark. Saved to this browser.</div></div>
          <div class="pill-toggle">
            <button data-theme-opt="light" class="${s.theme === "light" ? "is-active" : ""}">${global.Icons.icon("sun", { size: 13 })} Light</button>
            <button data-theme-opt="dark" class="${s.theme === "dark" ? "is-active" : ""}">${global.Icons.icon("moon", { size: 13 })} Dark</button>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card__title">Ledger mode</div>
        <div class="card__subtitle" style="margin-bottom:12px">How corrections and deletions are handled — from the ledger architecture (§5).</div>
        <div class="settings-row">
          <div><div class="settings-row__label">STRICT mode</div><div class="settings-row__desc">Nothing is ever overwritten. Editing or deleting posts a reversal alongside the original — full audit history, always.</div></div>
          <input type="radio" name="ledger-mode" value="STRICT" ${s.ledgerMode === "STRICT" ? "checked" : ""} />
        </div>
        <div class="settings-row">
          <div><div class="settings-row__label">DIRECT mode</div><div class="settings-row__desc">Edits and deletes mutate the entry in place with no trace left behind — faster, but no undo trail.</div></div>
          <input type="radio" name="ledger-mode" value="DIRECT" ${s.ledgerMode === "DIRECT" ? "checked" : ""} />
        </div>
        <div class="insight-card" style="margin-top:12px">
          <span class="insight-card__icon" style="background:var(--warn-soft);color:var(--warn)">${global.Icons.icon("alert", { size: 16 })}</span>
          <div class="text-soft" style="font-size:12.5px">This is a single, owner-level setting — switching it only changes how <em>future</em> edits behave. Entries created under the previous mode keep whatever history they already have.</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px">
        <div class="card__title">Profile</div>
        <div class="settings-row"><div><div class="settings-row__label">Name</div><div class="settings-row__desc">${s.ownerName}</div></div></div>
        <div class="settings-row"><div><div class="settings-row__label">Email</div><div class="settings-row__desc">${s.ownerEmail}</div></div></div>
        <div class="settings-row">
          <div><div class="settings-row__label">Timezone</div><div class="settings-row__desc">Used to display dates and times consistently.</div></div>
          <select class="select" id="st-tz" style="width:200px">
            ${["Asia/Kolkata", "Asia/Dubai", "Europe/London", "America/New_York"].map((tz) => `<option value="${tz}" ${s.timezone === tz ? "selected" : ""}>${tz}</option>`).join("")}
          </select>
        </div>
        <div class="settings-row"><div><div class="settings-row__label">Home currency</div><div class="settings-row__desc">Indian Rupee (₹ INR) — single currency per entry, as required by the ledger.</div></div></div>
        <div class="settings-row">
          <div><div class="settings-row__label">Session</div><div class="settings-row__desc">Signed in on this device.</div></div>
          <button class="btn btn--secondary btn--sm" id="st-logout">${global.Icons.icon("logout", { size: 14 })} Log out</button>
        </div>
      </div>

      <div class="card">
        <div class="card__title">Data</div>
        <div class="settings-row">
          <div><div class="settings-row__label">Export data</div><div class="settings-row__desc">Download your accounts, categories and transactions as a JSON snapshot.</div></div>
          <button class="btn btn--secondary btn--sm" id="st-export">${global.Icons.icon("download", { size: 14 })} Export</button>
        </div>
        <div class="settings-row">
          <div><div class="settings-row__label">Import data</div><div class="settings-row__desc">This is a prototype — import is illustrative only.</div></div>
          <button class="btn btn--secondary btn--sm" id="st-import">${global.Icons.icon("upload", { size: 14 })} Import</button>
        </div>
      </div>
    `;

    container.querySelectorAll("[data-theme-opt]").forEach((btn) => btn.addEventListener("click", async () => {
      await global.mockApi.updateSettings({ theme: btn.dataset.themeOpt });
      global.App.applyTheme();
      paint(container);
      global.Toast.show(`Switched to ${btn.dataset.themeOpt} mode.`, { variant: "success" });
    }));
    container.querySelectorAll('input[name="ledger-mode"]').forEach((r) => r.addEventListener("change", async (e) => {
      await global.mockApi.updateSettings({ ledgerMode: e.target.value });
      global.Auth.updateCurrentUser({ ledgerMode: e.target.value });
      global.Toast.show(`Ledger mode set to ${e.target.value}.`, { variant: "success" });
    }));
    container.querySelector("#st-tz").addEventListener("change", (e) => {
      S.state.settings.timezone = e.target.value;
      global.Auth.updateCurrentUser({ timezone: e.target.value });
      global.Toast.show("Timezone updated.", { variant: "success" });
    });
    container.querySelector("#st-logout").addEventListener("click", () => {
      global.Modal.confirmDialog({
        title: "Log out?", message: "You'll need to sign in again to see your ledger.",
        confirmLabel: "Log out", variant: "danger", onConfirm: () => global.App.logout(),
      });
    });
    container.querySelector("#st-export").addEventListener("click", () => global.App.openExportModal());
    container.querySelector("#st-import").addEventListener("click", () => global.Toast.show("Import isn't available in this prototype.", { variant: "warning" }));
  }

  global.Pages = global.Pages || {};
  global.Pages.settings = { render };
})(window);
