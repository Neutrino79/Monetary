/**
 * The real HTTP client. Every `services/*Service.ts` module routes here
 * once `appConfig.useMockApi` is false — nothing else in the app should
 * import this directly. All requests are built against `appConfig.apiBaseUrl`,
 * which is the single place a real backend's URL gets wired in.
 */
import { appConfig } from "@/config/app";
import { tokenStorage } from "./tokenStorage";
import { ApiError } from "./errors";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!appConfig.apiBaseUrl) {
    throw new ApiError("No backend configured — set VITE_API_BASE_URL to point the app at a real API.", 0, "NO_BACKEND");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), appConfig.apiTimeoutMs);
  const token = tokenStorage.get();

  try {
    const res = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body != null ? JSON.stringify(options.body) : undefined,
      signal: options.signal ?? controller.signal,
    });

    if (!res.ok) {
      let message = res.statusText || "Request failed";
      let code: string | undefined;
      try {
        const data = (await res.json()) as { message?: string; error?: string; code?: string };
        message = data.message ?? data.error ?? message;
        code = data.code;
      } catch {
        /* response wasn't JSON — fall back to the status text */
      }
      throw new ApiError(message, res.status, code);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    if (ApiError.isApiError(err)) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The request timed out. Check your connection and try again.", 0, "TIMEOUT");
    }
    throw new ApiError(err instanceof Error ? err.message : "Network error", 0, "NETWORK");
  } finally {
    clearTimeout(timeout);
  }
}

export const http = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: "GET", signal }),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>(path, { method: "POST", body, signal }),
  patch: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>(path, { method: "PATCH", body, signal }),
  put: <T>(path: string, body?: unknown, signal?: AbortSignal) => request<T>(path, { method: "PUT", body, signal }),
  delete: <T>(path: string, signal?: AbortSignal) => request<T>(path, { method: "DELETE", signal }),
};
