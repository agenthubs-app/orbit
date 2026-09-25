import type { OrbitApiClient } from "../api/client";
import { z } from "zod";
import { readRelationshipSnapshot, relationshipLifecyclePath } from "../api/relationship-lifecycle";
import type { RelationshipInitializationInput, RelationshipInitializationRead } from "../api/contract/relationship-lifecycle";
import { buildContactInitialization, contactInitializationPath, contactInitializationReceipt, readContactInitialization, type ContactInitializationDraft } from "../api/relationship-initialization";

export type ContactInitializationView = { kind: "loading" | "hidden" | "error" }
  | { kind: "pending" }
  | { kind: "initialized"; stage: "active" | "needs_follow_up" | "nurture" | "archived"; goal: string | null; connectionId: string; tasks: { id: string; title: string; dueAt: string }[] };
export interface ContactInitializationState { view: ContactInitializationView; draft: ContactInitializationDraft; busy: boolean; locked: boolean; error: string; notice: "saved" | "replayed" | null }
const blank = (): ContactInitializationDraft => ({ stage: "", goal: "", title: "", date: "", time: "", archiveConfirmed: false });
const connectionIdentity = z.string().min(1).max(256).refine(value => value.trim() === value && !value.includes("\0"));
function viewOf(read: RelationshipInitializationRead): ContactInitializationView {
  if (read.state === "pending") return { kind: "pending" };
  return { kind: "initialized", stage: read.snapshot.connection.stage, goal: read.snapshot.connection.activeGoal, connectionId: read.snapshot.connection.connectionId,
    tasks: read.snapshot.tasks.filter(task => ["open", "scheduled"].includes(task.status)).map(task => ({ id: task.taskId, title: task.title, dueAt: task.dueAt })) };
}

// One controller per actor/cookie/baseURL/contact scope. No shared cache, writes,
// or optimistic stage projection; only verified receipts update the display.
export function createContactInitializationController(options: {
  client: OrbitApiClient; actorId: string; contactId: string; connectionId: string | null; isCurrent: () => boolean;
  createId: () => string; onConfirmed: () => void;
}) {
  let state: ContactInitializationState = { view: { kind: "loading" }, draft: blank(), busy: false, locked: false, error: "", notice: null };
  let read: RelationshipInitializationRead | null = null;
  let intent: RelationshipInitializationInput | null = null;
  let active = false, epoch = 0;
  let request: AbortController | null = null;
  const listeners = new Set<() => void>();
  const current = (token: number) => active && epoch === token && options.isCurrent();
  const publish = (patch: Partial<ContactInitializationState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
  const invalidResponse = "INVALID_RESPONSE: 返回的关系身份或保存回执不一致 / Relationship response mismatch / 関係の応答が一致しません";

  async function refresh() {
    const token = epoch;
    if (!current(token) || state.busy) return;
    const controller = new AbortController(); request = controller;
    publish({ busy: true, error: "" });
    try {
      const result = await options.client.get<unknown>(contactInitializationPath(options.contactId), { signal: controller.signal });
      if (!current(token) || controller.signal.aborted) return;
      let next: RelationshipInitializationRead | null = null;
      if (!result.success && result.status === 404) {
        // The focused contact detail already resolved its actor-owned
        // relationship. Never download every relationship to recover one ID.
        if (!options.connectionId && read === null) {
          intent = null; publish({ view: { kind: "hidden" }, draft: blank(), locked: false }); return;
        }
        if (!options.connectionId) throw new Error(invalidResponse);
        const canonical = await options.client.get<unknown>(relationshipLifecyclePath(options.connectionId), { signal: controller.signal });
        if (!current(token) || controller.signal.aborted) return;
        if (!canonical.success) throw new Error(`${canonical.error.code}: ${canonical.error.message}`);
        const snapshot = canonical.status >= 200 && canonical.status < 300 ? readRelationshipSnapshot(canonical.data, options.actorId, options.connectionId) : null;
        if (!snapshot || snapshot.connection.contactId !== options.contactId) throw new Error(invalidResponse);
        next = { state: "initialized", snapshot };
      } else {
        if (!result.success) throw new Error(`${result.error.code}: ${result.error.message}`);
        next = result.status >= 200 && result.status < 300 ? readContactInitialization(result.data, options.actorId, options.contactId) : null;
      }
      if (!next) throw new Error(invalidResponse);
      const clear = next.state === "initialized" || (intent !== null && next.state === "pending" && next.revision !== intent.expectedRevision);
      read = next;
      if (clear) intent = null;
      publish({ view: viewOf(next), ...(clear ? { draft: blank(), locked: false } : {}) });
    } catch (cause) {
      if (current(token)) publish({ error: message(cause), ...(read === null ? { view: { kind: "error" } } : {}) });
    } finally { if (current(token)) { request = null; publish({ busy: false }); } }
  }

  async function save(zone: string, canSave: boolean) {
    const token = epoch;
    if (!current(token) || state.busy || read?.state !== "pending") return;
    const dated = state.draft.stage === "needs_follow_up" || state.draft.stage === "nurture";
    if (!intent && dated && !canSave) { publish({ error: "TIME_ZONE_UNAVAILABLE: 无法确认时区 / Time zone unavailable / タイムゾーンを確認できません" }); return; }
    const controller = new AbortController(); request = controller;
    publish({ busy: true, error: "", notice: null });
    try {
      intent ??= buildContactInitialization(read, state.draft, zone, options.createId(), `relationship-task:${options.createId()}`);
      publish({ locked: true });
      const result = await options.client.post<unknown>(contactInitializationPath(options.contactId), { body: intent, signal: controller.signal });
      if (!current(token) || controller.signal.aborted) return;
      if (!result.success) throw new Error(`${result.error.code}: ${result.error.message}`);
      const receipt = result.status >= 200 && result.status < 300 ? contactInitializationReceipt(result.data, options.actorId, options.contactId, read.connectionId, intent) : null;
      if (!receipt) throw new Error(invalidResponse);
      read = { state: "initialized", snapshot: receipt.snapshot }; intent = null;
      publish({ view: viewOf(read), draft: blank(), locked: false, notice: receipt.replayed ? "replayed" : "saved" });
      if (current(token)) options.onConfirmed();
    } catch (cause) { if (current(token)) publish({ error: message(cause) }); }
    finally { if (current(token)) { request = null; publish({ busy: false }); } }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => { active = true; epoch++; publish({ busy: false }); return refresh(); },
    dispose: () => { active = false; epoch++; request?.abort(); request = null; },
    refresh, save,
    change: (patch: Partial<ContactInitializationDraft>) => { if (current(epoch) && !state.busy && !intent) publish({ draft: { ...state.draft, ...patch }, error: "" }); },
  };
}
export type ContactInitializationController = ReturnType<typeof createContactInitializationController>;

export function applyContactInitializationView(data: unknown, view: ContactInitializationView): unknown {
  if (!data || typeof data !== "object" || !("contact" in data) || !data.contact || typeof data.contact !== "object") return data;
  if (view.kind === "pending") return { ...data, contact: { ...data.contact, lifecycleInitialization: "pending", nextAction: "" } };
  if (view.kind === "initialized") return { ...data, contact: { ...data.contact, lifecycleInitialization: "ready", status: view.stage, nextAction: "" } };
  return data;
}
