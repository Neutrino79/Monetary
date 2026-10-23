import { TransactionTable } from "@/components/domain/TransactionTable";

export function ExpensesPage() {
  return (
    <TransactionTable
      allowedTypes={["expense", "refund", "settlement"]}
      settlementDirection="pay"
      title="Expenses"
      description="Everything you've spent, plus refunds against it and what you paid back to friends."
      addType="expense"
      emptyTitle="No expenses recorded"
      emptyDescription="Try widening your date range, or record your first expense."
    />
  );
}
