import type { AppointmentOutboxEvent } from "./contract";
import type { EventOperationsPostgresRuntime } from "../events/event-operations/storage/postgres-client";
import { createConfiguredOrbitIntegrationService } from "../integrations/service-factory";
import type { OrbitIntegrationService } from "../integrations/service";

export interface AppointmentCalendarProjection {
  joinUrl: string | null;
  providerRecordId: string;
}

export interface AppointmentCalendarProjector {
  cancel(event: AppointmentOutboxEvent): Promise<void>;
  upsert(event: AppointmentOutboxEvent): Promise<AppointmentCalendarProjection>;
}

interface AppointmentActorDirectoryEntry {
  actorId: string;
  displayName: string;
  email: string;
}

interface AppointmentActorDirectory {
  load(actorIds: readonly string[]): Promise<readonly AppointmentActorDirectoryEntry[]>;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Appointment calendar projection requires ${label}.`);
  }
  return value.trim();
}

function participantActorIds(event: AppointmentOutboxEvent): readonly [string, string] {
  const values = Array.isArray(event.payload.participantActorIds)
    ? event.payload.participantActorIds
    : [];
  if (values.length !== 2 || values.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("Appointment calendar projection requires exactly two participant actors.");
  }
  return [String(values[0]), String(values[1])];
}

function calendarInput(event: AppointmentOutboxEvent, actors: readonly AppointmentActorDirectoryEntry[]) {
  const confirmed = record(event.payload.confirmed);
  const medium = record(confirmed.medium);
  const startsAt = requiredText(confirmed.startsAtUtc, "a confirmed start time");
  const durationMinutes = Number(confirmed.durationMinutes);
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 24 * 60) {
    throw new Error("Appointment calendar projection has an invalid duration.");
  }
  const endsAt = new Date(Date.parse(startsAt) + durationMinutes * 60_000).toISOString();
  const [owner, invitee] = actors;
  if (!owner || !invitee) throw new Error("Appointment calendar projection requires two account identities.");
  return {
    attendees: actors.map((actor) => ({ displayName: actor.displayName, email: actor.email })),
    conference:
      medium.kind === "video" && medium.provider === "google_meet"
        ? "google_meet"
        : undefined,
    description: event.payload.eventId
      ? `Orbit activity follow-up · ${String(event.payload.eventId)}`
      : "Orbit relationship follow-up",
    endsAt,
    startsAt,
    title: `Orbit 约谈 · ${owner.displayName} × ${invitee.displayName}`,
  };
}

export function createAppointmentCalendarProjector(input: {
  actorDirectory: AppointmentActorDirectory;
  integrationForActor(actorId: string): OrbitIntegrationService | null;
}): AppointmentCalendarProjector {
  async function context(event: AppointmentOutboxEvent) {
    const actorIds = participantActorIds(event);
    const integration = input.integrationForActor(actorIds[0]);
    if (!integration) throw new Error("The appointment owner's calendar integration is unavailable.");
    const authorization = (await integration.listAuthorizations()).find(
      (value) => value.provider === "google_calendar",
    );
    if (
      !authorization ||
      authorization.status !== "active" ||
      !authorization.capabilities.includes("calendar.write")
    ) {
      throw new Error("The appointment owner must connect Google Calendar with calendar write access.");
    }
    const actors = await input.actorDirectory.load(actorIds);
    if (actors.length !== 2 || actorIds.some((actorId) => !actors.some((actor) => actor.actorId === actorId))) {
      throw new Error("Appointment participant account identities are incomplete.");
    }
    const ordered = actorIds.map((actorId) => actors.find((actor) => actor.actorId === actorId)!);
    return { integration, ordered };
  }

  const idempotencyKey = (event: AppointmentOutboxEvent) =>
    `${event.appointmentId}:google-calendar`;

  return {
    async cancel(event) {
      const { integration } = await context(event);
      await integration.deleteCalendarEvent({
        provider: "google_calendar",
        idempotencyKey: idempotencyKey(event),
      });
    },
    async upsert(event) {
      const { integration, ordered } = await context(event);
      const result = await integration.createCalendarEvent({
        provider: "google_calendar",
        idempotencyKey: idempotencyKey(event),
        payload: calendarInput(event, ordered),
      });
      return {
        joinUrl: result.joinUrl ?? null,
        providerRecordId: result.providerRecordId,
      };
    },
  };
}

function hasGoogleCalendarConfiguration(env: NodeJS.ProcessEnv): boolean {
  return [
    "ORBIT_GOOGLE_CALENDAR_AUTHORIZATION_ENDPOINT",
    "ORBIT_GOOGLE_CALENDAR_TOKEN_ENDPOINT",
    "ORBIT_GOOGLE_CALENDAR_API_BASE_URL",
    "ORBIT_GOOGLE_CALENDAR_CLIENT_ID",
    "ORBIT_GOOGLE_CALENDAR_CLIENT_SECRET",
    "ORBIT_GOOGLE_CALENDAR_REDIRECT_URI",
    "ORBIT_GOOGLE_CALENDAR_SCOPES",
    "ORBIT_INTEGRATION_TOKEN_KEY",
  ].every((name) => Boolean(env[name]?.trim()));
}

export function createConfiguredAppointmentCalendarProjector(
  runtime: EventOperationsPostgresRuntime,
  env: NodeJS.ProcessEnv = process.env,
): AppointmentCalendarProjector | null {
  if (!hasGoogleCalendarConfiguration(env)) return null;
  return createAppointmentCalendarProjector({
    actorDirectory: {
      async load(actorIds) {
        const result = await runtime.client.query<{
          actor_id: string;
          display_name: string;
          email: string;
        }>(`
          select user_id as actor_id,
                 payload #>> '{displayName}' as display_name,
                 payload #>> '{email}' as email
            from orbit_records
           where workspace_id = $1
             and collection_name = 'auth_users'
             and user_id = any($2::text[])
             and deleted_at is null
        `, [runtime.workspaceId, [...actorIds]]);
        return result.rows.map((row) => ({
          actorId: requiredText(row.actor_id, "an account actor id"),
          displayName: requiredText(row.display_name, "an account display name"),
          email: requiredText(row.email, "an account email"),
        }));
      },
    },
    integrationForActor: (actorId) =>
      createConfiguredOrbitIntegrationService({ actorId, env }),
  });
}
