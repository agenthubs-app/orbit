import { createHash } from "node:crypto";

import type {
  AgentActionDecisionRecord,
  AgentActionRecord,
  AgentActionStatus,
  AgentExecutionReceipt,
  AgentOutboxEvent,
  AgentRun,
  AgentRunDetail,
  AgentRunStep,
} from "./contract";

const OUTBOX_LEASE_TIMEOUT_MS = 15 * 60_000;

export interface AgentActionListFilter {
  status?: string | null;
  workflowKey?: string | null;
  createdAfter?: string | null;
  createdBefore?: string | null;
}

/** Largest action page; also the size of `listActions`, which returns the first page. */
export const AGENT_ACTION_PAGE_MAX = 500;

export interface AgentActionPage {
  /** Newest first (updatedAt, then actionId, both descending). */
  actions: readonly AgentActionRecord[];
  /** Opaque cursor of the next page, or null on the last page. */
  nextCursor: string | null;
}

/**
 * Keyset cursor over (updatedAt, actionId). Sprint 0121: the ledger filters
 * first and pages explicitly, so older matching actions are never dropped.
 */
export function encodeAgentActionCursor(action: Pick<AgentActionRecord, "actionId" | "updatedAt">): string {
  return Buffer.from(JSON.stringify([action.updatedAt, action.actionId]), "utf8").toString("base64url");
}

export function decodeAgentActionCursor(cursor: string): { updatedAt: string; actionId: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string") {
      return { updatedAt: value[0], actionId: value[1] };
    }
  } catch {
    // Reported below.
  }
  throw new RangeError("Invalid agent action cursor");
}

export function isAgentActionCursor(cursor: string): boolean {
  try {
    decodeAgentActionCursor(cursor);
    return true;
  } catch {
    return false;
  }
}

export function agentActionPageLimit(limit: number | null | undefined): number {
  return Number.isSafeInteger(limit) && (limit as number) > 0
    ? Math.min(limit as number, AGENT_ACTION_PAGE_MAX)
    : AGENT_ACTION_PAGE_MAX;
}

export function matchesAgentActionFilter(action: AgentActionRecord, input: AgentActionListFilter): boolean {
  return (!input.status || action.status === input.status) &&
    (!input.workflowKey || action.workflowKey === input.workflowKey) &&
    (!input.createdAfter || action.createdAt >= input.createdAfter) &&
    (!input.createdBefore || action.createdAt <= input.createdBefore);
}

const codeUnitOrder = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

/** Pages already-filtered actions in memory with the same order and cursor as the SQL path. */
export function pageAgentActions(
  actions: readonly AgentActionRecord[],
  input: { limit?: number | null; cursor?: string | null },
): AgentActionPage {
  const limit = agentActionPageLimit(input.limit);
  const after = input.cursor ? decodeAgentActionCursor(input.cursor) : null;
  const ordered = [...actions]
    .sort((left, right) => codeUnitOrder(right.updatedAt, left.updatedAt) || codeUnitOrder(right.actionId, left.actionId))
    .filter((action) => !after ||
      action.updatedAt < after.updatedAt ||
      (action.updatedAt === after.updatedAt && action.actionId < after.actionId));
  const page = ordered.slice(0, limit);
  return {
    actions: page,
    nextCursor: ordered.length > limit ? encodeAgentActionCursor(page.at(-1)!) : null,
  };
}

