/**
 * App bootstrap 的 mock 服务。
 *
 * bootstrap 是应用启动时的聚合入口，会给 UI 提供用户、任务、权限等初始状态。
 * 这个实现只从 fixture 生成启动 payload，并支持 scenario 与 taskLimit，
 * 用来稳定测试空状态、加载中、失败和任务截断。
 */
import {
  APP_BOOTSTRAP_ERROR_DEFINITIONS,
  mockAppBootstrapFailureProvenance,
  mockAppBootstrapFixture,
  mockEmptyAppBootstrapFixture,
  mockPendingAppBootstrapFixture,
  type AppBootstrapErrorCode,
  type AppBootstrapFailure,
  type AppBootstrapInput,
  type AppBootstrapPayload,
  type AppBootstrapResult,
  type AppBootstrapScenario,
} from "./contract";
import type { AppBootstrapService } from "./service";

const supportedScenarios = new Set<AppBootstrapScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // bootstrap payload 会被页面拆开使用，返回 clone 可以保护全局 fixture。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(data: AppBootstrapPayload): AppBootstrapResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(code: AppBootstrapErrorCode): AppBootstrapFailure {
  // mock 层不自行拼错误文本，全部复用 contract 的错误定义。
  const definition = APP_BOOTSTRAP_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockAppBootstrapFailureProvenance,
      evidenceIds: mockAppBootstrapFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: AppBootstrapInput["scenario"],
): AppBootstrapScenario {
  // 未知 scenario 回到 success，保证 API query 参数不会创建未定义状态。
  if (scenario && supportedScenarios.has(scenario as AppBootstrapScenario)) {
    return scenario as AppBootstrapScenario;
  }

  return "success";
}

function normalizedTaskLimit(limit?: number | null): number | null {
  // taskLimit 是可选开发/测试开关；无效值表示不截断。
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function scenarioResult(
  scenario: AppBootstrapScenario,
): AppBootstrapResult | null {
  // success 返回 null 表示继续走正常 bootstrap fixture；其它 scenario 直接短路。
  switch (scenario) {
    case "empty":
      return success(mockEmptyAppBootstrapFixture);
    case "pending":
      return success(mockPendingAppBootstrapFixture);
    case "failure":
      return failure("APP_BOOTSTRAP_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function applyTaskLimit(
  payload: AppBootstrapPayload,
  taskLimit?: number | null,
): AppBootstrapPayload {
  // 截断任务列表时同步改 provenance，方便调试层知道结果来自本地规则。
  const limit = normalizedTaskLimit(taskLimit);

  if (limit === null) {
    return payload;
  }

  return {
    ...payload,
    pendingTasks: payload.pendingTasks.slice(0, limit),
    provenance: {
      ...payload.provenance,
      sourceLabel: "Mock app bootstrap task limit rule",
      generationMethod: "rule-based-task-limit",
    },
  };
}

export function createMockAppBootstrapService(): AppBootstrapService {
  // 应用启动页只依赖这个 service contract，不需要感知背后是 mock 还是真实实现。
  return {
    getAppBootstrap(input = {}): AppBootstrapResult {
      const result = scenarioResult(normalizeScenario(input.scenario));

      if (result) {
        return result;
      }

      return success(applyTaskLimit(mockAppBootstrapFixture, input.taskLimit));
    },
  };
}

export type {
  AppBootstrapResult,
  AppBootstrapService,
};
