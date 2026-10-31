import type { Theme } from "@/store/uiStore";

const FADE_MS = 320;
let fadeTimer: ReturnType<typeof setTimeout> | undefined;

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void) => unknown };

/**
 * Point the page at a theme. When `animate` is set the whole page cross-fades between the two palettes instead of
 * snapping: with the View Transitions API where the browser has it, otherwise by briefly letting colours transition.
 * People who ask for reduced motion always get the instant switch.
 */
export function applyTheme(theme: Theme, animate: boolean): void {
  const root = document.documentElement;
  const set = () => root.setAttribute("data-theme", theme);
  const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!animate || calm || root.getAttribute("data-theme") === theme) {
    set();
    return;
  }
  const doc = document as ViewTransitionDocument;
  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(set);
    return;
  }
  root.classList.add("theme-fade");
  set();
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => root.classList.remove("theme-fade"), FADE_MS + 40);
}
