import { ControlStrip, StripSearch } from "@/components/list/ControlStrip";

/** The toolbar for lists that only need a search box (friends, accounts, categories). */
export function ListToolbar({ search }: { search: { value: string; onChange: (v: string) => void; placeholder?: string } }) {
  return (
    <div className="mb-4">
      <ControlStrip className="w-full sm:w-auto">
        <StripSearch alwaysOpen value={search.value} onChange={search.onChange} placeholder={search.placeholder} />
      </ControlStrip>
    </div>
  );
}
