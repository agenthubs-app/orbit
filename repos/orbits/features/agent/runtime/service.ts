import type { CardOperationIntent } from "./card-operations";
import type {
  AgentActionOperationPayload,
  AgentActionRecord,
  AgentExecutionReceipt,
  AgentOutboxEvent,
  AgentRun,
  AgentRunDetail,
  AgentRunProgress,
  AgentRunStep,
} from "./contract";
import type { AgentExecutorRegistry } from "./executor-registry";
import { stablePayloadHash } from "./hash";
import { emitTrace, takeEvalFault } from "../../agent-v1/observability/trace";
import { AgentProposalsPausedError, agentProposalsPaused } from "../../agent-v1/rollout/rollback";
import { resolveLocalCreateRefs } from "../../agent-v1/domains/private-event/ops";
import type { AgentRuntimeRepository } from "./repository";
import {
  cardTtlMs,
  buildCardOperations,
  cardTexts,
  decideAction,
  editCard,
  expireCard,
  recheckCard,
  regenerateCard,
  reviseCard,
  type AgentExpireCardResult,
  type AgentReviseCardResult,
  type AgentDecisionInput,
  type AgentRecheckResult,
  type AgentDecisionResult,
  type AgentEditCardResult,
  type AgentRegenerateResult,
  type FrozenCardInput,
} from "./decision";
import type { TodoReader } from "./todo-operations";

/**
 * agent-design AG02: an executor can say its outcome is unknown (the write may or may not have
 * happened and cannot be looked up). Such an item is not retried automatically; it waits for the
 * user's review (设计稿 §5.2).
 */
export class AgentExecutionOutcomeUnknownError extends Error {
  readonly code = "EXECUTION_OUTCOME_UNKNOWN";
}

/**
 * agent-design AG06 (设计稿 §5.2 "永久失败停止该项，跳过依赖项"): a failure that trying again cannot fix — the
 * domain refused the values, the record is gone or changed since the card was shown. Not retried; items
 * that depend on it are skipped.
 */
export class AgentExecutionPermanentError extends Error {
  readonly code = "EXECUTION_PERMANENT";
}

/** agent-design AG13: a payload's `localCreateRef: n` replaced by the id item n's receipt holds (null: it has none). */
async function resolveCardLocalRefs(payload: Readonly<Record<string, unknown>>, createdIdOf: (position: number) => Promise<string | null>): Promise<Readonly<Record<string, unknown>> | null> {
  const ref = payload.eventRef as { localCreateRef?: unknown } | undefined;
  if (!ref || typeof ref.localCreateRef !== "number") return payload;
  const id = await createdIdOf(ref.localCreateRef);
  return resolveLocalCreateRefs(payload, () => id);
}

/** Domain error codes that retrying with the same operation key cannot change. */
const PERMANENT_CODES = new Set([
  "EXECUTION_PERMANENT",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "TASK_NOT_FOUND",
  "TASK_VERSION_CONFLICT",
  "TASK_INVALID_TRANSITION",
  "TASK_INVALID_PLAN_LINK",
  "TASK_INVALID_LINK",
  "NOTE_INVALID_INPUT",
  "NOTE_NOT_FOUND",
  "NOTE_IDEMPOTENCY_CONFLICT",
  "NOTE_VERSION_CONFLICT",
  "EXECUTOR_NOT_FOUND",
  "EXECUTOR_RISK_MISMATCH",
  "EXTERNAL_MESSAGE_SEND_FORBIDDEN",
]);

export function isPermanentExecutionError(error: unknown): boolean {
  if (error instanceof AgentExecutionPermanentError) return true;
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && PERMANENT_CODES.has(code);
}

