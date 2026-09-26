(function (global) {
  "use strict";

  function render(container) {
    let step = "email";
    let email = "";
    let question = null;

    function paint() {
      if (step === "email") return paintEmailStep();
      if (step === "question") return paintQuestionStep();
      return paintDoneStep();
    }

    function shell(inner) {
      container.innerHTML = `
        <div class="auth-shell">
          <div class="auth-card">
            <div class="auth-brand">
              <span class="auth-brand__mark">₹</span>
              <div style="text-align:left"><div class="auth-brand__text">Khata</div><div class="auth-brand__sub">Personal ledger</div></div>
            </div>
            <div class="auth-panel">
              <button class="auth-back-link" id="back-to-login">${global.Icons.icon("chevronRight", { size: 13 })} Back to sign in</button>
              ${inner}
            </div>
          </div>
        </div>
      `;
      container.querySelector("#back-to-login").addEventListener("click", () => { location.hash = "#/login"; });
    }

    function paintEmailStep() {
      shell(`
        <h1>Reset your password</h1>
        <p class="auth-panel__desc">Enter the email on your account and we'll ask your security question.</p>
        <div id="fp-error"></div>
        <div class="auth-form-field"><label for="fp-email">Email</label><input class="input" id="fp-email" type="email" placeholder="you@example.com" value="${email}" /></div>
        <button class="btn btn--primary btn--block" id="fp-email-submit" type="button">Continue</button>
      `);
      function submit() {
        const val = container.querySelector("#fp-email").value.trim();
        try {
          const result = global.Auth.requestReset(val);
          email = result.email; question = result.question; step = "question";
          paint();
        } catch (err) {
          container.querySelector("#fp-error").innerHTML = `<div class="auth-error-banner">${global.Icons.icon("alert", { size: 15 })} ${err.message}</div>`;
        }
      }
      container.querySelector("#fp-email-submit").addEventListener("click", submit);
      container.querySelector("#fp-email").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    }

    function paintQuestionStep() {
      shell(`
        <h1>Security question</h1>
        <p class="auth-panel__desc">Answer the question you set up for <strong>${email}</strong>.</p>
        <div id="fp-error"></div>
        <div class="auth-form-field"><label>${question.text}</label><input class="input" id="fp-answer" placeholder="Your answer" /></div>
        <div class="form-grid" style="margin-bottom:16px">
          <div class="form-field"><label for="fp-pass">New password</label><input class="input" id="fp-pass" type="password" placeholder="At least 8 characters" /></div>
          <div class="form-field"><label for="fp-pass2">Confirm</label><input class="input" id="fp-pass2" type="password" placeholder="Re-enter" /></div>
        </div>
        <button class="btn btn--primary btn--block" id="fp-question-submit" type="button">Reset password</button>
      `);
      function submit() {
        const answer = container.querySelector("#fp-answer").value.trim();
        const p1 = container.querySelector("#fp-pass").value;
        const p2 = container.querySelector("#fp-pass2").value;
        const errEl = container.querySelector("#fp-error");
        if (p1.length < 8) { errEl.innerHTML = `<div class="auth-error-banner">${global.Icons.icon("alert", { size: 15 })} Password must be at least 8 characters.</div>`; return; }
        if (p1 !== p2) { errEl.innerHTML = `<div class="auth-error-banner">${global.Icons.icon("alert", { size: 15 })} Passwords don't match.</div>`; return; }
        try {
          global.Auth.resetPassword(email, answer, p1);
          step = "done";
          paint();
        } catch (err) {
          errEl.innerHTML = `<div class="auth-error-banner">${global.Icons.icon("alert", { size: 15 })} ${err.message}</div>`;
        }
      }
      container.querySelector("#fp-question-submit").addEventListener("click", submit);
      container.querySelectorAll("#fp-answer, #fp-pass, #fp-pass2").forEach((el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); }));
    }

    function paintDoneStep() {
      shell(`
        <h1>Password reset</h1>
        <p class="auth-panel__desc">You're all set — sign in with your new password.</p>
        <button class="btn btn--primary btn--block" id="fp-to-login">Go to sign in</button>
      `);
      container.querySelector("#fp-to-login").addEventListener("click", () => { location.hash = "#/login"; });
    }

    paint();
  }

  global.Pages = global.Pages || {};
  global.Pages.forgotPassword = { render };
})(window);
