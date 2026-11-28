/** A normalized error for anything the API layer throws. */
export class ApiError extends Error {
  status: number;
  /** The backend's `error_type` (e.g. "ConflictError") or a client code (NETWORK, TIMEOUT). */
  code?: string;
  /** Per-field messages for 422 validation errors, keyed by the request field name. */
  fieldErrors: Record<string, string>;
  /** Structured extras some 409s carry, e.g. the payments a bill change would delete (BillDependencyError). */
  details?: Record<string, unknown>;

  constructor(message: string, status = 0, code?: string, fieldErrors: Record<string, string> = {}, details?: Record<string, unknown>) {
    super(message);
    this.details = details;
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }

  static isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }

  /** The change is blocked by payments / matches resting on a bill; retrying with `removeLinked` deletes them. */
  get isBillDependency(): boolean {
    return this.status === 409 && this.code === "BillDependencyError";
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

interface ValidationItem {
  loc?: (string | number)[];
  msg?: string;
}

/** Turns a FastAPI error body (`{detail, error_type}`; `detail` is a list for 422 validation) into an ApiError. */
export function apiErrorFromBody(status: number, statusText: string, body: unknown): ApiError {
  const data = (body ?? {}) as { detail?: unknown; error_type?: string; details?: Record<string, unknown> };
  if (typeof data.detail === "string") return new ApiError(data.detail, status, data.error_type, {}, data.details ?? undefined);
  if (Array.isArray(data.detail)) {
    const fieldErrors: Record<string, string> = {};
    for (const item of data.detail as ValidationItem[]) {
      const field = item.loc?.filter((p) => typeof p === "string" && p !== "body" && p !== "query").pop();
      if (typeof field === "string" && item.msg && !(field in fieldErrors)) fieldErrors[field] = item.msg;
    }
    const first = (data.detail as ValidationItem[])[0]?.msg;
    return new ApiError(first ? `Please check your input: ${first}` : "Please check your input.", status, "ValidationError", fieldErrors);
  }
  return new ApiError(statusText || "Request failed", status, data.error_type);
}
