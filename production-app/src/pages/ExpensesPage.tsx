import { TransactionTable } from "@/components/domain/TransactionTable";

export function ExpensesPage() {
  return (
    <TransactionTable
      allowedTypes={["expense", "refund"]}
      title="Expenses"
      description="Everything you've spent, plus any refunds against it."
      addType="expense"
      emptyTitle="No expenses recorded"
      emptyDescription="Try widening your date range, or record your first expense."
    />
  );
}
