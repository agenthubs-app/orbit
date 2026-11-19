/**
 * The memo write adapter (设计稿附录 B「Memo」, 附录 E, §4; agent-design AG06). `prepare` freezes a new memo
 * with its interaction for the card (features/agent/runtime/card-operations.ts); `applyApproved` runs only
 * in the executor after the click.
 *
 * - The body is the user's own words (the card froze them); nothing is added.
 * - `interaction.actualContactIds` must be among `contactIds`: the note service checks it with
 *   readNoteInteraction() and refuses otherwise (a permanent failure). A person only mentioned is linked,
 *   never an actual contact.
 * - The memo is marked `autoExtraction: "suppressed"` and no `onPersisted` hook is passed, so the old
 *   automatic extraction never runs on it and no contact detail (`lastInteraction` included) is written;
 *   "recent interaction" is read from the memo (views/recent-interaction.ts).
 * - A retry with the same operation key reaches the same note id (actor + key) and `saveIfAbsent` returns
 *   the first memo: there is never a second one.
 */
import type { NoteInteractionContract } from "../../../../shared/contract/notes";
import type { NoteService } from "../../../notes/service";
import { AgentExecutionPermanentError } from "../../../agent/runtime/service";
import type { AgentActionExecutor } from "../../../agent/runtime/executor-registry";
import { MEMO_CREATE, MEMO_UPDATE } from "../../../agent/runtime/card-operations";
import { NoteServiceError } from "../../../notes/service";

export { prepareCardOperation as prepare } from "../../../agent/runtime/card-operations";

export function memoWriteExecutors(input: { notes: Pick<NoteService, "create" | "update">; actorId: string }): AgentActionExecutor[] {
  return [
    { execute: (payload, context) => applyApprovedMemoCreate(input, payload, context), key: MEMO_CREATE, riskLevel: "write" },
    { execute: (payload, context) => applyApprovedMemoUpdate(input, payload, context), key: MEMO_UPDATE, riskLevel: "write" },
  ];
}

/**
 * AG10 applyApproved for memo.update (设计稿 §3.5 从笔记到联系人往来): writes only the interaction field of the memo, at
 * the version the card was frozen from. The memo changed since → nothing is written (a permanent failure, never retried);
 * an interaction whose actual contacts are not among the memo's is refused by the note service. A replay of the same key
 * returns the first result. No onPersisted hook: the old automatic extraction never runs, no contact detail is written.
 */
export async function applyApprovedMemoUpdate(
  input: { notes: Pick<NoteService, "update">; actorId: string },
  payload: Readonly<Record<string, unknown>>,
  context: { idempotencyKey: string; now: string },
): Promise<{ resultRef: string; summary: string }> {
  const noteId = typeof payload.noteId === "string" ? payload.noteId : "";
  const expectedVersion = typeof payload.expectedVersion === "number" ? payload.expectedVersion : Number.NaN;
  // AG13: a memo's event links (unlinking a private event before it is deleted); its text is not touched.
  const eventRefs = Array.isArray(payload.eventRefs) ? (payload.eventRefs as { kind: "platform" | "private"; id: string }[]) : null;
  if (!noteId || !Number.isInteger(expectedVersion) || (!payload.interaction && !eventRefs)) throw new AgentExecutionPermanentError("noteId, expectedVersion and interaction or eventRefs are required.");
  try {
    const note = await input.notes.update({ actorId: input.actorId, expectedVersion, idempotencyKey: context.idempotencyKey, ...(payload.interaction ? { interaction: payload.interaction as NoteInteractionContract } : {}), ...(eventRefs ? { eventRefs } : {}), noteId, now: context.now });
    if (eventRefs) return { resultRef: `notes:${note.id}`, summary: "Memo's event links changed in Orbit." };
    return { resultRef: `notes:${note.id}`, summary: "Interaction recorded on the memo in Orbit." };
  } catch (error) {
    if (error instanceof NoteServiceError && (error.code === "NOTE_VERSION_CONFLICT" || error.code === "NOTE_INVALID_INPUT" || error.code === "NOTE_NOT_FOUND")) throw new AgentExecutionPermanentError(`CARD_CONTENT_CHANGED: ${error.message}; nothing was written.`);
    throw error;
  }
}

export async function applyApprovedMemoCreate(
  input: { notes: Pick<NoteService, "create">; actorId: string },
  payload: Readonly<Record<string, unknown>>,
  context: { idempotencyKey: string; now: string },
): Promise<{ resultRef: string; summary: string }> {
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  if (!body) throw new AgentExecutionPermanentError("body is required.");
  const contactIds = Array.isArray(payload.contactIds) ? payload.contactIds.filter((id): id is string => typeof id === "string") : [];
  const note = await input.notes.create({
    actorId: input.actorId,
    autoExtraction: "suppressed",
    body,
    contactIds,
    idempotencyKey: context.idempotencyKey,
    ...(payload.interaction ? { interaction: payload.interaction as NoteInteractionContract } : {}),
    now: context.now,
    ...(typeof payload.title === "string" && payload.title.trim() ? { title: payload.title } : {}),
  });
  return { resultRef: `notes:${note.id}`, summary: "Memo saved in Orbit." };
}
