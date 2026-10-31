import { useSearchParams } from "react-router-dom";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { RangePicker } from "@/components/reports/RangePicker";
import { OverviewTab } from "@/components/reports/OverviewTab";
import { CategoriesTab } from "@/components/reports/CategoriesTab";
import { CompareTab } from "@/components/reports/CompareTab";
import { BudgetsTab } from "@/components/reports/BudgetsTab";
import { OutlookTab } from "@/components/reports/OutlookTab";
import { parseRange, rangeMonths } from "@/lib/utils/reportRange";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "categories", label: "Categories" },
  { value: "compare", label: "Compare" },
  { value: "budgets", label: "Budgets" },
  { value: "outlook", label: "Outlook" },
];

/** One page, one range: every tab reads the same stretch of months. All figures and judgements come from the API. */
export function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const range = parseRange(params.get("range"));
  const requested = params.get("tab");
  const tab = TABS.some((t) => t.value === requested) ? (requested as string) : "overview";
  const months = rangeMonths(range);
  const set = (key: string, value: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(key, value); return n; }, { replace: true });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports & Trends</h1>
          <p className="mt-1 text-body text-ink-soft">What your money is doing, why, and where it is heading.</p>
        </div>
        <RangePicker value={range} onChange={(r) => set("range", r)} />
      </div>
      <Tabs tabs={TABS} value={tab} onValueChange={(t) => set("tab", t)}>
        <TabPanel value="overview"><OverviewTab months={months} /></TabPanel>
        <TabPanel value="categories"><CategoriesTab months={months} /></TabPanel>
        <TabPanel value="compare"><CompareTab range={range} /></TabPanel>
        <TabPanel value="budgets"><BudgetsTab months={months} /></TabPanel>
        <TabPanel value="outlook"><OutlookTab months={months} /></TabPanel>
      </Tabs>
    </div>
  );
}
