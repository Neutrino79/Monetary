import { TransactionTable } from "@/components/domain/TransactionTable";

export function IncomePage() {
  return (
    <TransactionTable
      allowedTypes={["income"]}
      title="Income"
      description="Every credit recorded against your accounts."
      showTypeFilter={false}
      showCategoryFilter
      addType="income"
      emptyTitle="No income recorded"
      emptyDescription="Try widening your date range, or record your first income entry."
    />
  );
}
