import type {
  AgentActionOperationPayload,
  AgentActionRecord,
  AgentAnalyticsEventName,
  AgentExecutionReceipt,
  AgentOutboxEvent,
  AgentRun,
  AgentRunDetail,
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
  updateRunStatus: (
    runId: string,
    status: AgentRun["status"],
    error?: AgentRun["error"],
  ) => Promise<AgentRun>;
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
  }) => Promise<AgentActionRecord>;
  undoAction: (actionId: string) => Promise<AgentActionRecord>;
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
      const timestamp = input.createdAt ?? now();
      const step: AgentRunStep = {
        ...input,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await repository.saveRunStep(step);
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
        (operation) =>
          operation.operationId === input.operationId &&
          operation.operationType === "save_message_draft",
      );
      if (operationIndex < 0) {
        throw new Error(
          `Operation ${input.operationId} is not an editable message draft.`,
        );
      }
      const operations = action.operations.map((operation, index) =>
        index === operationIndex
          ? {
              ...operation,
              payload: {
                ...operation.payload,
                draftText: input.draftText,
              },
              preview: input.draftText,
            }
          : operation,
      );
      const timestamp = now();
      const updated: AgentActionRecord = {
        ...action,
        operations,
        preview: input.draftText,
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
    recordAnalytics: analytics,
    getRun: repository.getRun,
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
