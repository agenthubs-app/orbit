import type { RelationshipCompletionInput, RelationshipLifecycleSnapshotDTO } from "./contract/relationship-lifecycle";
import { relationshipCompletionSchema, relationshipLifecycleMutationSchema, relationshipLifecycleReadSchema } from "./schema/relationship-lifecycle";
import { resolveLocalDateTime } from "../time/date-time";

export interface RelationshipCompletionDraft { taskId: string; kind: RelationshipCompletionInput["outcome"]["kind"]; title: string; date: string; time: string; goal: string; archiveConfirmed: boolean }
export const relationshipLifecyclePath = (id: string) => `/api/connections/${encodeURIComponent(id)}/lifecycle`;
export function readRelationshipSnapshot(value: unknown, actorId: string, connectionId: string): RelationshipLifecycleSnapshotDTO | null {
  const parsed = relationshipLifecycleReadSchema.safeParse(value);
  if (!parsed.success) return null;
  const snapshot = parsed.data.snapshot;
  const connection = snapshot.connection;
  if (connection.actorId !== actorId || connection.connectionId !== connectionId || new Set(snapshot.tasks.map(task => task.taskId)).size !== snapshot.tasks.length || snapshot.tasks.some(task => task.actorId !== actorId || task.connectionId !== connectionId || task.contactId !== connection.contactId)) return null;
  return snapshot;
}
export function buildRelationshipCompletion(snapshot: RelationshipLifecycleSnapshotDTO, draft: RelationshipCompletionDraft, zone: string, idempotencyKey: string, nextTaskId: string): RelationshipCompletionInput {
  const task = snapshot.tasks.find(item => item.taskId === draft.taskId && ["open", "scheduled"].includes(item.status));
  if (!task) throw new Error("请先选择当前未完成的跟进。");
  if (draft.kind === "archived" && !draft.archiveConfirmed) throw new Error("请确认归档并忽略其余未完成跟进。");
  if (draft.kind === "next_task" && !["needs_follow_up", "nurture"].includes(snapshot.connection.stage)) throw new Error("当前关系阶段需要选择新的下一步。");
  const outcome = draft.kind === "active" ? { kind: draft.kind, activeGoal: draft.goal.trim() }
    : draft.kind === "archived" ? { kind: draft.kind, dismissTaskIds: snapshot.tasks.filter(item => item.taskId !== task.taskId && ["open", "scheduled"].includes(item.status)).map(item => item.taskId) }
    : { kind: draft.kind, nextTask: { taskId: nextTaskId, title: draft.title.trim(), dueAt: resolveLocalDateTime(draft.date, draft.time, zone) ?? "" } };
  const parsed = relationshipCompletionSchema.safeParse({ taskId: task.taskId, expectedConnectionVersion: snapshot.connection.version, expectedTaskVersion: task.version, idempotencyKey, outcome });
  if (!parsed.success) throw new Error("请填写完整的关系目标，或下一次跟进内容和有效日期时间。");
  return { ...parsed.data, outcome: parsed.data.outcome.kind === "archived" ? { kind: "archived", dismissTaskIds: parsed.data.outcome.dismissTaskIds } : parsed.data.outcome };
}
export function relationshipReceiptMatches(value: unknown, before: RelationshipLifecycleSnapshotDTO, body: RelationshipCompletionInput): RelationshipLifecycleSnapshotDTO | null {
  if (!relationshipLifecycleMutationSchema.safeParse(value).success) return null;
  const after = readRelationshipSnapshot(value, before.connection.actorId, before.connection.connectionId);
  if (!after || after.connection.version !== body.expectedConnectionVersion + 1 || after.connection.contactId !== before.connection.contactId) return null;
  const completed = after.tasks.find(item => item.taskId === body.taskId);
  if (!completed || completed.status !== "completed" || completed.version !== body.expectedTaskVersion + 1) return null;
  const outcome = body.outcome;
  if (outcome.kind === "active") return after.connection.stage === "active" && after.connection.activeGoal === outcome.activeGoal ? after : null;
  if (outcome.kind === "archived") return after.connection.stage === "archived" && !after.tasks.some(item => ["open", "scheduled"].includes(item.status)) ? after : null;
  const next = after.tasks.find(item => item.taskId === outcome.nextTask.taskId);
  return after.connection.stage === (outcome.kind === "nurture" ? "nurture" : before.connection.stage) && next?.status === "open" && next.version === 1 && next.title === outcome.nextTask.title && next.dueAt === new Date(outcome.nextTask.dueAt).toISOString() ? after : null;
}
