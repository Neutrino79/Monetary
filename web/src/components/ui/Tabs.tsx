import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export interface TabDef {
  value: string;
  label: string;
}

export function Tabs({
  tabs,
  value,
  onValueChange,
  children,
}: {
  tabs: TabDef[];
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange}>
      <TabsPrimitive.List className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              "whitespace-nowrap border-b-2 border-transparent px-3 py-2 pointer-coarse:min-h-11 text-body font-semibold text-ink-faint transition-colors",
              "hover:text-ink-soft data-[state=active]:border-ink data-[state=active]:text-ink",
            )}
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export const TabPanel = TabsPrimitive.Content;
