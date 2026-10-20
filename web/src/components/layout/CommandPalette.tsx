import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog } from "radix-ui";
import { Search, Plus, User, Sun } from "lucide-react";
import { ALL_NAV_ITEMS } from "@/config/nav";
import { useFriends, useAccounts } from "@/hooks/queries";
import { useUiStore } from "@/store/uiStore";
import { cn } from "@/lib/utils/cn";

interface CommandItem {
  label: string;
  hint: string;
  icon: React.ReactNode;
  action: () => void;
}

export function CommandPalette({ open, onOpenChange, onAddTransaction }: { open: boolean; onOpenChange: (open: boolean) => void; onAddTransaction: () => void }) {
  const navigate = useNavigate();
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const { data: friends = [] } = useFriends();
  const { data: accounts = [] } = useAccounts();
  const [query, setQuery] = useState("");

  const items = useMemo<CommandItem[]>(() => {
    const commands: CommandItem[] = [
      { label: "Add transaction", hint: "Command", icon: <Plus size={16} />, action: onAddTransaction },
      { label: "Toggle theme", hint: "Command", icon: <Sun size={16} />, action: toggleTheme },
    ];
    const pages: CommandItem[] = ALL_NAV_ITEMS.map((i) => ({ label: i.label, hint: "Go to page", icon: <i.icon size={16} />, action: () => navigate(i.path) }));
    const friendItems: CommandItem[] = friends.map((f) => ({ label: f.name, hint: "Friend", icon: <User size={16} />, action: () => navigate("/friends") }));
    const accountItems: CommandItem[] = accounts
      .filter((a) => a.isActive)
      .map((a) => ({ label: a.name, hint: "Account", icon: <User size={16} />, action: () => navigate("/accounts") }));
    return [...commands, ...pages, ...friendItems, ...accountItems];
  }, [friends, accounts, navigate, onAddTransaction, toggleTheme]);

  const filtered = items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setQuery("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] w-[92vw] max-w-140 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-paper-raised shadow-2xl">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-line px-5 py-4">
            <Search size={16} className="text-ink-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages, friends, accounts, or type a command…"
              className="flex-1 bg-transparent text-[15px] text-ink outline-none"
            />
          </div>
          <div className="max-h-90 overflow-y-auto p-2">
            {filtered.length ? (
              filtered.map((item, idx) => (
                <button
                  key={item.label + idx}
                  onClick={() => {
                    item.action();
                    onOpenChange(false);
                    setQuery("");
                  }}
                  className={cn("flex w-full items-center gap-3 rounded-[10px] px-3 py-3 text-left text-[13.5px] hover:bg-paper-sunken", idx === 0 && "bg-paper-sunken")}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  <span className="ml-auto text-[11.5px] text-ink-faint">{item.hint}</span>
                </button>
              ))
            ) : (
              <div className="px-3 py-8 text-center text-[13px] text-ink-faint">No matches</div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