export interface AgentRuntimeRepository {
  getRun: (runId: string) => Promise<AgentRunDetail | null>;
  /** The first page (at most AGENT_ACTION_PAGE_MAX) of actions matching the filter. */
  listActions: (input?: AgentActionListFilter) => Promise<readonly AgentActionRecord[]>;
  /** Filters before it limits, then returns one page and the next cursor (0121). */
  listActionPage: (input?: AgentActionListFilter & {
    limit?: number | null;
    cursor?: string | null;
  }) => Promise<AgentActionPage>;
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
  claimReadyOutbox: (input: {
    now: string;
    limit: number;
    workerId: string;
    actionId?: string;
  }) => Promise<readonly AgentOutboxEvent[]>;
  /**
   * Returns a successful terminal receipt. Failed attempts are deliberately
   * ignored so executor retries remain possible; completed writes and
   * completed compensations both fence duplicate side effects.
   */
  getReceiptByIdempotencyKey: (
    idempotencyKey: string,
    /** Receipts belong to one run; the lookup reads only that run's rows (0103). */
    runId: string,
  ) => Promise<AgentExecutionReceipt | null>;
  /** agent-design AG02: the decision a card already got for this client decision key. */
  getDecision?: (
    actionId: string,
    clientDecisionId: string,
  ) => Promise<AgentActionDecisionRecord | null>;
  /**
   * agent-design AG02: one atomic change of a card. The card row is locked; the change is written
   * only while the card is still in one of `expect.statuses`, at `expect.revision` and unchanged
   * since `expect.updatedAt`, and only if no decision with the same client key exists. The card,
   * its outbox events, receipts and the decision record are written in one transaction, or none.
   */
  commitCardChange?: (input: AgentCardChangeInput) => Promise<AgentCardChangeResult>;
}

export interface AgentCardChangeInput {
  actionId: string;
  /** Omitted: nothing about the card is checked (a refusal only records its decision). */
  expect?: {
    statuses: readonly AgentActionStatus[];
    revision: number;
    updatedAt: string;
  };
  /** Omitted: the card itself is not written. */
  next?: AgentActionRecord;
  outbox?: readonly AgentOutboxEvent[];
  receipts?: readonly AgentExecutionReceipt[];
  decision?: AgentActionDecisionRecord;
}

export type AgentCardChangeResult =
  | { committed: true }
  | {
      committed: false;
      /** The card as it is now (null if it no longer exists). */
      current: AgentActionRecord | null;
      /** Set when a decision with the same client key was already recorded. */
      existingDecision: AgentActionDecisionRecord | null;
    };

export function agentDecisionRecordId(actionId: string, clientDecisionId: string): string {
  return `decision:${createHash("sha256").update(`${actionId}\u0000${clientDecisionId}`).digest("hex").slice(0, 32)}`;
}

/** The checks of commitCardChange, shared by the memory and the SQL implementation. */
export function cardChangeBlocked(
  current: AgentActionRecord | null,
  existingDecision: AgentActionDecisionRecord | null,
  input: AgentCardChangeInput,
): AgentCardChangeResult | null {
  if (existingDecision) return { committed: false, current, existingDecision };
  if (!input.expect) return null;
  if (
    !current ||
    !input.expect.statuses.includes(current.status) ||
    (current.revision ?? 1) !== input.expect.revision ||
    current.updatedAt !== input.expect.updatedAt
  ) {
    return { committed: false, current, existingDecision: null };
  }
  return null;
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
  const decisions = new Map<string, AgentActionDecisionRecord>();

  return {
    async getDecision(actionId, clientDecisionId) {
      const decision = decisions.get(agentDecisionRecordId(actionId, clientDecisionId));
      return decision ? clone(decision) : null;
    },
    async commitCardChange(input) {
      // No await between the checks and the writes: atomic within this process.
      const current = actions.get(input.actionId) ?? null;
      const existing = input.decision ? decisions.get(input.decision.decisionId) ?? null : null;
      const blocked = cardChangeBlocked(current ? clone(current) : null, existing ? clone(existing) : null, input);
      if (blocked) return blocked;
      if (input.next) actions.set(input.next.actionId, clone(input.next));
      for (const event of input.outbox ?? []) outbox.set(event.outboxId, clone(event));
      for (const receipt of input.receipts ?? []) receipts.set(receipt.receiptId, clone(receipt));
      if (input.decision) decisions.set(input.decision.decisionId, clone(input.decision));
      return { committed: true };
    },
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
      return clone(pageAgentActions([...actions.values()].filter((action) => matchesAgentActionFilter(action, input)), {}).actions);
    },
    async listActionPage(input = {}) {
      return clone(pageAgentActions([...actions.values()].filter((action) => matchesAgentActionFilter(action, input)), input));
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
    async getReceiptByIdempotencyKey(idempotencyKey, runId) {
      const receipt = [...receipts.values()].find(
        (candidate) =>
          candidate.runId === runId &&
          candidate.idempotencyKey === idempotencyKey &&
          (candidate.status === "completed" ||
            candidate.status === "undone"),
      );

      return receipt ? clone(receipt) : null;
    },
  };
}
