/** A normalized error shape for anything the API layer throws, mock or real. */
export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status = 0, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  static isApiError(err: unknown): err is ApiError {
    return err instanceof ApiError;
  }
}
