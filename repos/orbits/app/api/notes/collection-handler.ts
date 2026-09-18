import { conditionalJsonRead, defaultConditionalReadDependencies } from "../_shared/conditional-read";
import { authenticatedApiActorRequiredResponse } from "../_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { AppError } from "../../../shared/errors/app-error";
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
  type NoteRouteDependencies,
} from "./route-support";

export function createNoteCollectionHandlers(dependencies?: NoteRouteDependencies) {
  return {
    async GET(request: Request): Promise<Response> {
      const actor = await noteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const params = new URL(request.url).searchParams;
        const contactId = params.get("contactId")?.trim();
        const q = params.get("q")?.trim();
        const association = params.get("association")?.trim();
        const sort = params.get("sort")?.trim();
        if (association && !["all", "contacts", "events", "unlinked"].includes(association)) throw new AppError("VALIDATION_ERROR", "Unsupported association filter");
        if (sort && !["updated_desc", "updated_asc"].includes(sort)) throw new AppError("VALIDATION_ERROR", "Unsupported note sort");
        const cursor = params.get("cursor")?.trim();
        const limitValue = params.get("limit");
        const limit = limitValue === null ? undefined : Number(limitValue);
        if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)) throw new AppError("VALIDATION_ERROR", "Invalid note limit");
        return await conditionalJsonRead(
          // A note search also consults contacts (mentions / name matches), a workspace-wide domain.
          { routeKey: "notes.search", request, actorId: actor.id, workspaceId: actor.workspaceId, collections: ["notes"], userScoped: true, sharedCollections: ["contacts"] },
          dependencies?.conditionalRead ?? defaultConditionalReadDependencies(),
          async () => {
            const result = await noteService(dependencies).search({
              actorId: actor.id,
              ...(contactId ? { contactId } : {}),
              ...(q ? { q } : {}),
              ...(association ? { association: association as "all" | "contacts" | "events" | "unlinked" } : {}),
              ...(sort ? { sort: sort as "updated_desc" | "updated_asc" } : {}),
              ...(cursor ? { cursor } : {}),
              ...(limit === undefined ? {} : { limit }),
            });
            return noteSuccess(result);
          },
        );
      } catch (error) { return noteError(error); }
    },
    async POST(request: Request): Promise<Response> {
      const actor = await noteActorResolver(dependencies)();
      if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
      try {
        const body = await noteBody(request);
        noteExactKeys(body, ["title", "body", "contactIds", "manualContactIds", "mentions", "eventIds", "idempotencyKey"]);
        const note = await noteService(dependencies).create({
          actorId: actor.id,
          title: noteOptionalString(body.title, "title"),
          body: noteString(body.body, "body"),
          contactIds: noteContactIds(body.contactIds),
          manualContactIds: noteContactIds(body.manualContactIds),
          mentions: noteMentions(body.mentions),
          eventIds: noteContactIds(body.eventIds),
          idempotencyKey: noteString(body.idempotencyKey, "idempotencyKey"),
          now: noteNow(dependencies),
        });
        return noteSuccess({ note }, 201);
      } catch (error) { return noteError(error); }
    },
  };
}
