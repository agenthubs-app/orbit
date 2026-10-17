import type { RelationshipCompletionOutcome } from "../../../../../shared/contract/relationship-lifecycle";
import { z } from "zod";
import { relationshipCompletionSchema, relationshipLifecycleMutationSchema, relationshipLifecycleSnapshotSchema } from "../../../../../shared/api-schema/relationship-lifecycle";
import { createRelationshipFollowupClient, type RelationshipFollowupRead } from "./relationship-followup-client";

export type FollowupMedium = "email" | "phone" | "met" | "message";
export interface FollowupNoteReceipt { encounterId: string; noteText: string }
const identity = z.string().min(1).max(256).refine(value => value.trim() === value && value !== "." && value !== ".." && !/[\u0000-\u001f\u007f]/u.test(value));
const mappingSchema = z.object({ taskId: identity, connectionId: identity, contactId: identity });
const noteSchema = z.object({ encounterId: identity, contactId: identity, connectionId: identity, noteText: z.string().max(5_000), observedAt: z.string().datetime(), privacy: z.literal("private"), talked: z.literal("uncertain"), tags: z.array(z.string()).max(20) });
const snapshotKey = (snapshot: z.infer<typeof relationshipLifecycleSnapshotSchema>) => JSON.stringify({ connection: snapshot.connection, tasks: [...snapshot.tasks].sort((a, b) => a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0) });

