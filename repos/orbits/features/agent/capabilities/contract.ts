import type { ModuleMode } from "../../../shared/services/module-mode";
import type { AgentLedgerOperationType } from "../ledger/contract";
import type { AgentActionRiskLevel } from "../runtime/contract";

/**
 * Runtime capabilities are finer grained than the product-level capability
 * inventory in shared/services/capability-registry.ts. One entry here is one
 * thing the Agent may read, propose, execute, or orchestrate.
 */
export const AGENT_CAPABILITY_KINDS = [
  "read",
  "action",
  "workflow",
] as const;

export const AGENT_CAPABILITY_TRIGGERS = [
  "chat",
  "today",
  "scheduler",
  "domain_signal",
  "manual",
] as const;

export const AGENT_CAPABILITY_SURFACES = [
  "chat",
  "today",
  "ledger",
  "event",
  "background",
] as const;

export const AGENT_CAPABILITY_EXECUTION_BOUNDARIES = [
  "artifact_tool",
  "runtime_executor",
  "workflow_service",
  "workflow",
] as const;

export const AGENT_CAPABILITY_CONFIRMATION_POLICIES = [
  "none",
  "per_operation",
  "workflow_gate",
] as const;

export const AGENT_READ_TOOL_NAMES = [
  "events.recommend",
  "contacts.recommend",
  "followups.reviewQueue",
  "chat.context",
  "profile.getSelf",
  "notes.query",
  "tasks.query",
  "followups.query",
  "schedule.query",
] as const;

export const AGENT_WORKFLOW_KEYS = [
  "post_event_followup_v1",
  "pre_event_brief_v1",
  "event_matchmaking_v1",
] as const;

export const AGENT_RUNTIME_EXECUTOR_KEYS = [
  "followups.createTask",
  "notifications.createReminder",
  "followups.saveDraft",
  "events.saveMeetingNote",
  "events.saveBrief",
  "events.saveGoal",
  "events.addToOrbitSchedule",
  "contacts.archive",
  "calendar.syncEvent",
  "events.createIntroductionRequest",
  "memory.save",
] as const;

/**
 * agent-design AG06: the executors of the new entry's conversation cards (设计稿附录 B), registered apart
 * from AGENT_RUNTIME_EXECUTOR_KEYS because that registry also feeds the old planner's capability list.
 * Each key is a capability of 附录 A with a domain write adapter (features/agent-v1/domains/writes.ts).
 */
export const AGENT_V1_CARD_EXECUTOR_KEYS = ["todo.create", "todo.update", "memo.create", "memo.update", "contact.create", "contact.update", "contact.delete", "contact.restore", "contact.import", "privateEvent.create", "privateEvent.update", "privateEvent.delete", "attendance.create", "attendance.update", "attendance.delete", "schedule.create", "schedule.update", "schedule.delete", "todo.complete", "todo.reopen", "todo.delete", "memory.create", "memory.update", "memory.delete",
  // agent-design AG15: scheduled rules.
  "rule.create", "rule.update", "rule.pause", "rule.resume", "rule.cancel"] as const;
export type AgentV1CardExecutorKey = (typeof AGENT_V1_CARD_EXECUTOR_KEYS)[number];
/** The ledger operation types those cards carry (features/agent/ledger/contract.ts). */
export const AGENT_V1_CARD_OPERATION_TYPES: readonly string[] = ["create_todo", "update_todo", "create_memo", "update_memo", "create_contact", "update_contact", "delete_contact", "restore_contact", "import_contacts", "create_private_event", "update_private_event", "delete_private_event", "create_attendance", "update_attendance", "delete_attendance", "create_schedule", "update_schedule", "delete_schedule", "complete_todo", "reopen_todo", "delete_todo", "create_memory", "update_memory", "delete_memory",
  // agent-design AG15: scheduled rules.
  "create_rule", "update_rule", "pause_rule", "resume_rule", "cancel_rule"];

export type AgentCapabilityKind =
  (typeof AGENT_CAPABILITY_KINDS)[number];
export type AgentCapabilityTrigger =
  (typeof AGENT_CAPABILITY_TRIGGERS)[number];
export type AgentCapabilitySurface =
  (typeof AGENT_CAPABILITY_SURFACES)[number];
export type AgentCapabilityExecutionBoundary =
  (typeof AGENT_CAPABILITY_EXECUTION_BOUNDARIES)[number];
export type AgentCapabilityConfirmationPolicy =
  (typeof AGENT_CAPABILITY_CONFIRMATION_POLICIES)[number];
export type AgentReadToolName = (typeof AGENT_READ_TOOL_NAMES)[number];
export type AgentWorkflowKey = (typeof AGENT_WORKFLOW_KEYS)[number];
export type AgentRuntimeExecutorKey =
  (typeof AGENT_RUNTIME_EXECUTOR_KEYS)[number];

export interface AgentCapabilityDefinition {
  id: string;
  version: number;
  kind: AgentCapabilityKind;
  title: string;
  description: string;
  domains: readonly (
    | "agent"
    | "calendar"
    | "chat"
    | "contacts"
    | "events"
    | "followups"
    | "matchmaking"
    | "memory"
    | "notifications"
    | "notes"
    | "profile"
    | "schedule"
    | "tasks"
  )[];
  executionBoundary: AgentCapabilityExecutionBoundary;
  riskLevel: AgentActionRiskLevel;
  confirmationPolicy: AgentCapabilityConfirmationPolicy;
  allowedModes: readonly ModuleMode[];
  requiredPermissions: readonly string[];
  evidenceRequired: boolean;
  compensationSupported: boolean;
  operationTypes: readonly AgentLedgerOperationType[];
  triggers: readonly AgentCapabilityTrigger[];
  userConfigurableAutomation: boolean;
  surfaces: readonly AgentCapabilitySurface[];
  toolName?: AgentReadToolName;
  workflowKey?: AgentWorkflowKey;
  executorKey?: AgentRuntimeExecutorKey;
}

export interface AgentCapabilityListFilter {
  kind?: AgentCapabilityKind;
  executionBoundary?: AgentCapabilityExecutionBoundary;
  trigger?: AgentCapabilityTrigger;
  surface?: AgentCapabilitySurface;
}

export interface AgentCapabilityRegistry {
  get: (id: string) => AgentCapabilityDefinition | null;
  require: (id: string) => AgentCapabilityDefinition;
  getByExecutorKey: (
    executorKey: string,
  ) => AgentCapabilityDefinition | null;
  getByToolName: (toolName: string) => AgentCapabilityDefinition | null;
  getByWorkflowKey: (
    workflowKey: string,
  ) => AgentCapabilityDefinition | null;
  list: (
    filter?: AgentCapabilityListFilter,
  ) => readonly AgentCapabilityDefinition[];
}
