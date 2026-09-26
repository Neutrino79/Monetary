(function (global) {
  "use strict";
  function render(container) {
    global.TxnList.render(container, {
      allowedTypes: ["income", "expense", "transfer", "split", "refund", "adjustment", "settlement"],
      title: "Transactions",
      description: "Every journal entry across all your accounts, in one ledger.",
      showTypeFilter: true, showCategoryFilter: true, showAccountFilter: true, showFriendFilter: true,
      addType: "expense",
      emptyTitle: "No transactions found",
      emptyDesc: "Try widening your date range or clearing filters — or add your first transaction.",
    });
  }
  global.Pages = global.Pages || {};
  global.Pages.transactions = { render };
})(window);
