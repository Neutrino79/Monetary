(function (global) {
  "use strict";
  const { icon } = global.Icons;
  const { initialsOf } = global.fmt;

  function chip(html, color, size) {
    size = size || 38;
    return `<span class="category-tree__icon" style="width:${size}px;height:${size}px;background:${color}">${html}</span>`;
  }

  function categoryChip(cat, size) {
    return chip(icon("tag", { size: Math.round((size || 38) * 0.46) }), cat.color, size);
  }

  function incomeChip(source, size) {
    return chip(icon("trendingUp", { size: Math.round((size || 38) * 0.46) }), source.color, size);
  }

  const ACCOUNT_ICONS = { bank: "landmark", cash: "wallet", credit_card: "creditCard", wallet: "wallet", system: "settings" };
  function accountChip(acc, size) {
    const color = acc.accountType === "LIABILITY" ? "#7B2E3A" : acc.isSystem ? "#5A5A5A" : "#2C6683";
    return chip(icon(ACCOUNT_ICONS[acc.subtype] || "landmark", { size: Math.round((size || 38) * 0.46) }), color, size);
  }

  function friendAvatar(friend, size) {
    size = size || 34;
    return `<span class="avatar" style="width:${size}px;height:${size}px;background:${friend.color};font-size:${Math.round(size * 0.36)}px">${friend.initials || initialsOf(friend.name)}</span>`;
  }

  const TXN_TYPE_META = {
    income: { label: "Income", icon: "trendingUp", badge: "badge--income", color: "var(--accent)", bg: "var(--accent-soft)" },
    expense: { label: "Expense", icon: "trendingDown", badge: "badge--expense", color: "var(--negative)", bg: "var(--negative-soft)" },
    transfer: { label: "Transfer", icon: "shuffle", badge: "badge--transfer", color: "var(--warn)", bg: "var(--warn-soft)" },
    split: { label: "Split Expense", icon: "users", badge: "badge--split", color: "var(--info)", bg: "var(--info-soft)" },
    settlement: { label: "Settlement", icon: "handCoins", badge: "badge--settlement", color: "var(--info)", bg: "var(--info-soft)" },
    refund: { label: "Refund", icon: "arrowRight", badge: "badge--refund", color: "var(--accent)", bg: "var(--accent-soft)" },
    adjustment: { label: "Adjustment", icon: "scale", badge: "badge--adjustment", color: "var(--ink-soft)", bg: "var(--paper-sunken)" },
  };

  function txnIconChip(txn, size) {
    size = size || 38;
    const meta = TXN_TYPE_META[txn.type];
    return `<span class="recent-txn-row__icon" style="background:${meta.bg};color:${meta.color};width:${size}px;height:${size}px">${icon(meta.icon, { size: Math.round(size * 0.46) })}</span>`;
  }

  function txnBadge(txn) {
    const meta = TXN_TYPE_META[txn.type];
    return `<span class="badge ${meta.badge}">${meta.label}</span>`;
  }

  // Signed display amount + direction class for a transaction, from the
  // owner's point of view (matches §16 of the architecture: transfers are
  // never shown as expenses; a split shows your share, not the total).
  function txnAmountDisplay(txn) {
    const { formatSigned } = global.fmt;
    if (txn.type === "income" || txn.type === "refund") return { text: formatSigned(txn.amount, "positive"), cls: "text-pos" };
    if (txn.type === "expense") return { text: formatSigned(txn.amount, "negative"), cls: "text-neg" };
    if (txn.type === "split") return { text: formatSigned(txn.yourShare, "negative"), cls: "text-neg" };
    if (txn.type === "transfer") return { text: global.fmt.formatINR(txn.amount), cls: "text-warn" };
    if (txn.type === "settlement") return { text: formatSigned(txn.amount, txn.direction === "receive" ? "positive" : "negative"), cls: txn.direction === "receive" ? "text-pos" : "text-neg" };
    if (txn.type === "adjustment") return { text: formatSigned(txn.amount, txn.direction === "increase" ? "positive" : "negative"), cls: txn.direction === "increase" ? "text-pos" : "text-neg" };
    return { text: global.fmt.formatINR(txn.amount), cls: "" };
  }

  global.Visuals = { categoryChip, incomeChip, accountChip, friendAvatar, txnIconChip, txnBadge, txnAmountDisplay, TXN_TYPE_META };
})(window);
