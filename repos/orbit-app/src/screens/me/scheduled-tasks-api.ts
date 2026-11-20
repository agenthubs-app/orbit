/**
 * agent-design AG15 (approved visual draft 15-3, 15-4): the App's reads and writes of 「定时任务」 — the same routes and
 * shapes the web uses (/api/agent/automations), checked with the synced schemas.
 */
import { agentScheduledTaskHistorySchema, agentScheduledTaskListSchema } from "../../api/schema/agent-v1";
import type { AgentScheduledTaskContract, AgentScheduledTaskFormContract, AgentScheduledTaskHistoryContract } from "../../api/contract/agent-v1";
import type { OrbitApiClient } from "../../api/client";

export type TaskRead<T> = { kind: "ok"; value: T } | { kind: "missing" } | { kind: "error" };

export async function readScheduledTasks(client: OrbitApiClient, language: string): Promise<TaskRead<AgentScheduledTaskContract[]>> {
  const result = await client.get<{ tasks?: unknown }>(`/api/agent/automations?language=${language}`).catch(() => null);
  if (!result?.success) return { kind: "error" };
  const parsed = agentScheduledTaskListSchema.safeParse({ tasks: result.data?.tasks });
  return parsed.success ? { kind: "ok", value: [...parsed.data.tasks] } : { kind: "error" };
}

export async function readScheduledTask(client: OrbitApiClient, id: string, language: string): Promise<TaskRead<AgentScheduledTaskHistoryContract>> {
  const result = await client.get<unknown>(`/api/agent/automations/${encodeURIComponent(id)}/runs?language=${language}`).catch(() => null);
  if (!result) return { kind: "error" };
  if (!result.success) return result.status === 404 ? { kind: "missing" } : { kind: "error" };
  const parsed = agentScheduledTaskHistorySchema.safeParse(result.data);
  return parsed.success ? { kind: "ok", value: parsed.data } : { kind: "error" };
}

export async function setScheduledTaskRunning(client: OrbitApiClient, id: string, running: boolean): Promise<boolean> {
  const result = await client.patch<unknown>(`/api/agent/automations/${encodeURIComponent(id)}`, { body: { status: running ? "active" : "paused" } }).catch(() => null);
  return Boolean(result?.success);
}

/** AG16 (draft 16-1): the task's own reminder switch, at once and without a card. Only the switch is sent. */
export async function setScheduledTaskPush(client: OrbitApiClient, id: string, push: boolean): Promise<boolean> {
  const result = await client.put<unknown>(`/api/agent/automations/${encodeURIComponent(id)}/reminder`, { body: { push } }).catch(() => null);
  return Boolean(result?.success);
}

export async function deleteScheduledTask(client: OrbitApiClient, id: string): Promise<boolean> {
  const result = await client.delete<unknown>(`/api/agent/automations/${encodeURIComponent(id)}`).catch(() => null);
  // 204 has no body (the client reads that as a failed envelope): the status says it was deleted.
  return Boolean(result?.success || result?.status === 204 || result?.status === 404);
}

/** The form, new (no id) or a change; resolves to the task's id, or the server's error code. */
export async function saveScheduledTaskForm(client: OrbitApiClient, form: AgentScheduledTaskFormContract, language: string, id?: string): Promise<{ ok: true; id: string } | { ok: false; code: string }> {
  const body = { form, language };
  // One literal path per call, so the offline inventory sees exactly the two routes this sends to.
  const result = await (id
    ? client.patch<{ automation?: { automationId?: unknown } }>(`/api/agent/automations/${encodeURIComponent(id)}`, { body })
    : client.post<{ automation?: { automationId?: unknown } }>("/api/agent/automations", { body })).catch(() => null);
  if (!result) return { code: "OFFLINE", ok: false };
  if (!result.success) return { code: result.error?.code ?? "FAILED", ok: false };
  const saved = typeof result.data?.automation?.automationId === "string" ? result.data.automation.automationId : id;
  return saved ? { id: saved, ok: true } : { code: "FAILED", ok: false };
}

/** The device's time zone, the form's default for a new task. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
  } catch {
    return "Asia/Tokyo";
  }
}
