import {
  FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS,
  type FollowupTask,
  type FollowupTaskGenerationErrorCode,
  type FollowupTaskGenerationFailure,
  type FollowupTaskGenerationGenerateInput,
  type FollowupTaskGenerationListInput,
  type FollowupTaskGenerationPayload,
  type FollowupTaskGenerationProvenance,
  type FollowupTaskGenerationResult,
  type FollowupTaskGenerationScenario,
  type FollowupTaskTrigger,
  type FollowupTaskTriggerKind,
} from "./contract";
import {
  mockEmptyFollowupTaskGenerationFixture,
  mockFollowupTaskGenerationCategories,
  mockFollowupTaskGenerationFailureProvenance,
  mockFollowupTaskGenerationFixture,
  mockFollowupTaskGenerationProvenance,
  mockFollowupTasks,
  mockFollowupTaskTriggers,
  mockPendingFollowupTaskGenerationFixture,
} from "./fixtures";
import type { FollowupTaskGenerationService } from "./service";

// FollowupTaskGeneration mock service 把关系触发器派生成跟进任务。
// 它不创建真实任务、不启动调度器，也不调用模型判断优先级。
const supportedScenarios = new Set<FollowupTaskGenerationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  // 跟进任务和 trigger fixture 会被列表/生成两条 API 复用，返回 clone 保持源数据只读。
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(
  data: FollowupTaskGenerationPayload,
): FollowupTaskGenerationResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: FollowupTaskGenerationErrorCode,
): FollowupTaskGenerationFailure {
  // 失败 provenance 说明这是 mock task generator 的本地错误，不是后台 job 失败。
  const definition = FOLLOWUP_TASK_GENERATION_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockFollowupTaskGenerationFailureProvenance,
      evidenceIds: mockFollowupTaskGenerationFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | FollowupTaskGenerationListInput["scenario"]
    | FollowupTaskGenerationGenerateInput["scenario"],
): FollowupTaskGenerationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as FollowupTaskGenerationScenario)
  ) {
    return scenario as FollowupTaskGenerationScenario;
  }

  return "success";
}

function normalizedLimit(limit?: number | null): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

function isTriggerKind(value: unknown): value is FollowupTaskTriggerKind {
  return (
    typeof value === "string" &&
    mockFollowupTaskGenerationCategories.includes(
      value as FollowupTaskTriggerKind,
    )
  );
}

function triggerKindsForInput(
  input: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput,
): readonly FollowupTaskTriggerKind[] | null {
  // list 支持 triggerKinds 数组，generate 支持单个 triggerKind；这里统一为数组过滤条件。
  if ("triggerKinds" in input && Array.isArray(input.triggerKinds)) {
    const kinds = input.triggerKinds.filter(isTriggerKind);

    return kinds.length > 0 ? kinds : null;
  }

  if ("triggerKind" in input && isTriggerKind(input.triggerKind)) {
    return [input.triggerKind];
  }

  return null;
}

function connectionIdForInput(
  input: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput,
): string | null {
  if (!("connectionId" in input)) {
    return null;
  }

  return input.connectionId?.trim() || null;
}

function selectedTasks(
  input: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput,
): readonly FollowupTask[] {
  // 任务选择只按 trigger kind、connectionId 和 limit 派生，不改动 mockFollowupTasks。
  const kinds = triggerKindsForInput(input);
  const connectionId = connectionIdForInput(input);
  const limit = normalizedLimit(input.limit);
  const tasks = mockFollowupTasks.filter((task) => {
    const matchesKind = !kinds || kinds.includes(task.triggerKind);
    const matchesConnection = !connectionId || task.connectionId === connectionId;

    return matchesKind && matchesConnection;
  });

  if (limit === null) {
    return tasks;
  }

  return tasks.slice(0, limit);
}

function selectedTriggers(tasks: readonly FollowupTask[]): readonly FollowupTaskTrigger[] {
  // 返回的 triggers 只保留与当前 tasks 匹配的来源触发器，方便 UI 显示为什么生成任务。
  const taskIds = new Set(tasks.map((task) => task.connectionId));
  const kinds = new Set(tasks.map((task) => task.triggerKind));

  return mockFollowupTaskTriggers.filter(
    (trigger) => taskIds.has(trigger.connectionId) && kinds.has(trigger.kind),
  );
}

function uniqueEvidenceIds(
  tasks: readonly FollowupTask[],
): readonly string[] {
  if (tasks.length === 0) {
    return ["evidence:followup-empty"];
  }

  return [...new Set(tasks.flatMap((task) => task.evidenceIds))];
}

function provenanceForTasks(input: {
  tasks: readonly FollowupTask[];
  sourceLabel: string;
  generationMethod: FollowupTaskGenerationProvenance["generationMethod"];
}): FollowupTaskGenerationProvenance {
  return {
    ...mockFollowupTaskGenerationProvenance,
    evidenceIds: uniqueEvidenceIds(input.tasks),
    sourceLabel: input.sourceLabel,
    generationMethod: input.generationMethod,
  };
}

function buildPayload(
  input: FollowupTaskGenerationListInput | FollowupTaskGenerationGenerateInput,
  sourceLabel: string,
): FollowupTaskGenerationPayload {
  // payload 把任务、触发器、summary 和 provenance 绑定在一起，确保每个任务都有来源证据。
  const tasks = selectedTasks(input);
  const triggers = selectedTriggers(tasks);
  const hasTasks = tasks.length > 0;

  return {
    ...mockFollowupTaskGenerationFixture,
    state: hasTasks ? "success" : "empty",
    triggers,
    tasks,
    summary: hasTasks
      ? "Local rules generated followup tasks from relationship triggers without schedulers, task persistence, or model work."
      : "The local followup task rule produced no eligible relationship tasks.",
    provenance: provenanceForTasks({
      tasks,
      sourceLabel,
      generationMethod: "rule-based-task-generation",
    }),
    nextAction: hasTasks
      ? "Review each task's evidence before any message draft, reminder, or external action is created."
      : "Create a local relationship trigger before generating followup tasks.",
  };
}

function scenarioResult(
  scenario: FollowupTaskGenerationScenario,
): FollowupTaskGenerationResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyFollowupTaskGenerationFixture);
    case "pending":
      return success(mockPendingFollowupTaskGenerationFixture);
    case "failure":
      return failure("FOLLOWUP_TASK_GENERATION_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

export function createMockFollowupTaskGenerationService(): FollowupTaskGenerationService {
  // listTasks 和 generateTasks 共用同一套规则；sourceLabel 用于区分是查看还是生成动作。
  return {
    listTasks(input = {}): FollowupTaskGenerationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(buildPayload(input, "Mock followup task list rule"));
    },

    generateTasks(input = {}): FollowupTaskGenerationResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return success(
        buildPayload(input, "Mock followup task generation rule"),
      );
    },
  };
}

export type { FollowupTaskGenerationResult };
