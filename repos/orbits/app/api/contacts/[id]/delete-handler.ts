import { NextResponse } from "next/server";
import { failure, success } from "../../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../shared/errors/app-error";
import { createConfiguredPostgresLiveRecordStore } from "../../../../shared/storage/configured-live-record-store";
import { resolveModuleMode } from "../../../../shared/services/module-mode";
import { isDemoContactRouteId } from "../../../../shared/domain/guide-demo-contact";
import { contactDeleteResultSchema, contactRestoreResultSchema } from "../../../../shared/api-schema/contact-delete";
import { createContactDeleteService, type ContactDeleteService } from "../../../../features/contacts/delete/service";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../_shared/authenticated-actor";

interface RouteContext { params: Promise<{ id: string }> }

function configuredService(): ContactDeleteService {
  if (resolveModuleMode() !== "live") throw new AppError("SERVICE_UNAVAILABLE", "Contact deletion requires a live provider.");
  const runtime = createConfiguredPostgresLiveRecordStore();
  if (!runtime) throw new AppError("SERVICE_UNAVAILABLE", "Contact storage is unavailable.");
  return createContactDeleteService({ client: runtime.client, workspaceId: runtime.workspaceId });
}

function errorResponse(error: unknown): Response {
  const safe = error instanceof AppError ? error : new AppError("SERVICE_UNAVAILABLE", "連絡先を更新できませんでした。");
  return NextResponse.json(failure(safe), { status: getHttpStatusForAppErrorCode(safe.code), headers: { "Cache-Control": "private, no-store" } });
}

/** R11a：DELETE /api/contacts/:id（软删）与 POST /api/contacts/:id/restore（30 天内恢复）。 */
export function createContactDeleteHandlers(options: { resolveActor?: ResolveAuthenticatedApiActor; service?: () => ContactDeleteService } = {}) {
  const run = (kind: "remove" | "restore") => async (_request: Request, context: RouteContext): Promise<Response> => {
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const { id } = await context.params;
    if (isDemoContactRouteId(id)) return errorResponse(new AppError("FORBIDDEN", "Demo contacts cannot be changed."));
    try {
      const service = (options.service ?? configuredService)();
      const data = kind === "remove"
        ? contactDeleteResultSchema.parse(await service.remove(actor.id, id))
        : contactRestoreResultSchema.parse(await service.restore(actor.id, id));
      return NextResponse.json(success(data), { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
      return errorResponse(error);
    }
  };
  return { DELETE: run("remove"), RESTORE: run("restore") };
}
