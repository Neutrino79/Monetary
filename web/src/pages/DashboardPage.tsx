import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, ChevronRight, AlertTriangle, Info } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { SkeletonChart, SkeletonList, SkeletonPageHeader, SkeletonStats } from "@/components/ui/skeletons";
import { Button } from "@/components/ui/Button";
import { MonthStepper } from "@/components/ui/MonthStepper";
import { TxnIconChip, TxnAmount } from "@/components/domain/chips";
import { VsLastMonth } from "@/components/domain/VsLastMonth";
import { TransactionForm } from "@/components/domain/TransactionForm";
import { TxnDetailDrawer } from "@/components/domain/TxnDetailDrawer";
import { SpendingPace, SetBudgetHint } from "@/components/dashboard/SpendingPace";
import { SpendDonut, type DonutRow } from "@/components/dashboard/SpendDonut";
import { MonthlyBars } from "@/components/dashboard/MonthlyBars";
import { SpendingBudgets } from "@/components/dashboard/SpendingBudgets";
import { buildSpendRows } from "@/lib/utils/spendRows";
import { useAccounts, useCashflow, useDashboard, useFriendBalances, useSpending, useSpendingPace, useTransactions } from "@/hooks/queries";
import { useLookups } from "@/hooks/useLookups";
import { useAuthStore } from "@/store/authStore";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { toMonthKey } from "@/lib/utils/clock";
import { shiftMonth } from "@/lib/utils/dateRange";
import { buildAttention } from "@/lib/utils/attention";
import { appConfig } from "@/config/app";
import { cn } from "@/lib/utils/cn";
import type { Transaction } from "@/types";

