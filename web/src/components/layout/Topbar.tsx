import { useLocation } from "react-router-dom";
import { Menu, Search, Sun, Moon, Plus, LogOut } from "lucide-react";
import { ALL_NAV_ITEMS } from "@/config/nav";
import { useBranding } from "@/hooks/queries";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { IconButton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useState } from "react";
import { NotificationsMenu } from "@/components/layout/NotificationsMenu";

export function Topbar({
  onOpenMobileNav,
  onOpenCommandPalette,
  onOpenQuickAdd,
}: {
  onOpenMobileNav: () => void;
  onOpenCommandPalette: () => void;
  onOpenQuickAdd: () => void;
}) {
  const { name } = useBranding();
  const location = useLocation();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const logout = useAuthStore((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const base = "/" + location.pathname.split("/")[1];
  const navItem = ALL_NAV_ITEMS.find((i) => i.path === base);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line bg-paper/88 px-6 backdrop-blur-sm max-[980px]:px-3 max-[980px]:gap-2">
      <button
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="hidden h-9 w-9 flex-none items-center justify-center rounded-control border border-line bg-paper-raised max-[980px]:inline-flex"
      >
        <Menu size={18} />
      </button>
      <span className="flex-none text-[18px] font-semibold max-[980px]:hidden">{navItem?.label ?? name}</span>
      <button
        onClick={onOpenCommandPalette}
        className="flex max-w-105 flex-1 items-center gap-2 rounded-control bg-paper-sunken px-3 py-2 text-ink-faint max-[640px]:hidden"
      >
        <Search size={15} />
        <span className="flex-1 text-left text-body">Search transactions, friends, accounts…</span>
        <span className="rounded border border-line-strong px-1.5 py-0.5 text-micro text-ink-faint">⌘K</span>
      </button>
      <span className="flex-1" />
      <div className="flex items-center gap-2">
        <IconButton aria-label="Toggle theme" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </IconButton>
        <NotificationsMenu />
        <Button size="sm" onClick={onOpenQuickAdd} className="max-[980px]:hidden">
          <Plus size={14} /> Add
        </Button>
        <IconButton aria-label="Log out" title="Log out" onClick={() => setConfirmLogout(true)}>
          <LogOut size={17} />
        </IconButton>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Log out?"
        message="You'll need to sign in again to see your ledger."
        confirmLabel="Log out"
        onConfirm={logout}
      />
    </header>
  );
}
