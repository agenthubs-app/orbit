import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError } from "../../shared/errors/app-error";
import {
  PROFILE_DOCUMENT_EXTRACTION_ERROR_DEFINITIONS,
  type ProfileDocumentExtractionFailure,
  type ProfileDocumentExtractionInput,
  type ProfileDocumentExtractionKind,
  type ProfileDocumentExtractionPayload,
  type ProfileDocumentExtractionResult,
  type ProfileDocumentExtractionScenario,
  type ProfileDocumentExtractionService,
  type ProfileDocumentExtractionSuccess,
} from "./extraction-contract";
import {
  mockBusinessCardExtractionFixture,
  mockEmptyResumeExtractionFixture,
  mockPendingBusinessCardExtractionFixture,
  mockProfileDocumentExtractionFailureProvenance,
  mockResumeExtractionFixture,
} from "./extraction-fixtures";

const supportedScenarios = new Set<ProfileDocumentExtractionScenario>([
  "success",
  "empty",
  "pending",
  "failure",
  "required",
  "unsupported-type",
]);

const resumeMimeTypes = new Set([
  "application/pdf",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const businessCardMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
]);

// Profile document extraction mock 用本地规则模拟简历/名片抽取。
// 它只检查 mimeType、文本和文件名，不调用 OCR、LLM 或真实文档解析器。
function clonePayload(
  payload: ProfileDocumentExtractionPayload,
): ProfileDocumentExtractionPayload {
  return JSON.parse(JSON.stringify(payload)) as ProfileDocumentExtractionPayload;
}

function success(
  payload: ProfileDocumentExtractionPayload,
): ProfileDocumentExtractionSuccess {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure(
  code: ProfileDocumentExtractionFailure["error"]["code"],
  kind: ProfileDocumentExtractionKind,
): ProfileDocumentExtractionFailure {
  const definition = PROFILE_DOCUMENT_EXTRACTION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      kind,
      state: "failure",
      provenance: {
        ...mockProfileDocumentExtractionFailureProvenance,
        sourceLabel: `Mock ${kind} extraction failure rule`,
      },
      evidenceIds: mockProfileDocumentExtractionFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ProfileDocumentExtractionInput["scenario"],
): ProfileDocumentExtractionScenario {
  if (scenario && supportedScenarios.has(scenario as ProfileDocumentExtractionScenario)) {
    return scenario as ProfileDocumentExtractionScenario;
  }

  return "success";
}

function isSupportedMimeType(
  kind: ProfileDocumentExtractionKind,
  mimeType?: string,
): boolean {
  // 未提供 mimeType 时允许走 demo 成功路径；提供后必须命中对应白名单。
  if (!mimeType) {
    return true;
  }

  const normalizedMimeType = mimeType.trim().toLowerCase();

  return kind === "resume"
    ? resumeMimeTypes.has(normalizedMimeType)
    : businessCardMimeTypes.has(normalizedMimeType);
}

function resolveScenario(
  kind: ProfileDocumentExtractionKind,
  input: ProfileDocumentExtractionInput = {},
): ProfileDocumentExtractionScenario {
  // 显式 scenario 优先；否则根据 mimeType/text/fileName 推导 mock 状态。
  const scenario = normalizeScenario(input.scenario);

  if (scenario !== "success") {
    return scenario;
  }

  if (!isSupportedMimeType(kind, input.mimeType)) {
    return "unsupported-type";
  }

  if (input.text !== undefined && input.text.trim().length === 0) {
    return "empty";
  }

  if (input.fileName?.toLowerCase().includes("review")) {
    return "pending";
  }

  return "success";
}

function extractByScenario(
  kind: ProfileDocumentExtractionKind,
  input: ProfileDocumentExtractionInput = {},
): ProfileDocumentExtractionResult {
  // 不同 kind 共享同一套场景判断，只在 success fixture 上区分 resume/business-card。
  switch (resolveScenario(kind, input)) {
    case "empty":
      return success({
        ...mockEmptyResumeExtractionFixture,
        kind,
      });
    case "pending":
      return success({
        ...mockPendingBusinessCardExtractionFixture,
        kind,
      });
    case "required":
      return failure("PROFILE_DOCUMENT_REQUIRED", kind);
    case "unsupported-type":
      return failure("PROFILE_DOCUMENT_UNSUPPORTED_TYPE", kind);
    case "failure":
      return failure("PROFILE_DOCUMENT_EXTRACTION_FAILED", kind);
    case "success":
    default:
      return success(
        kind === "resume"
          ? mockResumeExtractionFixture
          : mockBusinessCardExtractionFixture,
      );
  }
}

export function createMockProfileDocumentExtractionService(): ProfileDocumentExtractionService {
  return {
    extractResumeDraft(input) {
      // 简历抽取返回 profile 更新草稿，不直接修改 profile。
      return extractByScenario("resume", input);
    },

    extractBusinessCardDraft(input) {
      // 名片抽取返回 profile 更新草稿，不直接修改 profile。
      return extractByScenario("business-card", input);
    },
  };
}

export function profileDocumentExtractionFailureToAppError(
  result: ProfileDocumentExtractionFailure,
): AppError {
  return new AppError(result.error.appCode, result.error.message);
}

export function profileDocumentExtractionFailureContext(
  result: ProfileDocumentExtractionFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    documentKind: result.error.kind,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    profileDocumentExtractionErrorCode: result.error.code,
    provenance:
      "Mock profile document extraction failure came from deterministic fixture rules.",
    service: "profile-document-extraction-mock",
  };
}
