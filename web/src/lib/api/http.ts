/**
 * The HTTP client. Every `services/*Service.ts` module goes through here; it
 * is the only place that knows the base URL, the bearer token, and how the
 * backend reports errors.
 */
import { appConfig } from "@/config/app";
import { tokenStorage } from "./tokenStorage";
import { ApiError, apiErrorFromBody } from "./errors";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type QueryValue = string | number | boolean | null | undefined | (string | number)[];

interface RequestOptions {
  method?: Method;
  body?: unknown;
  /** application/x-www-form-urlencoded body (used by the OAuth2 login endpoint). */
  form?: Record<string, string>;
  query?: Record<string, QueryValue>;
  signal?: AbortSignal;
  /** Extra request headers (for example the captcha solution). */
  headers?: Record<string, string>;
  /** Return the response body as a file instead of JSON. */
  asBlob?: boolean;
  /** Name to save under when the server's Content-Disposition cannot be read. */
  fallbackName?: string;
  /** Don't treat a 401 as "session expired" (e.g. wrong password on the login form). */
  skipUnauthorizedHandler?: boolean;
}

let onUnauthorized: (() => void) | null = null;
/** The auth store registers a handler so an expired/invalid session logs the user out everywhere. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

export function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.append(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), appConfig.apiTimeoutMs);
  const token = tokenStorage.get();
  const headers: Record<string, string> = { ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(options.form).toString();
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(`${appConfig.apiBaseUrl}${path}${buildQuery(options.query)}`, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: options.signal ?? controller.signal,
    });

    if (!res.ok) {
      let parsed: unknown;
      try {
        parsed = await res.json();
      } catch {
        /* not JSON -- fall back to the status text */
      }
      if (res.status === 401 && token && !options.skipUnauthorizedHandler) onUnauthorized?.();
      throw apiErrorFromBody(res.status, res.statusText, parsed);
    }
    if (options.asBlob) {
      return { blob: await res.blob(), filename: downloadName(res.headers.get("Content-Disposition"), options.fallbackName) } as T;
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    if (ApiError.isApiError(err)) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("The request timed out. Check your connection and try again.", 0, "TIMEOUT");
    }
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, "NETWORK");
  } finally {
    clearTimeout(timeout);
  }
}

/** The file name the server chose (`filename*=` wins over `filename=`), else the caller's own fallback. */
export function downloadName(contentDisposition: string | null, fallback = "download"): string {
  const header = contentDisposition ?? "";
  const encoded = /filename\*\s*=\s*[^']*'[^']*'([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      /* fall through to the plain name */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1];
  return plain?.trim() || fallback;
}

export const http = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal, headers?: Record<string, string>) =>
    request<T>(path, { query, signal, headers }),
  post: <T>(path: string, body?: unknown, opts?: Pick<RequestOptions, "query" | "signal" | "headers">) => request<T>(path, { method: "POST", body, ...opts }),
  postForm: <T>(path: string, form: Record<string, string>, opts?: Pick<RequestOptions, "skipUnauthorizedHandler" | "headers">) =>
    request<T>(path, { method: "POST", form, ...opts }),
  /** A file download (the signed-in user's own data). */
  download: (path: string, fallbackName?: string) => request<{ blob: Blob; filename: string }>(path, { asBlob: true, fallbackName }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string, query?: Record<string, QueryValue>) => request<T>(path, { method: "DELETE", query }),
};
