import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, TrendingUp, TrendingDown, ChevronRight } from "lucide-react";
import { Card, Skeleton } from "@/components/ui/primitives";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/form";
import { LineChart, DonutChart } from "@/components/charts/charts";
import { TxnIconChip, TxnAmount } from "@/components/domain/chips";
import { TransactionForm } from "@/components/domain/TransactionForm";
import { TxnDetailDrawer } from "@/components/domain/TxnDetailDrawer";
import { useCashflow, useDashboard, useSpending, useTransactions } from "@/hooks/queries";
import { useLookups } from "@/hooks/useLookups";
import { useAuthStore } from "@/store/authStore";
import { currencySymbol, formatCurrency, formatDate } from "@/lib/utils/format";
import { toMonthKey } from "@/lib/utils/clock";
import { appConfig } from "@/config/app";
import type { Transaction } from "@/types";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const currentMonth = toMonthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const dashboard = useDashboard(month);
  const cashflow = useCashflow(6);
  const spending = useSpending(month);
  const recentQuery = useTransactions({ limit: 6, sort: "date", direction: "desc" });
  const lookups = useLookups();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);

  if (dashboard.isLoading || !dashboard.data) {
    return dashboard.isError ? <DashboardError message={dashboard.error instanceof Error ? dashboard.error.message : "Couldn't load the dashboard."} onRetry={() => dashboard.refetch()} /> : <DashboardSkeleton />;
  }

  // Every figure below is computed by the backend; this page only lays them out.
  const d = dashboard.data;
  const { income, expense: expenses, savings: netFlow, netWorth, assets, liabilities, owedToYou, youOwe } = d;
  const buckets = cashflow.data ?? [];
  const budgets = [...d.budgets].sort((a, b) => b.percentageUsed - a.percentageUsed).slice(0, 4);
  const catSpend = (spending.data ?? []).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const topCat = catSpend[0];
  const topIncome = [...d.incomeSummary].sort((a, b) => b.total - a.total)[0];
  const recent = recentQuery.data?.items ?? [];
  const monthLabel = formatDate(`${month}-01`, "monthYear");

  const accentColor = "#1F6D4C";
  const negativeColor = "#7B2E3A";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Good to see you, {(user?.name ?? "there").split(" ")[0]}</h1>
          <p className="mt-1 text-[13.5px] text-ink-soft">Here's where things stand for {monthLabel}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="month" aria-label="Month" max={currentMonth} value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="w-40" />
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Add transaction
          </Button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-4 gap-5 max-[1180px]:grid-cols-2 max-[640px]:grid-cols-1">
        <Card className="flex flex-col gap-2">
          <div className="text-[12.5px] text-ink-soft">Net worth</div>
          <div className="ledger-figure text-[27px]">{formatCurrency(netWorth)}</div>
          <div className="text-[11.5px] text-ink-faint">
            {formatCurrency(assets)} assets − {formatCurrency(liabilities)} owed
          </div>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <TrendingUp size={14} /> Income
          </div>
          <div className="ledger-figure text-accent text-[27px]">{formatCurrency(income)}</div>
          <span className="w-fit rounded-full bg-accent-soft px-2 py-0.5 text-[12px] text-accent">{topIncome ? `Top: ${topIncome.categoryName}` : "No income yet"}</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
            <TrendingDown size={14} /> Expenses
          </div>
          <div className="ledger-figure text-negative text-[27px]">{formatCurrency(expenses)}</div>
          <span className="w-fit rounded-full bg-negative-soft px-2 py-0.5 text-[12px] text-negative">{topCat ? `Top: ${topCat.categoryName}` : "No spend yet"}</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <div className="text-[12.5px] text-ink-soft">Net cash flow</div>
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
              { label: "Income", color: accentColor, points: buckets.map((b, i) => ({ x: i, y: b.income, label: b.label })) },
              { label: "Expenses", color: negativeColor, points: buckets.map((b, i) => ({ x: i, y: b.expense, label: b.label })) },
            ]}
            yFormat={(v) => currencySymbol() + Math.round(v / 1000) + "k"}
          />
        </Card>
        <Card>
          <div className="text-[14.5px] font-semibold">Where it went</div>
          <div className="mb-2.5 text-[12.5px] text-ink-faint">Spending by category ({monthLabel})</div>
          {catSpend.length ? (
            <DonutChart segments={catSpend.slice(0, 6).map((x) => ({ label: x.categoryName, value: x.total, color: lookups.getCategory(x.categoryId)?.color ?? "#5A5A5A" }))} size={172} thickness={24} centerLabel={formatCurrency(expenses)} centerSub="total spent" />
          ) : (
            <div className="py-8 text-center text-[13px] text-ink-faint">No expenses this month</div>
          )}
          <div className="mt-4 flex flex-wrap gap-3 text-[12.5px]">
            {catSpend.slice(0, 5).map((x) => (
              <span key={x.categoryId} className="flex items-center gap-1.5 text-ink-soft">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: lookups.getCategory(x.categoryId)?.color ?? "#5A5A5A" }} /> {x.categoryName}
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
              const account = lookups.getAccount(t.accountId);
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
            <div className="text-[14.5px] font-semibold">Budgets</div>
            <div className="mb-3 text-[12.5px] text-ink-faint">Top categories against their limit ({monthLabel})</div>
            {budgets.length ? (
              budgets.map((b) => (
                <div key={b.categoryId} className="mb-3.5 last:mb-0">
                  <div className="mb-1.5 flex justify-between text-[12.5px]">
                    <span>{b.categoryName}</span>
                    <span className={b.overBudget ? "text-negative" : "text-ink-soft"}>
                      {formatCurrency(b.spent)} / {formatCurrency(b.budget)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-paper-sunken">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.min(100, b.percentageUsed)}%`, background: b.overBudget ? "var(--negative)" : b.percentageUsed > 80 ? "var(--warn)" : "var(--accent)" }}
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

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-md text-center">
      <div className="mb-1 text-[15px] font-semibold">Couldn't load your dashboard</div>
      <p className="mb-4 text-[13px] text-ink-faint">{message || `Please try again, or contact ${appConfig.supportEmail}.`}</p>
      <Button onClick={onRetry}>Try again</Button>
    </Card>
  );
}
