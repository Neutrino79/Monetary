import { NavLink } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { appConfig } from "@/config/app";
import { useBranding } from "@/hooks/queries";
import { NAV_SECTIONS } from "@/config/nav";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils/cn";

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { name, tagline } = useBranding();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);

  return (
    <>
      <div
        className={cn("overlay-scrim fixed inset-0 z-50", mobileOpen ? "hidden max-[980px]:block" : "hidden")}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "sticky top-0 z-60 flex h-screen flex-col overflow-y-auto border-r border-line bg-paper-raised px-3 py-5 transition-[width,transform] duration-200",
          "max-[980px]:fixed max-[980px]:left-0 max-[980px]:top-0 max-[980px]:w-66 max-[980px]:shadow-2xl max-[980px]:-translate-x-full",
          mobileOpen && "max-[980px]:translate-x-0",
        )}
        style={{ width: collapsed ? "var(--sidebar-width-collapsed)" : "var(--sidebar-width)" }}
        aria-label="Primary navigation"
      >
        <div className="flex items-center gap-3 px-2 pb-6">
          <span className="flex h-8.5 w-8.5 flex-none items-center justify-center rounded-control bg-ink font-semibold text-paper" style={{ fontFamily: "var(--font-ledger)", fontSize: 16 }}>
            {appConfig.logoMark}
          </span>
          {!collapsed && (
            <div>
              <div className="text-[15.5px] font-semibold">{name}</div>
              <div className="text-micro text-ink-faint">{tagline}</div>
            </div>
          )}
        </div>

        <nav className="flex-1">
          {NAV_SECTIONS.map((section) => (
            <div key={section.section}>
              {!collapsed && <div className="px-3 pb-1 pt-4 text-micro text-ink-faint">{section.section}</div>}
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    cn(
                      "mb-0.5 flex items-center gap-3 rounded-control px-3 py-2 text-[13.7px] font-medium text-ink-soft transition-colors",
                      "hover:bg-paper-sunken hover:text-ink",
                      isActive && "bg-brand-soft font-semibold text-brand hover:bg-brand-soft hover:text-brand",
                    )
                  }
                >
                  <item.icon size={17} className="flex-none" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="pt-4">
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-control border border-line py-2 text-ink-faint hover:bg-paper-sunken hover:text-ink max-[980px]:hidden"
          >
            <ChevronLeft size={15} className={cn("transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span className="text-body">Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
