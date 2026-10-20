import { TransactionTable } from "@/components/domain/TransactionTable";

export function TransactionsPage() {
  return (
    <TransactionTable
      allowedTypes={["income", "expense", "transfer", "split", "refund", "adjustment", "settlement"]}
      title="Transactions"
      description="Every journal entry across all your accounts, in one ledger."
      showFriendFilter
      addType="expense"
      emptyTitle="No transactions found"
      emptyDescription="Try widening your date range or clearing filters — or add your first transaction."
    />
  );
}
