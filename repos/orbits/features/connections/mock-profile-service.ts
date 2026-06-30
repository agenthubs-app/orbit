/**
 * 关系阶段与关系画像的 mock 服务。
 *
 * 这个文件模拟联系人关系的“阶段更新”和“画像更新”流程。
 * 它只接受 demo connection，所有输出都基于本地 fixture 和显式输入计算，
 * 不调用模型、不读写数据库，也不触发外部副作用。
 */
import { RUNTIME_BOUNDARY_HEADER_VALUES, type ApiErrorContext } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import {
  isRelationshipStage,
  isRelationshipValueType,
  type RelationshipStage,
  type RelationshipValueType,
} from "../../shared/domain/source-types";
import { AppError } from "../../shared/errors/app-error";
import {
  RELATIONSHIP_PROFILE_ERROR_DEFINITIONS,
  RELATIONSHIP_PROFILE_TYPES,
  type RelationshipMutualValue,
  type RelationshipNextAction,
  type RelationshipProfileErrorCode,
  type RelationshipProfileFailure,
  type RelationshipProfileFailureForCode,
  type RelationshipProfileInvalidBodyFailure,
  type RelationshipProfileMutualValueInput,
  type RelationshipProfileNextActionInput,
  type RelationshipProfilePayload,
  type RelationshipProfileResult,
  type RelationshipProfileScenario,
  type RelationshipProfileType,
  type RelationshipProfileUpdateInput,
  type RelationshipStageAndProfileService,
  type RelationshipStageUpdateInput,
} from "./profile-contract";
import {
  mockEmptyRelationshipProfileFixture,
  mockPendingRelationshipProfileFixture,
  mockRelationshipProfileFailureProvenance,
  mockRelationshipProfileRecord,
  mockRelationshipProfileUpdateFixture,
  mockRelationshipStageUpdateFixture,
} from "./profile-fixtures";

const supportedScenarios = new Set<RelationshipProfileScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);
const supportedProfileTypes = new Set<RelationshipProfileType>(
  RELATIONSHIP_PROFILE_TYPES,
);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 返回独立 payload，避免测试之间共享可变 fixture 引用。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function successPayload(
  payload: RelationshipProfilePayload,
): RelationshipProfileResult {
  return {
    success: true,
    data: clonePayload(payload),
  };
}

function failure<TCode extends RelationshipProfileErrorCode>(
  code: TCode,
): RelationshipProfileFailureForCode<TCode> {
  // 泛型返回值让调用方保留具体错误码对应的错误类型。
  const definition = RELATIONSHIP_PROFILE_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockRelationshipProfileFailureProvenance,
      evidenceIds: mockRelationshipProfileFailureProvenance.evidenceIds,
    },
  } as RelationshipProfileFailureForCode<TCode>;
}

function normalizeScenario(
  scenario?: RelationshipStageUpdateInput["scenario"],
): RelationshipProfileScenario {
  // scenario 用于锁定 UI 状态；未声明值不会进入新分支。
  if (
    scenario &&
    supportedScenarios.has(scenario as RelationshipProfileScenario)
  ) {
    return scenario as RelationshipProfileScenario;
  }

  return "success";
}

