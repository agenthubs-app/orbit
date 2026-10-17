import { z } from "zod";
import type { TodoDecisionItem } from "../../../../../shared/contract/todo-page";

type Decision = "accept" | "dismiss" | "snooze";
type DecisionItem = Pick<TodoDecisionItem, "key" | "source" | "sourceId" | "actions" | "sample">;
const id = z.string().min(1);

export class TodoDecisionError extends Error {
  constructor(readonly code: string) { super(code); }
}

/** Native source writes only. The read-only aggregate is never a mutation API. */
export function createTodoDecisionClient(fetcher: typeof fetch = fetch) {
  const pending = new Map<string, { fingerprint: string; key: string }>();
  return { async decide(item: DecisionItem, action: Decision, options: { nextVisibleAt?: string } = {}): Promise<void> {
    if (item.sample || !item.sourceId || item.key !== `${item.source}:${item.sourceId}` || !item.actions.includes(action)
      || !["task_suggestion", "agent_action", "plan_pending"].includes(item.source)
      || (item.source === "plan_pending" && action === "snooze")) throw new TodoDecisionError("TODO_ACTION_UNAVAILABLE");
    if (item.source === "task_suggestion" && action === "snooze"
      && (!options.nextVisibleAt || !Number.isFinite(Date.parse(options.nextVisibleAt)) || Date.parse(options.nextVisibleAt) <= Date.now())) {
      throw new TodoDecisionError("TODO_SNOOZE_TIME_INVALID");
    }
    const encoded = encodeURIComponent(item.sourceId);
    const path = item.source === "task_suggestion" ? `/api/task-suggestions/${encoded}/${action}`
      : item.source === "plan_pending" ? `/api/agent/plans/v2/pending/${encoded}/${action}`
      : action === "snooze" ? `/api/agent/ledger/${encoded}/transition` : `/api/agent/actions/${encoded}/${action}`;
    // Existing queue/ledger decisions have native status guards, not a new
    // client-invented idempotency protocol. Suggestions and plans accept keys.
    const keyed = item.source !== "agent_action";
    const input = item.source === "agent_action" && action === "snooze" ? { transition: "defer" }
      : item.source === "task_suggestion" && action === "snooze" ? { nextVisibleAt: options.nextVisibleAt } : {};
    const fingerprint = JSON.stringify(input);
    let operation = pending.get(path);
    if (keyed && operation?.fingerprint !== fingerprint) {
      operation = { fingerprint, key: `web:todo:${globalThis.crypto.randomUUID()}` };
      pending.set(path, operation);
    }
    let response: Response;
    try {
      response = await fetcher(path, {
        method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, ...(keyed ? { idempotencyKey: operation!.key } : {}) }),
      });
    } catch { throw new TodoDecisionError("NETWORK_ERROR"); }
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
      throw new TodoDecisionError(response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : typeof body?.error?.code === "string" ? body.error.code : "INVALID_RESPONSE");
    }
    try {
      if (item.source === "task_suggestion") {
        const data = z.object({ suggestion: z.object({ id: z.literal(item.sourceId), status: z.literal(action === "accept" ? "accepted" : action === "dismiss" ? "dismissed" : "snoozed"), acceptedTaskId: id.optional(), nextVisibleAt: z.string().optional() }), task: z.object({ id }).optional() }).parse(body.data);
        if (action === "accept" && (!data.task || data.task.id !== data.suggestion.acceptedTaskId)) throw Error();
        if (action === "snooze" && Date.parse(data.suggestion.nextVisibleAt ?? "") !== Date.parse(options.nextVisibleAt!)) throw Error();
      } else if (item.source === "plan_pending") {
        z.object({ id: z.literal(item.sourceId), status: z.literal(action === "accept" ? "accepted" : "dismissed"), replayed: z.boolean() }).parse(body.data);
      } else if (action === "snooze") {
        z.object({ state: z.literal("success"), transition: z.literal("defer"), entry: z.object({ entryId: z.literal(item.sourceId), status: z.literal("deferred") }) }).parse(body.data);
      } else {
        z.object({ state: z.literal("success"), actionId: z.literal(item.sourceId), decision: z.literal(action === "accept" ? "accepted" : "dismissed") }).parse(body.data);
      }
    } catch { throw new TodoDecisionError("INVALID_RESPONSE"); }
    if (pending.get(path) === operation) pending.delete(path);
  } };
}
