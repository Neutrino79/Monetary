import { NavLink, useLocation } from "react-router-dom";
import { ADMIN_MOBILE_TAB_PATHS, ALL_ADMIN_NAV_ITEMS, ALL_NAV_ITEMS, MOBILE_TAB_PATHS, isAdminPath } from "@/config/nav";
import { cn } from "@/lib/utils/cn";

export function MobileTabbar() {
  const admin = isAdminPath(useLocation().pathname);
  const paths = admin ? ADMIN_MOBILE_TAB_PATHS : MOBILE_TAB_PATHS;
  const items = admin ? ALL_ADMIN_NAV_ITEMS : ALL_NAV_ITEMS;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 hidden justify-around border-t border-line bg-paper-raised px-1 pb-[calc(6px+env(safe-area-inset-bottom,0px))] pt-1.5 max-[980px]:flex">
      {paths.map((path) => {
        const item = items.find((i) => i.path === path) ?? ALL_NAV_ITEMS.find((i) => i.path === path);
        if (!item) return null;
        return (
          <NavLink
            key={path}
            to={path}
            end={item.end}
            className={({ isActive }) => cn("flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] text-ink-faint", isActive && "text-accent")}
          >
            <item.icon size={19} />
            <span>{admin && path === "/dashboard" ? "My ledger" : item.label.split(" ")[0]}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
