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
import { MEMO_CREATE } from "../../../agent/runtime/card-operations";

export { prepareCardOperation as prepare } from "../../../agent/runtime/card-operations";

export function memoWriteExecutors(input: { notes: Pick<NoteService, "create">; actorId: string }): AgentActionExecutor[] {
  return [{ execute: (payload, context) => applyApprovedMemoCreate(input, payload, context), key: MEMO_CREATE, riskLevel: "write" }];
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
