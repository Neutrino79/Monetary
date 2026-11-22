import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api/errors";

/** Reads are retried a couple of times when the failure may be temporary (no connection, a 5xx), never for a 4xx. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return !ApiError.isApiError(error) || error.status === 0 || error.status >= 500;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: shouldRetryQuery },
    // A write is never held back and replayed later: while offline it fails at once, so the person sees
    // that it was not saved instead of it being sent by surprise (and possibly twice) on reconnect.
    mutations: { networkMode: "always", retry: false },
  },
});
