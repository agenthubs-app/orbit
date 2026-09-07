import {
  RelationshipLifecycleError,
  type RelationshipLifecycleAudit,
  type RelationshipLifecycleMutationPlan,
  type RelationshipLifecycleSnapshot,
} from "./contract";
import { isConnectionStage } from "../../../shared/domain/source-types";

export interface RelationshipLifecycleMutationInput {
  actorId: string;
  command: RelationshipLifecycleAudit["command"];
  connectionId: string;
  expectedVersion: number;
  idempotencyKey: string;
  requestHash: string;
}

export interface RelationshipLifecycleMutationResult {
  snapshot: RelationshipLifecycleSnapshot;
  replayed: boolean;
}

export interface RelationshipLifecycleRepository {
  read(actorId: string, connectionId: string): Promise<RelationshipLifecycleSnapshot | null>;
  mutate(
    input: RelationshipLifecycleMutationInput,
    operation: (snapshot: RelationshipLifecycleSnapshot) => RelationshipLifecycleMutationPlan,
  ): Promise<RelationshipLifecycleMutationResult>;
}

export function validateLifecycleMutationInput(input: RelationshipLifecycleMutationInput): void {
  for (const value of [input.actorId, input.connectionId, input.idempotencyKey, input.requestHash]) {
    if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.includes("\0")) {
      throw new RelationshipLifecycleError("INVALID_TRANSITION", "Invalid mutation identity.");
    }
  }
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1 || input.expectedVersion >= Number.MAX_SAFE_INTEGER) {
    throw new RelationshipLifecycleError("CONFLICT", "Invalid connection version.");
  }
  if (input.command !== "change_stage" && input.command !== "complete_task") {
    throw new RelationshipLifecycleError("INVALID_TRANSITION", "Unknown lifecycle command.");
  }
}

// Both repositories check the plan against the original snapshot before writing.
export function applyLifecycleMutationPlan(
  input: RelationshipLifecycleMutationInput,
  snapshot: RelationshipLifecycleSnapshot,
  plan: RelationshipLifecycleMutationPlan,
): RelationshipLifecycleSnapshot {
  const previous = snapshot.connection;
  const next = plan.connection;
  if (next.actorId !== input.actorId || next.connectionId !== input.connectionId || next.contactId !== previous.contactId || next.createdAt !== previous.createdAt) {
    throw new RelationshipLifecycleError("FORBIDDEN", "Mutation cannot change connection identity.");
  }
  if (previous.version !== input.expectedVersion || next.version !== previous.version + 1) {
    throw new RelationshipLifecycleError("CONFLICT", "Connection version must advance exactly once.");
  }
  const taskMap = new Map(snapshot.tasks.map((task) => [task.taskId, task]));
  const changed = new Set<string>();
  for (const task of [...plan.upsertTasks, ...plan.dismissTasks]) {
    if (task.actorId !== input.actorId || task.connectionId !== input.connectionId || task.contactId !== previous.contactId) {
      throw new RelationshipLifecycleError("FORBIDDEN", "Mutation cannot change task ownership.");
    }
    const old = taskMap.get(task.taskId);
    if (!task.taskId || changed.has(task.taskId) || !Number.isSafeInteger(task.version) || task.version !== (old?.version ?? 0) + 1) {
      throw new RelationshipLifecycleError("INVALID_TASK", "Task identity or version is invalid.");
    }
    changed.add(task.taskId);
    taskMap.set(task.taskId, task);
  }
  if (plan.dismissTasks.some((task) => task.status !== "dismissed")) {
    throw new RelationshipLifecycleError("INVALID_TASK", "Dismissed tasks must be closed.");
  }
  const tasks = [...taskMap.values()];
  const open = tasks.filter((task) => task.status === "open" || task.status === "scheduled");
  const requiredPurpose = next.stage === "needs_follow_up" ? "follow_up" : "maintenance";
  if (!isConnectionStage(next.stage) || (next.stage === "active" && (typeof next.activeGoal !== "string" || !next.activeGoal.trim())) || (next.stage === "archived" && open.length > 0) || ((next.stage === "needs_follow_up" || next.stage === "nurture") && !open.some((task) => task.purpose === requiredPurpose && Number.isFinite(Date.parse(task.dueAt))))) {
    throw new RelationshipLifecycleError("INVALID_TRANSITION", "Mutation violates relationship stage requirements.");
  }
  const audit = plan.audit;
  if (audit.actorId !== input.actorId || audit.connectionId !== input.connectionId || audit.command !== input.command || audit.fromStage !== previous.stage || audit.toStage !== next.stage || new Set(audit.taskIds).size !== changed.size || audit.taskIds.length !== changed.size || audit.taskIds.some((id) => !changed.has(id))) {
    throw new RelationshipLifecycleError("INVALID_TRANSITION", "Audit does not describe the mutation.");
  }
  return structuredClone({ connection: next, tasks });
}
