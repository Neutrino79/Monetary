(function (global) {
  "use strict";

  const inrFormatter = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  });
  const inrFormatterPrecise = new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 2,
  });

  function formatINR(amount, precise) {
    if (amount == null || isNaN(amount)) return "—";
    return (precise ? inrFormatterPrecise : inrFormatter).format(amount);
  }

  // Signed variant for ledger-style displays: +₹ for inflow, −₹ for outflow.
  function formatSigned(amount, kind) {
    const abs = formatINR(Math.abs(amount));
    if (kind === "positive") return `+${abs}`;
    if (kind === "negative") return `−${abs}`;
    return abs;
  }

  function formatDate(dateStr, style) {
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    if (style === "short") return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
    if (style === "long") return d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
    if (style === "weekday") return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
    if (style === "monthYear") return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  function relativeDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    const today = new Date("2026-09-23T00:00:00");
    const diffDays = Math.round((today - d) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateStr);
  }

  function monthKey(dateStr) { return dateStr.slice(0, 7); }

  function titleCase(s) {
    return String(s).replace(/[-_]/g, " ").replace(/\w\S*/g, (t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
  }

  function initialsOf(name) {
    return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  }

  function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  global.fmt = {
    formatINR, formatSigned, formatDate, relativeDate, monthKey, titleCase, initialsOf, uid, clamp,
  };
})(window);
