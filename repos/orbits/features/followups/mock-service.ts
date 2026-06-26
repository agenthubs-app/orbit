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

const supportedScenarios = new Set<FollowupTaskGenerationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
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
