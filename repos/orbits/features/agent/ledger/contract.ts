import type { ApiErrorContext } from "../../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../../shared/api/envelope";
import type { FeatureMode } from "../../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../../shared/errors/app-error";
import type { AgentActionSourceReference } from "../contract";

// Agent action ledger contract 描述"操作账本"：每一次 AI 写操作都记录在这里，
// 可追溯、可撤销。条目是复合决策（多个可勾选子操作），确认后逐子操作执行。
// 硬约束：消息类子操作只存草稿，不会自动发送（2026-07 定稿"A 档执行/邮件止于草稿"）。

export const AGENT_LEDGER_ENTRY_STATUSES = [
  "awaiting_confirmation",
  "executing",
  "completed",
  "partially_failed",
  "failed",
  "undone",
  "deferred",
] as const;

export const AGENT_LEDGER_OPERATION_STATUSES = [
  "pending",
  "skipped",
  "succeeded",
  "failed",
  "undone",
] as const;

export const AGENT_LEDGER_OPERATION_TYPES = [
  "save_meeting_note",
  "create_followup_reminder",
  "save_message_draft",
  "archive_contacts",
  "generate_meeting_brief",
  "sync_event_to_calendar",
] as const;

// 证据种类白名单。语音记录按 2026-07-24 决定暂不纳入。
export const AGENT_LEDGER_EVIDENCE_KINDS = [
  "event_material",
  "chat_summary",
  "calendar_signal",
  "contact_note",
] as const;

export const AGENT_LEDGER_TRANSITIONS = [
  "confirm",
  "defer",
  "undo",
  "retry",
] as const;

export const AGENT_LEDGER_ERROR_CODES = [
  "AGENT_LEDGER_ENTRY_ID_REQUIRED",
  "AGENT_LEDGER_ENTRY_NOT_FOUND",
  "AGENT_LEDGER_NO_OPERATIONS_SELECTED",
  "AGENT_LEDGER_TRANSITION_INVALID",
  "AGENT_LEDGER_DRAFT_NOT_EDITABLE",
  "AGENT_LEDGER_MOCK_FAILED",
  "AGENT_LEDGER_LIVE_STORE_UNCONFIGURED",
] as const;

export type AgentLedgerEntryStatus =
  (typeof AGENT_LEDGER_ENTRY_STATUSES)[number];
export type AgentLedgerOperationStatus =
  (typeof AGENT_LEDGER_OPERATION_STATUSES)[number];
export type AgentLedgerOperationType =
  (typeof AGENT_LEDGER_OPERATION_TYPES)[number];
export type AgentLedgerEvidenceKind =
  (typeof AGENT_LEDGER_EVIDENCE_KINDS)[number];
export type AgentLedgerTransition = (typeof AGENT_LEDGER_TRANSITIONS)[number];
export type AgentLedgerErrorCode = (typeof AGENT_LEDGER_ERROR_CODES)[number];

// provenance 是账本的安全说明：所有外部副作用与自动发送固定为 false。
export interface AgentLedgerProvenance {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "demo-agent-ledger-only" | "live-agent-ledger-preview";
  generationMethod:
    | "fixture"
    | "rule-based-ledger-transition"
    | "live-store-query";
  autonomousExecutionStarted: false;
  externalSideEffectExecuted: false;
  externalNetworkRequested: false;
  messageAutoSendExecuted: false;
  liveDatabaseReadExecuted: boolean;
  liveDatabaseWriteExecuted: boolean;
}

// 证据 chip 对应设计稿"建议基于什么信息?"里的来源标签。
export interface AgentLedgerEvidenceChip {
  kind: AgentLedgerEvidenceKind;
  label: string;
  evidenceId: string;
}

// 子操作是账本的最小执行单元；重试按 idempotencyKey 去重，成功项不重复执行。
export interface AgentLedgerOperation {
  operationId: string;
  operationType: AgentLedgerOperationType;
  title: string;
  effectSummary: string;
  selectedByDefault: boolean;
  status: AgentLedgerOperationStatus;
  idempotencyKey: string;
  draftPreview?: string;
  // mock 执行结果开关，仅 fixtures/mock-service 使用；live 实现忽略。
  mockOutcome?: "succeed" | "fail";
  autoSendCapable: false;
}

export interface AgentLedgerEntry {
  entryId: string;
  title: string;
  contactName?: string;
  organization?: string;
  status: AgentLedgerEntryStatus;
  whyNow: string;
  evidenceChips: readonly AgentLedgerEvidenceChip[];
  operations: readonly AgentLedgerOperation[];
  undoable: boolean;
  createdAt: string;
  updatedAt: string;
  sourceRefs: readonly AgentActionSourceReference[];
  evidenceIds: readonly string[];
  provenance: AgentLedgerProvenance;
  autonomousExecutionStarted: false;
  externalSideEffectExecuted: false;
  messageAutoSendExecuted: false;
}

