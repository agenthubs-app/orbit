import { AppError } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse } from "../../_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
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
  noteVersion,
  type NoteRouteContext,
  type NoteRouteDependencies,
} from "../route-support";

export function createNoteDetailHandlers(dependencies?: NoteRouteDependencies) {
  return {
    async GET(_request: Request, context: NoteRouteContext): Promise<Response> {
      const actor = await noteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const { id } = await context.params;
        const note = await noteService(dependencies).get({ actorId: actor.id, noteId: id });
        if (!note) throw new AppError("NOT_FOUND", "Note not found.");
        return noteSuccess({ note });
      } catch (error) { return noteError(error); }
    },
    async PATCH(request: Request, context: NoteRouteContext): Promise<Response> {
      const actor = await noteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const { id } = await context.params;
        const body = await noteBody(request);
        noteExactKeys(body, ["body", "contactIds", "expectedVersion", "idempotencyKey"]);
        const note = await noteService(dependencies).update({
          actorId: actor.id,
          noteId: id,
          ...(body.body === undefined ? {} : { body: noteString(body.body, "body") }),
          ...(body.contactIds === undefined ? {} : { contactIds: noteContactIds(body.contactIds) }),
          expectedVersion: noteVersion(body.expectedVersion),
          idempotencyKey: noteString(body.idempotencyKey, "idempotencyKey"),
          now: noteNow(dependencies),
        });
        return noteSuccess({ note });
      } catch (error) { return noteError(error); }
    },
  };
}
