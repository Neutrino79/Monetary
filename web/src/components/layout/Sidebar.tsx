import { NavLink, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { useBranding } from "@/hooks/queries";
import { ADMIN_NAV_SECTIONS, NAV_SECTIONS, isAdminPath } from "@/config/nav";
import { useAdminStats } from "@/hooks/admin";
import { selectIsSuperuser, useAuthStore } from "@/store/authStore";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils/cn";

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { name, tagline } = useBranding();
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const admin = isAdminPath(useLocation().pathname);
  const isSuperuser = useAuthStore(selectIsSuperuser);
  const sections = (admin ? ADMIN_NAV_SECTIONS : NAV_SECTIONS)
    .map((sec) => ({ ...sec, items: sec.items.filter((i) => !i.superuserOnly || isSuperuser) }))
    .filter((sec) => sec.items.length > 0);
  const pending = useAdminStats({ enabled: admin }).data?.pendingApproval ?? 0;

  return (
    <>
      <div
        className={cn("fixed inset-0 z-50 bg-black/45", mobileOpen ? "hidden max-[980px]:block" : "hidden")}
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
          <LogoMark size={34} />
          {!collapsed && (
            <div>
              <div className="text-[15.5px] font-semibold">{name}</div>
              <div className="text-[11.5px] text-ink-faint">{admin ? "Administration" : tagline}</div>
            </div>
          )}
        </div>

        <nav className="flex-1">
          {sections.map((section) => (
            <div key={section.section}>
              {!collapsed && <div className="px-3 pb-1 pt-4 text-[11px] text-ink-faint">{section.section}</div>}
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={onCloseMobile}
                  className={({ isActive }) =>
                    cn(
                      "relative mb-0.5 flex items-center rounded-[10px] py-2 text-[13.7px] font-medium text-ink-soft transition-colors",
                      collapsed ? "justify-center px-0" : "gap-3 px-3",
                      "hover:bg-paper-sunken hover:text-ink",
                      isActive && "bg-accent-soft font-semibold text-accent hover:bg-accent-soft hover:text-accent",
                    )
                  }
                >
                  <item.icon size={17} className="flex-none" />
                  {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                  {item.pendingBadge && pending > 0 && (
                    <span aria-label={`${pending} pending`} className={cn("rounded-full bg-danger px-1.5 py-px text-[10.5px] font-bold text-white", collapsed && "absolute right-1 top-0.5")}>
                      {pending}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="space-y-2 pt-4">
          <button
            onClick={toggleCollapsed}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-line py-2 text-ink-faint hover:bg-paper-sunken hover:text-ink max-[980px]:hidden"
          >
            <ChevronLeft size={15} className={cn("transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span className="text-[13px]">Collapse</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
