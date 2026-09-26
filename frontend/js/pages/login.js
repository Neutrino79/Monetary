(function (global) {
  "use strict";

  function render(container) {
    container.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card">
          <div class="auth-brand">
            <span class="auth-brand__mark">₹</span>
            <div style="text-align:left"><div class="auth-brand__text">Khata</div><div class="auth-brand__sub">Personal ledger</div></div>
          </div>
          <div class="auth-panel">
            <h1>Welcome back</h1>
            <p class="auth-panel__desc">Sign in to see your accounts, transactions and reports.</p>
            <div class="auth-demo-hint">${global.Icons.icon("sparkle", { size: 13 })} <strong>Prototype demo:</strong> ananya.kulkarni@example.com / demo1234</div>
            <div id="login-error"></div>
            <div class="auth-form-field">
              <label for="lg-email">Email</label>
              <input class="input" id="lg-email" type="email" autocomplete="username" placeholder="you@example.com" />
            </div>
            <div class="auth-form-field">
              <label for="lg-pass">Password</label>
              <input class="input" id="lg-pass" type="password" autocomplete="current-password" placeholder="••••••••" />
            </div>
            <div style="text-align:right;margin-bottom:20px">
              <a href="#/forgot-password" class="auth-inline-link" style="text-decoration:none;font-weight:500;color:var(--ink-faint)">Forgot password?</a>
            </div>
            <button class="btn btn--primary btn--block" id="lg-submit" type="button">Sign in</button>
          </div>
          <p class="auth-footer-link">Don't have an account? <a href="#/signup">Create one</a></p>
        </div>
      </div>
    `;

    function submit() {
      const email = container.querySelector("#lg-email").value.trim();
      const password = container.querySelector("#lg-pass").value;
      const errorHolder = container.querySelector("#login-error");
      errorHolder.innerHTML = "";
      const btn = container.querySelector("#lg-submit");
      btn.disabled = true; btn.textContent = "Signing in…";
      setTimeout(() => {
        try {
          global.Auth.login(email, password);
          global.Toast.show("Welcome back!", { variant: "success" });
          global.App.onAuthenticated();
        } catch (err) {
          errorHolder.innerHTML = `<div class="auth-error-banner">${global.Icons.icon("alert", { size: 15 })} ${err.message}</div>`;
          btn.disabled = false; btn.textContent = "Sign in";
        }
      }, 300);
    }

    container.querySelector("#lg-submit").addEventListener("click", submit);
    container.querySelectorAll("#lg-email, #lg-pass").forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); }));
  }

  global.Pages = global.Pages || {};
  global.Pages.login = { render };
})(window);
