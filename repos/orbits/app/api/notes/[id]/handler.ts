import { AppError } from "../../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse } from "../../_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../../shared/config/feature-mode";
import {
  noteActorResolver,
  noteBody,
  noteContactIds,
  noteError,
  noteExactKeys,
  noteMentions,
  noteNow,
  noteOptionalString,
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
        noteExactKeys(body, ["title", "body", "contactIds", "manualContactIds", "mentions", "eventIds", "expectedVersion", "idempotencyKey"]);
        const note = await noteService(dependencies).update({
          actorId: actor.id,
          noteId: id,
          ...(body.title === undefined ? {} : { title: noteOptionalString(body.title, "title") }),
          ...(body.body === undefined ? {} : { body: noteString(body.body, "body") }),
          ...(body.contactIds === undefined ? {} : { contactIds: noteContactIds(body.contactIds) }),
          ...(body.manualContactIds === undefined ? {} : { manualContactIds: noteContactIds(body.manualContactIds) }),
          ...(body.mentions === undefined ? {} : { mentions: noteMentions(body.mentions) }),
          ...(body.eventIds === undefined ? {} : { eventIds: noteContactIds(body.eventIds) }),
          expectedVersion: noteVersion(body.expectedVersion),
          idempotencyKey: noteString(body.idempotencyKey, "idempotencyKey"),
          now: noteNow(dependencies),
        });
        return noteSuccess({ note });
      } catch (error) { return noteError(error); }
    },
  };
}
