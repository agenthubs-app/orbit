import type { CalendarExternalEventsContract } from "../../shared/contract/calendar-external-events";
import { calendarExternalEventsQuerySchema } from "../../shared/api-schema/calendar-external-events";
import type { ExternalCalendarEventSummary, IntegrationAuthorization } from "../integrations/contract";
import type { ReadBudgetGate } from "../sync/read-budget-gate";

type CalendarAuthorization = Pick<IntegrationAuthorization, "provider" | "status" | "capabilities" | "connectionVersion">;
interface CalendarProvider {
  listAuthorizations(): Promise<readonly CalendarAuthorization[]>;
  listCalendarEvents(input: { provider: "google_calendar"; timeMin: string; timeMax: string }): Promise<readonly ExternalCalendarEventSummary[]>;
}

const TTL_MS = 300_000;
const MAX_CACHE_ENTRIES = 256;

export function createCalendarExternalReader(input: {
  serviceForActor(actorId: string): CalendarProvider | null | Promise<CalendarProvider | null>;
  gate?: Pick<ReadBudgetGate, "assertAllowed"> | null;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  const cache = new Map<string, { expiresAt: number; events: CalendarExternalEventsContract["events"]; asOf: string }>();
  return {
    async read(actorId: string, query: { from: string; to: string }): Promise<CalendarExternalEventsContract> {
      if (!actorId.trim()) throw new Error("CALENDAR_EXTERNAL_ACTOR_REQUIRED");
      const interval = calendarExternalEventsQuerySchema.parse(query);
      input.gate?.assertAllowed({ collectionName: "integrationTokens" });
      input.gate?.assertAllowed({ collectionName: "integrationHealth" });
      const asOf = new Date(now()).toISOString();
      const empty = (connection: CalendarExternalEventsContract["connection"]): CalendarExternalEventsContract =>
        ({ connection, provider: "google_calendar", events: [], asOf });
      const service = await input.serviceForActor(actorId);
      // No integration service: this deployment does not offer Google Calendar (no key / store) — not a failure.
      if (!service) return empty("off");
      let authorizations: readonly CalendarAuthorization[];
      try { authorizations = await service.listAuthorizations(); }
      catch { return empty("unavailable"); }
      const authorization = authorizations.find(item => item.provider === "google_calendar");
      if (!authorization || authorization.status === "pending" || authorization.status === "revoked") return empty("not_connected");
      if ((authorization.status === "active" || authorization.status === "expired") && !authorization.capabilities.includes("calendar.read")) return empty("needs_reconnect");
      if (authorization.status !== "active" && authorization.status !== "expired") return empty("unavailable");

      const key = JSON.stringify([actorId, authorization.connectionVersion ?? "legacy", interval.from, interval.to]);
      const cached = cache.get(key);
      if (authorization.status === "active" && cached && now() < cached.expiresAt) return { connection: "connected", provider: "google_calendar", events: cached.events, asOf: cached.asOf };
      if (cached) cache.delete(key);
      try {
        const events = (await service.listCalendarEvents({ provider: "google_calendar", timeMin: interval.from, timeMax: interval.to }))
          .map(event => ({ id: event.providerRecordId, titlePreview: event.title.slice(0, 240), startsAt: event.startsAt,
            ...(event.endsAt ? { endsAt: event.endsAt } : {}), allDay: /^\d{4}-\d{2}-\d{2}$/.test(event.startsAt),
            ...(event.location ? { locationPreview: event.location.slice(0, 120) } : {}) }));
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
        cache.set(key, { expiresAt: now() + TTL_MS, events, asOf });
        return { connection: "connected", provider: "google_calendar", events, asOf };
      } catch (error) {
        const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
        if (status === 401 || status === 403 || error instanceof Error && /token refresh failed|not authorized/i.test(error.message)) return empty("needs_reconnect");
        return empty("unavailable");
      }
    },
  };
}