const OTHERS_COLOR = "#b9b29f";

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const currentMonth = toMonthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const dashboard = useDashboard(month);
  const previousMonth = shiftMonth(month, -1);
  const previous = useDashboard(previousMonth);
  const pace = useSpendingPace(month);
  const cashflow = useCashflow(6);
  const spending = useSpending(month);
  const recentQuery = useTransactions({ limit: 6, sort: "date", direction: "desc" });
  const { data: accounts = [] } = useAccounts();
  const { data: friendBalances = [] } = useFriendBalances();
  const lookups = useLookups();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [now] = useState(() => new Date());

  if (dashboard.isLoading || !dashboard.data) {
    return dashboard.isError ? <DashboardError message={dashboard.error instanceof Error ? dashboard.error.message : "Couldn't load the dashboard."} onRetry={() => dashboard.refetch()} /> : <DashboardSkeleton />;
  }

  // Every figure below is computed by the backend; this page only lays them out.
  const d = dashboard.data;
  const { income, expense: expenses, savings: netFlow, owedToYou, youOwe } = d;
  const monthLabel = formatDate(`${month}-01`, "monthYear");
  const catSpend = (spending.data ?? []).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const colorOf = (id: number) => lookups.getCategory(id)?.color;
  const donutRows: DonutRow[] = catSpend.slice(0, 5).map((c) => ({ id: c.categoryId, name: c.categoryName, value: c.total, color: colorOf(c.categoryId) ?? "#5a5a5a" }));
  const rest = catSpend.slice(5).reduce((s, c) => s + c.total, 0);
  if (rest > 0) donutRows.push({ id: null, name: "Others", value: rest, color: OTHERS_COLOR });
  const spendRows = buildSpendRows(spending.data ?? [], d.budgets, colorOf);
  const buckets = cashflow.data ?? [];
  const hasHistory = buckets.some((b) => b.income > 0 || b.expense > 0);
  const recent = recentQuery.data?.items ?? [];
  const attention = buildAttention({ budgets: d.budgets, accounts, friendBalances, today: now });
  const paceData = pace.data;
  const noSpend = !paceData || paceData.days.every((x) => x.cumulative === 0);
  const hasSplits = owedToYou > 0 || youOwe > 0;
  const firstTime = recentQuery.data !== undefined && recentQuery.data.total === 0 && income === 0 && expenses === 0;
  const savedPct = income > 0 ? Math.round((netFlow / income) * 100) : null;

  const kpis = [
    { label: "Income", value: income, cls: "text-accent", prev: previous.data?.income, upIsGood: true },
    { label: "Spent", value: expenses, cls: "text-negative", prev: previous.data?.expense, upIsGood: false },
    { label: netFlow >= 0 ? "Saved" : "Overspent", value: Math.abs(netFlow), cls: "", prev: previous.data?.savings, upIsGood: true },
  ];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Good to see you, {(user?.name ?? "there").split(" ")[0]}</h1>
          <p className="mt-1 text-body text-ink-soft">Here's where things stand for {monthLabel}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MonthStepper value={month} max={currentMonth} onChange={setMonth} />
          <Button onClick={() => setAddOpen(true)}>
            <Plus size={15} /> Add transaction
          </Button>
        </div>
      </div>

      {firstTime ? (
        <Card className="mx-auto mt-6 max-w-lg text-center">
          <div className="mb-1 text-[16px] font-semibold">Nothing here yet</div>
          <p className="mb-4 text-body text-ink-soft">Add your first transaction and this page will start showing where your money goes, and how the month is pacing.</p>
          <Button onClick={() => setAddOpen(true)}><Plus size={15} /> Add your first transaction</Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          <section aria-label="This month">
            <div className="grid grid-cols-3 divide-x divide-line overflow-hidden rounded-card border border-line bg-paper-raised">
              {kpis.map((k) => (
                <div key={k.label} className="min-w-0 px-3 py-3.5 sm:px-5 sm:py-4">
                  <div className="text-caption text-ink-soft sm:text-caption">{k.label}</div>
                  <div className={cn("ledger-figure truncate text-[18px] sm:text-[24px]", k.cls)}>{formatCurrency(k.value)}</div>
                  <div className="hidden sm:block"><VsLastMonth current={k.label === "Overspent" ? -k.value : k.value} previous={k.prev} previousMonth={previousMonth} upIsGood={k.upIsGood} /></div>
                </div>
              ))}
            </div>
            {savedPct !== null && (
              <p className="mt-2 px-1 text-caption text-ink-soft" data-testid="savings-line">
                {netFlow >= 0 ? `${formatCurrency(netFlow)} saved, ${savedPct}% of income` : `Spent ${formatCurrency(-netFlow)} more than came in`}
              </p>
            )}
          </section>

          <div className={cn("grid gap-5", donutRows.length ? "lg:grid-cols-[2fr_1fr]" : "")}>
            <Card className="min-w-0">
              {noSpend || !paceData ? (
                <div>
                  <h2 className="text-lead font-semibold">Spending pace</h2>
                  <p className="mt-1 text-body text-ink-soft">{pace.isLoading ? "Loading\u2026" : `Nothing spent in ${monthLabel} yet.`}</p>
                  {paceData && paceData.budgetTotal == null && <SetBudgetHint />}
                </div>
              ) : (
                <>
                  <SpendingPace pace={paceData} month={month} monthName={monthLabel} />
                  {paceData.budgetTotal == null && <SetBudgetHint />}
                </>
              )}
            </Card>
            {donutRows.length > 0 && (
              <Card className="min-w-0">
                <h2 className="text-lead font-semibold">Where it went</h2>
                <p className="mb-3 text-caption text-ink-soft">Spending by category</p>
                <SpendDonut rows={donutRows} total={expenses} month={month} />
              </Card>
            )}
          </div>

          {(hasHistory || spendRows.length > 0) && (
            <div className={cn("grid gap-5", hasHistory && spendRows.length > 0 ? "md:grid-cols-2" : "")}>
              {hasHistory && (
                <Card className="min-w-0">
                  <h2 className="text-lead font-semibold">Last six months</h2>
                  <p className="mb-1 text-caption text-ink-soft">Money in against money out</p>
                  <MonthlyBars points={buckets} />
                </Card>
              )}
              {spendRows.length > 0 && (
                <Card className="min-w-0">
                  <div className="mb-4 flex items-baseline justify-between gap-2">
                    <h2 className="text-lead font-semibold">Spending and budgets</h2>
                    <Link to="/categories" className="text-caption font-semibold text-ink-soft hover:text-ink">Manage budgets</Link>
                  </div>
                  <SpendingBudgets rows={spendRows} month={month} />
                </Card>
              )}
            </div>
          )}

          {(recent.length > 0 || attention.length > 0 || hasSplits) && (
            <div className={cn("grid items-start gap-5", recent.length > 0 && (attention.length > 0 || hasSplits) ? "lg:grid-cols-[1.2fr_1fr]" : "")}>
              {recent.length > 0 && (
                <Card className="min-w-0">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="text-lead font-semibold">Recent activity</h2>
                    <Link to="/transactions" className="flex items-center gap-1 text-caption font-semibold text-ink-soft hover:text-ink">
                      View all <ChevronRight size={14} />
                    </Link>
                  </div>
                  {recent.map((t) => {
                    const account = lookups.getAccount(t.accountId);
                    return (
                      <button key={t.id} onClick={() => setSelectedTxn(t)} className="flex w-full items-center gap-3 border-b border-line py-3 text-left last:border-b-0">
                        <TxnIconChip txn={t} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-body font-semibold">{t.description}</div>
                          <div className="truncate text-caption text-ink-faint">
                            {formatDate(t.date, "short")} {account ? `\u00b7 ${account.name}` : ""}
                          </div>
                        </div>
                        <TxnAmount txn={t} className="text-lead font-semibold" />
                      </button>
                    );
                  })}
                </Card>
              )}
              {(attention.length > 0 || hasSplits) && (
                <div className="flex min-w-0 flex-col gap-5">
                  {attention.length > 0 && (
                    <Card>
                      <h2 className="text-lead font-semibold">Needs your attention</h2>
                      <ul className="mt-1 divide-y divide-line">
                        {attention.map((i) => {
                          const body = (
                            <>
                              {i.level === "warn" ? <AlertTriangle size={16} aria-hidden className="mt-0.5 flex-none text-danger" /> : <Info size={16} aria-hidden className="mt-0.5 flex-none text-info" />}
                              <span className="min-w-0">
                                <span className="block text-body font-semibold">{i.title}</span>
                                {i.detail && <span className="block text-caption text-ink-soft">{i.detail}</span>}
                              </span>
                            </>
                          );
                          return (
                            <li key={i.id}>
                              {i.to ? <Link to={i.to} className="flex items-start gap-3 py-3 hover:bg-paper-sunken">{body}</Link> : <div className="flex items-start gap-3 py-3">{body}</div>}
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  )}
                  {hasSplits && (
                    <Card>
                      <h2 className="text-lead font-semibold">Splits & dues</h2>
                      <div className="mb-2.5 text-caption text-ink-faint">Net position with friends</div>
                      <div className="flex items-center justify-between border-b border-dashed border-line py-3">
                        <span className="text-ink-soft">Owed to you</span>
                        <span className="ledger-figure text-accent">{formatCurrency(owedToYou)}</span>
                      </div>
                      <div className="flex items-center justify-between py-3">
                        <span className="text-ink-soft">You owe</span>
                        <span className="ledger-figure text-negative">{formatCurrency(youOwe)}</span>
                      </div>
                      <Link to="/friends" className="mt-2 flex items-center justify-center gap-1 rounded-control py-2 text-center text-caption font-semibold text-ink-soft hover:bg-paper-sunken">
                        View friends <ChevronRight size={13} />
                      </Link>
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <TransactionForm open={addOpen} onOpenChange={setAddOpen} initialType="expense" />
      <TxnDetailDrawer txn={selectedTxn} open={!!selectedTxn} onOpenChange={(o) => !o && setSelectedTxn(null)} />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div>
      <SkeletonPageHeader />
      <SkeletonStats count={4} className="mb-5" />
      <div className="grid grid-cols-[1.6fr_1fr] gap-5 max-[900px]:grid-cols-1">
        <SkeletonChart height={220} />
        <div className="rounded-card border border-line bg-paper-raised p-5">
          <SkeletonList rows={5} />
        </div>
      </div>
    </div>
  );
}

function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="mx-auto mt-10 max-w-md text-center">
      <div className="mb-1 text-[15px] font-semibold">Couldn't load your dashboard</div>
      <p className="mb-4 text-body text-ink-faint">{message || `Please try again, or contact ${appConfig.supportEmail}.`}</p>
      <Button onClick={onRetry}>Try again</Button>
    </Card>
  );
}
