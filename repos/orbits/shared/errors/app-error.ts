export const APP_ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
] as const;

export type AppErrorCode = (typeof APP_ERROR_CODES)[number];

export const APP_ERROR_HTTP_STATUS: Record<AppErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export const SAFE_INTERNAL_ERROR_MESSAGE = "An unexpected error occurred.";

export class AppError extends Error {
  readonly code: AppErrorCode;

  constructor(
    code: AppErrorCode,
    message: string,
    options?: {
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;

    if (options && "cause" in options) {
      this.cause = options.cause;
    }
  }
}

export function getHttpStatusForAppErrorCode(code: AppErrorCode): number {
  return APP_ERROR_HTTP_STATUS[code];
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE, {
    cause: error,
  });
}
