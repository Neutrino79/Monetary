import { NavLink } from "react-router-dom";
import { MOBILE_TAB_PATHS, ALL_NAV_ITEMS } from "@/config/nav";
import { cn } from "@/lib/utils/cn";

export function MobileTabbar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 hidden justify-around border-t border-line bg-paper-raised px-1 pb-[calc(6px+env(safe-area-inset-bottom,0px))] pt-1.5 max-[980px]:flex">
      {MOBILE_TAB_PATHS.map((path) => {
        const item = ALL_NAV_ITEMS.find((i) => i.path === path);
        if (!item) return null;
        return (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) => cn("flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] text-ink-faint", isActive && "text-brand")}
          >
            <item.icon size={19} />
            <span>{item.label.split(" ")[0]}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
