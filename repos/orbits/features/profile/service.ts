import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  ManualProfile,
  ManualProfileUpdateInput,
  ProfileCompleteness,
  ProfileFailure,
  ProfileResult,
  ProfileScenario,
  ProfileSuccess,
} from "./contract";

// ProfileService 管理用户手动资料和完整度评分。
// 当前服务边界用于 onboarding/profile 页面；不会从外部账号自动抓取资料。
export interface ProfileService {
  // 读取当前用户资料，scenario 用于测试不同状态。
  getProfile: (options?: {
    scenario?: ProfileScenario | string | null;
  }) => ProfileResult;
  // 返回“等待人工复核”的资料状态。
  getPendingManualReview: () => ProfileSuccess;
  // 对手动资料做完整度评分，供 UI 显示待补字段。
  scoreCompleteness: (profile: ManualProfile | null) => ProfileCompleteness;
  // 更新手动资料；真实持久化由具体实现负责。
  updateProfile: (input: ManualProfileUpdateInput) => ProfileResult;
}

// 将领域失败转换成统一 AppError，供 API route 填入 envelope。
export function profileFailureToAppError(failure: ProfileFailure): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

// 错误上下文会进入 API 响应，帮助调用方判断 mode、边界和 mock 来源。
export function profileFailureContext(
  failure: ProfileFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    profileErrorCode: failure.error.code,
    provenance: "Mock profile failure came from deterministic fixture rules.",
    service: "profile-onboarding-and-manual-profile-editor",
  };
}
