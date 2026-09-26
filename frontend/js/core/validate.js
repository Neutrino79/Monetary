(function (global) {
  "use strict";

  const rules = {
    required: (v) => (v !== null && v !== undefined && String(v).trim() !== "") || "This field is required.",
    positiveAmount: (v) => (Number(v) > 0) || "Enter an amount greater than ₹0.",
    nonNegative: (v) => (Number(v) >= 0) || "Amount can't be negative.",
    notFutureDate: (v) => (v <= "2026-09-23") || "Date can't be in the future.",
    validDate: (v) => (!isNaN(new Date(v).getTime())) || "Enter a valid date.",
    email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || "Enter a valid email address.",
    maxLen: (n) => (v) => (String(v || "").length <= n) || `Keep it under ${n} characters.`,
  };

  // Runs `checks` (array of [value, ruleFn][]) and returns { valid, errors: {field: msg} }
  function runValidation(fields) {
    const errors = {};
    Object.keys(fields).forEach((key) => {
      const { value, checks } = fields[key];
      for (const check of checks) {
        const result = check(value);
        if (result !== true) { errors[key] = result; break; }
      }
    });
    return { valid: Object.keys(errors).length === 0, errors };
  }

  global.Validate = { rules, runValidation };
})(window);
