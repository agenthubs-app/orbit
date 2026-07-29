import type {
  AgentActionOperationPayload,
  AgentActionRecord,
  AgentAnalyticsEventName,
  AgentExecutionReceipt,
  AgentOutboxEvent,
  AgentRun,
  AgentRunDetail,
  AgentRunProgress,
  AgentRunStep,
} from "./contract";
import type { AgentExecutorRegistry } from "./executor-registry";
import { stablePayloadHash } from "./hash";
import type { AgentRuntimeRepository } from "./repository";

const MAX_OUTBOX_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;

export interface AgentActionProposalInput
  extends Omit<
    AgentActionRecord,
    | "status"
    | "immutablePayloadHash"
    | "createdAt"
    | "updatedAt"
    | "approvedAt"
    | "executingAt"
    | "completedAt"
    | "failedAt"
    | "rejectedAt"
    | "canceledAt"
    | "deferredAt"
    | "undoneAt"
    | "approvedBy"
  > {
  createdAt?: string;
}

export interface AgentRuntimeService {
  createRun: (input: {
    runId: string;
    workflowKey: string;
    workflowVersion?: number;
    conversationId?: string;
    trigger: AgentRun["trigger"];
    createdAt?: string;
  }) => Promise<AgentRun>;
  addRunStep: (
    step: Omit<AgentRunStep, "createdAt" | "updatedAt"> & {
      createdAt?: string;
    },
  ) => Promise<AgentRunStep>;
  updateRunStep: (input: {
    runId: string;
    stepId: string;
    status: AgentRunStep["status"];
    inputRef?: string;
    outputRef?: string;
    error?: AgentRunStep["error"];
  }) => Promise<AgentRunStep>;
  updateRunStatus: (
    runId: string,
    status: AgentRun["status"],
    error?: AgentRun["error"],
  ) => Promise<AgentRun>;
  cancelRun: (runId: string) => Promise<AgentRunDetail>;
  proposeAction: (input: AgentActionProposalInput) => Promise<AgentActionRecord>;
  approveAction: (input: {
    actionId: string;
    actorLabel: string;
    selectedOperationIds?: readonly string[];
  }) => Promise<AgentActionRecord>;
  deferAction: (actionId: string) => Promise<AgentActionRecord>;
  rejectAction: (actionId: string) => Promise<AgentActionRecord>;
  cancelAction: (actionId: string) => Promise<AgentActionRecord>;
  retryAction: (actionId: string) => Promise<AgentActionRecord>;
  updateDraft: (input: {
    actionId: string;
    operationId: string;
    draftText: string;
    field?: "draftText" | "goal" | "title" | "dueAt";
  }) => Promise<AgentActionRecord>;
  undoAction: (actionId: string) => Promise<AgentActionRecord>;
  markActionViewed: (actionId: string) => Promise<AgentActionRecord>;
  recordAnalytics: (
    name: AgentAnalyticsEventName,
    input: {
      runId?: string;
      actionId?: string;
      workflowKey?: string;
      metadata?: Record<string, string | number | boolean | null>;
    },
  ) => Promise<void>;
  getRun: (runId: string) => Promise<AgentRunDetail | null>;
  listActions: AgentRuntimeRepository["listActions"];
  processOutbox: (input?: {
    actionId?: string;
    limit?: number;
    workerId?: string;
  }) => Promise<{
    processed: number;
    completed: number;
    failed: number;
    deadLettered: number;
  }>;
}

const TERMINAL_RUN_STATUSES = new Set<AgentRun["status"]>([
  "completed",
  "failed",
  "canceled",
]);

const FINISHED_STEP_STATUSES = new Set<AgentRunStep["status"]>([
  "completed",
  "failed",
  "canceled",
  "skipped",
]);

