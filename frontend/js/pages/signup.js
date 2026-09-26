(function (global) {
  "use strict";

  function render(container) {
    const questions = global.Auth.SECURITY_QUESTIONS;
    container.innerHTML = `
      <div class="auth-shell">
        <div class="auth-card" style="max-width:440px">
          <div class="auth-brand">
            <span class="auth-brand__mark">₹</span>
            <div style="text-align:left"><div class="auth-brand__text">Khata</div><div class="auth-brand__sub">Personal ledger</div></div>
          </div>
          <div class="auth-panel">
            <h1>Create your account</h1>
            <p class="auth-panel__desc">Set up your ledger — this is the owner account for this instance.</p>
            <div id="signup-error"></div>
            <div class="auth-form-field"><label for="su-name">Full name</label><input class="input" id="su-name" placeholder="Your name" /></div>
            <div class="auth-form-field"><label for="su-email">Email</label><input class="input" id="su-email" type="email" autocomplete="username" placeholder="you@example.com" /></div>
            <div class="form-grid" style="margin-bottom:16px">
              <div class="form-field"><label for="su-pass">Password</label><input class="input" id="su-pass" type="password" autocomplete="new-password" placeholder="At least 8 characters" /></div>
              <div class="form-field"><label for="su-pass2">Confirm password</label><input class="input" id="su-pass2" type="password" autocomplete="new-password" placeholder="Re-enter password" /></div>
            </div>
            <div class="auth-form-field">
              <label for="su-tz">Timezone</label>
              <select class="select" id="su-tz">
                <option value="Asia/Kolkata" selected>Asia/Kolkata (IST)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
                <option value="America/New_York">America/New_York (ET)</option>
              </select>
            </div>
            <div class="auth-form-field">
              <label for="su-q">Security question <span class="text-faint" style="font-weight:400">— used to recover your password</span></label>
              <select class="select" id="su-q">${questions.map((q) => `<option value="${q.id}">${q.text}</option>`).join("")}</select>
            </div>
            <div class="auth-form-field"><label for="su-a">Your answer</label><input class="input" id="su-a" placeholder="Answer" /></div>
            <button class="btn btn--primary btn--block" id="su-submit" type="button" style="margin-top:8px">Create account</button>
          </div>
          <p class="auth-footer-link">Already have an account? <a href="#/login">Sign in</a></p>
        </div>
      </div>
    `;

    function submit() {
      const errorHolder = container.querySelector("#signup-error");
      errorHolder.innerHTML = "";
      const name = container.querySelector("#su-name").value.trim();
      const email = container.querySelector("#su-email").value.trim();
      const pass = container.querySelector("#su-pass").value;
      const pass2 = container.querySelector("#su-pass2").value;
      const answer = container.querySelector("#su-a").value.trim();

      const problems = [];
      if (!name) problems.push("Enter your name.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("Enter a valid email.");
      if (pass.length < 8) problems.push("Password must be at least 8 characters.");
      if (pass !== pass2) problems.push("Passwords don't match.");
      if (!answer) problems.push("Answer your security question.");
      if (problems.length) {
        errorHolder.innerHTML = `<div class="auth-error-banner">${global.Icons.icon("alert", { size: 15 })} ${problems[0]}</div>`;
        return;
      }

      const btn = container.querySelector("#su-submit");
      btn.disabled = true; btn.textContent = "Creating account…";
      setTimeout(() => {
        try {
          global.Auth.signup({
            name, email, password: pass,
            timezone: container.querySelector("#su-tz").value,
            homeCurrencyCode: "INR",
            securityQuestionId: parseInt(container.querySelector("#su-q").value, 10),
            securityAnswer: answer,
          });
          global.Toast.show("Account created — welcome to Khata!", { variant: "success" });
          global.App.onAuthenticated();
        } catch (err) {
          errorHolder.innerHTML = `<div class="auth-error-banner">${global.Icons.icon("alert", { size: 15 })} ${err.message}</div>`;
          btn.disabled = false; btn.textContent = "Create account";
        }
      }, 300);
    }

    container.querySelector("#su-submit").addEventListener("click", submit);
    container.querySelectorAll("#su-name, #su-email, #su-pass, #su-pass2, #su-a").forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); }));
  }

  global.Pages = global.Pages || {};
  global.Pages.signup = { render };
})(window);