function scenarioResult(
  scenario: RelationshipProfileScenario,
): RelationshipProfileResult | null {
  // success 返回 null，表示继续执行真实 mock 规则；其它 scenario 直接返回固定状态。
  switch (scenario) {
    case "empty":
      return successPayload(mockEmptyRelationshipProfileFixture);
    case "pending":
      return successPayload(mockPendingRelationshipProfileFixture);
    case "failure":
      return failure("RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function isDemoConnection(connectionId: string): boolean {
  // 当前 fixture 只定义一个 demo connection，非 demo id 一律模拟 not found。
  return connectionId.trim() === "demo-connection-1";
}

function normalizeProfileType(
  relationshipType?: RelationshipProfileUpdateInput["relationshipType"],
): RelationshipProfileType {
  // relationshipType 来自请求体，必须回到 contract 白名单后才能写入 payload。
  const normalized = relationshipType?.trim();

  if (
    normalized &&
    supportedProfileTypes.has(normalized as RelationshipProfileType)
  ) {
    return normalized as RelationshipProfileType;
  }

  return "customer_candidate";
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();

  return normalized && normalized.length > 0 ? normalized : fallback;
}

function normalizeValueTypes(
  valueTypes: RelationshipProfileMutualValueInput["valueTypes"] | undefined,
): readonly RelationshipValueType[] {
  // 过滤不认识的 mutual value 类型；如果全部无效，保留 fixture 默认值。
  if (!valueTypes || valueTypes.length === 0) {
    return mockRelationshipProfileRecord.mutualValue.valueTypes;
  }

  const filtered = valueTypes.filter(isRelationshipValueType);

  return filtered.length > 0
    ? filtered
    : mockRelationshipProfileRecord.mutualValue.valueTypes;
}

function normalizeMutualValue(
  input?: RelationshipProfileMutualValueInput | null,
): RelationshipMutualValue {
  const fallback = mockRelationshipProfileRecord.mutualValue;

  return {
    contactReceives: normalizeText(
      input?.contactReceives,
      fallback.contactReceives,
    ),
    orbitUserReceives: normalizeText(
      input?.orbitUserReceives,
      fallback.orbitUserReceives,
    ),
    valueTypes: normalizeValueTypes(input?.valueTypes),
  };
}

function normalizeNextAction(
  input?: RelationshipProfileNextActionInput | null,
): RelationshipNextAction {
  const fallback = mockRelationshipProfileRecord.nextAction;

  return {
    label: normalizeText(input?.label, fallback.label),
    rationale: normalizeText(input?.rationale, fallback.rationale),
    dueAt: normalizeText(input?.dueAt, fallback.dueAt ?? ""),
  };
}

function buildStagePayload(stage: RelationshipStage): RelationshipProfilePayload {
  // 默认 stage 直接复用标准 fixture；其它合法 stage 动态改写摘要，便于测试差异。
  if (stage === mockRelationshipStageUpdateFixture.profile?.relationshipStage) {
    return mockRelationshipStageUpdateFixture;
  }

  const profile = {
    ...mockRelationshipProfileRecord,
    relationshipStage: stage,
    latestSummary: {
      ...mockRelationshipProfileRecord.latestSummary,
      text: `Kenji moved to ${stage} through deterministic relationship profile rules backed by local evidence.`,
    },
  };

  return {
    ...mockRelationshipStageUpdateFixture,
    profile,
    updateSummary: `Relationship stage ${stage} was calculated from local fixture evidence without provider calls.`,
  };
}

function buildProfilePayload(
  input: RelationshipProfileUpdateInput,
): RelationshipProfilePayload {
  // 画像更新由显式输入覆盖 fixture 字段，未提供或空白字段保留默认值。
  const relationshipType = normalizeProfileType(input.relationshipType);
  const context = normalizeText(
    input.context,
    mockRelationshipProfileRecord.context,
  );
  const mutualValue = normalizeMutualValue(input.mutualValue);
  const nextAction = normalizeNextAction(input.nextAction);

  if (
    relationshipType === "customer_candidate" &&
    context === mockRelationshipProfileRecord.context &&
    mutualValue.contactReceives ===
      mockRelationshipProfileRecord.mutualValue.contactReceives &&
    mutualValue.orbitUserReceives ===
      mockRelationshipProfileRecord.mutualValue.orbitUserReceives &&
    nextAction.label === mockRelationshipProfileRecord.nextAction.label &&
    nextAction.rationale === mockRelationshipProfileRecord.nextAction.rationale
  ) {
    return mockRelationshipProfileUpdateFixture;
  }

  return {
    ...mockRelationshipProfileUpdateFixture,
    profile: {
      ...mockRelationshipProfileRecord,
      relationshipType,
      context,
      mutualValue,
      nextAction,
      latestSummary: {
        ...mockRelationshipProfileRecord.latestSummary,
        text: `${mockRelationshipProfileRecord.displayName} is profiled as ${relationshipType} from local evidence and explicit context.`,
      },
    },
    updateSummary: `Relationship profile ${relationshipType} was calculated from local fixture evidence without provider calls.`,
  };
}

function invalidBodyFailure(): RelationshipProfileInvalidBodyFailure {
  return failure("RELATIONSHIP_PROFILE_INVALID_BODY");
}

export function relationshipProfileFailureToAppError(
  profileFailure: RelationshipProfileFailure,
): AppError {
  // API route 使用统一 AppError，不直接暴露 feature contract 的错误对象。
  return new AppError(
    profileFailure.error.appCode,
    profileFailure.error.message,
  );
}

export function relationshipProfileFailureContext(
  profileFailure: RelationshipProfileFailure,
  mode: FeatureMode,
): ApiErrorContext {
  // 失败上下文会被 envelope 带到响应头/响应体，帮助定位 mock 边界来源。
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Mock relationship profile failure came from deterministic fixture rules.",
    relationshipProfileErrorCode: profileFailure.error.code,
    service: "relationship-stage-and-profile-mock",
  };
}

export function createMockRelationshipStageAndProfileService(): RelationshipStageAndProfileService {
  // service 方法先处理 scenario，再校验 demo connection，最后应用本地规则。
  return {
    updateStage(input: RelationshipStageUpdateInput): RelationshipProfileResult {
      const scenario = normalizeScenario(input.scenario);
      const scenarioPayload = scenarioResult(scenario);

      if (scenarioPayload) {
        return scenarioPayload;
      }

      if (!isDemoConnection(input.connectionId)) {
        return failure("RELATIONSHIP_PROFILE_NOT_FOUND");
      }

      const requestedStage = input.relationshipStage ?? "active";

      if (!isRelationshipStage(requestedStage)) {
        return failure("RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED");
      }

      return successPayload(buildStagePayload(requestedStage));
    },

    updateProfile(
      input: RelationshipProfileUpdateInput,
    ): RelationshipProfileResult {
      const scenario = normalizeScenario(input.scenario);
      const scenarioPayload = scenarioResult(scenario);

      if (scenarioPayload) {
        return scenarioPayload;
      }

      if (!isDemoConnection(input.connectionId)) {
        return failure("RELATIONSHIP_PROFILE_NOT_FOUND");
      }

      return successPayload(buildProfilePayload(input));
    },

    invalidRelationshipProfileBody(): RelationshipProfileInvalidBodyFailure {
      return invalidBodyFailure();
    },
  };
}
