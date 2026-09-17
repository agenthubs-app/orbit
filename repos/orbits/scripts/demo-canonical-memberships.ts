import { activateCanonicalRegistrationsWithExecutor } from "../features/events/event-operations/storage/canonical-registration-repository";
import type { EventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";

// Reviewed fixture deadlines, not a runtime inference from event startsAt.
export const DEMO_PROFILE_DEADLINES: Readonly<Record<string, string>> = {
  event_01: "2026-02-14T01:00:00.000Z",
  event_02: "2026-03-14T01:00:00.000Z",
  event_03: "2026-04-14T01:00:00.000Z",
  event_04: "2026-05-14T01:00:00.000Z",
  event_05: "2026-06-14T01:00:00.000Z",
  event_06: "2026-01-14T01:00:00.000Z",
  event_07: "2026-02-14T01:00:00.000Z",
  event_08: "2026-03-14T01:00:00.000Z",
  event_09: "2026-04-14T01:00:00.000Z",
  event_10: "2026-05-14T01:00:00.000Z",
  event_signup_02: "2026-08-31T05:00:00.000Z",
  event_signup_03: "2026-09-14T09:00:00.000Z",
};

/** Initialize empty fixture events, preserving and verifying established baselines. */
export async function ensureDemoCanonicalMemberships(input: {
  client: EventOperationsPostgresClient;
  eventIds: readonly string[];
  workspaceId: string;
}): Promise<number> {
  if (input.workspaceId !== "workspace:orbit-demo-fixtures" || process.env.NODE_ENV === "production") {
    throw new Error("Canonical Demo initialization is restricted to the isolated demo workspace.");
  }
  if (new Set(input.eventIds).size !== input.eventIds.length || input.eventIds.some(
    (id) => id !== "event_signup_01" && !Object.hasOwn(DEMO_PROFILE_DEADLINES, id),
  )) throw new Error("Unreviewed or duplicate Demo event IDs.");

  return input.client.transaction(async (executor) => {
    for (const eventId of input.eventIds) {
      const event = (await executor.query<{
        registration_migration_state: string;
        registration_migration_count: number | null;
        registration_migration_hash: string | null;
        registration_migrated_at: unknown;
      }>(`select registration_migration_state, registration_migration_count,
                  registration_migration_hash, registration_migrated_at
           from event_ops_events where workspace_id=$1 and event_id=$2
             and lifecycle_state_v2='published' for update`,
      [input.workspaceId, eventId])).rows[0];
      if (!event) throw new Error(`Published Demo event is missing: ${eventId}`);
      const noBaseline = event.registration_migration_count === null &&
        event.registration_migration_hash === null && event.registration_migrated_at === null;
      if (event.registration_migration_state === "legacy" || noBaseline) {
        if (eventId === "event_signup_01" || !noBaseline ||
            !["legacy", "canonical"].includes(event.registration_migration_state)) {
          throw new Error(`Demo event requires its existing registration baseline: ${eventId}`);
        }
        // The previous Demo seed set only the canonical flag. Recover that exact
        // empty state, never a populated, partially migrated, or audited event.
        const facts = (await executor.query<{ occupied: boolean }>(`select (
          exists(select 1 from event_ops_membership_heads where workspace_id=$1 and event_id=$2) or
          exists(select 1 from event_ops_membership_versions where workspace_id=$1 and event_id=$2) or
          exists(select 1 from event_ops_profile_heads where workspace_id=$1 and event_id=$2) or
          exists(select 1 from event_ops_profile_versions where workspace_id=$1 and event_id=$2) or
          exists(select 1 from event_ops_audit_log where workspace_id=$1 and event_id=$2) or
          exists(select 1 from orbit_records where workspace_id=$1 and collection_name='event_registrations'
            and (target_id=$2 or payload->>'eventId'=$2))
        ) as occupied`, [input.workspaceId, eventId])).rows[0];
        if (!facts || facts.occupied) throw new Error(`Refusing to replace Demo registration history: ${eventId}`);
        if (event.registration_migration_state === "canonical") {
          await executor.query(`update event_ops_events set registration_migration_state='legacy'
            where workspace_id=$1 and event_id=$2`, [input.workspaceId, eventId]);
        }
      }
      await activateCanonicalRegistrationsWithExecutor({
        eventId, executor, registrations: [], workspaceId: input.workspaceId,
        ...(eventId === "event_signup_01" ? {} : {
          registrationMigrationOptions: {
            source: "operator_manifest" as const,
            profileEditDeadlineAt: DEMO_PROFILE_DEADLINES[eventId]!,
            evidenceId: `demo-profile-deadline:v1:${eventId}`,
          },
        }),
      });
    }
    return input.eventIds.length;
  });
}
