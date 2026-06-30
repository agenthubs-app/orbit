/**
 * Agent 自主级别设置的 mock 服务。
 *
 * 这里模拟“读取当前自主级别”和“请求更新自主级别”两个动作。
 * 更新只返回 fixture 化结果，不持久化写入真实设置；因此适合 UI、API contract
 * 和权限边界测试。
 */
import {
  AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS,
  type AgentAutonomyLevel,
  type AgentAutonomySettingsErrorCode,
  type AgentAutonomySettingsFailure,
  type AgentAutonomySettingsInput,
  type AgentAutonomySettingsPayload,
  type AgentAutonomySettingsResult,
  type AgentAutonomySettingsScenario,
  type AgentAutonomySettingsService,
  type AgentAutonomySettingsUpdateInput,
  type AgentAutonomySettingsUpdatePayload,
  type AgentAutonomySettingsUpdateResult,
  mockAgentAutonomySettingsFailureProvenance,
  mockAgentAutonomySettingsFixture,
  mockEmptyAgentAutonomySettingsFixture,
  mockPendingAgentAutonomySettingsFixture,
  mockUpdatedHighAgentAutonomySettingsFixture,
  mockUpdatedLowAgentAutonomySettingsFixture,
  mockUpdatedMediumAgentAutonomySettingsFixture,
} from "./settings-contract";

const supportedScenarios = new Set<AgentAutonomySettingsScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedLevels = new Set<AgentAutonomyLevel>([
  "low",
  "medium",
  "high",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 防止调用方持有 fixture 引用后修改全局 mock 数据。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function settingsSuccess(
  data: AgentAutonomySettingsPayload,
): AgentAutonomySettingsResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function updateSuccess(
  data: AgentAutonomySettingsUpdatePayload,
): AgentAutonomySettingsUpdateResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: AgentAutonomySettingsErrorCode,
): AgentAutonomySettingsFailure {
  // 所有错误从 contract 定义生成，避免 mock 和真实服务使用不同错误结构。
  const definition = AGENT_AUTONOMY_SETTINGS_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockAgentAutonomySettingsFailureProvenance,
      evidenceIds: mockAgentAutonomySettingsFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | AgentAutonomySettingsInput["scenario"]
    | AgentAutonomySettingsUpdateInput["scenario"],
): AgentAutonomySettingsScenario {
  // 只接受声明过的 scenario；测试没有指定时默认返回 success fixture。
  if (
    scenario &&
    supportedScenarios.has(scenario as AgentAutonomySettingsScenario)
  ) {
    return scenario as AgentAutonomySettingsScenario;
  }

  return "success";
}

function isAutonomyLevel(value: unknown): value is AgentAutonomyLevel {
  // updateSettings 的输入可能来自 JSON body，需要运行时再做白名单校验。
  return (
    typeof value === "string" &&
    supportedLevels.has(value as AgentAutonomyLevel)
  );
}

function getSettingsResult(
  input: AgentAutonomySettingsInput,
): AgentAutonomySettingsResult {
  // get 路径只受 scenario 控制，不根据用户身份或远程配置读取真实状态。
  const scenario = normalizeScenario(input.scenario);

  switch (scenario) {
    case "empty":
      return settingsSuccess(mockEmptyAgentAutonomySettingsFixture);
    case "pending":
      return settingsSuccess(mockPendingAgentAutonomySettingsFixture);
    case "failure":
      return failure("AGENT_AUTONOMY_SETTINGS_MOCK_FAILED");
    case "success":
    default:
      return settingsSuccess(mockAgentAutonomySettingsFixture);
  }
}

function updateFixtureForLevel(
  level: AgentAutonomyLevel,
): AgentAutonomySettingsUpdatePayload {
  // 不同 level 使用不同 fixture，方便 UI 验证低/中/高三种文案和风险说明。
  switch (level) {
    case "low":
      return mockUpdatedLowAgentAutonomySettingsFixture;
    case "high":
      return mockUpdatedHighAgentAutonomySettingsFixture;
    case "medium":
    default:
      return mockUpdatedMediumAgentAutonomySettingsFixture;
  }
}

function updateSettingsResult(
  input: AgentAutonomySettingsUpdateInput,
): AgentAutonomySettingsUpdateResult {
  // 更新路径先处理受控失败，再校验目标 level，最后返回对应 mock payload。
  const scenario = normalizeScenario(input.scenario);

  if (scenario === "failure") {
    return failure("AGENT_AUTONOMY_SETTINGS_MOCK_FAILED");
  }

  if (!isAutonomyLevel(input.requestedLevel)) {
    return failure("AGENT_AUTONOMY_SETTINGS_INVALID_LEVEL");
  }

  const base = updateFixtureForLevel(input.requestedLevel);

  return updateSuccess({
    ...base,
    actorLabel: input.actorLabel?.trim() || base.actorLabel,
  });
}

export function createMockAgentAutonomySettingsService(): AgentAutonomySettingsService {
  // factory 返回 contract 约定的两个方法，供 API route 或页面服务工厂注入。
  return {
    getSettings(input = {}): AgentAutonomySettingsResult {
      return getSettingsResult(input);
    },

    updateSettings(input): AgentAutonomySettingsUpdateResult {
      return updateSettingsResult(input);
    },
  };
}

export type {
  AgentAutonomySettingsInput,
  AgentAutonomySettingsResult,
  AgentAutonomySettingsService,
  AgentAutonomySettingsUpdateInput,
  AgentAutonomySettingsUpdateResult,
};
