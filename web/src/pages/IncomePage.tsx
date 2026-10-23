import { TransactionTable } from "@/components/domain/TransactionTable";

export function IncomePage() {
  return (
    <TransactionTable
      allowedTypes={["income", "settlement"]}
      settlementDirection="receive"
      title="Income"
      description="Every credit recorded against your accounts, including money friends paid back."
      addType="income"
      emptyTitle="No income recorded"
      emptyDescription="Try widening your date range, or record your first income entry."
    />
  );
}
