import { authenticatedApiActorRequiredResponse } from "../_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import {
  noteActorResolver,
  noteBody,
  noteContactIds,
  noteError,
  noteExactKeys,
  noteNow,
  noteService,
  noteString,
  noteSuccess,
  type NoteRouteDependencies,
} from "./route-support";

export function createNoteCollectionHandlers(dependencies?: NoteRouteDependencies) {
  return {
    async GET(request: Request): Promise<Response> {
      const actor = await noteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const contactId = new URL(request.url).searchParams.get("contactId")?.trim();
        const notes = await noteService(dependencies).list({ actorId: actor.id, ...(contactId ? { contactId } : {}) });
        return noteSuccess({ notes });
      } catch (error) { return noteError(error); }
    },
    async POST(request: Request): Promise<Response> {
      const actor = await noteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const body = await noteBody(request);
        noteExactKeys(body, ["body", "contactIds", "idempotencyKey"]);
        const note = await noteService(dependencies).create({
          actorId: actor.id,
          body: noteString(body.body, "body"),
          contactIds: noteContactIds(body.contactIds),
          idempotencyKey: noteString(body.idempotencyKey, "idempotencyKey"),
          now: noteNow(dependencies),
        });
        return noteSuccess({ note }, 201);
      } catch (error) { return noteError(error); }
    },
  };
}
