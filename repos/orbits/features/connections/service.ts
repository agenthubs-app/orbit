import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import type {
  ConnectionAddEvidenceInput,
  ConnectionEvidenceAddResult,
  ConnectionEvidenceDetailResult,
  ConnectionEvidenceFailure,
  ConnectionEvidenceInvalidBodyFailure,
  ConnectionEvidenceListInput,
  ConnectionEvidenceListResult,
  ConnectionEvidenceLookupInput,
} from "./contract";

// ConnectionEvidenceService 管理“我为什么认识这个人”的证据链。
// 它面向 UI 提供关系证据读写入口，但所有输出仍遵守 contract 的 provenance。
export interface ConnectionEvidenceService {
  // 列出关系证据摘要。
  listConnections: (
    input?: ConnectionEvidenceListInput,
  ) => ConnectionEvidenceListResult;
  // 读取单条关系证据详情。
  getConnection: (
    input: ConnectionEvidenceLookupInput,
  ) => ConnectionEvidenceDetailResult;
  // 添加新的关系证据；具体实现决定是否持久化。
  addEvidence: (
    input: ConnectionAddEvidenceInput,
  ) => ConnectionEvidenceAddResult;
  // 请求体不合法时返回领域失败，避免 route 自己拼错误结构。
  invalidAddEvidenceBody: () => ConnectionEvidenceInvalidBodyFailure;
}

// 将关系证据失败转换成统一 AppError，供 API 层复用。
export function connectionEvidenceFailureToAppError(
  failure: ConnectionEvidenceFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

// 失败上下文明确标出 mock 来源和运行边界，便于调试 envelope。
export function connectionEvidenceFailureContext(
  failure: ConnectionEvidenceFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    connectionEvidenceErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock connection evidence failure came from deterministic fixture rules.",
    service: "connection-and-evidence-service-mock",
  };
}

export type {
  ConnectionEvidenceAddResult,
  ConnectionEvidenceDetailResult,
  ConnectionEvidenceListResult,
};
