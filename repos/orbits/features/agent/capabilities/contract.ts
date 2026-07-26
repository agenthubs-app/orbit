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
