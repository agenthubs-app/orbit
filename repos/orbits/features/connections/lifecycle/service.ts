import { createHash } from "node:crypto";
import { RelationshipLifecycleError, type RelationshipStageCommand, type RelationshipTaskCompletionCommand } from "./contract";
import { validateLifecycleMutationInput, type RelationshipLifecycleMutationInput, type RelationshipLifecycleMutationResult, type RelationshipLifecycleRepository } from "./repository";
import { applyRelationshipStageCommand, applyRelationshipTaskCompletion } from "./transition";

export interface RelationshipLifecycleCommandResult extends RelationshipLifecycleMutationResult {
  externalWriteExecuted: false;
  messageSent: false;
  aiProviderCalled: false;
}

export interface RelationshipLifecycleService {
  changeStage(command: RelationshipStageCommand): Promise<RelationshipLifecycleCommandResult>;
  completeTask(command: RelationshipTaskCompletionCommand): Promise<RelationshipLifecycleCommandResult>;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([key, entry]) => [key, canonicalValue(entry)]));
  }
  return value;
}

function mutationInput(command: RelationshipStageCommand | RelationshipTaskCompletionCommand, kind: RelationshipLifecycleMutationInput["command"], expectedVersion: number): RelationshipLifecycleMutationInput {
  const { idempotencyKey, ...body } = command;
  const input: RelationshipLifecycleMutationInput = { actorId: command.actorId, connectionId: command.connectionId, idempotencyKey, command: kind, expectedVersion, requestHash: "pending" };
  validateLifecycleMutationInput(input);
  input.requestHash = createHash("sha256").update(JSON.stringify(canonicalValue({ ...body, command: kind }))).digest("hex");
  return input;
}

function resultWithSideEffects(result: RelationshipLifecycleMutationResult): RelationshipLifecycleCommandResult {
  // These commands only mutate the lifecycle repository, never external systems.
  return { ...result, externalWriteExecuted: false, messageSent: false, aiProviderCalled: false };
}

export function createRelationshipLifecycleService(repository: RelationshipLifecycleRepository, now: () => string = () => new Date().toISOString()): RelationshipLifecycleService {
  return {
    async changeStage(command) {
      command = structuredClone(command);
      const input = mutationInput(command, "change_stage", command.expectedVersion);
      const occurredAt = now();
      const result = await repository.mutate(input, (snapshot) => applyRelationshipStageCommand({ command, current: snapshot.connection, tasks: snapshot.tasks, now: occurredAt }));
      return resultWithSideEffects(result);
    },
    async completeTask(command) {
      command = structuredClone(command);
      if (typeof command.taskId !== "string" || !command.taskId.trim() || command.taskId !== command.taskId.trim() || command.taskId.includes("\0")) throw new RelationshipLifecycleError("INVALID_TASK", "A valid task identifier is required.");
      if (!Number.isSafeInteger(command.expectedTaskVersion) || command.expectedTaskVersion < 1 || command.expectedTaskVersion >= Number.MAX_SAFE_INTEGER) throw new RelationshipLifecycleError("CONFLICT", "Invalid task version.");
      const input = mutationInput(command, "complete_task", command.expectedConnectionVersion);
      const occurredAt = now();
      const result = await repository.mutate(input, (snapshot) => applyRelationshipTaskCompletion({ command, current: snapshot.connection, tasks: snapshot.tasks, now: occurredAt }));
      return resultWithSideEffects(result);
    },
  };
}
