import type { ConnectionStage, SourceReferenceDTO } from "../../../shared/domain/source-types";

export type { ConnectionStage } from "../../../shared/domain/source-types";

export type RelationshipTaskStatus = "open" | "scheduled" | "completed" | "dismissed";
export type RelationshipTaskPurpose = "follow_up" | "maintenance";

export interface RelationshipConnectionAggregate {
  actorId: string;
  activeGoal: string | null;
  connectionId: string;
  contactId: string;
  createdAt: string;
  stage: ConnectionStage;
  updatedAt: string;
  version: number;
}

export interface RelationshipLifecycleTask {
  actorId: string;
  connectionId: string;
  contactId: string;
  createdAt: string;
  dueAt: string;
  purpose: RelationshipTaskPurpose;
  status: RelationshipTaskStatus;
  taskId: string;
  title: string;
  updatedAt: string;
  version: number;
}

export interface RelationshipNextTask {
  taskId: string;
  title: string;
  dueAt: string;
}

interface RelationshipCommandIdentity {
  actorId: string;
  connectionId: string;
  idempotencyKey: string;
  source?: SourceReferenceDTO;
}

export type RelationshipStageCommand = RelationshipCommandIdentity & {
  expectedVersion: number;
} & (
  | { stage: "needs_follow_up" | "nurture"; nextTask: RelationshipNextTask }
  | { stage: "active"; activeGoal: string }
  | { stage: "archived"; dismissTaskIds: string[]; reason?: string }
);

export type RelationshipTaskClosingOutcome =
  | { kind: "next_task"; nextTask: RelationshipNextTask }
  | { kind: "active"; activeGoal: string }
  | { kind: "nurture"; nextTask: RelationshipNextTask }
  | { kind: "archived"; dismissTaskIds: string[]; reason?: string };

export interface RelationshipTaskCompletionCommand extends RelationshipCommandIdentity {
  taskId: string;
  expectedConnectionVersion: number;
  expectedTaskVersion: number;
  outcome: RelationshipTaskClosingOutcome;
}

export interface RelationshipLifecycleAudit {
  auditId: string;
  actorId: string;
  connectionId: string;
  command: "change_stage" | "complete_task";
  fromStage: ConnectionStage;
  toStage: ConnectionStage;
  taskIds: string[];
  source: SourceReferenceDTO;
  occurredAt: string;
}

export interface RelationshipLifecycleSnapshot {
  connection: RelationshipConnectionAggregate;
  tasks: RelationshipLifecycleTask[];
}

export interface RelationshipLifecycleMutationPlan {
  connection: RelationshipConnectionAggregate;
  upsertTasks: RelationshipLifecycleTask[];
  dismissTasks: RelationshipLifecycleTask[];
  audit: RelationshipLifecycleAudit;
}

export type RelationshipLifecycleErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INVALID_TRANSITION"
  | "INVALID_TASK"
  | "IDEMPOTENCY_CONFLICT";

export class RelationshipLifecycleError extends Error {
  constructor(public readonly code: RelationshipLifecycleErrorCode, message: string) {
    super(message);
    this.name = "RelationshipLifecycleError";
  }
}