export interface AgentLedgerListInput {
  status?: AgentLedgerEntryStatus | string | null;
  scenario?: "success" | "empty" | "failure" | string | null;
}

export interface AgentLedgerTransitionInput {
  entryId?: string | null;
  transition?: AgentLedgerTransition | string | null;
  selectedOperationIds?: readonly string[] | null;
  actorLabel?: string | null;
  scenario?: "success" | "failure" | string | null;
}

export interface AgentLedgerDraftUpdateInput {
  entryId?: string | null;
  operationId?: string | null;
  draftText?: string | null;
}

export interface AgentLedgerListPayload {
  state: "success" | "empty";
  entries: readonly AgentLedgerEntry[];
  summary: string;
  provenance: AgentLedgerProvenance;
  nextAction: string;
}

export interface AgentLedgerMutationPayload {
  state: "success";
  entry: AgentLedgerEntry;
  transition: AgentLedgerTransition | "update_draft";
  actorLabel: string;
  decidedAt: string;
  provenance: AgentLedgerProvenance;
  nextAction: string;
}

export interface AgentLedgerErrorDefinition {
  code: AgentLedgerErrorCode;
  appCode: AppErrorCode;
  message: string;
  recovery: string;
}

export const AGENT_LEDGER_ERROR_DEFINITIONS = {
  AGENT_LEDGER_ENTRY_ID_REQUIRED: {
    code: "AGENT_LEDGER_ENTRY_ID_REQUIRED",
    appCode: "VALIDATION_ERROR",
    message: "A ledger entry id is required before applying a transition.",
    recovery:
      "Keep ledger controls disabled until a known ledger entry is selected.",
  },
  AGENT_LEDGER_ENTRY_NOT_FOUND: {
    code: "AGENT_LEDGER_ENTRY_NOT_FOUND",
    appCode: "NOT_FOUND",
    message: "No ledger entry matches that id.",
    recovery:
      "Render the missing-entry envelope and avoid autonomous execution or external side effects.",
  },
  AGENT_LEDGER_NO_OPERATIONS_SELECTED: {
    code: "AGENT_LEDGER_NO_OPERATIONS_SELECTED",
    appCode: "VALIDATION_ERROR",
    message: "Confirming a ledger entry requires at least one selected operation.",
    recovery:
      "Keep the confirm control disabled until at least one operation checkbox is selected.",
  },
  AGENT_LEDGER_TRANSITION_INVALID: {
    code: "AGENT_LEDGER_TRANSITION_INVALID",
    appCode: "CONFLICT",
    message: "That transition is not allowed from the entry's current status.",
    recovery:
      "Refresh the ledger list and only offer transitions valid for the entry's current status.",
  },
  AGENT_LEDGER_DRAFT_NOT_EDITABLE: {
    code: "AGENT_LEDGER_DRAFT_NOT_EDITABLE",
    appCode: "CONFLICT",
    message:
      "Only save_message_draft operations on awaiting or deferred entries can be edited.",
    recovery:
      "Hide the draft editor once an entry has started executing; drafts stay drafts and are never auto-sent.",
  },
  AGENT_LEDGER_MOCK_FAILED: {
    code: "AGENT_LEDGER_MOCK_FAILED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The mock agent ledger boundary is pinned to a controlled failure scenario.",
    recovery:
      "Render the controlled failure state and do not retry autonomous execution or external side effects.",
  },
  AGENT_LEDGER_LIVE_STORE_UNCONFIGURED: {
    code: "AGENT_LEDGER_LIVE_STORE_UNCONFIGURED",
    appCode: "SERVICE_UNAVAILABLE",
    message: "The live agent ledger store is not configured.",
    recovery:
      "Configure ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before using the live agent ledger.",
  },
} as const satisfies Record<AgentLedgerErrorCode, AgentLedgerErrorDefinition>;

export interface AgentLedgerListSuccess {
  success: true;
  data: AgentLedgerListPayload;
}

export interface AgentLedgerMutationSuccess {
  success: true;
  data: AgentLedgerMutationPayload;
}

export interface AgentLedgerFailure {
  success: false;
  error: AgentLedgerErrorDefinition & {
    state: "failure";
    provenance: AgentLedgerProvenance;
    evidenceIds: readonly string[];
  };
}

export type AgentLedgerListResult = AgentLedgerListSuccess | AgentLedgerFailure;
export type AgentLedgerMutationResult =
  | AgentLedgerMutationSuccess
  | AgentLedgerFailure;

export function agentLedgerFailureToAppError(
  failure: AgentLedgerFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function agentLedgerFailureContext(
  failure: AgentLedgerFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    agentLedgerErrorCode: failure.error.code,
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance: failure.error.provenance.sourceLabel,
    service: "agent-action-ledger",
  };
}
