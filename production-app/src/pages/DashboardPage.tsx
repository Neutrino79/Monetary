import { useState } from "react";
import { Link } from "react-router-dom";
import { Download, Plus, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { LineChart, DonutChart } from "@/components/charts/charts";
import { TxnIconChip, TxnAmount } from "@/components/domain/chips";
import { TransactionForm } from "@/components/domain/TransactionForm";
import { TxnDetailDrawer } from "@/components/domain/TxnDetailDrawer";
import { useCoreData } from "@/hooks/queries";
import { useAuthStore } from "@/store/authStore";
import { useLedgerCalc } from "@/hooks/useLedgerCalc";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import type { Transaction } from "@/types";

export function DashboardPage() {
  const { transactions, categories, isLoading } = useCoreData();
  const user = useAuthStore((s) => s.user);
  const calc = useLedgerCalc();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  if (isLoading) return <DashboardSkeleton />;

  const range30 = calc.monthRange(1);
  const income = calc.calcTotalIncome(range30);
  const expenses = calc.calcTotalExpenses(range30);
  const netFlow = Math.round((income - expenses) * 100) / 100;
  const netWorth = calc.calcNetWorth();
  const buckets = calc.lastNMonthsBuckets(6);
  const incomeSeries = buckets.map((b) => calc.calcTotalIncome(b));
  const expenseSeries = buckets.map((b) => calc.calcTotalExpenses(b));
  const budgets = calc
    .calcBudgetUsage(range30)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 4);
  const dueFriends = calc.friends.map((f) => ({ f, bal: calc.calcFriendOutstanding(f.id) })).filter((x) => Math.abs(x.bal) > 0.5);
  const owedToYou = dueFriends.filter((x) => x.bal > 0).reduce((a, x) => a + x.bal, 0);
  const youOwe = dueFriends.filter((x) => x.bal < 0).reduce((a, x) => a - x.bal, 0);
  const recent = transactions.filter((t) => t.status !== "reversed").slice(0, 6);
  const catSpend = categories
    .filter((c) => !c.parentId)
    .map((c) => ({ cat: c, spent: calc.calcCategorySpend(c.id, range30) }))
    .filter((x) => x.spent > 0)
    .sort((a, b) => b.spent - a.spent);
  const topCat = catSpend[0];

  const accentColor = "#1F6D4C";
  const negativeColor = "#7B2E3A";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Good to see you, {(user?.name ?? "there").split(" ")[0]}</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">Here's where things stand over the last 30 days.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">
            <Download size={15} /> Export
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Add transaction
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-5 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
        <Card className="flex flex-col gap-2">
          <div className="text-[12.5px] text-ink-soft">Net worth</div>
          <div className="ledger-figure text-[27px]">{formatCurrency(netWorth.net)}</div>
          <div className="text-[11.5px] text-ink-faint">
            {formatCurrency(netWorth.assets)} assets − {formatCurrency(netWorth.liabilities)} owed
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <TrendingUp size={14} /> Income (30d)
          </div>
          <div className="ledger-figure text-accent text-[27px]">{formatCurrency(income)}</div>
          <span className="w-fit rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent">Salary + freelance</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <TrendingDown size={14} /> Expenses (30d)
          </div>
          <div className="ledger-figure text-negative text-[27px]">{formatCurrency(expenses)}</div>
          <span className="w-fit rounded-full bg-negative-soft px-2 py-0.5 text-[12px] text-negative">{topCat ? `Top: ${topCat.cat.name}` : "No spend yet"}</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="text-[12.5px] text-ink-soft">Net cash flow (30d)</div>
          <div className={`ledger-figure text-[27px] ${netFlow >= 0 ? "text-accent" : "text-negative"}`}>
            {netFlow >= 0 ? "+" : "\u2212"}
            {formatCurrency(Math.abs(netFlow))}
          </div>
          <span className={`w-fit rounded-full px-2 py-0.5 text-[12px] ${netFlow >= 0 ? "bg-accent-soft text-accent" : "bg-negative-soft text-negative"}`}>
            {netFlow >= 0 ? "Saving this month" : "Spending more than earning"}
          </span>
        </Card>
      </div>

      <div className="mb-5 grid grid-cols-[2fr_1fr] gap-5 max-[1180px]:grid-cols-1">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[14.5px] font-semibold">Cash flow — last 6 months</div>
              <div className="text-[12.5px] text-ink-faint">Income vs. expenses, month over month</div>
            </div>
            <div className="flex gap-3 text-[12.5px]">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: accentColor }} /> Income
              </span>
              <span className="flex items-center gap-1.5 text-ink-soft">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: negativeColor }} /> Expenses
              </span>
            </div>
          </div>
          <LineChart
            series={[
              { label: "Income", color: accentColor, points: buckets.map((b, i) => ({ x: i, y: incomeSeries[i], label: b.label })) },
              { label: "Expenses", color: negativeColor, points: buckets.map((b, i) => ({ x: i, y: expenseSeries[i], label: b.label })) },
            ]}
            yFormat={(v) => "\u20B9" + Math.round(v / 1000) + "k"}
          />
        </Card>
        <Card>
          <div className="text-[14.5px] font-semibold">Where it went</div>
          <div className="mb-2.5 text-[12.5px] text-ink-faint">Spending by category (30d)</div>
          {catSpend.length ? (
            <DonutChart segments={catSpend.slice(0, 6).map((x) => ({ label: x.cat.name, value: x.spent, color: x.cat.color }))} size={172} thickness={24} centerLabel={formatCurrency(expenses)} centerSub="total spent" />
          ) : (
            <div className="py-8 text-center text-[13px] text-ink-faint">No expenses in the last 30 days</div>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-[12.5px]">
            {catSpend.slice(0, 5).map((x) => (
              <span key={x.cat.id} className="flex items-center gap-1.5 text-ink-soft">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.cat.color }} /> {x.cat.name}
              </span>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-5 max-[1180px]:grid-cols-1">
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[14.5px] font-semibold">Recent activity</div>
            <Link to="/transactions" className="flex items-center gap-1 text-[12.5px] font-semibold text-ink-soft hover:text-ink">
              View all <ChevronRight size={14} />
            </Link>
          </div>
          {recent.length ? (
            recent.map((t) => {
              const account = calc.getAccount(t.accountId);
              return (
                <button key={t.id} onClick={() => setSelectedTxn(t)} className="flex w-full items-center gap-3 border-b border-line py-3 text-left last:border-b-0">
                  <TxnIconChip txn={t} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.3px] font-semibold">{t.description}</div>
                    <div className="text-[12px] text-ink-faint">
                      {formatDate(t.date, "short")} {account ? `· ${account.name}` : ""}
                    </div>
                  </div>
                  <TxnAmount txn={t} className="text-[14.5px] font-semibold" />
                </button>
              );
            })
          ) : (
            <div className="py-8 text-center text-[13px] text-ink-faint">Nothing recorded yet</div>
          )}
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <div className="text-[14.5px] font-semibold">Budgets this month</div>
            <div className="mb-3 text-[12.5px] text-ink-faint">Top categories against their limit</div>
            {budgets.length ? (
              budgets.map((b) => (
                <div key={b.category.id} className="mb-3.5 last:mb-0">
                  <div className="mb-1.5 flex justify-between text-[12.5px]">
                    <span>{b.category.name}</span>
                    <span className={b.pct > 100 ? "text-negative" : "text-ink-soft"}>
                      {formatCurrency(b.spent)} / {formatCurrency(b.limit)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, b.pct)}%`, background: b.pct > 100 ? "var(--negative)" : b.pct > 80 ? "var(--warn)" : "var(--accent)" }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-[13px] text-ink-faint">No budgets set up</div>
            )}
            <Link to="/categories" className="mt-1 block rounded-[10px] py-2 text-center text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken">
              Manage budgets
            </Link>
          </Card>

          <Card>
            <div className="text-[14.5px] font-semibold">Splits & dues</div>
            <div className="mb-2.5 text-[12.5px] text-ink-faint">Net position with friends</div>
            <div className="flex items-center justify-between border-b border-dashed border-line py-3">
              <span className="text-ink-soft">Owed to you</span>
              <span className="ledger-figure text-accent">{formatCurrency(owedToYou)}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-ink-soft">You owe</span>
              <span className="ledger-figure text-negative">{formatCurrency(youOwe)}</span>
            </div>
            <Link to="/friends" className="mt-2 flex items-center justify-center gap-1 rounded-[10px] py-2 text-center text-[12.5px] font-semibold text-ink-soft hover:bg-paper-sunken">
              View friends <ChevronRight size={13} />
            </Link>
          </Card>
        </div>
      </div>

      <TransactionForm open={addOpen} onOpenChange={setAddOpen} initialType="expense" />
      <TxnDetailDrawer txn={selectedTxn} open={!!selectedTxn} onOpenChange={(o) => !o && setSelectedTxn(null)} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6 h-7 w-45" />
      <div className="mb-5 grid grid-cols-4 gap-5 max-[640px]:grid-cols-1">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-65 rounded-2xl" />
    </div>
  );
}
