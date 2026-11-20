import type {
  AgentLedgerEvidenceChip,
  AgentLedgerOperationType,
} from "../ledger/contract";
import type { AgentActionSourceReference } from "../contract";
import type { AgentCardOperationDisplayContract } from "../../../shared/contract/agent-v1";

export const AGENT_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_for_input",
  "waiting_for_confirmation",
  "completed",
  "failed",
  "canceled",
] as const;

export const AGENT_RUN_STEP_KINDS = [
  "deterministic",
  "ai",
  "tool",
  "confirmation",
] as const;

export const AGENT_ACTION_STATUSES = [
  "awaiting_confirmation",
  "deferred",
  "approved",
  "executing",
  "completed",
  "partially_failed",
  "failed",
  "rejected",
  "canceled",
  "undone",
  // agent-design AG02 (设计稿附录 D): left too long; never executed. Judged from expiresAt.
  "expired",
] as const;

export const AGENT_ACTION_RISK_LEVELS = [
  "read",
  "draft",
  "write",
  "external",
] as const;

export const AGENT_OUTBOX_STATUSES = [
  "pending",
  "processing",
  "completed",
  "retry_scheduled",
  "dead_letter",
  "canceled",
  // AG02: the executor's outcome is unknown; not retried until the user decides (设计稿 §5.2).
  "needs_review",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export type AgentRunStepKind = (typeof AGENT_RUN_STEP_KINDS)[number];
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];
export type AgentActionRiskLevel =
  (typeof AGENT_ACTION_RISK_LEVELS)[number];
export type AgentOutboxStatus = (typeof AGENT_OUTBOX_STATUSES)[number];

