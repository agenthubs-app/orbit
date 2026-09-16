export type RelationshipLifecycleStage = "needs_follow_up" | "active" | "nurture" | "archived";
export interface RelationshipLifecycleSnapshotDTO {
  connection: { actorId: string; connectionId: string; contactId: string; stage: RelationshipLifecycleStage; activeGoal: string | null; version: number; createdAt: string; updatedAt: string };
  tasks: { actorId: string; connectionId: string; contactId: string; taskId: string; title: string; status: "open" | "scheduled" | "completed" | "dismissed"; purpose: "follow_up" | "maintenance"; dueAt: string; version: number; createdAt: string; updatedAt: string }[];
}
export type RelationshipCompletionOutcome =
  | { kind: "next_task" | "nurture"; nextTask: { taskId: string; title: string; dueAt: string } }
  | { kind: "active"; activeGoal: string }
  | { kind: "archived"; dismissTaskIds: string[]; reason?: string };
export interface RelationshipCompletionInput {
  taskId: string;
  expectedConnectionVersion: number;
  expectedTaskVersion: number;
  idempotencyKey: string;
  outcome: RelationshipCompletionOutcome;
}
export interface RelationshipTaskSummary {
  taskId: string;
  connectionId: string;
  contactId: string;
  contactName: string;
  title: string;
  status: "open" | "scheduled" | "completed" | "dismissed";
  dueAt: string | null;
}

/** Acquisition is not a fifth canonical relationship stage. */
export type RelationshipInitializationRead =
  | { state: "pending"; revision: string; connectionId: string }
  | { state: "initialized"; snapshot: RelationshipLifecycleSnapshotDTO };
export type RelationshipInitializationChoice =
  | { stage: "active"; activeGoal: string }
  | { stage: "needs_follow_up" | "nurture"; nextTask: { taskId: string; title: string; dueAt: string } }
  | { stage: "archived" };
export interface RelationshipInitializationInput {
  expectedRevision: string;
  idempotencyKey: string;
  choice: RelationshipInitializationChoice;
}
