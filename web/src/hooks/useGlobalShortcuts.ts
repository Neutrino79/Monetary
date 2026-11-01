import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { GO_TO, isTypingTarget } from "@/lib/shortcuts";

interface Handlers {
  onAddTransaction: () => void;
  onSearch: () => void;
  onHelp: () => void;
  onToggleTheme: () => void;
}

const SEQUENCE_MS = 1200;

/**
 * App-wide single-key shortcuts: n, /, ?, Shift+D and "g then a letter" to jump to a page. Ignored while typing,
 * while a dialog or panel is open (so keys never act on the page behind it), and with Ctrl, Cmd or Alt held. Ctrl or Cmd plus K opens search.
 */
export function useGlobalShortcuts({ onAddTransaction, onSearch, onHelp, onToggleTheme }: Handlers) {
  const navigate = useNavigate();
  const waitingForTarget = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlers = useRef({ onAddTransaction, onSearch, onHelp, onToggleTheme });
  useEffect(() => {
    handlers.current = { onAddTransaction, onSearch, onHelp, onToggleTheme };
  });

  useEffect(() => {
    const clear = () => {
      if (waitingForTarget.current) clearTimeout(waitingForTarget.current);
      waitingForTarget.current = null;
    };
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.isComposing) return;
      // Ctrl/Cmd+K opens search from anywhere, even from inside a field
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
        e.preventDefault();
        handlers.current.onSearch();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      if (waitingForTarget.current) {
        clear();
        const go = GO_TO[e.key.toLowerCase()];
        if (go) {
          e.preventDefault();
          navigate(go.path);
        }
        return;
      }
      const h = handlers.current;
      if (e.key === "g") {
        waitingForTarget.current = setTimeout(clear, SEQUENCE_MS);
      } else if (e.key === "n") {
        e.preventDefault();
        h.onAddTransaction();
      } else if (e.key === "/") {
        e.preventDefault();
        h.onSearch();
      } else if (e.key === "?") {
        e.preventDefault();
        h.onHelp();
      } else if (e.key === "D") {
        e.preventDefault();
        h.onToggleTheme();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clear();
    };
  }, [navigate]);
}
