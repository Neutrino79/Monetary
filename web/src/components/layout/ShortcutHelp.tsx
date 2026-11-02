import { Modal } from "@/components/ui/Dialog";
import { SectionLabel } from "@/components/ui/primitives";
import { SHORTCUTS } from "@/lib/shortcuts";

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex flex-none items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="contents">
          {i > 0 && keys[0] === "g" && <span className="text-micro text-ink-faint">then</span>}
          <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-line-strong bg-paper-sunken px-1.5 py-0.5 font-mono text-micro font-semibold text-ink">{k}</kbd>
        </span>
      ))}
    </span>
  );
}

/** The shortcuts, grouped, as a list (used in Settings and in the help sheet). */
export function ShortcutList() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {SHORTCUTS.map((g) => (
        <div key={g.group}>
          <SectionLabel className="mb-2">{g.group}</SectionLabel>
          <ul>
            {g.items.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 border-t border-dashed border-line py-2 text-body first:border-t-0">
                <span className="text-ink-soft">{s.label}</span>
                <Keys keys={s.keys} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Keyboard shortcuts" subtitle="Single keys work when you are not typing in a field." size="lg">
      <ShortcutList />
    </Modal>
  );
}
