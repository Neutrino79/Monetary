import { useState } from "react";
import { Card } from "@/components/ui/primitives";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { LineChart, BarChart, DonutChart } from "@/components/charts/charts";
import { useLedgerCalc } from "@/hooks/useLedgerCalc";
import { formatCurrency } from "@/lib/utils/format";

const TABS = [
  { value: "cashflow", label: "Cash Flow" },
  { value: "categories", label: "Category Analysis" },
  { value: "budgets", label: "Budgets" },
];

export function ReportsPage() {
  const [tab, setTab] = useState("cashflow");
  const calc = useLedgerCalc();
  const buckets = calc.lastNMonthsBuckets(6);
  const incomeSeries = buckets.map((b) => calc.calcTotalIncome(b));
  const expenseSeries = buckets.map((b) => calc.calcTotalExpenses(b));
  const netSeries = buckets.map((_, i) => Math.round((incomeSeries[i] - expenseSeries[i]) * 100) / 100);

  const range30 = calc.monthRange(1);
  const catSpend = calc
    .categoryRoots()
    .map((c) => ({ cat: c, spent: calc.calcCategorySpend(c.id, range30) }))
    .filter((x) => x.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const totalSpend = catSpend.reduce((a, x) => a + x.spent, 0);

  const budgets = calc.calcBudgetUsage(range30).sort((a, b) => b.pct - a.pct);

  const accent = "#1F6D4C";
  const negative = "#7B2E3A";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Reports & Trends</h1>
        <p className="mt-1 text-[13.5px] text-ink-soft">How your money moves over time, and where it goes.</p>
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
              yFormat={(v) => "₹" + Math.round(v / 1000) + "k"}
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
              yFormat={(v) => "₹" + Math.round(v / 1000) + "k"}
            />
          </Card>
        </TabPanel>

        <TabPanel value="categories">
          <div className="grid grid-cols-[1fr_1.3fr] gap-5 max-[900px]:grid-cols-1">
            <Card>
              <div className="mb-3">
                <div className="text-[14.5px] font-semibold">Spending breakdown</div>
                <div className="text-[12.5px] text-ink-faint">Last 30 days</div>
              </div>
              {catSpend.length ? (
                <DonutChart segments={catSpend.map((x) => ({ label: x.cat.name, value: x.spent, color: x.cat.color }))} size={200} thickness={28} centerLabel={formatCurrency(totalSpend)} centerSub="total spent" />
              ) : (
                <div className="py-10 text-center text-[13px] text-ink-faint">No expenses in the last 30 days</div>
              )}
            </Card>
            <Card>
              <div className="mb-3 text-[14.5px] font-semibold">By category</div>
              {catSpend.map((x) => (
                <div key={x.cat.id} className="flex items-center justify-between border-b border-dashed border-line py-2.5 last:border-b-0">
                  <span className="flex items-center gap-2 text-[13.3px]">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.cat.color }} />
                    {x.cat.name}
                  </span>
                  <span className="ledger-figure text-[13.3px]">{formatCurrency(x.spent)}</span>
                </div>
              ))}
              {catSpend.length === 0 && <div className="py-6 text-center text-[13px] text-ink-faint">Nothing to show yet</div>}
            </Card>
          </div>
        </TabPanel>

        <TabPanel value="budgets">
          <Card>
            <div className="mb-4">
              <div className="text-[14.5px] font-semibold">Budgets this month</div>
              <div className="text-[12.5px] text-ink-faint">Categories with a monthly limit set</div>
            </div>
            {budgets.length ? (
              budgets.map((b) => (
                <div key={b.category.id} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex justify-between text-[13px]">
                    <span className="font-medium">{b.category.name}</span>
                    <span className={b.pct > 100 ? "text-negative" : "text-ink-soft"}>
                      {formatCurrency(b.spent)} / {formatCurrency(b.limit)} ({b.pct}%)
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct > 100 ? "var(--negative)" : b.pct > 80 ? "var(--warn)" : "var(--accent)" }}
                    />
                  </div>
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
