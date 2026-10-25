import { TransactionTable } from "@/components/domain/TransactionTable";

export function ExpensesPage() {
  return (
    <TransactionTable
      allowedTypes={["expense"]}
      title="Expenses"
      description="Everything you've spent. Refunds you receive are on the Income page."
      showTypeFilter={false}
      addType="expense"
      emptyTitle="No expenses recorded"
      emptyDescription="Try widening your date range, or record your first expense."
    />
  );
}
