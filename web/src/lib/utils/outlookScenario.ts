import type { ForecastPoint, Outlook } from "@/types";

/** Net worth along the forecast if the chosen levers (budgets you would hold to) each save their
 *  monthly amount from the first forecast month on. Display arithmetic on figures the API supplied. */
export function scenarioLine(forecast: ForecastPoint[], levers: Outlook["levers"], active: ReadonlySet<number>): number[] {
  const monthly = levers.filter((l) => active.has(l.categoryId)).reduce((a, l) => a + l.monthlySaving, 0);
  return forecast.map((f, i) => f.expected + monthly * (i + 1));
}
