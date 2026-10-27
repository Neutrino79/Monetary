import { useEffect, useState } from "react";

/** The rendered width of an element, kept current as it resizes: lets an SVG chart draw at true pixel size. */
export function useElementWidth<T extends HTMLElement>(fallback = 640) {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(Math.round(el.getBoundingClientRect().width) || fallback));
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, fallback]);
  return [setEl, width] as const;
}
