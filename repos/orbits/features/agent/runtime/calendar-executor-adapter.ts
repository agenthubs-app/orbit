import type { OrbitIntegrationService } from "../../integrations/service";
import type { AgentDomainExecutorDependencies } from "./domain-executors";

/** Uses the actor-scoped integration service for both creation and compensation. */
export function createAgentCalendarExecutorAdapter(
  integrations: Pick<OrbitIntegrationService, "createCalendarEvent" | "deleteCalendarEvent">,
): NonNullable<AgentDomainExecutorDependencies["calendar"]> {
  const providerFor = (payload: Readonly<Record<string, unknown>>) =>
    payload.provider === "microsoft_graph" ? "microsoft_graph" : "google_calendar";
  return {
    createEvent: (payload, idempotencyKey) => integrations.createCalendarEvent({
      provider: providerFor(payload), payload, idempotencyKey,
    }),
    deleteEvent: (providerRecordId, payload, idempotencyKey) => integrations.deleteCalendarEvent({
      provider: providerFor(payload), providerRecordId, idempotencyKey,
    }),
  };
}
