import type {
  AgentActionRecord,
  AgentAnalyticsEvent,
  AgentExecutionReceipt,
  AgentOutboxEvent,
  AgentRun,
  AgentRunDetail,
  AgentRunStep,
} from "./contract";

const OUTBOX_LEASE_TIMEOUT_MS = 15 * 60_000;

export interface AgentRuntimeRepository {
  getRun: (runId: string) => Promise<AgentRunDetail | null>;
  listActions: (input?: {
    status?: string | null;
    workflowKey?: string | null;
    createdAfter?: string | null;
    createdBefore?: string | null;
  }) => Promise<readonly AgentActionRecord[]>;
  getAction: (actionId: string) => Promise<AgentActionRecord | null>;
  saveRun: (run: AgentRun) => Promise<void>;
  saveRunStep: (step: AgentRunStep) => Promise<void>;
  saveAction: (action: AgentActionRecord) => Promise<void>;
  approveActionWithOutbox: (
    action: AgentActionRecord,
    events: readonly AgentOutboxEvent[],
  ) => Promise<void>;
  saveOutbox: (event: AgentOutboxEvent) => Promise<void>;
  saveReceipt: (receipt: AgentExecutionReceipt) => Promise<void>;
  saveAnalyticsEvent: (event: AgentAnalyticsEvent) => Promise<void>;
  claimReadyOutbox: (input: {
    now: string;
    limit: number;
    workerId: string;
    actionId?: string;
  }) => Promise<readonly AgentOutboxEvent[]>;
  getReceiptByIdempotencyKey: (
    idempotencyKey: string,
  ) => Promise<AgentExecutionReceipt | null>;
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

export function createMemoryAgentRuntimeRepository(): AgentRuntimeRepository {
  const runs = new Map<string, AgentRun>();
  const steps = new Map<string, AgentRunStep>();
  const actions = new Map<string, AgentActionRecord>();
  const outbox = new Map<string, AgentOutboxEvent>();
  const receipts = new Map<string, AgentExecutionReceipt>();
  const analytics = new Map<string, AgentAnalyticsEvent>();

  return {
    async getRun(runId) {
      const run = runs.get(runId);
      if (!run) return null;

      return clone({
        run,
        steps: [...steps.values()].filter((step) => step.runId === runId),
        actions: [...actions.values()].filter(
          (action) => action.runId === runId,
        ),
        outbox: [...outbox.values()].filter((event) => event.runId === runId),
        receipts: [...receipts.values()].filter(
          (receipt) => receipt.runId === runId,
        ),
      });
    },
    async listActions(input = {}) {
      const result = [...actions.values()]
        .filter(
          (action) =>
            (!input.status || action.status === input.status) &&
            (!input.workflowKey ||
              action.workflowKey === input.workflowKey) &&
            (!input.createdAfter ||
              action.createdAt >= input.createdAfter) &&
            (!input.createdBefore ||
              action.createdAt <= input.createdBefore),
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

      return clone(result);
    },
    async getAction(actionId) {
      const action = actions.get(actionId);
      return action ? clone(action) : null;
    },
    async saveRun(run) {
      runs.set(run.runId, clone(run));
    },
    async saveRunStep(step) {
      steps.set(step.stepId, clone(step));
    },
    async saveAction(action) {
      actions.set(action.actionId, clone(action));
    },
    async approveActionWithOutbox(action, events) {
      const nextAction = clone(action);
      const nextEvents = events.map((event) => clone(event));
      for (const event of nextEvents) {
        outbox.set(event.outboxId, event);
      }
      actions.set(nextAction.actionId, nextAction);
    },
    async saveOutbox(event) {
      outbox.set(event.outboxId, clone(event));
    },
    async saveReceipt(receipt) {
      receipts.set(receipt.receiptId, clone(receipt));
    },
    async saveAnalyticsEvent(event) {
      analytics.set(event.eventId, clone(event));
    },
    async claimReadyOutbox(input) {
      const leaseExpiredBefore = new Date(
        Date.parse(input.now) - OUTBOX_LEASE_TIMEOUT_MS,
      ).toISOString();
      const claimed = [...outbox.values()]
        .filter(
          (event) =>
            ((event.status === "pending" ||
              event.status === "retry_scheduled") ||
              (event.status === "processing" &&
                Boolean(event.leasedAt) &&
                event.leasedAt! <= leaseExpiredBefore)) &&
            event.availableAt <= input.now &&
            (!input.actionId || event.actionId === input.actionId),
        )
        .sort((left, right) =>
          left.availableAt.localeCompare(right.availableAt),
        )
        .slice(0, Math.max(0, input.limit))
        .map((event) => ({
          ...event,
          status: "processing" as const,
          attempt: event.attempt + 1,
          leasedAt: input.now,
          leaseOwner: input.workerId,
          updatedAt: input.now,
        }));
      for (const event of claimed) {
        outbox.set(event.outboxId, clone(event));
      }
      return clone(claimed);
    },
    async getReceiptByIdempotencyKey(idempotencyKey) {
      const receipt = [...receipts.values()].find(
        (candidate) =>
          candidate.idempotencyKey === idempotencyKey &&
          candidate.status === "completed",
      );

      return receipt ? clone(receipt) : null;
    },
  };
}
