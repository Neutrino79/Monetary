import { BudgetBar } from "@/components/domain/BudgetBar";
import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { LineChart, BarChart, DonutChart } from "@/components/charts/charts";
import { Input } from "@/components/ui/form";
import { useCashflow, useDashboard, useSpending } from "@/hooks/queries";
import { useLookups } from "@/hooks/useLookups";
import { currencySymbol, formatCurrency, formatDate } from "@/lib/utils/format";
import { toMonthKey } from "@/lib/utils/clock";

const TABS = [
  { value: "cashflow", label: "Cash Flow" },
  { value: "categories", label: "Category Analysis" },
  { value: "budgets", label: "Budgets" },
];

export function ReportsPage() {
  const [tab, setTab] = useState("cashflow");
  const currentMonth = toMonthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const lookups = useLookups();
  const cashflow = useCashflow(6);
  const spending = useSpending(month);
  const dashboard = useDashboard(month);
  // All series/totals are computed by the backend; this page only lays them out.
  const buckets = cashflow.data ?? [];
  const incomeSeries = buckets.map((b) => b.income);
  const expenseSeries = buckets.map((b) => b.expense);
  const netSeries = buckets.map((b) => b.net);
  const catSpend = (spending.data ?? []).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const totalSpend = catSpend.reduce((a, x) => a + x.total, 0);
  const budgets = [...(dashboard.data?.budgets ?? [])].sort((a, b) => b.percentageUsed - a.percentageUsed);
  const monthLabel = formatDate(`${month}-01`, "monthYear");

  const accent = "#1F6D4C";
  const negative = "#7B2E3A";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Reports & Trends</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">How your money moves over time, and where it goes.</p>
      </div>
      <div className="mb-4 flex items-center gap-2 text-[12.5px] text-ink-soft">
        <span>Month for category and budget views</span>
        <Input type="month" aria-label="Month" max={currentMonth} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-40" />
      </div>

      <Tabs tabs={TABS} value={tab} onValueChange={setTab}>
        <TabPanel value="cashflow">
          <Card className="mb-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="text-[14.5px] font-semibold">Income vs. expenses</div>
                <div className="text-[12.5px] text-ink-faint">Last 6 months</div>
              </div>
              <div className="flex gap-3 text-[12.5px]">
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: accent }} /> Income
                </span>
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: negative }} /> Expenses
                </span>
              </div>
            </div>
            <LineChart
              series={[
                { label: "Income", color: accent, points: buckets.map((b, i) => ({ x: i, y: incomeSeries[i], label: b.label })) },
                { label: "Expenses", color: negative, points: buckets.map((b, i) => ({ x: i, y: expenseSeries[i], label: b.label })) },
              ]}
              yFormat={(v) => currencySymbol() + Math.round(v / 1000) + "k"}
            />
          </Card>
          <Card>
            <div className="mb-4">
              <div className="text-[14.5px] font-semibold">Net cash flow</div>
              <div className="text-[12.5px] text-ink-faint">Income minus expenses, per month</div>
            </div>
            <BarChart
              categories={buckets.map((b) => b.label)}
              series={[{ label: "Net", color: accent, values: netSeries }]}
              yFormat={(v) => currencySymbol() + Math.round(v / 1000) + "k"}
            />
          </Card>
        </TabPanel>

        <TabPanel value="categories">
          <div className="grid grid-cols-[1fr_1.3fr] gap-5 max-[900px]:grid-cols-1">
            <Card>
              <div className="mb-3">
                <div className="text-[14.5px] font-semibold">Spending breakdown</div>
                <div className="text-[12.5px] text-ink-faint">{monthLabel}</div>
              </div>
              {catSpend.length ? (
                <DonutChart segments={catSpend.map((x) => ({ label: x.categoryName, value: x.total, color: lookups.getCategory(x.categoryId)?.color ?? "#5A5A5A" }))} size={200} thickness={28} centerLabel={formatCurrency(totalSpend)} centerSub="total spent" />
              ) : (
                <div className="py-10 text-center text-[13px] text-ink-faint">No expenses this month</div>
              )}
            </Card>
            <Card>
              <div className="mb-3 text-[14.5px] font-semibold">By category</div>
              {catSpend.map((x) => (
                <div key={x.categoryId} className="border-b border-dashed border-line py-2.5 last:border-b-0">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[13.3px]">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: lookups.getCategory(x.categoryId)?.color ?? "#5A5A5A" }} />
                      {x.categoryName}
                    </span>
                    <span className="ledger-figure text-[13.3px]">{formatCurrency(x.total)}</span>
                  </div>
                  {x.children.filter((k) => k.total > 0).map((k) => (
                    <div key={k.categoryId} className="mt-1 flex justify-between pl-[18px] text-[12px] text-ink-faint">
                      <span>{k.categoryName}</span>
                      <span>{formatCurrency(k.total)}</span>
                    </div>
                  ))}
                </div>
              ))}
              {catSpend.length === 0 && <div className="py-6 text-center text-[13px] text-ink-faint">Nothing to show yet</div>}
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="budgets">
          <Card>
            <div className="mb-4">
              <div className="text-[14.5px] font-semibold">Budgets</div>
              <div className="text-[12.5px] text-ink-faint">Categories with a monthly limit set — {monthLabel}</div>
            </div>
            {budgets.length ? (
              budgets.map((b) => (
                <div key={b.categoryId} className="mb-4 last:mb-0">
                  <BudgetBar b={b} showPercent large />
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-[13px] text-ink-faint">No budgets set up yet — add one from the Categories page.</div>
            )}
          </Card>
        </TabPanel>
      </Tabs>
    </div>
  );
}
