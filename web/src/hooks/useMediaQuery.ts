import { useSyncExternalStore } from "react";

/** Tracks a CSS media query. Where `matchMedia` is missing (tests, old browsers) the answer is `false`. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches),
    () => false,
  );
}
