import { ZodError } from "zod";
import { createConfiguredPersonalScheduleService } from "../../../features/personal-schedule/service-factory";
import type { PersonalScheduleService } from "../../../features/personal-schedule/service";
import { personalScheduleCreateSchema, personalScheduleUpdateSchema, personalScheduleDeleteSchema } from "../../../shared/api-schema/personal-schedule";
import { AppError } from "../../../shared/errors/app-error";
import { authenticatedApiActorRequiredResponse, resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../_shared/authenticated-actor";
import { resolveFeatureMode } from "../../../shared/config/feature-mode";
import { readTaskJsonObject, taskErrorResponse, taskSuccessResponse } from "../tasks/route-support";
import { personalScheduleRepresentation } from "../../../features/personal-schedule/representation";

type Context = { params: Promise<{ id: string }> };
export function createPersonalScheduleHandlers(dependencies?: { service?: PersonalScheduleService; resolveActor?: ResolveAuthenticatedApiActor }) {
  async function handle(request: Request, context: Context | undefined, action: "GET" | "POST" | "PATCH" | "DELETE") {
    const actor = await (dependencies?.resolveActor ?? resolveAuthenticatedApiActor)();
    if (!actor) return authenticatedApiActorRequiredResponse(resolveFeatureMode());
    try {
      const service = dependencies?.service ?? createConfiguredPersonalScheduleService();
      const id = context ? (await context.params).id : "";
      const body = action === "GET" ? undefined : await readTaskJsonObject(request);
      if (body && request.headers.get("x-orbit-personal-schedule-version") !== "3") {
        const fields = action === "PATCH" ? body.patch : body;
        if (body.scope !== undefined || (fields && typeof fields === "object" && (Object.hasOwn(fields, "recurrence") || Object.hasOwn(fields, "reminderMinutes")))) throw new AppError("VALIDATION_ERROR", "Reminder/repeat changes require personal schedule version 3.");
      }
      const result = action === "GET" ? { scheduleItem: await service.get({ actorId: actor.id, id }) }
        : action === "POST" ? await service.create(actor.id, personalScheduleCreateSchema.parse(body))
        : action === "PATCH" ? await service.update(actor.id, id, personalScheduleUpdateSchema.parse(body))
        : await service.remove(actor.id, id, personalScheduleDeleteSchema.parse(body));
      return taskSuccessResponse({ ...result, scheduleItem: personalScheduleRepresentation(result.scheduleItem, request) }, action === "POST" ? 201 : 200);
    } catch (error) { return taskErrorResponse(error instanceof ZodError ? new AppError("VALIDATION_ERROR", "Invalid personal schedule fields.") : error); }
  }
  return { GET: (request: Request, context: Context) => handle(request, context, "GET"), POST: (request: Request) => handle(request, undefined, "POST"), PATCH: (request: Request, context: Context) => handle(request, context, "PATCH"), DELETE: (request: Request, context: Context) => handle(request, context, "DELETE") };
}
