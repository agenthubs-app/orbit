import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Pool } from "pg";

import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import type { EventRegistration } from "../../features/events/registration/contract";
import { stableProfileRepairValue } from "../../features/events/registration/profile-contract-repair/contract";

export async function seedProfileRepairFixture(pool: Pool, workspaceId: string) {
  const client = createEventOperationsPostgresClient({ connectionString: "fixture", pool });
  const repository = createPostgresEventOperationsRepository({ client, workspaceId });
  const eventIds = ["repair-event-a", "repair-event-b"];
  for (const eventId of eventIds) {
    await pool.query(`insert into event_ops_events (
      workspace_id,event_id,organizer_actor_id,lifecycle_state,revision,created_at,updated_at,
      public_code,title,timezone,starts_at,ends_at,lifecycle_state_v2,source_payload,event_version
    ) values ($1,$2,'organizer-repair','active',1,now(),now(),$2,$2,'Asia/Tokyo',
      '2026-09-01T10:00:00Z','2026-09-01T14:00:00Z','published','{}',1)`, [workspaceId,eventId]);
    await pool.query(`insert into event_event_versions (
      workspace_id,event_id,event_version,public_code,title,timezone,starts_at,ends_at,
      lifecycle_state_v2,source_payload,organizer_actor_id,content_hash,created_at
    ) values ($1,$2,1,$2,$2,'Asia/Tokyo','2026-09-01T10:00:00Z','2026-09-01T14:00:00Z',
      'published','{}','organizer-repair',$3,now())`,
    [workspaceId,eventId,createHash("sha256").update(eventId).digest("hex")]);
    await repository.saveConfiguration({
      checkInOpensAt: "2026-09-01T09:00:00.000Z",
      eventEndsAt: "2026-09-01T14:00:00.000Z", eventId,
      eventStartsAt: "2026-09-01T10:00:00.000Z", maxAttemptsPerTask: 3,
      organizerActorId: "organizer-repair", profileEditDeadlineAt: "2026-08-20T10:00:00.000Z",
      recommendationCount: 4, registrationCutoffAt: "2026-08-25T10:00:00.000Z",
      resultsAvailableAt: "2026-08-26T10:00:00.000Z", roundOneStartsAt: "2026-09-01T11:00:00.000Z",
      roundTwoStartsAt: "2026-09-01T12:00:00.000Z", shardSize: 6, tableSize: 6,
      updatedAt: "2026-08-04T10:00:00.000Z",
    });
    const registrations = Array.from({ length: 13 }, (_, index): EventRegistration => {
      const userId = `actor:${eventId}:${String(index).padStart(2, "0")}`;
      const participantProfileId = `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
      const registeredAt = index === 11 ? "2026-08-21T10:00:00.000Z" : "2026-08-01T10:00:00.000Z";
      const cancelledAt = index === 9 || index === 10 ? "2026-08-22T10:00:00.000Z" : null;
      return {
        id: `event-registration:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`,
        eventId, userId, participantProfileId, registeredAt, cancelledAt,
        reactivatedAt: index === 9 ? "2026-08-15T10:00:00.000Z" : null,
        updatedAt: cancelledAt ?? registeredAt, status: cancelledAt ? "cancelled" : "rsvped",
        participantProfile: {
          id: participantProfileId, eventId, userId, displayName: `Repair Candidate ${index}`,
          createdAt: registeredAt, updatedAt: registeredAt,
          answers: {
            desiredOutcome: `Partnership outcome ${index}`, energyStyle: "Focused conversation",
            experienceHighlight: `Regional launch ${index}`, industry: "Industrial AI",
            positioning: `Operator ${index}`, targetAttendees: "Technical partners",
            valueOffered: `Pilot evidence ${index}`,
          },
        },
        sideEffects: {
          calendarUpdateExecuted: false, emailSent: false, globalProfileWriteExecuted: false,
          notificationDelivered: false, organizerMessageSent: false, refundRequested: false,
        },
      };
    });
    // Migration activation intentionally imports historical registrations, not a live signup.
    await repository.activateCanonicalRegistrations(eventId, registrations);
    for (const registration of registrations) {
      await pool.query(`insert into orbit_records (
        workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,
        provider_record_id,target_type,target_id,lifecycle_state,search_text,payload,created_at,updated_at
      ) values ($1,'event_registrations',$2,$3,'manual',$2,'{}',$2,'event',$4,'active','',$5,now(),now())`,
      [workspaceId,registration.id,registration.userId,eventId,
        JSON.stringify({ registration, registrationId: registration.id })]);
    }
  }
  const profiles = await pool.query<{
    event_id: string; participant_id: string; actor_id: string; profile_version: number;
    profile_payload: { participant: { profileAnswers: Record<string, string> }; registrationProfile: { answers: Record<string, string> } };
  }>(`select event_id,participant_id,actor_id,profile_version,profile_payload
      from event_ops_profile_versions where workspace_id=$1 order by event_id,actor_id`, [workspaceId]);
  assert.equal(profiles.rows.length, 26);
  let defects = 0;
  for (const row of profiles.rows) {
    if (row.actor_id.endsWith(":12")) continue;
    const payload = structuredClone(row.profile_payload);
    const empty = ["", "   ", "\u3000\t"][defects % 3]!;
    payload.participant.profileAnswers.industry = empty;
    payload.registrationProfile.answers.industry = empty;
    const hash = createHash("sha256").update(JSON.stringify(stableProfileRepairValue(payload))).digest("hex");
    await pool.query(`update event_ops_profile_versions set profile_payload=$5,profile_hash=$6
      where workspace_id=$1 and event_id=$2 and participant_id=$3 and profile_version=$4`,
    [workspaceId,row.event_id,row.participant_id,row.profile_version,JSON.stringify(payload),hash]);
    defects += 1;
  }
  assert.equal(defects, 24);
  return eventIds;
}
