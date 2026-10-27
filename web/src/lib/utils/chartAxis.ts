/** A y axis that ends on a round number: three equal steps (0, step, 2*step, 3*step) covering `max`. */
export function niceAxis(max: number): { max: number; ticks: number[] } {
  const wanted = Math.max(max, 1) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(wanted));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= wanted) ?? 10 * magnitude;
  return { max: step * 3, ticks: [0, step, step * 2, step * 3] };
}

/** Which days get a label on the x axis: first, last and a few evenly between, fewer on a narrow chart. */
export function dayTicks(daysInMonth: number, narrow: boolean): number[] {
  const every = narrow ? 7 : 5;
  const out = [1];
  for (let d = every; d < daysInMonth - 2; d += every) out.push(d);
  out.push(daysInMonth);
  return out;
}
