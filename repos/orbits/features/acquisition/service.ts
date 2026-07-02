import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  ContactAcquisitionDraftFailure,
  ContactAcquisitionDraftInput,
  ContactAcquisitionDraftResult,
  ContactDraftConfirmationInput,
  ContactDraftConfirmationResult,
} from "./contract";

export type ContactAcquisitionDraftServiceResult<TResult> =
  TResult | Promise<TResult>;

// ContactAcquisitionDraftService 管理联系人采集管线里的“待确认草稿”。
// 它不直接导入外部通讯录；草稿确认后是否写入真实联系人由具体实现决定。
export interface ContactAcquisitionDraftService {
  // 列出采集管线产生的联系人草稿。
  listContactDrafts: (
    input?: ContactAcquisitionDraftInput,
  ) => ContactAcquisitionDraftServiceResult<ContactAcquisitionDraftResult>;
  // 确认或拒绝某个草稿，返回可复核结果。
  confirmContactDraft: (
    input: ContactDraftConfirmationInput,
  ) => ContactAcquisitionDraftServiceResult<ContactDraftConfirmationResult>;
}

// 将采集草稿领域失败转换成统一 AppError。
export function contactAcquisitionDraftFailureToAppError(
  failure: ContactAcquisitionDraftFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

// API route 使用该上下文说明 mock 采集管线和隐私边界。
export function contactAcquisitionDraftFailureContext(
  failure: ContactAcquisitionDraftFailure,
  mode: FeatureMode,
): ApiErrorContext {
  if (failure.error.provenance.privacy === "live-contact-acquisition-drafts") {
    return {
      boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
      contactAcquisitionDraftErrorCode: failure.error.code,
      mode,
      privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
      provenance:
        "Live contact acquisition draft failure came from the shared storage boundary.",
      service: "contact-acquisition-draft-live",
    };
  }

  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    contactAcquisitionDraftErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock contact acquisition draft failure came from deterministic fixture rules.",
    service: "contact-acquisition-draft-pipeline-mock",
  };
}
