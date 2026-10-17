import { createCalendarExternalReader } from "./reader";
import { createConfiguredOrbitIntegrationService } from "../integrations/service-factory";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { calendarExternalEventsQuerySchema, calendarExternalEventsResponseSchema } from "../../shared/api-schema/calendar-external-events";
import { AppError } from "../../shared/errors/app-error";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";
import { redesignContractRoute } from "../redesign-contracts/route";
import { redesignMock } from "../redesign-contracts/mock-service";

type CalendarReader = ReturnType<typeof createCalendarExternalReader>;
let configuredReader: CalendarReader | undefined;

function defaultReader(): CalendarReader {
  configuredReader ??= createCalendarExternalReader({
    serviceForActor: actorId => createConfiguredOrbitIntegrationService({ actorId }),
    gate: resolveSharedReadBudgetGate(),
  });
  return configuredReader;
}

export function createCalendarExternalEventsGetHandler(options: { resolveActor?: ResolveAuthenticatedApiActor; reader?: CalendarReader } = {}) {
  return redesignContractRoute("calendar-external-events", calendarExternalEventsResponseSchema, async (request, _params, { service }) => {
    try {
      const params = new URL(request.url).searchParams;
      const raw = Object.fromEntries(params);
      const parsed = calendarExternalEventsQuerySchema.safeParse(raw);
      if ([...params.keys()].some(key => params.getAll(key).length !== 1) || !parsed.success) {
        return { error: new AppError("VALIDATION_ERROR", "Calendar interval must be valid and at most 42 days.") };
      }
      if (service.mode !== "live") return { data: redesignMock.calendarExternalEvents(parsed.data.from, parsed.data.to) };
      const actor = await (options.resolveActor ?? resolveAuthenticatedApiActor)();
      if (!actor) return { error: new AppError("UNAUTHORIZED", "Sign in to access this resource.") };
      const data = await (options.reader ?? defaultReader()).read(actor.id, parsed.data);
      return { data };
    } catch {
      console.error(JSON.stringify({ event: "calendar_external_read_failed", code: "CALENDAR_EXTERNAL_UNAVAILABLE" }));
      return { error: new AppError("SERVICE_UNAVAILABLE", "External calendar events are temporarily unavailable.") };
    }
  });
}
