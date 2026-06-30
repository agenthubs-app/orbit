// AppErrorCode 是 API 层对外暴露的稳定错误分类。
// feature 内部可以有更细的错误码，但 route 最终会映射到这些通用类别。
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

// HTTP status 只由 AppErrorCode 决定，避免不同 route 对同类错误返回不同状态。
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

// AppError 是可安全返回给客户端的业务错误。
// 如果需要保留原始异常，放在 cause 里，外部 envelope 不会直接序列化它。
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

// 未知异常统一降级为安全的 INTERNAL_ERROR，防止堆栈、密钥或内部状态进入 API 响应。
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  return new AppError("INTERNAL_ERROR", SAFE_INTERNAL_ERROR_MESSAGE, {
    cause: error,
  });
}
