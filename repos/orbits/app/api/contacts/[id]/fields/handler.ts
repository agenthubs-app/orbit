import { NextResponse } from "next/server";
import { failure, success } from "../../../../../shared/api/envelope";
import { AppError, getHttpStatusForAppErrorCode } from "../../../../../shared/errors/app-error";
import { resolveModuleMode } from "../../../../../shared/services/module-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../../../../shared/storage/configured-live-record-store";
import { isDemoContactRouteId } from "../../../../../shared/domain/guide-demo-contact";
import { contactFieldsUpdateInputSchema, contactFieldsUpdateResultSchema } from "../../../../../shared/api-schema/contact-fields";
import type { ContactFieldsUpdateInput, ContactFieldsUpdateResult } from "../../../../../shared/contract/contact-fields";
import { applyContactFieldValues, ContactFieldWriteError } from "../../../../../features/contacts/contact-field-write";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../_shared/authenticated-actor";

type Update = (actorId: string, contactId: string, input: ContactFieldsUpdateInput) => Promise<ContactFieldsUpdateResult>;

const configuredUpdate: Update = async (actorId, contactId, input) => {
  if (resolveModuleMode() !== "live") throw new AppError("SERVICE_UNAVAILABLE", "Contact editing requires a live provider.");
  const runtime = createConfiguredPostgresLiveRecordStore();
  if (!runtime) throw new AppError("SERVICE_UNAVAILABLE", "Contact storage is unavailable.");
  const result = await applyContactFieldValues({ actorId, contactId, source: "manual", store: runtime.store, values: input.values, workspaceId: runtime.workspaceId });
  return { changed: result.changed, contactId: result.contactId, updatedAt: result.updatedAt };
};

/** R11a：PATCH /api/contacts/:id/fields（連絡先の編集：氏名・会社・役職・メール・電話）。 */
export function createContactFieldsPatchHandler(options: { resolveActor?: ResolveAuthenticatedApiActor; update?: Update } = {}) {
  return async function PATCH(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    const headers = { "Cache-Control": "private, no-store" };
    const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse("live");
    const { id } = await context.params;
    const respond = (error: AppError) => NextResponse.json(failure(error), { status: getHttpStatusForAppErrorCode(error.code), headers });
    if (isDemoContactRouteId(id)) return respond(new AppError("FORBIDDEN", "Demo contacts cannot be changed."));
    const body = contactFieldsUpdateInputSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return respond(new AppError("VALIDATION_ERROR", "連絡先の項目が正しくありません。"));
    try {
      const result = await (options.update ?? configuredUpdate)(actor.id, id, body.data as ContactFieldsUpdateInput);
      return NextResponse.json(success(contactFieldsUpdateResultSchema.parse(result)), { headers });
    } catch (error) {
      if (error instanceof ContactFieldWriteError) {
        return respond(new AppError(error.code === "NOT_FOUND" ? "NOT_FOUND" : error.code === "INVALID" ? "VALIDATION_ERROR" : error.code === "CONFLICT" ? "CONFLICT" : "SERVICE_UNAVAILABLE", error.message));
      }
      return respond(error instanceof AppError ? error : new AppError("SERVICE_UNAVAILABLE", "連絡先を保存できませんでした。"));
    }
  };
}
