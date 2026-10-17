import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { success, failure } from "../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../shared/errors/app-error";
import { relationshipTaskPageItemSchema } from "../../../shared/api-schema/relationship-lifecycle";
import type { RelationshipTaskResolver } from "./task-resolve";

const mappingSchema = relationshipTaskPageItemSchema.pick({ taskId: true, connectionId: true, contactId: true });
const validId = (id: string) => id !== "." && id !== ".." && id.length > 0 && id.length <= 256 && id.trim() === id && !/[\u0000-\u001f\u007f]/u.test(id);

export function createRelationshipTaskResolveHandler(options: { resolveActor?: ResolveAuthenticatedApiActor; reader: (workspaceId: string) => RelationshipTaskResolver | null }) {
  return async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const headers = { "Cache-Control": "private, no-store" };
    try {
      const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
      if (!actor) return authenticatedApiActorRequiredResponse("live");
      const { id } = await context.params;
      if (!validId(id) || new URL(request.url).search !== "") throw new AppError("VALIDATION_ERROR", "Invalid follow-up identifier.");
      if (!actor.workspaceId || !validId(actor.workspaceId) || !validId(actor.id)) throw Error("RELATIONSHIP_TASK_STORAGE_UNAVAILABLE");
      const reader = options.reader(actor.workspaceId);
      if (!reader) throw Error("RELATIONSHIP_TASK_STORAGE_UNAVAILABLE");
      const mapping = await reader.read(actor.id, id);
      if (!mapping) throw new AppError("NOT_FOUND", "Follow-up not found.");
      const data = mappingSchema.parse(mapping);
      if (data.taskId !== id) throw Error("RELATIONSHIP_TASK_RESPONSE_INVALID");
      return Response.json(success(data), { headers });
    } catch (error) {
      const safe = error instanceof AppError ? error : error instanceof Error && error.message === "RELATIONSHIP_TASK_MAPPING_CONFLICT"
        ? new AppError("CONFLICT", "This follow-up's relationship could not be verified.")
        : new AppError("SERVICE_UNAVAILABLE", "Follow-up details are temporarily unavailable.");
      return Response.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers });
    }
  };
}