export function agentRunProgress(detail: AgentRunDetail): AgentRunProgress {
  const completedSteps = detail.steps.filter(
    (step) => step.status === "completed" || step.status === "skipped",
  ).length;
  const failedSteps = detail.steps.filter(
    (step) => step.status === "failed",
  ).length;
  const totalSteps = detail.steps.length;
  const activeStep =
    detail.steps.find((step) => step.status === "running") ??
    detail.steps.find((step) => step.status === "waiting") ??
    detail.steps.find((step) => step.status === "queued");

  return {
    activeStepId: activeStep?.stepId,
    canCancel: !TERMINAL_RUN_STATUSES.has(detail.run.status),
    canRetry:
      (detail.run.status === "failed" ||
        detail.run.status === "canceled") &&
      detail.steps.some(
        (step) => step.status === "failed" || step.status === "canceled",
      ),
    completedSteps,
    failedSteps,
    percent:
      totalSteps === 0
        ? detail.run.status === "completed"
          ? 100
          : 0
        : Math.round((completedSteps / totalSteps) * 100),
    totalSteps,
  };
}

function orderedRunDetail(detail: AgentRunDetail): AgentRunDetail {
  return {
    ...detail,
    steps: [...detail.steps].sort(
      (left, right) =>
        (left.sequence ?? Number.MAX_SAFE_INTEGER) -
          (right.sequence ?? Number.MAX_SAFE_INTEGER) ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.stepId.localeCompare(right.stepId),
    ),
  };
}

export interface AgentRuntimeServiceOptions {
  executors: AgentExecutorRegistry;
  id?: () => string;
  now?: () => string;
  repository: AgentRuntimeRepository;
}

function immutablePayloadFor(action: {
  operations: readonly AgentActionOperationPayload[];
  payloadVersion: number;
}): unknown {
  return {
    payloadVersion: action.payloadVersion,
    operations: action.operations.map((operation) => ({
      executorKey: operation.executorKey,
      idempotencyKey: operation.idempotencyKey,
      operationId: operation.operationId,
      payload: operation.payload,
      payloadVersion: operation.payloadVersion,
      riskLevel: operation.riskLevel,
    })),
  };
}

function assertStatus(
  action: AgentActionRecord,
  allowed: readonly AgentActionRecord["status"][],
): void {
  if (!allowed.includes(action.status)) {
    throw new Error(
      `Agent action ${action.actionId} cannot transition from ${action.status}.`,
    );
  }
}

function retryDelayMs(attempt: number): number {
  return Math.min(
    INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    MAX_RETRY_DELAY_MS,
  );
}

function aggregateActionStatus(
  outbox: readonly AgentOutboxEvent[],
  selectedOperationIds: readonly string[],
): AgentActionRecord["status"] {
  const selected = new Set(selectedOperationIds);
  const relevant = outbox.filter((event) => selected.has(event.operationId));
  const completed = relevant.filter(
    (event) => event.status === "completed",
  ).length;
  const failed = relevant.filter(
    (event) => event.status === "dead_letter",
  ).length;
  const operationCount = selected.size;

  if (completed >= operationCount && failed === 0) return "completed";
  if (completed > 0 && completed + failed >= operationCount) {
    return "partially_failed";
  }
  return failed >= operationCount ? "failed" : "executing";
}

