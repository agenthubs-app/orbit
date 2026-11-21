/**
 * agent-design AG14 (设计稿 §6 "记忆分两种取法"): which saved entries a task may use.
 *
 * - 「回答时参考这些」 off: nothing is taken, standing rules included.
 * - Standing rules (category `constraint`) are loaded every time inside their range — every task (`all`) or the task
 *   at hand — and take no place among the others; at most 20 per account and workspace.
 * - Goals, preferences and identity entries are taken only for the task they apply to, inside their validity dates, at
 *   most 5; with no match the list is empty.
 * - An entry that was never classified (stored before AG14) is used only where its own words name the task.
 * - Deleted and expired entries are never taken. What is returned is read from the service at the moment of the call,
 *   so a resumed conversation or a scheduled run always sees the current entries (never a copy kept elsewhere).
 *
 * `recallFor()` needs no conversation: a scheduled rule (AG15) calls it with the rule owner's account and workspace.
 */
import type { ModuleMode } from "../../../shared/services/module-mode";
import type { AgentMemory, AgentMemoryService, AgentMemorySettings, AgentMemorySnapshot, AgentMemoryStructured, AgentMemoryTask } from "./contract";
import { createAgentMemoryService } from "./service-factory";

export type MemoryRecallTask = Exclude<AgentMemoryTask, "all">;

export const RECALL_RELEVANT_LIMIT = 5;
export const RECALL_CONSTRAINT_LIMIT = 20;

export interface RecalledMemory {
  memoryId: string;
  revision: number;
  category: AgentMemory["category"];
  content: string;
  appliesTo: AgentMemoryTask[];
  structured: AgentMemoryStructured | null;
  /** `rule`: a standing rule loaded every time; `relevant`: taken because it applies to this task. */
  why: "rule" | "relevant";
  /** The rule applies to every task (`all`), not to this task in particular. */
  everyTask: boolean;
}

export interface MemoryRecall {
  /** False when 「回答时参考这些」 is off: nothing was taken. */
  enabled: boolean;
  /** The scope's memory version at the time of the call. */
  memoryVersion: number;
  /** Standing rules in range (every task, and this task). */
  rules: RecalledMemory[];
  /** Goals, preferences and identity entries for this task, at most `limit`. */
  relevant: RecalledMemory[];
}

export interface RecallSelection {
  task?: MemoryRecallTask | null;
  /** Today as YYYY-MM-DD in the user's time zone (validity dates are days). */
  today: string;
  limit?: number;
}

/** Words that name a task, for entries that were never classified (zh, ja, en). */
const TASK_WORDS: Record<MemoryRecallTask, RegExp> = {
  "contact.recommend": /(联系人|人脉|連絡先|contacts?|people)/iu,
  "event.recommend": /(活动|活動|イベント|讲座|研讨会|events?|meetups?)/iu,
  "memo.summarize": /(笔记|メモ|notes?|memos?)/iu,
  "schedule.plan": /(日程|行程|スケジュール|予定|schedule|calendar)/iu,
  "todo.plan": /(待办|任务|タスク|ToDo|to-?dos?|tasks?)/iu,
};

function inValidity(memory: AgentMemory, today: string): boolean {
  if (memory.validFrom && today < memory.validFrom) return false;
  if (memory.validUntil && today > memory.validUntil) return false;
  return true;
}

function appliesToTask(memory: AgentMemory, task: MemoryRecallTask | null | undefined): { applies: boolean; everyTask: boolean } {
  if (memory.appliesTo.includes("all")) return { applies: true, everyTask: true };
  if (!task) return { applies: false, everyTask: false };
  if (memory.appliesTo.length) return { applies: memory.appliesTo.includes(task), everyTask: false };
  // Not classified: only where its own words name the task.
  return { applies: TASK_WORDS[task].test(memory.content), everyTask: false };
}

const recalled = (memory: AgentMemory, why: RecalledMemory["why"], everyTask: boolean): RecalledMemory => ({
  appliesTo: [...memory.appliesTo],
  category: memory.category,
  content: memory.content,
  everyTask,
  memoryId: memory.memoryId,
  revision: memory.revision,
  structured: memory.structured ? { ...memory.structured } : null,
  why,
});

/** The selection itself (no storage): what of these entries a task may use today. */
export function selectRecall(memories: readonly AgentMemory[], settings: Pick<AgentMemorySettings, "enabled">, selection: RecallSelection): Pick<MemoryRecall, "enabled" | "rules" | "relevant"> {
  if (!settings.enabled) return { enabled: false, relevant: [], rules: [] };
  const limit = Math.max(0, Math.min(RECALL_RELEVANT_LIMIT, selection.limit ?? RECALL_RELEVANT_LIMIT));
  const usable = memories
    .filter((memory) => memory.status === "active" && inValidity(memory, selection.today))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.memoryId.localeCompare(right.memoryId));
  const rules: RecalledMemory[] = [];
  const relevant: RecalledMemory[] = [];
  for (const memory of usable) {
    const { applies, everyTask } = appliesToTask(memory, selection.task);
    if (!applies) continue;
    if (memory.category === "constraint") {
      if (rules.length < RECALL_CONSTRAINT_LIMIT) rules.push(recalled(memory, "rule", everyTask));
    } else if (relevant.length < limit) relevant.push(recalled(memory, "relevant", everyTask));
  }
  return { enabled: true, relevant, rules };
}

/** Today as YYYY-MM-DD in a time zone. */
export function recallDay(now: string, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export interface RecallForInput {
  /** The canonical account id of the owner (never an Auth.js user id). */
  accountId: string;
  /** The workspace the account is in; absent: the deployment's workspace. */
  workspaceId?: string;
  /** The kind of task at hand; absent or null: only the rules for every task. */
  task?: MemoryRecallTask | null;
  /** ISO time of the call (the round's clock); default: now. */
  now?: string;
  timeZone?: string;
  limit?: number;
  mode?: ModuleMode | string;
  /** A service to read from (tests, a caller that has one already). */
  service?: Pick<AgentMemoryService, "snapshot">;
}

/**
 * The entries a task may use right now, for one account in one workspace. Needs no conversation and no request:
 * `await recallFor({ accountId, workspaceId, task: "event.recommend", now })`. One read of the scope.
 */
export async function recallFor(input: RecallForInput): Promise<MemoryRecall> {
  const service = input.service ?? createAgentMemoryService({ actorId: input.accountId, mode: input.mode, ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}) });
  return recallFrom(await service.snapshot(), { limit: input.limit, now: input.now, task: input.task ?? null, timeZone: input.timeZone });
}

/** The same selection over a snapshot already read (a turn reads its scope once and recalls per task from it). */
export function recallFrom(snapshot: Pick<AgentMemorySnapshot, "settings" | "entries" | "version">, input: { task?: MemoryRecallTask | null; now?: string; timeZone?: string; limit?: number }): MemoryRecall {
  const today = recallDay(input.now ?? new Date().toISOString(), input.timeZone ?? process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo");
  return { ...selectRecall(snapshot.entries, snapshot.settings, { limit: input.limit, task: input.task ?? null, today }), memoryVersion: snapshot.version };
}

/** Every recalled entry as a reference (id and revision; what a trace or a session state may keep). */
export function recallRefs(recall: Pick<MemoryRecall, "rules" | "relevant">): { memoryId: string; revision: number }[] {
  return [...recall.rules, ...recall.relevant].map((item) => ({ memoryId: item.memoryId, revision: item.revision }));
}
