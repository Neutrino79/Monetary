/** Every keyboard shortcut in the app, in one place, so the handler, the help sheet and Settings agree. */
export interface Shortcut {
  keys: string[];
  label: string;
}

export const GO_TO: Record<string, { path: string; label: string }> = {
  d: { path: "/dashboard", label: "Dashboard" },
  t: { path: "/transactions", label: "Transactions" },
  e: { path: "/expenses", label: "Expenses" },
  i: { path: "/income", label: "Income" },
  x: { path: "/transfers", label: "Transfers" },
  h: { path: "/shared", label: "Shared" },
  f: { path: "/friends", label: "Friends" },
  a: { path: "/accounts", label: "Accounts" },
  c: { path: "/categories", label: "Categories & tags" },
  r: { path: "/reports", label: "Reports & Trends" },
  s: { path: "/settings", label: "Settings" },
};

export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Anywhere",
    items: [
      { keys: ["n"], label: "Add a transaction" },
      { keys: ["/"], label: "Search and jump" },
      { keys: ["Ctrl", "K"], label: "Search and jump (⌘K on a Mac)" },
      { keys: ["Shift", "D"], label: "Switch between light and dark" },
      { keys: ["?"], label: "Show this list" },
      { keys: ["Esc"], label: "Close a panel or dialog" },
    ],
  },
  {
    group: "Go to (press g, then a letter)",
    items: Object.entries(GO_TO).map(([key, g]) => ({ keys: ["g", key], label: g.label })),
  },
];

/** True when the key press is the person typing into something, so a shortcut must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute?.("role") === "combobox" || el.getAttribute?.("role") === "textbox";
}
