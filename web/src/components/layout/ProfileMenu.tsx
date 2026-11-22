import { useState } from "react";
import { Popover } from "radix-ui";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, LogOut, Settings, ShieldCheck } from "lucide-react";
import { isAdminPath } from "@/config/nav";
import { Avatar } from "@/components/ui/primitives";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { useDemoMode } from "@/hooks/queries";
import { useAdminStats } from "@/hooks/admin";
import { selectIsAdmin, useAuthStore } from "@/store/authStore";

const ROLE_LABEL: Record<string, string> = { superuser: "Superuser", admin: "Admin", operator: "Operator", user: "Member" };

const itemClass = "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] text-ink hover:bg-paper-sunken";

/**
 * The person's avatar in the far corner of the top bar. It is the way into the Admin area (and back
 * out of it), to Settings, and the place to sign out, in the ledger and in admin mode alike.
 */
export function ProfileMenu() {
  const admin = isAdminPath(useLocation().pathname);
  const account = useAuthStore((s) => s.account);
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore(selectIsAdmin);
  const { isDemo } = useDemoMode();
  const canAdmin = isAdmin && !isDemo;
  const pending = useAdminStats({ enabled: canAdmin }).data?.pendingApproval ?? 0;
  const [confirmLogout, setConfirmLogout] = useState(false);
  if (!account) return null;
  const display = account.name || account.email || "Account";

  return (
    <>
      <Popover.Root>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="flex h-9 w-9 flex-none items-center justify-center rounded-full outline-offset-2 hover:opacity-90"
          >
            <Avatar name={display} color="var(--accent)" size={34} />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content side="bottom" align="end" sideOffset={8} collisionPadding={12} className="z-[70] w-60 rounded-[14px] border border-line-strong bg-paper-raised p-1.5 shadow-xl">
            <div className="px-3 pb-2 pt-1.5">
              <div className="truncate text-[13.5px] font-semibold">{display}</div>
              <div className="truncate text-[12px] text-ink-faint">{account.email}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-faint">{ROLE_LABEL[account.role] ?? account.role}</div>
            </div>
            <div className="my-1 border-t border-line" />
            {canAdmin &&
              (admin ? (
                <Popover.Close asChild>
                  <Link to="/dashboard" className={itemClass}>
                    <BookOpen size={15} /> My ledger
                  </Link>
                </Popover.Close>
              ) : (
                <Popover.Close asChild>
                  <Link to="/admin" className={itemClass}>
                    <ShieldCheck size={15} /> Administration
                    {pending > 0 && (
                      <span aria-label={`${pending} pending`} className="ml-auto rounded-full bg-danger px-1.5 py-px text-[10.5px] font-bold text-white">
                        {pending}
                      </span>
                    )}
                  </Link>
                </Popover.Close>
              ))}
            <Popover.Close asChild>
              <Link to="/settings" className={itemClass}>
                <Settings size={15} /> Settings
              </Link>
            </Popover.Close>
            <div className="my-1 border-t border-line" />
            <Popover.Close asChild>
              <button type="button" onClick={() => setConfirmLogout(true)} className={itemClass}>
                <LogOut size={15} /> Log out
              </button>
            </Popover.Close>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Log out?"
        message="You'll need to sign in again to continue."
        confirmLabel="Log out"
        onConfirm={logout}
      />
    </>
  );
}