function outcomeUnknown(error: unknown): boolean {
  return error instanceof AgentExecutionOutcomeUnknownError ||
    (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "EXECUTION_OUTCOME_UNKNOWN");
}

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
  getRun: (runId: string) => Promise<AgentRunDetail | null>;
  listActions: AgentRuntimeRepository["listActions"];
  /** One filtered page of actions and the next cursor (0121). */
  listActionPage: AgentRuntimeRepository["listActionPage"];
  /** Exact lookup by id; existence checks must not scan a truncated list (0121). */
  getAction: AgentRuntimeRepository["getAction"];
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
  // ── agent-design AG02 (decision.ts). Optional so wrappers and fixtures keep compiling. ──
  /** Freezes revision 1 of a card from operation intents and the current data; idempotent by actionId. */
  freezeCard?: (input: FrozenCardInput & { createdAt?: string }) => Promise<{ action: AgentActionRecord | null; missingTargets: readonly string[]; created: boolean }>;
  /** The button decision interface; null when the card does not exist. */
  decideAction?: (input: AgentDecisionInput) => Promise<AgentDecisionResult | null>;
  /** Re-issues an expired card from its intents as a new revision; null when it does not exist. */
  regenerateCard?: (input: { actionId: string }) => Promise<AgentRegenerateResult | null>;
  /** AG06: takes one item off a waiting card (not a decision): the rest is frozen again as revision+1. */
  editCard?: (input: { actionId: string; revision: number; payloadHash: string; removeOperationId: string }) => Promise<AgentEditCardResult | null>;
  /** AG07: looks at a waiting card again after a client synced (not a decision): a changed value re-freezes it as revision+1. */
  recheckCard?: (input: { actionId: string }) => Promise<AgentRecheckResult | null>;
  /** AG12: the user changed an item in words (an import row): the card is frozen again from the new intents as revision+1. */
  reviseCard?: (input: { actionId: string; intents: readonly CardOperationIntent[] }) => Promise<AgentReviseCardResult | null>;
  /** AG15: closes a waiting card without a click (its expiry timer, or the next period's card took its place). */
  expireCard?: (input: { actionId: string; revision?: number; reason: "timer" | "superseded"; by?: { actionId: string; firedAt: string } }) => Promise<AgentExpireCardResult | null>;
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

export function orderedRunDetail(detail: AgentRunDetail): AgentRunDetail {
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
  /** Unused since 0110 (it only named analytics events); kept so existing callers compile. */
  id?: () => string;
  now?: () => string;
  repository: AgentRuntimeRepository;
  /** agent-design AG02: reads the to-dos a card changes (freeze, the check at the click, regeneration). */
  cardReader?: TodoReader | null;
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
  // AG02: an item the user abandoned (its event canceled) is settled and did not succeed.
  const abandoned = relevant.filter((event) => event.status === "canceled").length;
  const failed = relevant.filter(
    (event) => event.status === "dead_letter",
  ).length + abandoned;
  const operationCount = selected.size;
  // Every item given up by the user (none succeeded, none failed): the user stopped this card.
  if (abandoned > 0 && abandoned >= operationCount && completed === 0) return "canceled";

  if (completed >= operationCount && failed === 0) return "completed";
  if (completed > 0 && completed + failed >= operationCount) {
    return "partially_failed";
  }
  return failed >= operationCount ? "failed" : "executing";
}

