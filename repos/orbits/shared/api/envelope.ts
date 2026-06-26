import type { FeatureMode } from "../config/feature-mode";
import type { AppErrorCode } from "../errors/app-error";
import { toAppError } from "../errors/app-error";

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