export function createRelationshipFollowupActions(options: { fetch?: typeof fetch; actorId?: string; now?: () => number } = {}) {
  const fetcher = options.fetch ?? globalThis.fetch, clock = options.now ?? Date.now;
  const reader = createRelationshipFollowupClient(options);
  const intents = new Map<string, { key: string; observedAt: string }>();
  function intent(fingerprint: string) {
    let value = intents.get(fingerprint);
    if (!value) { value = { key: `web:followup:${crypto.randomUUID()}`, observedAt: new Date(clock()).toISOString() }; intents.set(fingerprint, value); }
    return value;
  }
  function checked(detail: { mapping: unknown; snapshot: unknown }) {
    const mapping = mappingSchema.safeParse(detail?.mapping), snapshot = relationshipLifecycleSnapshotSchema.safeParse(detail?.snapshot);
    if (!mapping.success || !snapshot.success) throw Error("INVALID_RESPONSE");
    const { connection, tasks } = snapshot.data;
    const task = tasks.find(row => row.taskId === mapping.data.taskId);
    if (!task || options.actorId && connection.actorId !== options.actorId || connection.connectionId !== mapping.data.connectionId || connection.contactId !== mapping.data.contactId
      || new Set(tasks.map(row => row.taskId)).size !== tasks.length || tasks.some(row => row.actorId !== connection.actorId || row.connectionId !== connection.connectionId || row.contactId !== connection.contactId)) throw Error("INVALID_RESPONSE");
    return { mapping: mapping.data, snapshot: snapshot.data, task };
  }
  async function post(path: string, body: object, signal?: AbortSignal, key?: string) {
    signal?.throwIfAborted();
    let response: Response;
    try { response = await fetcher(path, { method: "POST", cache: "no-store", credentials: "same-origin", signal, headers: { "content-type": "application/json", accept: "application/json", ...(key ? { "idempotency-key": key } : {}) }, body: JSON.stringify(body) }); }
    catch { signal?.throwIfAborted(); throw Error("UNAVAILABLE"); }
    signal?.throwIfAborted();
    if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : response.status === 409 ? "CONFLICT" : "UNAVAILABLE");
    if (Number(response.headers.get("content-length")) > 1_048_576) throw Error("INVALID_RESPONSE");
    const text = await response.text(); signal?.throwIfAborted();
    if (new TextEncoder().encode(text).byteLength > 1_048_576) throw Error("INVALID_RESPONSE");
    let envelope: { success?: boolean; data?: unknown };
    try { envelope = JSON.parse(text); } catch { throw Error("INVALID_RESPONSE"); }
    if (envelope?.success !== true) throw Error("INVALID_RESPONSE");
    return envelope.data;
  }
  return {
    async complete(detail: RelationshipFollowupRead, outcome: RelationshipCompletionOutcome, signal?: AbortSignal): Promise<RelationshipFollowupRead> {
      const before = checked(detail);
      if (!["open", "scheduled"].includes(before.task.status)) throw Error("INVALID_RESPONSE");
      const input = { taskId: before.mapping.taskId, expectedConnectionVersion: before.snapshot.connection.version, expectedTaskVersion: before.task.version, outcome };
      const parsed = relationshipCompletionSchema.safeParse({ ...input, idempotencyKey: "validate" });
      if (!parsed.success) throw Error("INVALID_RESPONSE");
      const body = { ...parsed.data, idempotencyKey: intent(JSON.stringify([before.mapping, input])).key };
      const raw = await post(`/api/connections/${encodeURIComponent(before.mapping.connectionId)}/lifecycle`, body, signal);
      const receipt = relationshipLifecycleMutationSchema.safeParse(raw);
      if (!receipt.success) throw Error("INVALID_RESPONSE");
      const after = checked({ mapping: before.mapping, snapshot: receipt.data.snapshot });
      const nextStage = outcome.kind === "next_task" ? before.snapshot.connection.stage : outcome.kind;
      if (after.snapshot.connection.actorId !== before.snapshot.connection.actorId || after.snapshot.connection.version !== before.snapshot.connection.version + 1 || after.snapshot.connection.stage !== nextStage || after.task.status !== "completed" || after.task.version !== before.task.version + 1 || after.task.title !== before.task.title || after.task.dueAt !== before.task.dueAt) throw Error("INVALID_RESPONSE");
      if (outcome.kind === "active" && after.snapshot.connection.activeGoal !== outcome.activeGoal.trim()) throw Error("INVALID_RESPONSE");
      if (outcome.kind === "next_task" || outcome.kind === "nurture") {
        const next = after.snapshot.tasks.find(row => row.taskId === outcome.nextTask.taskId);
        if (!next || next.title !== outcome.nextTask.title.trim() || Date.parse(next.dueAt) !== Date.parse(outcome.nextTask.dueAt) || next.version !== 1 || next.status !== "open" || next.purpose !== (nextStage === "nurture" ? "maintenance" : "follow_up")) throw Error("INVALID_RESPONSE");
      }
      if (outcome.kind === "archived" && after.snapshot.tasks.some(row => ["open", "scheduled"].includes(row.status))) throw Error("INVALID_RESPONSE");
      if (after.snapshot.tasks.length !== before.snapshot.tasks.length + (outcome.kind === "next_task" || outcome.kind === "nurture" ? 1 : 0)) throw Error("INVALID_RESPONSE");
      for (const previous of before.snapshot.tasks) {
        const current = after.snapshot.tasks.find(row => row.taskId === previous.taskId);
        if (!current) throw Error("INVALID_RESPONSE");
        const closed = previous.taskId === before.mapping.taskId || outcome.kind === "archived" && ["open", "scheduled"].includes(previous.status);
        const expected = closed ? { ...previous, status: previous.taskId === before.mapping.taskId ? "completed" : "dismissed", version: previous.version + 1, updatedAt: current.updatedAt } : previous;
        if (JSON.stringify(current) !== JSON.stringify(expected)) throw Error("INVALID_RESPONSE");
      }
      const verified = await reader.read(before.mapping.taskId, signal);
      if (snapshotKey(checked(verified).snapshot) !== snapshotKey(after.snapshot)) throw Error("INVALID_RESPONSE");
      return verified;
    },
    async saveNote(detail: RelationshipFollowupRead, medium: FollowupMedium, note: string, signal?: AbortSignal): Promise<FollowupNoteReceipt> {
      const before = checked(detail), noteText = note.trim();
      if (!noteText || noteText.length > 5_000 || !["email", "phone", "met", "message"].includes(medium)) throw Error("INVALID_RESPONSE");
      const action = intent(JSON.stringify(["note", before.mapping, medium, noteText]));
      const body = { contactId: before.mapping.contactId, connectionId: before.mapping.connectionId, observedAt: action.observedAt, privacy: "private", talked: "uncertain", noteText, tags: ["followup", `medium:${medium}`] };
      const parsed = noteSchema.safeParse(await post("/api/encounters", body, signal, action.key));
      if (!parsed.success || parsed.data.contactId !== body.contactId || parsed.data.connectionId !== body.connectionId || parsed.data.noteText !== body.noteText || parsed.data.observedAt !== body.observedAt || JSON.stringify(parsed.data.tags) !== JSON.stringify(body.tags)) throw Error("INVALID_RESPONSE");
      return { encounterId: parsed.data.encounterId, noteText: parsed.data.noteText };
    },
  };
}
