import { useState } from "react";
import { Popover } from "radix-ui";
import { useNavigate } from "react-router-dom";
import { Bell, AlertTriangle, Info } from "lucide-react";
import { useAccounts, useDashboard, useFriendBalances } from "@/hooks/queries";
import { IconButton } from "@/components/ui/primitives";
import { buildAttention } from "@/lib/utils/attention";
import { cn } from "@/lib/utils/cn";

/** The bell: a short list of what needs attention (nothing to dismiss; it clears when the numbers do). */
export function NotificationsMenu() {
  const navigate = useNavigate();
  const { data: dashboard } = useDashboard();
  const { data: accounts = [] } = useAccounts();
  const { data: friendBalances = [] } = useFriendBalances();
  const [today] = useState(() => new Date());
  const items = buildAttention({ budgets: dashboard?.budgets ?? [], accounts, friendBalances, today });
  const warnings = items.filter((i) => i.level === "warn").length;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <IconButton aria-label={warnings ? `Notifications, ${warnings} need attention` : "Notifications"} className="relative">
          <Bell size={18} />
          {warnings > 0 && <span aria-hidden className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-paper bg-danger" />}
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={12} className="z-[70] w-[min(22rem,calc(100vw-1.5rem))] rounded-card border border-line-strong bg-paper-raised shadow-xl">
          <div className="border-b border-line px-4 py-3 text-[14px] font-semibold">Needs your attention</div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-body text-ink-soft">All clear. Budgets, accounts and friends look fine.</p>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-line overflow-y-auto">
              {items.map((i) => (
                <li key={i.id}>
                  <Popover.Close asChild>
                    <button type="button" onClick={() => i.to && navigate(i.to)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-paper-sunken">
                      {i.level === "warn" ? <AlertTriangle size={16} className="mt-0.5 flex-none text-danger" aria-hidden /> : <Info size={16} className={cn("mt-0.5 flex-none text-info")} aria-hidden />}
                      <span className="min-w-0">
                        <span className="block text-body font-semibold">{i.title}</span>
                        {i.detail && <span className="block text-caption text-ink-faint">{i.detail}</span>}
                      </span>
                    </button>
                  </Popover.Close>
                </li>
              ))}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
