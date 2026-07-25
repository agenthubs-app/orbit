// 跨客户端契约：统一响应壳。
// 运行时实现在 shared/api/envelope.ts，错误码常量在 shared/errors/app-error.ts，
// 两处都有类型断言保证与这里一致。本文件不得引入任何 import。

export type ApiErrorCodeContract =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export interface ApiErrorBodyContract {
  code: ApiErrorCodeContract;
  message: string;
  context?: Readonly<Record<string, string>>;
}

export interface ApiSuccessEnvelopeContract<TData> {
  success: true;
  data: TData;
}

export interface ApiFailureEnvelopeContract {
  success: false;
  error: ApiErrorBodyContract;
}

export type ApiEnvelopeContract<TData> =
  | ApiSuccessEnvelopeContract<TData>
  | ApiFailureEnvelopeContract;
