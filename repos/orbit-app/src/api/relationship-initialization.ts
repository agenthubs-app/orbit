import type { RelationshipInitializationInput, RelationshipInitializationRead } from "./contract/relationship-lifecycle";
import { relationshipInitializationReadSchema, relationshipInitializationSchema } from "./schema/relationship-initialization";
import { relationshipLifecycleMutationSchema } from "./schema/relationship-lifecycle";
import { readRelationshipSnapshot } from "./relationship-lifecycle";
import { resolveLocalDateTime } from "../time/date-time";

export interface ContactInitializationDraft {
  stage: "" | "active" | "needs_follow_up" | "nurture" | "archived";
  goal: string; title: string; date: string; time: string; archiveConfirmed: boolean;
}
export const contactInitializationPath = (id: string) => `/api/contacts/${encodeURIComponent(id)}/relationship-initialization`;

export function readContactInitialization(value: unknown, actorId: string, contactId: string): RelationshipInitializationRead | null {
  const parsed = relationshipInitializationReadSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.state === "pending") return parsed.data;
  const snapshot = readRelationshipSnapshot(parsed.data, actorId, parsed.data.snapshot.connection.connectionId);
  return snapshot?.connection.contactId === contactId ? { state: "initialized", snapshot } : null;
}

export function buildContactInitialization(pending: Extract<RelationshipInitializationRead, { state: "pending" }>, draft: ContactInitializationDraft, zone: string, idempotencyKey: string, taskId: string): RelationshipInitializationInput {
  if (!draft.stage) throw new Error("CHOICE_REQUIRED: 请明确选择关系阶段 / Choose a relationship stage / 関係段階を選択してください");
  if (draft.stage === "archived" && !draft.archiveConfirmed) throw new Error("ARCHIVE_CONFIRMATION_REQUIRED: 请确认归档 / Confirm archive / アーカイブを確認してください");
  const choice = draft.stage === "active" ? { stage: draft.stage, activeGoal: draft.goal.trim() }
    : draft.stage === "archived" ? { stage: draft.stage }
      : { stage: draft.stage, nextTask: { taskId, title: draft.title.trim(), dueAt: resolveLocalDateTime(draft.date, draft.time, zone) ?? "" } };
  const parsed = relationshipInitializationSchema.safeParse({ expectedRevision: pending.revision, idempotencyKey, choice });
  if (!parsed.success) throw new Error("INVALID_INPUT: 请填写目标或有效的跟进内容及日期时间 / Enter a goal or a dated next step / 目標または日時付きの次のステップを入力してください");
  return parsed.data;
}

export function contactInitializationReceipt(value: unknown, actorId: string, contactId: string, connectionId: string, body: RelationshipInitializationInput) {
  const parsed = relationshipLifecycleMutationSchema.safeParse(value);
  if (!parsed.success) return null;
  const snapshot = readRelationshipSnapshot(parsed.data, actorId, connectionId);
  if (!snapshot || snapshot.connection.contactId !== contactId || snapshot.connection.stage !== body.choice.stage) return null;
  const choice = body.choice;
  if (choice.stage === "active" && snapshot.connection.activeGoal !== choice.activeGoal) return null;
  if (choice.stage === "archived" && snapshot.tasks.some(task => ["open", "scheduled"].includes(task.status))) return null;
  if ("nextTask" in choice && !snapshot.tasks.some(task => task.taskId === choice.nextTask.taskId && task.title === choice.nextTask.title && task.status === "open" && task.version === 1 && task.purpose === (choice.stage === "nurture" ? "maintenance" : "follow_up") && Date.parse(task.dueAt) === Date.parse(choice.nextTask.dueAt))) return null;
  return { snapshot, replayed: parsed.data.replayed };
}
