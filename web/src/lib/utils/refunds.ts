const cents = (n: number) => Math.round(n * 100);

export interface RefundSummary {
  /** The purchase amount. */
  original: number;
  /** Total of the refunds recorded against it. */
  refunded: number;
  /** What can still be refunded. */
  remaining: number;
  /** What the purchase really cost after refunds. */
  net: number;
  count: number;
  /** Nothing left to refund. */
  complete: boolean;
  /** 0 to 100, for a progress bar. */
  pct: number;
}

/** How much of a purchase has been refunded, worked out in whole cents so 0.1 + 0.2 never shows as 0.30000000000000004. */
export function summariseRefunds(original: number, refunds: { amount: number }[]): RefundSummary {
  const refundedCents = refunds.reduce((sum, r) => sum + cents(r.amount), 0);
  const originalCents = cents(original);
  const remainingCents = Math.max(0, originalCents - refundedCents);
  return {
    original,
    refunded: refundedCents / 100,
    remaining: remainingCents / 100,
    net: (originalCents - refundedCents) / 100,
    count: refunds.length,
    complete: remainingCents === 0,
    pct: originalCents > 0 ? Math.min(100, (refundedCents / originalCents) * 100) : 0,
  };
}
