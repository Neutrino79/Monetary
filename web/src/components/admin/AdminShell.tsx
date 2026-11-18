import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { BookOpen, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { LogoMark } from "@/components/ui/LogoMark";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/primitives";
import { useBranding } from "@/hooks/queries";
import { useAdminStats } from "@/hooks/admin";
import { useUiStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/authStore";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/pending", label: "Pending requests", badge: true },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/audit", label: "Audit log" },
];

/**
 * The Admin area: a separate screen from the person's own ledger, reached with the Admin button and
 * left with "My ledger". Administrators manage accounts here and never see anyone's ledger.
 */
export function AdminShell() {
  const { name } = useBranding();
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const pending = useAdminStats().data?.pendingApproval ?? 0;

  return (
    <div data-theme={theme} className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper-raised/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-330 items-center gap-3 px-6 max-[980px]:px-3">
          <LogoMark size={30} />
          <span className="text-[16px] font-semibold max-[640px]:hidden">{name}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-accent">
            <ShieldCheck size={13} /> Admin
          </span>
          <span className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => navigate("/dashboard")}>
            <BookOpen size={14} /> My ledger
          </Button>
          <IconButton aria-label="Toggle theme" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
          </IconButton>
          <IconButton aria-label="Log out" title="Log out" onClick={() => logout().then(() => navigate("/login", { replace: true }))}>
            <LogOut size={17} />
          </IconButton>
        </div>
        <nav aria-label="Admin sections" className="mx-auto flex max-w-330 gap-1 overflow-x-auto px-6 max-[980px]:px-3">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-[13.5px] font-medium text-ink-soft hover:text-ink",
                  isActive && "border-accent font-semibold text-accent hover:text-accent",
                )
              }
            >
              {t.label}
              {t.badge && pending > 0 && (
                <span aria-label={`${pending} pending`} className="rounded-full bg-danger px-1.5 py-px text-[10.5px] font-bold text-white">
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-330 min-w-0 p-6 max-[980px]:p-4">
        <Outlet />
      </main>
    </div>
  );
}
