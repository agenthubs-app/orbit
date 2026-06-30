import type { FeatureMode } from "../config/feature-mode";
import type { AppErrorCode } from "../errors/app-error";
import { toAppError } from "../errors/app-error";

// API envelope 是前后端之间的统一响应壳。
// 所有 route 都应返回 success/data 或 success=false/error，
// 避免每个端点自己发明错误格式。
export interface ApiErrorBody {
  code: AppErrorCode;
  message: string;
  context?: ApiErrorContext;
}

export interface ApiSuccessEnvelope<TData> {
  success: true;
  data: TData;
}

export interface ApiFailureEnvelope {
  success: false;
  error: ApiErrorBody;
}

export type ApiEnvelope<TData> = ApiSuccessEnvelope<TData> | ApiFailureEnvelope;

export type ApiErrorContext = Readonly<Record<string, string>>;

// runtime boundary headers 告诉浏览器、CDN 和调试工具：
// 这些响应不应被缓存，也不应被当成真实关系数据边界外的数据。
export const RUNTIME_BOUNDARY_HEADER_VALUES = {
  cacheControl: "no-store",
  cdnCacheControl: "no-store",
  privacy: "no-relationship-data",
  runtimeBoundary: "developer-admin",
  vercelCdnCacheControl: "no-store",
} as const;

export function success<TData>(data: TData): ApiSuccessEnvelope<TData> {
  return {
    success: true,
    data,
  };
}

// failure 只暴露 AppError 的稳定 code/message。
// 非 AppError 会被 toAppError 转成安全的 INTERNAL_ERROR，避免泄露内部异常细节。
export function failure(
  error: unknown,
  context?: ApiErrorContext,
): ApiFailureEnvelope {
  const appError = toAppError(error);
  const hasContext = context && Object.keys(context).length > 0;

  return {
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(hasContext ? { context } : {}),
    },
  };
}

// API route 调用这个函数时，会同时声明 feature mode 和隐私/运行边界。
export function runtimeBoundaryHeaders(mode: FeatureMode): HeadersInit {
  return {
    "Cache-Control": RUNTIME_BOUNDARY_HEADER_VALUES.cacheControl,
    "CDN-Cache-Control": RUNTIME_BOUNDARY_HEADER_VALUES.cdnCacheControl,
    "Vercel-CDN-Cache-Control":
      RUNTIME_BOUNDARY_HEADER_VALUES.vercelCdnCacheControl,
    "X-Orbit-Feature-Mode": mode,
    "X-Orbit-Privacy": RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    "X-Orbit-Runtime-Boundary":
      RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
  };
}
