import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  PermissionRequestInput,
  PermissionRequestResult,
  PermissionStateFailure,
  PermissionStateInput,
  PermissionStateResult,
} from "./contract";

// PermissionStateService 管理分阶段授权状态。
// 它只描述权限请求/状态，不直接连接 Gmail、日历或通讯录 provider。
export interface PermissionStateService {
  // 列出当前授权状态。
  listPermissionStates: (
    input?: PermissionStateInput,
  ) => PermissionStateResult;
  // 发起权限请求，返回可展示的授权状态变化。
  requestPermission: (input: PermissionRequestInput) => PermissionRequestResult;
}

// 将权限领域失败转换成统一 AppError。
export function permissionStateFailureToAppError(
  failure: PermissionStateFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

// API route 使用该上下文标明 staged authorization 的 mock 来源。
export function permissionStateFailureContext(
  failure: PermissionStateFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    permissionStateErrorCode: failure.error.code,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock permission state failure came from deterministic fixture rules.",
    service: "permission-state-and-staged-authorization-mock",
  };
}
