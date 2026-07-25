import type {
  AgentLedgerEvidenceChip,
  AgentLedgerOperationType,
} from "../ledger/contract";
import type { AgentActionSourceReference } from "../contract";

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
] as const;

export const AGENT_ANALYTICS_EVENT_NAMES = [
  "agent_run_started",
  "agent_run_completed",
  "agent_run_failed",
  "agent_action_proposed",
  "agent_action_approved",
  "agent_action_completed",
  "agent_action_failed",
  "agent_action_undone",
  "today_item_opened",
  "today_item_snoozed",
  "today_item_dismissed",
  "brief_viewed",
  "encounter_note_confirmed",
  "followup_draft_prepared",
  "relationship_work_completed",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];
export type AgentRunStepKind = (typeof AGENT_RUN_STEP_KINDS)[number];
export type AgentActionStatus = (typeof AGENT_ACTION_STATUSES)[number];
export type AgentActionRiskLevel =
  (typeof AGENT_ACTION_RISK_LEVELS)[number];
export type AgentOutboxStatus = (typeof AGENT_OUTBOX_STATUSES)[number];
export type AgentAnalyticsEventName =
  (typeof AGENT_ANALYTICS_EVENT_NAMES)[number];

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
  status:
    | "queued"
    | "running"
    | "waiting"
    | "completed"
    | "failed"
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
  approvedBy?: string;
  immutablePayloadHash: string;
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
  status: "completed" | "failed" | "undone";
  resultRef?: string;
  resultSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentAnalyticsEvent {
  eventId: string;
  name: AgentAnalyticsEventName;
  occurredAt: string;
  runId?: string;
  actionId?: string;
  workflowKey?: string;
  metadata: Readonly<Record<string, string | number | boolean | null>>;
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