export function createAgentRuntimeService({
  executors,
  id = () => crypto.randomUUID(),
  now = () => new Date().toISOString(),
  repository,
}: AgentRuntimeServiceOptions): AgentRuntimeService {
  async function analytics(
    name: AgentAnalyticsEventName,
    input: {
      runId?: string;
      actionId?: string;
      workflowKey?: string;
      metadata?: Record<string, string | number | boolean | null>;
    },
  ): Promise<void> {
    const occurredAt = now();
    await repository.saveAnalyticsEvent({
      eventId: `analytics:${id()}`,
      name,
      occurredAt,
      runId: input.runId,
      actionId: input.actionId,
      workflowKey: input.workflowKey,
      metadata: input.metadata ?? {},
    });
  }

  async function requireAction(actionId: string): Promise<AgentActionRecord> {
    const action = await repository.getAction(actionId);
    if (!action) throw new Error(`Agent action ${actionId} was not found.`);
    return action;
  }

  async function saveActionStatus(
    action: AgentActionRecord,
    status: AgentActionRecord["status"],
    timestampField:
      | "deferredAt"
      | "rejectedAt"
      | "canceledAt"
      | "undoneAt",
  ): Promise<AgentActionRecord> {
    const timestamp = now();
    const updated = {
      ...action,
      status,
      [timestampField]: timestamp,
      updatedAt: timestamp,
    };
    await repository.saveAction(updated);
    return updated;
  }

  async function cancelPendingOutbox(
    events: readonly AgentOutboxEvent[],
    timestamp: string,
  ): Promise<void> {
    for (const event of events) {
      if (
        event.status === "pending" ||
        event.status === "retry_scheduled"
      ) {
        await repository.saveOutbox({
          ...event,
          status: "canceled",
          updatedAt: timestamp,
        });
      }
    }
  }

  async function refreshRunStatus(runId: string): Promise<void> {
    const detail = await repository.getRun(runId);
    if (!detail || detail.actions.length === 0) return;
    const statuses = detail.actions.map((action) => action.status);
    const terminal = new Set<AgentActionRecord["status"]>([
      "completed",
      "partially_failed",
      "failed",
      "rejected",
      "canceled",
      "undone",
    ]);
    let status: AgentRun["status"];
    if (statuses.every((value) => terminal.has(value))) {
      status = statuses.some(
        (value) => value === "failed" || value === "partially_failed",
      )
        ? "failed"
        : "completed";
    } else if (
      statuses.some(
        (value) =>
          value === "awaiting_confirmation" || value === "deferred",
      )
    ) {
      status = "waiting_for_confirmation";
    } else {
      status = "running";
    }
    if (detail.run.status === status) return;
    const timestamp = now();
    await repository.saveRun({
      ...detail.run,
      status,
      completedAt:
        status === "completed" ? timestamp : detail.run.completedAt,
      failedAt: status === "failed" ? timestamp : detail.run.failedAt,
      error:
        status === "failed"
          ? {
              code: "AGENT_ACTION_FAILED",
              message: "One or more confirmed actions failed.",
              retryable: true,
            }
          : undefined,
      updatedAt: timestamp,
    });
    if (status === "completed") {
      await analytics("agent_run_completed", {
        runId,
        workflowKey: detail.run.workflowKey,
      });
    } else if (status === "failed") {
      await analytics("agent_run_failed", {
        runId,
        workflowKey: detail.run.workflowKey,
        metadata: { code: "AGENT_ACTION_FAILED" },
      });
    }
  }

  async function refreshActionStatus(
    actionId: string,
  ): Promise<AgentActionRecord> {
    const action = await requireAction(actionId);
    const detail = await repository.getRun(action.runId);
    if (!detail) return action;
    const selectedOperationIds =
      action.selectedOperationIds ??
      action.operations.map((operation) => operation.operationId);
    const nextStatus = aggregateActionStatus(
      detail.outbox.filter((event) => event.actionId === actionId),
      selectedOperationIds,
    );
    const updatedAt = now();
    const updated: AgentActionRecord = {
      ...action,
      status: nextStatus,
      completedAt:
        nextStatus === "completed" ? updatedAt : action.completedAt,
      failedAt:
        nextStatus === "failed" || nextStatus === "partially_failed"
          ? updatedAt
          : undefined,
      updatedAt,
    };
    await repository.saveAction(updated);

    if (action.status !== nextStatus && nextStatus === "completed") {
      await analytics("agent_action_completed", {
        runId: action.runId,
        actionId: action.actionId,
        workflowKey: action.workflowKey,
      });
      await analytics("relationship_work_completed", {
        runId: action.runId,
        actionId: action.actionId,
        workflowKey: action.workflowKey,
      });
    } else if (
      action.status !== nextStatus &&
      (nextStatus === "failed" || nextStatus === "partially_failed")
    ) {
      await analytics("agent_action_failed", {
        runId: action.runId,
        actionId: action.actionId,
        workflowKey: action.workflowKey,
      });
    }

    await refreshRunStatus(action.runId);
    return updated;
  }

  return {
    async createRun(input) {
      const existing = await repository.getRun(input.runId);
      if (existing) return existing.run;
      const timestamp = input.createdAt ?? now();
      const run: AgentRun = {
        runId: input.runId,
        workflowKey: input.workflowKey,
        workflowVersion: input.workflowVersion ?? 1,
        conversationId: input.conversationId,
        trigger: input.trigger,
        status: "running",
        actionIds: [],
        createdAt: timestamp,
        startedAt: timestamp,
        updatedAt: timestamp,
      };
      await repository.saveRun(run);
      await analytics("agent_run_started", {
        runId: run.runId,
        workflowKey: run.workflowKey,
      });
      return run;
    },
    async addRunStep(input) {
      const detail = await repository.getRun(input.runId);
      if (!detail) {
        throw new Error(`Agent run ${input.runId} was not found.`);
      }
      const timestamp = input.createdAt ?? now();
      const step: AgentRunStep = {
        ...input,
        createdAt: timestamp,
        sequence:
          input.sequence ??
          Math.max(0, ...detail.steps.map((item) => item.sequence ?? 0)) + 1,
        updatedAt: timestamp,
      };
      await repository.saveRunStep(step);
      return step;
    },
    async updateRunStep(input) {
      const detail = await repository.getRun(input.runId);
      if (!detail) {
        throw new Error(`Agent run ${input.runId} was not found.`);
      }
      if (detail.run.status === "canceled") {
        throw new Error(`Agent run ${input.runId} was canceled.`);
      }
      const existing = detail.steps.find(
        (step) => step.stepId === input.stepId,
      );
      if (!existing) {
        throw new Error(`Agent run step ${input.stepId} was not found.`);
      }
      if (
        FINISHED_STEP_STATUSES.has(existing.status) &&
        existing.status !== input.status
      ) {
        throw new Error(
          `Agent run step ${input.stepId} cannot transition from ${existing.status}.`,
        );
      }
      const timestamp = now();
      const step: AgentRunStep = {
        ...existing,
        error: input.error,
        inputRef: input.inputRef ?? existing.inputRef,
        outputRef: input.outputRef ?? existing.outputRef,
        startedAt:
          input.status === "running"
            ? existing.startedAt ?? timestamp
            : existing.startedAt,
        completedAt: FINISHED_STEP_STATUSES.has(input.status)
          ? timestamp
          : undefined,
        status: input.status,
        updatedAt: timestamp,
      };
      await repository.saveRunStep(step);

      const nextRun: AgentRun =
        input.status === "failed"
          ? {
              ...detail.run,
              currentStepId: step.stepId,
              error:
                input.error ?? {
                  code: "AGENT_RUN_STEP_FAILED",
                  message: `Step ${step.name} failed.`,
                  retryable: true,
                },
              failedAt: timestamp,
              status: "failed",
              updatedAt: timestamp,
            }
          : {
              ...detail.run,
              currentStepId: step.stepId,
              error: undefined,
              failedAt: undefined,
              status:
                input.status === "waiting"
                  ? step.kind === "confirmation"
                    ? "waiting_for_confirmation"
                    : "waiting_for_input"
                  : "running",
              updatedAt: timestamp,
            };
      await repository.saveRun(nextRun);
      if (input.status === "failed") {
        await analytics("agent_run_failed", {
          runId: nextRun.runId,
          workflowKey: nextRun.workflowKey,
          metadata: {
            code: nextRun.error?.code ?? "AGENT_RUN_STEP_FAILED",
            stepId: step.stepId,
          },
        });
      }
      return step;
    },
    async updateRunStatus(runId, status, error) {
      const detail = await repository.getRun(runId);
      if (!detail) throw new Error(`Agent run ${runId} was not found.`);
      const timestamp = now();
      const run: AgentRun = {
        ...detail.run,
        status,
        error,
        waitingAt:
          status === "waiting_for_input" ||
          status === "waiting_for_confirmation"
            ? timestamp
            : detail.run.waitingAt,
        completedAt:
          status === "completed" ? timestamp : detail.run.completedAt,
        failedAt: status === "failed" ? timestamp : detail.run.failedAt,
        canceledAt:
          status === "canceled" ? timestamp : detail.run.canceledAt,
        updatedAt: timestamp,
      };
      await repository.saveRun(run);
      if (status === "completed") {
        await analytics("agent_run_completed", {
          runId,
          workflowKey: run.workflowKey,
        });
      } else if (status === "failed") {
        await analytics("agent_run_failed", {
          runId,
          workflowKey: run.workflowKey,
          metadata: { code: error?.code ?? "UNKNOWN" },
        });
      }
      return run;
    },
    async cancelRun(runId) {
      const detail = await repository.getRun(runId);
      if (!detail) throw new Error(`Agent run ${runId} was not found.`);
      if (detail.run.status === "canceled") return detail;
      if (detail.run.status === "completed") {
        throw new Error(`Completed Agent run ${runId} cannot be canceled.`);
      }
      if (
        detail.actions.some(
          (action) =>
            action.status === "executing" ||
            action.status === "completed" ||
            action.status === "partially_failed",
        )
      ) {
        throw new Error(
          `Agent run ${runId} has executing or completed actions and cannot be canceled.`,
        );
      }
      const timestamp = now();
      for (const step of detail.steps) {
        if (!FINISHED_STEP_STATUSES.has(step.status)) {
          await repository.saveRunStep({
            ...step,
            completedAt: timestamp,
            status: "canceled",
            updatedAt: timestamp,
          });
        }
      }
      for (const action of detail.actions) {
        if (
          action.status === "awaiting_confirmation" ||
          action.status === "deferred" ||
          action.status === "approved"
        ) {
          await saveActionStatus(
            action,
            "canceled",
            "canceledAt",
          );
        }
      }
      await cancelPendingOutbox(detail.outbox, timestamp);
      await repository.saveRun({
        ...detail.run,
        canceledAt: timestamp,
        error: undefined,
        status: "canceled",
        updatedAt: timestamp,
      });
      return orderedRunDetail((await repository.getRun(runId))!);
    },
    async proposeAction(input) {
      const existingAction = await repository.getAction(input.actionId);
      if (existingAction) return existingAction;
      const timestamp = input.createdAt ?? now();
      const action: AgentActionRecord = {
        ...input,
        status: "awaiting_confirmation",
        createdAt: timestamp,
        updatedAt: timestamp,
        immutablePayloadHash: stablePayloadHash(immutablePayloadFor(input)),
      };
      const runDetail = await repository.getRun(input.runId);
      if (!runDetail) throw new Error(`Agent run ${input.runId} was not found.`);

      await repository.saveAction(action);
      await repository.saveRun({
        ...runDetail.run,
        actionIds: [...new Set([...runDetail.run.actionIds, action.actionId])],
        status: "waiting_for_confirmation",
        waitingAt: timestamp,
        updatedAt: timestamp,
      });
      await analytics("agent_action_proposed", {
        runId: action.runId,
        actionId: action.actionId,
        workflowKey: action.workflowKey,
        metadata: { riskLevel: action.riskLevel },
      });
      return action;
    },
    async approveAction(input) {
      const action = await requireAction(input.actionId);
      const requestedSelection = [
        ...new Set(
          input.selectedOperationIds?.length
            ? input.selectedOperationIds
            : action.operations.map((operation) => operation.operationId),
        ),
      ];
      if (
        action.status === "approved" ||
        action.status === "executing" ||
        action.status === "completed" ||
        action.status === "partially_failed" ||
        action.status === "failed"
      ) {
        const existingSelection =
          action.selectedOperationIds ??
          action.operations.map((operation) => operation.operationId);
        if (
          existingSelection.length !== requestedSelection.length ||
          existingSelection.some(
            (operationId) => !requestedSelection.includes(operationId),
          )
        ) {
          throw new Error(
            `Agent action ${action.actionId} was already approved with a different operation selection.`,
          );
        }
        return action;
      }
      assertStatus(action, ["awaiting_confirmation", "deferred"]);
      if (
        stablePayloadHash(immutablePayloadFor(action)) !==
        action.immutablePayloadHash
      ) {
        throw new Error(
          `Agent action ${action.actionId} payload changed after proposal.`,
        );
      }

      const selected = new Set(requestedSelection);
      const operations = action.operations.filter((operation) =>
        selected.has(operation.operationId),
      );
      if (
        operations.length === 0 ||
        operations.length !== selected.size
      ) {
        throw new Error("Approving an action requires one selected operation.");
      }

      const timestamp = now();
      const approved: AgentActionRecord = {
        ...action,
        selectedOperationIds: operations.map(
          (operation) => operation.operationId,
        ),
        approvedAt: timestamp,
        approvedBy: input.actorLabel.trim() || "Orbit user",
        status: "approved",
        updatedAt: timestamp,
      };
      const events = operations.map(
        (operation): AgentOutboxEvent => ({
          outboxId: `outbox:${action.actionId}:${operation.operationId}`,
          actionId: action.actionId,
          operationId: operation.operationId,
          runId: action.runId,
          executorKey: operation.executorKey,
          idempotencyKey: operation.idempotencyKey,
          payloadVersion: operation.payloadVersion,
          payload: operation.payload,
          compensation: operation.compensation,
          status: "pending",
          attempt: 0,
          maxAttempts: MAX_OUTBOX_ATTEMPTS,
          availableAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        }),
      );
      await repository.approveActionWithOutbox(approved, events);
      await analytics("agent_action_approved", {
        runId: action.runId,
        actionId: action.actionId,
        workflowKey: action.workflowKey,
        metadata: { operationCount: operations.length },
      });
      await refreshRunStatus(action.runId);
      return approved;
    },
    async deferAction(actionId) {
      const action = await requireAction(actionId);
      assertStatus(action, ["awaiting_confirmation"]);
      const updated = await saveActionStatus(
        action,
        "deferred",
        "deferredAt",
      );
      await analytics("today_item_snoozed", {
        runId: action.runId,
        actionId,
        workflowKey: action.workflowKey,
      });
      await refreshRunStatus(action.runId);
      return updated;
    },
    async rejectAction(actionId) {
      const action = await requireAction(actionId);
      assertStatus(action, ["awaiting_confirmation", "deferred"]);
      const updated = await saveActionStatus(
        action,
        "rejected",
        "rejectedAt",
      );
      await analytics("today_item_dismissed", {
        runId: action.runId,
        actionId,
        workflowKey: action.workflowKey,
      });
      await refreshRunStatus(action.runId);
      return updated;
    },
    async cancelAction(actionId) {
      const action = await requireAction(actionId);
      assertStatus(action, [
        "awaiting_confirmation",
        "deferred",
        "approved",
      ]);
      const detail = await repository.getRun(action.runId);
      const timestamp = now();
      await cancelPendingOutbox(
        detail?.outbox.filter((event) => event.actionId === actionId) ?? [],
        timestamp,
      );
      const updated = await saveActionStatus(
        action,
        "canceled",
        "canceledAt",
      );
      await refreshRunStatus(action.runId);
      return updated;
    },
    async retryAction(actionId) {
      const action = await requireAction(actionId);
      assertStatus(action, ["failed", "partially_failed"]);
      const detail = await repository.getRun(action.runId);
      if (!detail) throw new Error(`Agent run ${action.runId} was not found.`);
      const timestamp = now();
      const retryable = detail.outbox.filter(
        (event) =>
          event.actionId === actionId &&
          (event.status === "dead_letter" ||
            event.status === "retry_scheduled"),
      );
      if (retryable.length === 0) {
        throw new Error(`Agent action ${actionId} has no retryable operation.`);
      }
      for (const event of retryable) {
        await repository.saveOutbox({
          ...event,
          status: "pending",
          attempt: 0,
          availableAt: timestamp,
          lastError: undefined,
          leasedAt: undefined,
          leaseOwner: undefined,
          processedAt: undefined,
          updatedAt: timestamp,
        });
      }
      const updated: AgentActionRecord = {
        ...action,
        status: "approved",
        failedAt: undefined,
        updatedAt: timestamp,
      };
      await repository.saveAction(updated);
      await refreshRunStatus(action.runId);
      return updated;
    },
    async updateDraft(input) {
      const action = await requireAction(input.actionId);
      assertStatus(action, ["awaiting_confirmation", "deferred"]);
      const operationIndex = action.operations.findIndex(
        (operation) => operation.operationId === input.operationId,
      );
      if (operationIndex < 0) {
        throw new Error(
          `Operation ${input.operationId} is not an editable draft.`,
        );
      }
      const operation = action.operations[operationIndex];
      const inferredField =
        operation.operationType === "save_message_draft"
          ? "draftText"
          : operation.operationType === "save_event_goal"
            ? "goal"
            : undefined;
      const field = input.field ?? inferredField;
      const fieldIsEditable =
        (operation.operationType === "save_message_draft" &&
          field === "draftText") ||
        (operation.operationType === "save_event_goal" && field === "goal") ||
        ((operation.operationType === "create_followup_task" ||
          operation.operationType === "create_followup_reminder") &&
          (field === "title" || field === "dueAt"));
      if (!fieldIsEditable || !field) {
        throw new Error(
          `Operation ${input.operationId} is not editable through field ${input.field ?? "default"}.`,
        );
      }
      const draftText = input.draftText.trim();
      const taskDueDateCleared =
        operation.operationType === "create_followup_task" &&
        field === "dueAt" &&
        !draftText;
      if (!draftText && !taskDueDateCleared) {
        throw new Error("Editable draft text cannot be empty.");
      }
      if (field === "dueAt" && draftText && Number.isNaN(Date.parse(draftText))) {
        throw new Error("Editable due date must be a valid date.");
      }
      const value =
        field === "dueAt" && draftText
          ? new Date(draftText).toISOString()
          : taskDueDateCleared
            ? null
            : draftText;
      const payload = {
        ...operation.payload,
        [field]: value,
      };
      const operationPreview =
        operation.operationType === "create_followup_task"
          ? `创建「${String(payload.title ?? "跟进任务")}」任务${
              payload.dueAt ? `，截止 ${String(payload.dueAt)}` : ""
            }`
          : operation.operationType === "create_followup_reminder"
            ? `在 ${String(payload.dueAt)} 提醒「${String(payload.title)}」`
            : String(value);
      const operations = action.operations.map((operation, index) =>
        index === operationIndex
          ? {
              ...operation,
              payload,
              preview: operationPreview,
            }
          : operation,
      );
      const timestamp = now();
      const updated: AgentActionRecord = {
        ...action,
        operations,
        preview:
          operations.length === 1 ? operationPreview : action.preview,
        updatedAt: timestamp,
        immutablePayloadHash: stablePayloadHash(
          immutablePayloadFor({
            operations,
            payloadVersion: action.payloadVersion,
          }),
        ),
      };
      await repository.saveAction(updated);
      return updated;
    },
    async undoAction(actionId) {
      const action = await requireAction(actionId);
      if (action.status === "undone") return action;
      assertStatus(action, ["completed", "partially_failed"]);
      if (!action.compensation.supported) {
        throw new Error(`Agent action ${actionId} does not support undo.`);
      }
      const timestamp = now();
      for (const operation of action.operations) {
        if (!operation.compensation.supported) continue;
        await executors.compensate(operation, {
          actionId,
          runId: action.runId,
          operationId: operation.operationId,
          idempotencyKey: `undo:${operation.idempotencyKey}`,
          now: timestamp,
        });
        await repository.saveReceipt({
          receiptId: `receipt:undo:${operation.idempotencyKey}`,
          outboxId: `undo:${operation.operationId}`,
          actionId,
          operationId: operation.operationId,
          runId: action.runId,
          idempotencyKey: `undo:${operation.idempotencyKey}`,
          executorKey:
            operation.compensation.executorKey ?? operation.executorKey,
          status: "undone",
          resultSummary: "Compensation completed.",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      const updated = await saveActionStatus(action, "undone", "undoneAt");
      await analytics("agent_action_undone", {
        runId: action.runId,
        actionId,
        workflowKey: action.workflowKey,
      });
      await refreshRunStatus(action.runId);
      return updated;
    },
    async markActionViewed(actionId) {
      const action = await requireAction(actionId);
      if (action.viewedAt) return action;
      const timestamp = now();
      const updated = {
        ...action,
        viewedAt: timestamp,
        updatedAt: timestamp,
      };
      await repository.saveAction(updated);
      return updated;
    },
    recordAnalytics: analytics,
    async getRun(runId) {
      const detail = await repository.getRun(runId);
      return detail ? orderedRunDetail(detail) : null;
    },
    listActions: repository.listActions,
    async processOutbox(input = {}) {
      const timestamp = now();
      const requestedLimit = input.limit ?? 20;
      const events = await repository.claimReadyOutbox({
        now: timestamp,
        limit: requestedLimit,
        workerId: input.workerId ?? "agent-worker",
        actionId: input.actionId,
      });
      let completed = 0;
      let failed = 0;
      let deadLettered = 0;

      for (const event of events) {
        const action = await repository.getAction(event.actionId);
        if (!action) {
          await repository.saveOutbox({
            ...event,
            status: "canceled",
            processedAt: timestamp,
            lastError: "Agent action was not persisted.",
            updatedAt: timestamp,
          });
          continue;
        }
        if (
          action.status !== "approved" &&
          action.status !== "executing"
        ) {
          await repository.saveOutbox({
            ...event,
            status: "canceled",
            processedAt: timestamp,
            updatedAt: timestamp,
          });
          continue;
        }

        const existingReceipt =
          await repository.getReceiptByIdempotencyKey(event.idempotencyKey);
        if (existingReceipt) {
          await repository.saveOutbox({
            ...event,
            status: "completed",
            processedAt: timestamp,
            updatedAt: timestamp,
          });
          await refreshActionStatus(action.actionId);
          completed += 1;
          continue;
        }

        const operation = action.operations.find(
          (candidate) => candidate.operationId === event.operationId,
        );
        if (!operation) {
          await repository.saveOutbox({
            ...event,
            status: "dead_letter",
            processedAt: timestamp,
            lastError: `Outbox ${event.outboxId} references a missing operation.`,
            updatedAt: timestamp,
          });
          failed += 1;
          deadLettered += 1;
          await refreshActionStatus(action.actionId);
          continue;
        }

        const started: AgentActionRecord = {
          ...action,
          status: "executing",
          executingAt: action.executingAt ?? timestamp,
          updatedAt: timestamp,
        };
        await repository.saveAction(started);
        try {
          const result = await executors.execute(operation, {
            actionId: action.actionId,
            runId: action.runId,
            operationId: operation.operationId,
            idempotencyKey: operation.idempotencyKey,
            now: timestamp,
          });
          const receipt: AgentExecutionReceipt = {
            receiptId: `receipt:${event.idempotencyKey}`,
            outboxId: event.outboxId,
            actionId: action.actionId,
            operationId: operation.operationId,
            runId: action.runId,
            idempotencyKey: operation.idempotencyKey,
            executorKey: operation.executorKey,
            status: "completed",
            resultRef: result.resultRef,
            resultSummary: result.summary,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          await repository.saveReceipt(receipt);
          await repository.saveOutbox({
            ...event,
            attempt: event.attempt,
            status: "completed",
            processedAt: timestamp,
            updatedAt: timestamp,
          });
          completed += 1;
        } catch (error) {
          const attempt = event.attempt;
          const deadLetter = attempt >= event.maxAttempts;
          await repository.saveReceipt({
            receiptId: `receipt:${event.idempotencyKey}:attempt:${attempt}`,
            outboxId: event.outboxId,
            actionId: action.actionId,
            operationId: operation.operationId,
            runId: action.runId,
            idempotencyKey: operation.idempotencyKey,
            executorKey: operation.executorKey,
            status: "failed",
            resultSummary:
              error instanceof Error ? error.message : "Executor failed.",
            createdAt: timestamp,
            updatedAt: timestamp,
          });
          await repository.saveOutbox({
            ...event,
            attempt,
            status: deadLetter ? "dead_letter" : "retry_scheduled",
            availableAt: new Date(
              Date.parse(timestamp) + retryDelayMs(attempt),
            ).toISOString(),
            lastError:
              error instanceof Error ? error.message : "Executor failed.",
            updatedAt: timestamp,
          });
          failed += 1;
          if (deadLetter) deadLettered += 1;
        }

        await refreshActionStatus(action.actionId);
      }

      return {
        processed: events.length,
        completed,
        failed,
        deadLettered,
      };
    },
  };
}
