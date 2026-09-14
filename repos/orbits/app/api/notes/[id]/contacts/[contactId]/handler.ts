import { authenticatedApiActorRequiredResponse } from "../../../../_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../../../../shared/config/feature-mode";
import {
  noteActorResolver,
  noteBody,
  noteError,
  noteExactKeys,
  noteNow,
  noteService,
  noteString,
  noteSuccess,
  noteVersion,
  type NoteContactRouteContext,
  type NoteRouteDependencies,
} from "../../../route-support";

export function createNoteContactDeleteHandler(dependencies?: NoteRouteDependencies) {
  return async function DELETE(request: Request, context: NoteContactRouteContext): Promise<Response> {
    const actor = await noteActorResolver(dependencies)();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
    try {
      const { id, contactId } = await context.params;
      const body = await noteBody(request);
      noteExactKeys(body, ["expectedVersion", "idempotencyKey"]);
      const note = await noteService(dependencies).unlinkContact({
        actorId: actor.id,
        noteId: id,
        contactId: noteString(contactId, "contactId"),
        expectedVersion: noteVersion(body.expectedVersion),
        idempotencyKey: noteString(body.idempotencyKey, "idempotencyKey"),
        now: noteNow(dependencies),
      });
      return noteSuccess({ note });
    } catch (error) { return noteError(error); }
  };
}
