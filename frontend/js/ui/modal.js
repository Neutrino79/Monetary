(function (global) {
  "use strict";

  let activeOverlay = null;

  function trapFocus(container) {
    const focusables = container.querySelectorAll('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    focusables[0].focus();
    container.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function close() {
    if (!activeOverlay) return;
    const { overlay, onClose } = activeOverlay;
    overlay.classList.remove("is-open");
    setTimeout(() => overlay.remove(), 180);
    activeOverlay = null;
    document.body.classList.remove("no-scroll");
    if (onClose) onClose();
  }

  function open({ kind = "modal", title, subtitle, bodyHTML, footerHTML, size = "md", onMount, onClose }) {
    close();
    const overlay = document.createElement("div");
    overlay.className = `overlay overlay--${kind}`;
    overlay.innerHTML = `
      <div class="overlay__scrim" data-close></div>
      <div class="overlay__panel overlay__panel--${size}" role="dialog" aria-modal="true" aria-labelledby="overlay-title">
        <div class="overlay__header">
          <div>
            <h2 class="overlay__title" id="overlay-title"></h2>
            ${subtitle ? `<p class="overlay__subtitle"></p>` : ""}
          </div>
          <button class="icon-btn overlay__close" data-close aria-label="Close">&times;</button>
        </div>
        <div class="overlay__body">${bodyHTML}</div>
        ${footerHTML ? `<div class="overlay__footer">${footerHTML}</div>` : ""}
      </div>
    `;
    overlay.querySelector(".overlay__title").textContent = title || "";
    if (subtitle) overlay.querySelector(".overlay__subtitle").textContent = subtitle;
    document.body.appendChild(overlay);
    document.body.classList.add("no-scroll");
    requestAnimationFrame(() => overlay.classList.add("is-open"));

    overlay.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", close));
    document.addEventListener("keydown", escHandler);
    function escHandler(e) { if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); } }

    activeOverlay = { overlay, onClose };
    trapFocus(overlay);
    if (onMount) onMount(overlay);
    return overlay;
  }

  function confirmDialog({ title, message, confirmLabel = "Confirm", variant = "danger", onConfirm }) {
    open({
      kind: "modal", title, size: "sm",
      bodyHTML: `<p class="confirm-msg"></p>`,
      footerHTML: `
        <button class="btn btn--ghost" data-close>Cancel</button>
        <button class="btn btn--${variant === "danger" ? "danger" : "primary"}" id="confirm-ok">${confirmLabel}</button>
      `,
      onMount(overlay) {
        overlay.querySelector(".confirm-msg").textContent = message;
        overlay.querySelector("#confirm-ok").addEventListener("click", () => { onConfirm(); close(); });
      },
    });
  }

  global.Modal = { open, close, confirmDialog, drawer: (opts) => open(Object.assign({ kind: "drawer", size: "drawer" }, opts)) };
})(window);
