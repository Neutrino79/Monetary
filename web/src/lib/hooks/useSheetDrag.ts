import { useRef, type PointerEvent } from "react";

const PHONE = "(max-width: 639px)";

/**
 * Drag a bottom sheet down by its handle or header to close it. Only on a phone-sized screen and only for
 * touch or pen, so a mouse click on the header never starts a drag. A long or quick pull closes; a short one
 * springs back.
 */
export function useSheetDrag(onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; id: number } | null>(null);

  const reset = () => {
    const el = panel.current;
    if (!el) return;
    el.style.transition = "transform 180ms ease-out";
    el.style.transform = "";
  };

  const handlers = {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === "mouse" || !window.matchMedia(PHONE).matches) return;
      drag.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      const el = panel.current;
      if (!d || !el) return;
      el.style.transition = "none";
      el.style.transform = `translateY(${Math.max(0, e.clientY - d.y)}px)`;
    },
    onPointerUp(e: PointerEvent<HTMLElement>) {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      const dy = e.clientY - d.y;
      const speed = dy / Math.max(1, e.timeStamp - d.t); // px per ms
      if (dy > 120 || (dy > 40 && speed > 0.6)) onClose();
      else reset();
    },
    onPointerCancel() {
      drag.current = null;
      reset();
    },
  };

  return { panel, handlers };
}
