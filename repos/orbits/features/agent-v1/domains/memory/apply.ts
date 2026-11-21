/**
 * agent-design AG14: applyApproved for the memory items of a card (domains/memory/ops.ts). They run only in the
 * executor after the click, through the memory service of the card's own account and workspace:
 *
 * - memory.create writes the entry the card showed under the item's own id (applied twice: still one entry);
 * - memory.update writes the card's values only if the entry is still at the revision the card showed;
 * - memory.delete forgets the entry at that revision: its words go, a mark stays, the memory version moves on.
 *
 * An entry that changed or went since the card was shown is not written (a permanent failure, never retried).
 */
import type { AgentMemoryService, AgentMemoryStructured, AgentMemoryTask, UpdateAgentMemoryInput } from "../../../agent/memory/contract";
import { AgentMemoryRevisionConflictError } from "../../../agent/memory/contract";
import { AGENT_MEMORY_COLLECTION } from "../../../agent/memory/service";
import type { AgentActionExecutor } from "../../../agent/runtime/executor-registry";
import { AgentExecutionPermanentError } from "../../../agent/runtime/service";
import { MEMORY_CREATE, MEMORY_DELETE, MEMORY_UPDATE } from "./ops";
import { twinOfNewEntry } from "./turn";

export interface MemoryWriteDeps {
  memory: Pick<AgentMemoryService, "create" | "update" | "remove" | "get" | "deletionMarks"> & Partial<Pick<AgentMemoryService, "list">>;
}

const text = (payload: Readonly<Record<string, unknown>>, key: string) => (typeof payload[key] === "string" && String(payload[key]).trim() ? String(payload[key]).trim() : undefined);
const changed = (what: string) => new AgentExecutionPermanentError(`CARD_CONTENT_CHANGED: ${what}; nothing was written.`);

function permanent(error: unknown): never {
  if (error instanceof AgentExecutionPermanentError) throw error;
  if (error instanceof AgentMemoryRevisionConflictError) throw changed("the memory was changed or deleted since the card was shown");
  if (error instanceof Error && /was not found|already exists/u.test(error.message)) throw changed(error.message);
  if (error instanceof Error && /(required|must be|Unknown Agent memory)/u.test(error.message)) throw new AgentExecutionPermanentError(error.message);
  throw error;
}

export function memoryWriteExecutors(deps: MemoryWriteDeps): AgentActionExecutor[] {
  const { memory } = deps;
  const add = (key: string, execute: AgentActionExecutor["execute"]): AgentActionExecutor => ({ execute: async (payload, context) => { try { return await execute(payload, context); } catch (error) { return permanent(error); } }, key, riskLevel: "write" });
  return [
    add(MEMORY_CREATE, async (payload) => {
      const memoryId = text(payload, "memoryId");
      const content = text(payload, "content");
      const category = text(payload, "category");
      if (!memoryId || !content || !category) throw new AgentExecutionPermanentError("memoryId, category and content are required.");
      // AG21c (R34): a create card still waiting while the same entry was saved or changed by a later card is replaced by
      // it: an entry with the same task, kind and topics already there is not written again (applied twice: still one).
      if (!(await memory.get(memoryId)) && memory.list) {
        const twin = twinOfNewEntry(await memory.list(), { appliesTo: Array.isArray(payload.appliesTo) ? (payload.appliesTo as AgentMemoryTask[]) : [], category: category as never, content, structured: (payload.structured ?? null) as AgentMemoryStructured | null });
        if (twin) throw changed(`the same entry is already saved (${twin.memoryId}); this card was replaced by a later one`);
      }
      const created = await memory.create({
        appliesTo: Array.isArray(payload.appliesTo) ? (payload.appliesTo as AgentMemoryTask[]) : [],
        category: category as never,
        content,
        memoryId,
        source: "conversation",
        sourceMessageRef: text(payload, "sourceMessageRef") ?? null,
        structured: (payload.structured ?? null) as AgentMemoryStructured | null,
        // AG14 UI (D2): the last day, when the user's words carried one.
        ...(typeof payload.validUntil === "string" ? { validUntil: payload.validUntil } : {}),
      });
      return { resultRef: `${AGENT_MEMORY_COLLECTION}:${created.memoryId}`, summary: "Personal memory saved in Orbit." };
    }),
    add(MEMORY_UPDATE, async (payload) => {
      const memoryId = text(payload, "memoryId");
      if (!memoryId || typeof payload.expectedRevision !== "number") throw new AgentExecutionPermanentError("memoryId and expectedRevision are required.");
      const patch = (payload.patch ?? {}) as Record<string, unknown>;
      const input: UpdateAgentMemoryInput = {
        expectedRevision: payload.expectedRevision,
        ...(typeof patch.content === "string" ? { content: patch.content } : {}),
        ...(typeof patch.category === "string" ? { category: patch.category as never } : {}),
        ...(Array.isArray(patch.appliesTo) ? { appliesTo: patch.appliesTo as AgentMemoryTask[] } : {}),
        ...("structured" in patch ? { structured: (patch.structured ?? null) as AgentMemoryStructured | null } : {}),
      };
      // Our own write already (the same confirmed card applied again): the entry is one revision on with these values.
      const current = await memory.get(memoryId);
      if (current && current.revision === payload.expectedRevision + 1 && Object.entries(patch).every(([field, value]) => JSON.stringify((current as unknown as Record<string, unknown>)[field] ?? null) === JSON.stringify(value ?? null))) {
        return { resultRef: `${AGENT_MEMORY_COLLECTION}:${memoryId}`, summary: "Personal memory changed in Orbit." };
      }
      const updated = await memory.update(memoryId, input);
      return { resultRef: `${AGENT_MEMORY_COLLECTION}:${updated.memoryId}`, summary: "Personal memory changed in Orbit." };
    }),
    add(MEMORY_DELETE, async (payload) => {
      const memoryId = text(payload, "memoryId");
      if (!memoryId || typeof payload.expectedRevision !== "number") throw new AgentExecutionPermanentError("memoryId and expectedRevision are required.");
      // Our own delete already (the same confirmed card applied again): the mark is one revision on.
      if (!(await memory.get(memoryId)) && (await memory.deletionMarks()).some((mark) => mark.memoryId === memoryId && mark.revision === (payload.expectedRevision as number) + 1)) {
        return { resultRef: `${AGENT_MEMORY_COLLECTION}:${memoryId}`, summary: "Personal memory deleted in Orbit; it is no longer used." };
      }
      await memory.remove(memoryId, { expectedRevision: payload.expectedRevision });
      return { resultRef: `${AGENT_MEMORY_COLLECTION}:${memoryId}`, summary: "Personal memory deleted in Orbit; it is no longer used." };
    }),
  ];
}