export interface AgentRun {
  runId: string;
  workflowKey: string;
  workflowVersion: number;
  conversationId?: string;
  trigger:
    | "chat"
    | "today"
    | "domain_signal"
    | "scheduler"
    | "manual";
  status: AgentRunStatus;
  actionIds: readonly string[];
  currentStepId?: string;
  createdAt: string;
  startedAt?: string;
  waitingAt?: string;
  completedAt?: string;
  failedAt?: string;
  canceledAt?: string;
  updatedAt: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export interface AgentRunStep {
  stepId: string;
  runId: string;
  kind: AgentRunStepKind;
  name: string;
  sequence?: number;
  status:
    | "queued"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "canceled"
    | "skipped";
  attempt: number;
  inputRef?: string;
  outputRef?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  startedAt?: string;
  completedAt?: string;
  /** Measured duration; present on steps derived from a conversation's timing spans (0103). */
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentActionCompensation {
  supported: boolean;
  executorKey?: string;
  preview?: string;
}

export interface AgentActionOperationPayload {
  operationId: string;
  operationType: AgentLedgerOperationType;
  executorKey: string;
  idempotencyKey: string;
  payloadVersion: number;
  payload: Readonly<Record<string, unknown>>;
  preview: string;
  riskLevel: AgentActionRiskLevel;
  compensation: AgentActionCompensation;
  // ── agent-design AG02 (设计稿 §5.1, 附录 B/E). Present on cards that carry an `origin`. ──
  /** The sub-goal of the request this item belongs to. */
  partId?: string;
  /** Operation catalogue name, e.g. todo.create, todo.update (附录 B). */
  capability?: string;
  /** The existing record this item changes; absent for a create. */
  targetRef?: AgentActionTargetRef;
  /** Only the fields being changed, as the card showed them. */
  before?: Readonly<Record<string, unknown>>;
  after?: Readonly<Record<string, unknown>>;
  /** What the card used to name the record (its title), checked again at the click. */
  shown?: Readonly<Record<string, unknown>>;
  preconditions?: {
    /** The domain's own version mark (for a to-do its updatedAt). Not part of the card hash. */
    versionToken?: string;
    targetExists: boolean;
  };
  dependsOn?: readonly string[];
  effects?: readonly string[];
  /** agent-design AG07: how the card shows this item (written by code in the card's language, frozen, hashed). */
  display?: AgentCardOperationDisplayContract;
}

export interface AgentActionTargetRef {
  collection: string;
  id: string;
}

/** Where a card came from (设计稿 §5.1): one of a conversation, a rule run or an external connection. */
export type AgentActionOrigin =
  | { kind: "conversation"; conversationId: string; requestId: string }
  | { kind: "automation"; ruleId: string; firedAt: string }
  | { kind: "connection"; connectionId: string; externalRequestKey: string };

/** An earlier version of a card, kept when the card gets a new revision (附录 D). */
export interface AgentActionRevisionRecord {
  revision: number;
  payloadHash: string;
  title: string;
  preview: string;
  operations: readonly AgentActionOperationPayload[];
  expiresAt?: string;
  frozenAt: string;
  supersededAt: string;
  /** AG06: edited — the user took an item off the card; the rest was frozen again (设计稿 §5.1). */
  reason: "content_changed" | "regenerated" | "edited";
}

/** One row of the difference shown when a card is re-issued because its data changed. */
export interface AgentCardChange {
  operationId: string;
  /** field, or "title" when the record's name changed, or "record" when it is gone. */
  field: string;
  shownBefore: unknown;
  now: unknown;
  to?: unknown;
}

/** A button decision (设计稿 §5.1). Unique per card and clientDecisionId; a resend returns it. */
export interface AgentActionDecisionRecord {
  decisionId: string;
  actionId: string;
  clientDecisionId: string;
  decision: "confirm" | "reject" | "retry" | "mark_done" | "abandon";
  operationId?: string;
  revision: number;
  payloadHash: string;
  outcome: "accepted" | "already_decided" | "refused";
  reason?: string;
  message: string;
  /** Card revision after the decision (a content change issues a new one). */
  resultRevision: number;
  changes?: readonly AgentCardChange[];
  decidedAt: string;
}

export interface AgentActionRecord {
  actionId: string;
  runId: string;
  workflowKey: string;
  workflowVersion: number;
  conversationId?: string;
  title: string;
  contactName?: string;
  organization?: string;
  whyNow: string;
  status: AgentActionStatus;
  riskLevel: AgentActionRiskLevel;
  payloadVersion: number;
  operations: readonly AgentActionOperationPayload[];
  selectedOperationIds?: readonly string[];
  evidenceChips: readonly AgentLedgerEvidenceChip[];
  evidenceIds: readonly string[];
  sourceRefs: readonly AgentActionSourceReference[];
  preview: string;
  compensation: AgentActionCompensation;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  executingAt?: string;
  completedAt?: string;
  failedAt?: string;
  rejectedAt?: string;
  canceledAt?: string;
  deferredAt?: string;
  undoneAt?: string;
  viewedAt?: string;
  approvedBy?: string;
  immutablePayloadHash: string;
  // ── agent-design AG02 (附录 E「动作账本」). Cards without `origin` keep the old behaviour. ──
  origin?: AgentActionOrigin;
  /** Starts at 1; a content change or a regeneration adds one. */
  revision?: number;
  /** SHA-256 over order, items, targets, dependencies, revision and every visible text. */
  payloadHash?: string;
  expiresAt?: string;
  expiredAt?: string;
  /** agent-design AG15: why it expired — the next period of the same scheduled task made a new card. Absent: left too long. */
  expiredReason?: "superseded";
  /** agent-design AG15 (D15-6): the card of the next period that took this one's place. */
  supersededBy?: { actionId: string; firedAt: string };
  /** The card's language (zh, ja, en) for its own texts. */
  locale?: string;
  revisions?: readonly AgentActionRevisionRecord[];
  /** The difference of the latest content change, shown until the user clicks again. */
  contentChanges?: readonly AgentCardChange[];
}

export interface AgentOutboxEvent {
  outboxId: string;
  actionId: string;
  operationId: string;
  runId: string;
  executorKey: string;
  idempotencyKey: string;
  payloadVersion: number;
  payload: Readonly<Record<string, unknown>>;
  compensation: AgentActionCompensation;
  status: AgentOutboxStatus;
  attempt: number;
  maxAttempts: number;
  availableAt: string;
  createdAt: string;
  updatedAt: string;
  leasedAt?: string;
  leaseOwner?: string;
  processedAt?: string;
  lastError?: string;
}

export interface AgentExecutionReceipt {
  receiptId: string;
  outboxId: string;
  actionId: string;
  operationId: string;
  runId: string;
  idempotencyKey: string;
  executorKey: string;
  /**
   * AG02 adds: needs_review (outcome unknown), user_confirmed (the user marked it done; not a
   * system success), abandoned (the user gave up) and skipped (a prerequisite was abandoned).
   */
  status: "completed" | "failed" | "undone" | "needs_review" | "user_confirmed" | "abandoned" | "skipped";
  resultRef?: string;
  resultSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface TodayWorkItem {
  workItemId: string;
  actionId?: string;
  runId?: string;
  workflowKey?: string;
  section: "decide" | "prepared" | "recent";
  title: string;
  summary: string;
  status: AgentActionStatus | AgentRunStatus;
  occurredAt: string;
  evidenceIds: readonly string[];
}

export interface AgentRunDetail {
  run: AgentRun;
  steps: readonly AgentRunStep[];
  actions: readonly AgentActionRecord[];
  outbox: readonly AgentOutboxEvent[];
  receipts: readonly AgentExecutionReceipt[];
}

export interface AgentRunProgress {
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  activeStepId?: string;
  percent: number;
  canCancel: boolean;
  canRetry: boolean;
}
