import { TransactionTable } from "@/components/domain/TransactionTable";

export function TransfersPage() {
  return (
    <TransactionTable
      allowedTypes={["transfer"]}
      title="Transfers"
      description="Money moved between your own accounts."
      showTypeFilter={false}
      showCategoryFilter={false}
      addType="transfer"
      emptyTitle="No transfers recorded"
      emptyDescription="Try widening your date range, or move money between accounts for the first time."
    />
  );
}
