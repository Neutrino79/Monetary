import { TransactionTable } from "@/components/domain/TransactionTable";

export function IncomePage() {
  return (
    <TransactionTable
      allowedTypes={["income", "refund"]}
      title="Income"
      description="Money coming in: income, and refunds you get back on something you bought."
      showCategoryFilter
      addType="income"
      emptyTitle="No income recorded"
      emptyDescription="Try widening your date range, or record your first income entry."
    />
  );
}
