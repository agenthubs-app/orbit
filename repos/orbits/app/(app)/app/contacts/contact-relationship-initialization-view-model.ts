import { relationshipInitializationReadSchema, relationshipInitializationSchema } from "../../../../shared/api-schema/relationship-initialization";
import { relationshipLifecycleMutationSchema } from "../../../../shared/api-schema/relationship-lifecycle";
import type { RelationshipInitializationInput, RelationshipLifecycleSnapshotDTO } from "../../../../shared/contract/relationship-lifecycle";

// A presentation state, not a fifth canonical lifecycle stage. Never infer it
// from captured/active or missing versions on arbitrary legacy contacts.
export function hasPendingInitialization(value: object): boolean {
  return "lifecycleInitialization" in value && value.lifecycleInitialization === "pending";
}

export type InitializationStage = "active" | "needs_follow_up" | "nurture" | "archived";
export interface InitializationDraft { stage: "" | InitializationStage; goal: string; title: string; due: string }
export type InitializationView =
  | { state: "loading" | "hidden" | "error" }
  | { state: "pending"; revision: string; connectionId: string }
  | { state: "initialized"; stage: InitializationStage; goal: string | null; tasks: { id: string; title: string; dueAt: string }[]; taskHref: string };

export const initializationStageLabels = {
  active: { zh: "进行中", en: "Active" },
  needs_follow_up: { zh: "需要跟进", en: "Needs follow-up" },
  nurture: { zh: "维护中", en: "Nurture" },
  archived: { zh: "已归档", en: "Archived" },
};

function snapshotView(snapshot: RelationshipLifecycleSnapshotDTO, contactId: string, connectionId?: string): InitializationView {
  const connection = snapshot.connection;
  if (connection.contactId !== contactId || (connectionId && connection.connectionId !== connectionId)
    || snapshot.tasks.some(task => task.contactId !== contactId || task.connectionId !== connection.connectionId || task.actorId !== connection.actorId)) {
    throw new Error("INVALID_RESPONSE: Relationship identity mismatch / 关系身份不匹配");
  }
  return { state: "initialized", stage: connection.stage, goal: connection.activeGoal,
    tasks: snapshot.tasks.filter(task => task.status === "open" || task.status === "scheduled").map(task => ({ id: task.taskId, title: task.title, dueAt: task.dueAt })),
    taskHref: `/app/tasks/relationship/${encodeURIComponent(connection.connectionId)}` };
}

async function dataFrom(response: Response): Promise<unknown> {
  const envelope = await response.json().catch(() => null);
  if (!response.ok || envelope?.success !== true) {
    const code = typeof envelope?.error?.code === "string" ? envelope.error.code : `HTTP_${response.status}`;
    const message = typeof envelope?.error?.message === "string" ? envelope.error.message : "Unable to read relationship response / 无法读取关系响应";
    throw new Error(`${code}: ${message}`);
  }
  return envelope.data;
}

const endpoint = (contactId: string) => `/api/contacts/${encodeURIComponent(contactId)}/relationship-initialization`;
export async function readContactInitialization(contactId: string): Promise<InitializationView> {
  const response = await fetch(endpoint(contactId), { cache: "no-store", credentials: "same-origin" });
  if (response.status === 404) return { state: "hidden" };
  const parsed = relationshipInitializationReadSchema.safeParse(await dataFrom(response));
  if (!parsed.success) throw new Error("INVALID_RESPONSE: Invalid relationship state / 关系响应无效");
  // Zod marks nullable properties optional under this repo's strictNullChecks=false;
  // the runtime schema above has already required and validated activeGoal.
  return parsed.data.state === "initialized" ? snapshotView(parsed.data.snapshot as RelationshipLifecycleSnapshotDTO, contactId) : parsed.data;
}

function localDateToISO(value: string): string {
  const date = new Date(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match || !Number.isFinite(date.getTime()) || date.getFullYear() !== +match[1] || date.getMonth() + 1 !== +match[2]
    || date.getDate() !== +match[3] || date.getHours() !== +match[4] || date.getMinutes() !== +match[5]) {
    throw new Error("INVALID_DATE: Choose a valid local date and time / 请填写有效日期和时间");
  }
  return date.toISOString();
}

export function initializationRequest(draft: InitializationDraft, revision: string): RelationshipInitializationInput {
  if (!draft.stage) throw new Error("CHOICE_REQUIRED: Choose a relationship stage / 请明确选择关系阶段");
  if (draft.stage === "active" && !draft.goal.trim()) throw new Error("GOAL_REQUIRED: Enter your goal / 请填写你的关系目标");
  if ((draft.stage === "needs_follow_up" || draft.stage === "nurture") && !draft.title.trim()) throw new Error("TASK_REQUIRED: Enter your next step / 请填写跟进内容");
  const choice = draft.stage === "active" ? { stage: draft.stage, activeGoal: draft.goal.trim() }
    : draft.stage === "archived" ? { stage: draft.stage }
      : { stage: draft.stage, nextTask: { taskId: `task:${crypto.randomUUID()}`, title: draft.title.trim(), dueAt: localDateToISO(draft.due) } };
  const parsed = relationshipInitializationSchema.safeParse({ expectedRevision: revision, idempotencyKey: `initialize:${crypto.randomUUID()}`, choice });
  if (!parsed.success) throw new Error("INVALID_INPUT: Check goal, task, and date / 请检查目标、跟进内容和日期");
  return { ...parsed.data, choice: parsed.data.choice! };
}

export async function saveContactInitialization(contactId: string, connectionId: string, input: RelationshipInitializationInput): Promise<{ view: InitializationView; replayed: boolean }> {
  const response = await fetch(endpoint(contactId), { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
  const parsed = relationshipLifecycleMutationSchema.safeParse(await dataFrom(response));
  if (!parsed.success) throw new Error("INVALID_RESPONSE: Invalid save receipt / 保存回执无效；请重试原提交");
  const { snapshot, replayed } = parsed.data;
  const choice = input.choice;
  if (snapshot.connection.stage !== choice.stage
    || (choice.stage === "active" && snapshot.connection.activeGoal !== choice.activeGoal)
    || ("nextTask" in choice && !snapshot.tasks.some(task => task.taskId === choice.nextTask.taskId && task.title === choice.nextTask.title && Date.parse(task.dueAt) === Date.parse(choice.nextTask.dueAt)))) {
    throw new Error("INVALID_RESPONSE: Save receipt does not match your choice / 保存回执与选择不符；请重试原提交");
  }
  return { view: snapshotView(snapshot as RelationshipLifecycleSnapshotDTO, contactId, connectionId), replayed };
}
