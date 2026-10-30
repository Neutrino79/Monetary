import { useSearchParams } from "react-router-dom";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { TagManager } from "@/components/domain/TagManager";
import { CategoriesPanel } from "@/components/categories/CategoriesPanel";
import { IncomePanel } from "@/components/categories/IncomePanel";

const TABS = [
  { value: "categories", label: "Categories" },
  { value: "tags", label: "Tags" },
  { value: "income", label: "Income" },
];

/** Three ways to organise money: categories (with the budgets), tags (free-form labels) and income sources. */
export function CategoriesPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.some((t) => t.value === requested) ? (requested as string) : "categories";
  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">Categories &amp; tags</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">Set each budget and watch the total change. Pick a category in the list or on the bar to edit it.</p>
      </div>
      <Tabs tabs={TABS} value={tab} onValueChange={(v) => setParams(v === "categories" ? {} : { tab: v }, { replace: true })}>
        <TabPanel value="categories"><CategoriesPanel /></TabPanel>
        <TabPanel value="tags"><TagManager /></TabPanel>
        <TabPanel value="income"><IncomePanel /></TabPanel>
      </Tabs>
    </div>
  );
}
