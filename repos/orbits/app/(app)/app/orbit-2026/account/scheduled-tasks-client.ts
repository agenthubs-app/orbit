/**
 * agent-design AG15 (approved visual draft 15-3, 15-4): the web's reads and writes of 「定时任务」. The list, one task with
 * its history, the switch (pause / resume), delete and the form all go to /api/agent/automations; every answer is
 * checked with the shared schemas, so a shape the page does not know never reaches it.
 */
import { agentReferenceSearchResultSchema, agentScheduledTaskHistorySchema, agentScheduledTaskListSchema } from "../../../../../shared/api-schema/agent-v1";
import type { AgentReferenceCandidateContract, AgentScheduledTaskContract, AgentScheduledTaskFormContract, AgentScheduledTaskHistoryContract } from "../../../../../shared/contract/agent-v1";
import type { OrbitLanguage } from "../../../../../shared/contract/language";

export const TASK_LIST_KEY = "settings:scheduled-tasks";
export const taskHistoryKey = (id: string) => `settings:scheduled-task:${id}`;

async function body(response: Response): Promise<unknown> {
  const parsed = (await response.json().catch(() => null)) as { data?: unknown; error?: { code?: string } } | null;
  if (!response.ok) throw new Error(parsed?.error?.code ?? `HTTP_${response.status}`);
  return parsed?.data;
}

export async function readScheduledTasks(language: OrbitLanguage, signal?: AbortSignal): Promise<AgentScheduledTaskContract[]> {
  const data = await body(await fetch(`/api/agent/automations?language=${language}`, { cache: "no-store", credentials: "same-origin", signal }));
  const parsed = agentScheduledTaskListSchema.safeParse({ tasks: (data as { tasks?: unknown } | undefined)?.tasks });
  if (!parsed.success) throw new Error("TASKS_UNREADABLE");
  return [...parsed.data.tasks];
}

/** One task and its history; null when it is not there (deleted, or not this account's). */
export async function readScheduledTask(id: string, language: OrbitLanguage, signal?: AbortSignal): Promise<AgentScheduledTaskHistoryContract | null> {
  const response = await fetch(`/api/agent/automations/${encodeURIComponent(id)}/runs?language=${language}`, { cache: "no-store", credentials: "same-origin", signal });
  if (response.status === 404) return null;
  const parsed = agentScheduledTaskHistorySchema.safeParse(await body(response));
  if (!parsed.success) throw new Error("TASK_UNREADABLE");
  return parsed.data;
}

/** The switch: off pauses (a result not sent yet is not sent either), on resumes. */
export async function setScheduledTaskRunning(id: string, running: boolean): Promise<void> {
  await body(await fetch(`/api/agent/automations/${encodeURIComponent(id)}`, { body: JSON.stringify({ status: running ? "active" : "paused" }), credentials: "same-origin", headers: { "content-type": "application/json" }, method: "PATCH" }));
}

/**
 * AG16 (draft 16-1): the task's own reminder switch. It takes effect at once (no card) and covers the owner's phone and
 * browser. Only the switch: the reminder's sentence follows the language of the task's results.
 */
export async function setScheduledTaskPush(id: string, push: boolean): Promise<void> {
  await body(await fetch(`/api/agent/automations/${encodeURIComponent(id)}/reminder`, { body: JSON.stringify({ push }), credentials: "same-origin", headers: { "content-type": "application/json" }, method: "PUT" }));
}

export async function deleteScheduledTask(id: string): Promise<void> {
  const response = await fetch(`/api/agent/automations/${encodeURIComponent(id)}`, { credentials: "same-origin", method: "DELETE" });
  if (!response.ok && response.status !== 404) throw new Error(`HTTP_${response.status}`);
}

/** Saves the form: a new task (no id) or a change to one. The server writes the rule's words. */
export async function saveScheduledTaskForm(form: AgentScheduledTaskFormContract, language: OrbitLanguage, id?: string): Promise<string> {
  const response = await fetch(id ? `/api/agent/automations/${encodeURIComponent(id)}` : "/api/agent/automations", { body: JSON.stringify({ form, language }), credentials: "same-origin", headers: { "content-type": "application/json" }, method: id ? "PATCH" : "POST" });
  const data = (await body(response)) as { automation?: { automationId?: unknown } } | undefined;
  const saved = typeof data?.automation?.automationId === "string" ? data.automation.automationId : id;
  if (!saved) throw new Error("TASK_NOT_SAVED");
  return saved;
}

/** The account's own notes matching some words (AG11's search), for 「按什么挑」. */
export async function searchNotes(query: string, signal?: AbortSignal): Promise<AgentReferenceCandidateContract[]> {
  const params = new URLSearchParams({ kind: "memo", q: query.trim() });
  const response = await fetch(`/api/agent/references/search?${params}`, { cache: "no-store", credentials: "same-origin", signal });
  const parsed = agentReferenceSearchResultSchema.safeParse(await body(response));
  if (!parsed.success) throw new Error("NOTES_UNREADABLE");
  return parsed.data.groups.flatMap((group) => (group.type === "memo" ? [...group.items] : []));
}

/** The device's time zone, the form's default for a new task. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
  } catch {
    return "Asia/Tokyo";
  }
}
