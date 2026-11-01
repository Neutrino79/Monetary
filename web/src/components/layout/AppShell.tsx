import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileTabbar } from "./MobileTabbar";
import { CommandPalette } from "./CommandPalette";
import { TransactionForm } from "@/components/domain/TransactionForm";
import { ShortcutHelp } from "./ShortcutHelp";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useUiStore } from "@/store/uiStore";

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const { pathname } = useLocation();
  useGlobalShortcuts({ onAddTransaction: () => setQuickAddOpen(true), onSearch: () => setPaletteOpen(true), onHelp: () => setHelpOpen(true), onToggleTheme: toggleTheme });

  return (
    <div data-theme={theme} className="min-h-screen bg-paper text-ink">
      <div className="flex">
        <Sidebar mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            onOpenMobileNav={() => setMobileNavOpen(true)}
            onOpenCommandPalette={() => setPaletteOpen(true)}
            onOpenQuickAdd={() => setQuickAddOpen(true)}
          />
          <main className="mx-auto w-full max-w-330 min-w-0 flex-1 p-6 max-[980px]:p-4 max-[980px]:pb-24">
            <div key={pathname} className="page-enter">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      <MobileTabbar />

      <button
        onClick={() => setQuickAddOpen(true)}
        aria-label="Add transaction"
        className="fixed bottom-20 right-5 z-30 hidden h-14 w-14 items-center justify-center rounded-full bg-ink text-paper shadow-2xl max-[980px]:flex"
      >
        <Plus size={22} />
      </button>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onAddTransaction={() => setQuickAddOpen(true)} />
      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <TransactionForm open={quickAddOpen} onOpenChange={setQuickAddOpen} initialType="expense" />
    </div>
  );
}
