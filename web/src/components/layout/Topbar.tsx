import { useLocation } from "react-router-dom";
import { Menu, Search, Sun, Moon } from "lucide-react";
import { ALL_ADMIN_NAV_ITEMS, ALL_NAV_ITEMS, isAdminPath } from "@/config/nav";
import { useBranding } from "@/hooks/queries";
import { useUiStore } from "@/store/uiStore";
import { IconButton } from "@/components/ui/primitives";
import { CreateUserButton } from "@/components/admin/CreateUserButton";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";
import { ProfileMenu } from "@/components/layout/ProfileMenu";

export function Topbar({
  onOpenMobileNav,
  onOpenCommandPalette,
}: {
  onOpenMobileNav: () => void;
  onOpenCommandPalette: () => void;
}) {
  const { name } = useBranding();
  const location = useLocation();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  const admin = isAdminPath(location.pathname);
  const base = admin ? location.pathname.split("/").slice(0, 3).join("/") : "/" + location.pathname.split("/")[1];
  const navItem = (admin ? ALL_ADMIN_NAV_ITEMS : ALL_NAV_ITEMS).find((i) => i.path === base);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line bg-paper/88 px-6 backdrop-blur-sm max-[980px]:px-3 max-[980px]:gap-2">
      <button
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="hidden h-9 w-9 flex-none items-center justify-center rounded-[10px] border border-line bg-paper-raised max-[980px]:inline-flex"
      >
        <Menu size={18} />
      </button>
      <span className="flex-none text-[18px] font-semibold max-[980px]:hidden">{navItem?.label ?? name}</span>
      <button
        onClick={onOpenCommandPalette}
        className="flex max-w-105 flex-1 items-center gap-2 rounded-[10px] bg-paper-sunken px-3 py-2 text-ink-faint max-[640px]:hidden"
      >
        <Search size={15} />
        <span className="flex-1 text-left text-[13.5px]">{admin ? "Search users, requests, audit…" : "Search transactions, friends, accounts…"}</span>
        <span className="rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-faint">⌘K</span>
      </button>
      <span className="flex-1" />
      <div className="flex items-center gap-2">
        <IconButton aria-label="Toggle theme" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
        <NotificationsMenu />
        {admin && <CreateUserButton />}
      </div>
      <ProfileMenu />
    </header>
  );
}
