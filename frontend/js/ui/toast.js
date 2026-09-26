(function (global) {
  "use strict";

  let container;
  function ensureContainer() {
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-stack";
      container.setAttribute("aria-live", "polite");
      document.body.appendChild(container);
    }
    return container;
  }

  function toast(message, opts) {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = `toast toast--${opts.variant || "default"}`;
    el.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${icon(opts.variant)}</span>
      <div class="toast__body">
        <p class="toast__msg"></p>
        ${opts.action ? `<button class="toast__action">${opts.action.label}</button>` : ""}
      </div>
      <button class="toast__close" aria-label="Dismiss notification">&times;</button>
    `;
    el.querySelector(".toast__msg").textContent = message;
    ensureContainer().appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));

    const remove = () => {
      el.classList.remove("is-visible");
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector(".toast__close").addEventListener("click", remove);
    if (opts.action) el.querySelector(".toast__action").addEventListener("click", () => { opts.action.onClick(); remove(); });
    const timeout = setTimeout(remove, opts.duration || 4200);
    el.addEventListener("mouseenter", () => clearTimeout(timeout));
    return remove;
  }

  function icon(variant) {
    if (variant === "success") return "&#10003;";
    if (variant === "error") return "&#33;";
    if (variant === "warning") return "&#9888;";
    return "&#8226;";
  }

  global.Toast = { show: toast };
})(window);