export function createAgentRuntimeService({
  executors,
  now = () => new Date().toISOString(),
  repository,
  cardReader = null,
}: AgentRuntimeServiceOptions): AgentRuntimeService {
  const cardDependencies = () => ({
    afterChange: async (action: AgentActionRecord) => refreshRunStatus(action.runId),
    refreshAction: async (actionId: string) => {
      await refreshActionStatus(actionId);
    },
    now,
    reader: cardReader,
    repository,
  });
  async function requireAction(actionId: string): Promise<AgentActionRecord> {
    const action = await repository.getAction(actionId);
    if (!action) throw new Error(`Agent action ${actionId} was not found.`);
    return action;
  }

  /** AG02: a card with an origin is decided only through decideAction (revision, hash, decision key). */
  function refuseOldShapeDecision(action: AgentActionRecord): void {
    if (action.origin) {
      throw new Error(`Agent action ${action.actionId} takes button decisions only (revision, payloadHash, clientDecisionId).`);
    }
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
      "expired",
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

    await refreshRunStatus(action.runId);
    return updated;
  }

  const service: AgentRuntimeService = {
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
      // AG00: no-op outside the agent eval.
      emitTrace({ type: "card.frozen", cardKind: "ledger_action", cardId: action.actionId, hash: action.immutablePayloadHash, version: action.payloadVersion, card: action });
      return action;
    },
    async approveAction(input) {
      const action = await requireAction(input.actionId);
      refuseOldShapeDecision(action);
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
      await refreshRunStatus(action.runId);
      return approved;
    },
    async deferAction(actionId) {
      const action = await requireAction(actionId);
      refuseOldShapeDecision(action);
      assertStatus(action, ["awaiting_confirmation"]);
      const updated = await saveActionStatus(
        action,
        "deferred",
        "deferredAt",
      );
      await refreshRunStatus(action.runId);
      return updated;
    },
    async rejectAction(actionId) {
      const action = await requireAction(actionId);
      refuseOldShapeDecision(action);
      assertStatus(action, ["awaiting_confirmation", "deferred"]);
      const updated = await saveActionStatus(
        action,
        "rejected",
        "rejectedAt",
      );
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
      refuseOldShapeDecision(action);
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
      refuseOldShapeDecision(action);
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
      const detail = await repository.getRun(action.runId);
      if (!detail) {
        throw new Error(`Agent run ${action.runId} was not found.`);
      }
      const completedOperationIds = new Set(
        detail.receipts
          .filter(
            (receipt) =>
              receipt.actionId === actionId &&
              receipt.status === "completed",
          )
          .map((receipt) => receipt.operationId),
      );
      const executedOperations = action.operations.filter((operation) =>
        completedOperationIds.has(operation.operationId),
      );
      if (executedOperations.length === 0) {
        throw new Error(
          `Agent action ${actionId} has no completed operation to undo.`,
        );
      }
      const unsupportedOperation = executedOperations.find(
        (operation) => !operation.compensation.supported,
      );
      if (unsupportedOperation) {
        throw new Error(
          `Agent operation ${unsupportedOperation.operationId} does not support undo.`,
        );
      }
      const timestamp = now();
      for (const operation of executedOperations) {
        const undoIdempotencyKey = `undo:${operation.idempotencyKey}`;
        const existingReceipt =
          await repository.getReceiptByIdempotencyKey(undoIdempotencyKey, action.runId);
        if (existingReceipt?.status === "undone") continue;
        await executors.compensate(operation, {
          actionId,
          runId: action.runId,
          operationId: operation.operationId,
          idempotencyKey: undoIdempotencyKey,
          now: timestamp,
          resultRef: detail.receipts.find((receipt) =>
            receipt.actionId === actionId &&
            receipt.operationId === operation.operationId &&
            receipt.idempotencyKey === operation.idempotencyKey &&
            receipt.status === "completed",
          )?.resultRef,
        });
        await repository.saveReceipt({
          receiptId: `receipt:undo:${operation.idempotencyKey}`,
          outboxId: `undo:${operation.operationId}`,
          actionId,
          operationId: operation.operationId,
          runId: action.runId,
          idempotencyKey: undoIdempotencyKey,
          executorKey:
            operation.compensation.executorKey ?? operation.executorKey,
          status: "undone",
          resultSummary: "Compensation completed.",
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }
      const updated = await saveActionStatus(action, "undone", "undoneAt");
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
    async getRun(runId) {
      const detail = await repository.getRun(runId);
      return detail ? orderedRunDetail(detail) : null;
    },
    listActions: repository.listActions,
    listActionPage: repository.listActionPage,
    getAction: repository.getAction,
    async freezeCard(input) {
      const existing = await repository.getAction(input.actionId);
      if (existing) return { action: existing, created: false, missingTargets: [] };
      // AG18 rollback (ORBIT_AGENT_V1_PROPOSALS=paused): no new card from any entry (chat, scheduled tasks, MCP).
      if (agentProposalsPaused()) {
        emitTrace({ actionId: input.actionId, origin: input.origin.kind, type: "rollout.proposal_refused" });
        throw new AgentProposalsPausedError();
      }
      const createdAt = input.createdAt ?? now();
      const { operations, missing } = await buildCardOperations(cardReader, { actionId: input.actionId, intents: input.intents, locale: input.locale, revision: 1 });
      if (!operations.length) return { action: null, created: false, missingTargets: missing };
      const texts = cardTexts(operations, input.locale, 1);
      const runId = `run:${input.actionId}`;
      const conversationId = input.origin.kind === "conversation" ? input.origin.conversationId : undefined;
      await service.createRun({ conversationId, createdAt, runId, trigger: "chat", workflowKey: "agent_v1_card" });
      const action = await service.proposeAction({
        actionId: input.actionId,
        compensation: { supported: false },
        conversationId,
        createdAt,
        evidenceChips: [],
        evidenceIds: [],
        // AG17: 7 days for a conversation's card, 24 hours for an external agent's proposal (设计稿 §5.2).
        expiresAt: new Date(Date.parse(createdAt) + cardTtlMs(input.origin)).toISOString(),
        locale: input.locale,
        operations,
        origin: input.origin,
        payloadHash: texts.payloadHash,
        payloadVersion: 1,
        preview: texts.preview,
        revision: 1,
        riskLevel: "write",
        runId,
        sourceRefs: [],
        title: texts.title,
        whyNow: "",
        workflowKey: "agent_v1_card",
        workflowVersion: 1,
      });
      return { action, created: true, missingTargets: missing };
    },
    decideAction: (input) => decideAction(cardDependencies(), input),
    // AG18 rollback: a paused deployment makes no new revision of a card either (no new content to approve).
    regenerateCard: (input) => (agentProposalsPaused() ? Promise.reject(new AgentProposalsPausedError()) : regenerateCard(cardDependencies(), input)),
    expireCard: (input) => expireCard(cardDependencies(), input),
    editCard: (input) => (agentProposalsPaused() ? Promise.reject(new AgentProposalsPausedError()) : editCard(cardDependencies(), input)),
    recheckCard: (input) => (agentProposalsPaused() ? Promise.reject(new AgentProposalsPausedError()) : recheckCard(cardDependencies(), input)),
    reviseCard: (input) => (agentProposalsPaused() ? Promise.reject(new AgentProposalsPausedError()) : reviseCard(cardDependencies(), input)),
    async processOutbox(input = {}) {
      // AG18 rollback: the queue claims nothing while paused; approved items wait where they are (same keys on restore).
      if (agentProposalsPaused()) {
        emitTrace({ actionId: input.actionId ?? null, type: "rollout.queue_paused" });
        return { completed: 0, deadLettered: 0, failed: 0, processed: 0 };
      }
      // AG06: an item waiting for another is put back while that one runs; once a prerequisite settled in a
      // pass, the waiting items get another pass right away (at most three passes per call).
      const total = { completed: 0, deadLettered: 0, failed: 0, processed: 0 };
      for (let pass = 0; pass < 3; pass += 1) {
        const result = await processOnce(input);
        total.completed += result.completed;
        total.deadLettered += result.deadLettered;
        total.failed += result.failed;
        total.processed += result.processed;
        if (!result.waited || !result.settled) break;
      }
      return total;
    },
  };

  async function processOnce(input: { actionId?: string; limit?: number; workerId?: string }) {
    {
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
      let waited = 0;
      let skipped = 0;

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
          await repository.getReceiptByIdempotencyKey(event.idempotencyKey, event.runId);
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
        // AG00: exec.* events and the `executor` fault point exist only under the agent eval.
        // AG02: an item waits for the items it depends on; an abandoned or failed prerequisite skips it.
        const runOutbox = operation.dependsOn?.length ? (await repository.getRun(action.runId))?.outbox ?? [] : [];
        const prerequisites = (operation.dependsOn ?? []).map((operationId) =>
          runOutbox.find((item) => item.actionId === action.actionId && item.operationId === operationId));
        if (prerequisites.some((item) => item && (item.status === "canceled" || item.status === "dead_letter"))) {
          await repository.saveReceipt({ receiptId: `receipt:${event.idempotencyKey}:skipped`, outboxId: event.outboxId, actionId: action.actionId, operationId: operation.operationId, runId: action.runId, idempotencyKey: operation.idempotencyKey, executorKey: operation.executorKey, status: "skipped", resultSummary: "Skipped: an item it depends on did not complete.", createdAt: timestamp, updatedAt: timestamp });
          await repository.saveOutbox({ ...event, status: "canceled", processedAt: timestamp, updatedAt: timestamp });
          emitTrace({ type: "exec.receipt", source: "real", actionId: action.actionId, operationId: operation.operationId, status: "skipped" });
          skipped += 1;
          await refreshActionStatus(action.actionId);
          continue;
        }
        if (prerequisites.some((item) => !item || item.status !== "completed")) {
          await repository.saveOutbox({ ...event, status: "pending", attempt: Math.max(0, event.attempt - 1), leasedAt: undefined, leaseOwner: undefined, updatedAt: timestamp });
          waited += 1;
          continue;
        }
        const execTrace = { actionId: action.actionId, operationId: operation.operationId, executorKey: operation.executorKey, idempotencyKey: operation.idempotencyKey };
        emitTrace({ type: "exec.call", source: "real", ...execTrace, operation });
        try {
          // AG06: a fault can be aimed at one operation (fault.where: memo.create) or at any executor.
          const fault = takeEvalFault(operation.capability ?? operation.executorKey) ?? takeEvalFault("executor");
          if (fault?.kind === "unknown_outcome" && !fault.appliedFlag) throw new AgentExecutionOutcomeUnknownError("agent-eval simulated executor unknown_outcome (nothing written)");
          // fail_always stands for a failure retrying cannot fix (permanent); fail_once and timeout for a passing one.
          if (fault?.kind === "fail_always") throw new AgentExecutionPermanentError(`agent-eval simulated executor ${fault.kind}`);
          if (fault && fault.kind !== "unknown_outcome") throw new Error(`agent-eval simulated executor ${fault.kind}`);
          // AG13: an item that points at the private event an earlier item of this card created (localCreateRef: n) gets
          // that event's id from the n-th item's receipt; it waited for it (dependsOn), so the receipt is there.
          const payload = await resolveCardLocalRefs(event.payload, async (position) => {
            const source = action.operations[position - 1];
            if (!source) return null;
            const receipt = await repository.getReceiptByIdempotencyKey(source.idempotencyKey, action.runId);
            const ref = receipt?.status === "completed" ? receipt.resultRef ?? "" : "";
            return ref.startsWith("private_events:") ? ref.slice("private_events:".length) : null;
          });
          if (!payload) throw new AgentExecutionPermanentError("The event this item records was not created; nothing was written.");
          const result = await executors.execute({ ...operation, payload }, {
            actionId: action.actionId,
            runId: action.runId,
            operationId: operation.operationId,
            idempotencyKey: operation.idempotencyKey,
            now: timestamp,
          });
          if (fault) throw new AgentExecutionOutcomeUnknownError("agent-eval simulated executor unknown_outcome (write applied)");
          emitTrace({ type: "exec.receipt", source: "real", ...execTrace, status: "completed", resultRef: result.resultRef, summary: result.summary });
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
          const execError = error instanceof Error ? error.message : "Executor failed.";
          if (outcomeUnknown(error)) {
            // AG02: the write may or may not have happened and cannot be looked up: no automatic
            // retry; the item waits for the user's review (retry / mark done / abandon).
            emitTrace({ type: "exec.receipt", source: execError.startsWith("agent-eval simulated") ? "simulated" : "real", ...execTrace, status: "needs_review", error: execError });
            await repository.saveReceipt({
              receiptId: `receipt:${event.idempotencyKey}:review:${event.attempt}`,
              outboxId: event.outboxId,
              actionId: action.actionId,
              operationId: operation.operationId,
              runId: action.runId,
              idempotencyKey: operation.idempotencyKey,
              executorKey: operation.executorKey,
              status: "needs_review",
              resultSummary: "The outcome is unknown: the write may or may not have happened.",
              createdAt: timestamp,
              updatedAt: timestamp,
            });
            await repository.saveOutbox({ ...event, status: "needs_review", lastError: execError, processedAt: timestamp, updatedAt: timestamp });
            failed += 1;
            await refreshActionStatus(action.actionId);
            continue;
          }
          emitTrace({ type: "exec.receipt", source: execError.startsWith("agent-eval simulated") ? "simulated" : "real", ...execTrace, status: "failed", error: execError });
          const attempt = event.attempt;
          // AG06: a permanent failure is not retried; only a passing one is, with the same operation key.
          const deadLetter = attempt >= event.maxAttempts || isPermanentExecutionError(error);
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
        waited,
        settled: completed + deadLettered + skipped,
      };
    }
  }
  return service;
}
