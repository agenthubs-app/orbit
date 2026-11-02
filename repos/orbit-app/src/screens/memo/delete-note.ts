import { notePath } from "../../api/endpoints";
import type { OrbitApiClient } from "../../api/client";
import type { NoteView } from "../../view-models/notes";

export type DeleteNoteOutcome = "deleted" | "conflict" | "failed" | "pending";

/** Sprint 0144: a note with a change still in the device outbox (queued, refused or in conflict) is not deleted. */
export function hasPendingNoteWrite(note: { localMutationState?: NoteView["localMutationState"] | undefined }): boolean {
  return Boolean(note.localMutationState);
}

/**
 * QA-D: deletes a synced note on the server (DELETE /api/notes/:id). `version` guards against deleting an edit made
 * elsewhere; a note already gone (404) counts as deleted. The device copy drops it on the next sync (a delete change).
 */
export async function deleteNoteOnServer(client: Pick<OrbitApiClient, "delete">, note: { id: string; version: number; localMutationState?: NoteView["localMutationState"] }): Promise<DeleteNoteOutcome> {
  if (hasPendingNoteWrite(note)) return "pending";
  if (note.id.startsWith("local:")) return "failed";
  const result = await client.delete<unknown>(`${notePath(note.id)}?expectedVersion=${encodeURIComponent(String(note.version))}`);
  if (result.status === 404 || (result.success && result.status >= 200 && result.status < 300)) return "deleted";
  return result.status === 409 ? "conflict" : "failed";
}
