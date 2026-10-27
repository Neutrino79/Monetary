import { useEffect, useState } from "react";

/**
 * Hover on a mouse, tap on a phone. A mouse shows the details of whatever it is over and a click opens it.
 * A finger has no hover, so the first tap on an item shows its details and a second tap on the same item opens it;
 * tapping anywhere outside `root` (the element holding every item) puts the details away. The same props work on links, buttons and SVG shapes.
 */
export function useInspect<K extends string | number>(open?: (key: K) => void, root?: HTMLElement | null) {
  const [active, setActive] = useState<K | null>(null);
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    if (active === null) return;
    const away = (e: PointerEvent) => {
      if (root && e.target instanceof Node && !root.contains(e.target)) setActive(null);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [active, root]);

  const itemProps = (key: K) => ({
    onPointerDown: (e: React.PointerEvent) => {
      setTouch(e.pointerType === "touch");
    },
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") setActive(key);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType !== "touch") setActive(null);
    },
    onFocus: () => setActive(key),
    onBlur: () => setActive((a) => (a === key && !touch ? null : a)),
    onClick: (e: React.MouseEvent) => {
      if (touch && active !== key) {
        e.preventDefault(); // first tap only inspects; a link must not follow it
        setActive(key);
        return;
      }
      open?.(key);
    },
  });

  return { active, setActive, touch, itemProps };
}
