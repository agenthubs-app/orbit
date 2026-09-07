import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import {
  ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION,
  createLiveRecordAttendeePostEventAiArtifactReader,
} from "../../features/events/post-event-artifact/live-record-reader";
import {
  createEventAnalyticsReadModel,
  EventAnalyticsReadModelError,
} from "../../features/events/event-analytics/read-model";
import { runEventAnalyticsMigrations } from "../../features/events/event-analytics/migrations";
import { createEventAnalyticsRoiSnapshotFinalizer } from "../../features/events/event-analytics/snapshot";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import {
  createEventOperationsPostgresClient,
  type EventOperationsPostgresRuntime,
} from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { runAppointmentMigrations } from "../../features/appointments/storage/migrations";
import { createHumanEncounterService } from "../../features/encounters/service";
import { readCanonicalPostEventReminderIntents } from "../../features/notifications/canonical-post-event-reminder-source";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const EVENT_ID = "event:analytics:postgres";
const ORGANIZER_ID = "actor:analytics-organizer";
const ACTOR_A = "actor:analytics-a";
const ACTOR_B = "actor:analytics-b";
const ACTOR_C = "actor:analytics-c";
const ACTOR_D = "actor:analytics-d";
const ACTOR_E = "actor:analytics-e";
const ACTOR_F = "actor:analytics-f";
const CANCELLED_ACTOR = "actor:analytics-cancelled";

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

async function runOrbitRecordsSchema(runtime: EventOperationsPostgresRuntime) {
  for (const statement of ORBIT_RECORDS_SCHEMA_SQL.split(";")) {
    if (statement.trim()) await runtime.client.query(statement);
  }
}

test(
  "PostgreSQL event analytics aggregates canonical evidence and isolates attendee evidence",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_analytics_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:analytics:${randomUUID()}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    const runtime: EventOperationsPostgresRuntime = {
      client: createEventOperationsPostgresClient({
        connectionString: databaseUrl,
        pool: scopedPool,
      }),
      workspaceId,
    };

    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(runtime.client);
      await runOrbitRecordsSchema(runtime);
      await runAppointmentMigrations(runtime.client);
      await runEventAnalyticsMigrations(runtime.client);

      const repository = createPostgresEventOperationsRepository(runtime);
      const clock = await scopedPool.query<{ now: Date }>(
        "select statement_timestamp() as now",
      );
      const base = clock.rows[0]!.now.getTime();
      await repository.saveConfiguration({
        checkInOpensAt: at(base, -5),
        eventEndsAt: at(base, 120),
        eventId: EVENT_ID,
        eventStartsAt: at(base, -1),
        maxAttemptsPerTask: 3,
        organizerActorId: ORGANIZER_ID,
        profileEditDeadlineAt: at(base, 20),
        recommendationCount: 4,
        registrationCutoffAt: at(base, 30),
        resultsAvailableAt: at(base, 40),
        roundOneStartsAt: at(base, 50),
        roundTwoStartsAt: at(base, 60),
        shardSize: 4,
        tableSize: 4,
        updatedAt: at(base, 0),
      });
      await runtime.client.query(`
        update event_ops_events
        set
          public_code = $3,
          title = 'Analytics integration event',
          timezone = 'Asia/Tokyo',
          starts_at = $4,
          ends_at = $5,
          lifecycle_state_v2 = 'published',
          source_payload = '{}'::jsonb,
          event_version = 1
        where workspace_id = $1 and event_id = $2
      `, [workspaceId, EVENT_ID, EVENT_ID, at(base, -1), at(base, 120)]);
      await runtime.client.query(`
        insert into event_event_versions (
          workspace_id, event_id, event_version, public_code, title, timezone,
          starts_at, ends_at, lifecycle_state_v2, source_payload,
          organizer_actor_id, content_hash, created_at
        ) values (
          $1, $2, 1, $2, 'Analytics integration event', 'Asia/Tokyo',
          $3, $4, 'published', '{}'::jsonb, $5, $6, $3
        )
      `, [
        workspaceId,
        EVENT_ID,
        at(base, -1),
        at(base, 120),
        ORGANIZER_ID,
        createHash("sha256").update(`event-content:${EVENT_ID}`).digest("hex"),
      ]);
      await repository.activateCanonicalRegistrations(EVENT_ID, []);

      for (const actorId of [
        ACTOR_A,
        ACTOR_B,
        ACTOR_C,
        ACTOR_D,
        ACTOR_E,
        ACTOR_F,
        CANCELLED_ACTOR,
      ]) {
        await repository.registerCanonicalParticipant({
          answers: { industry: "Private data must not be in analytics" },
          displayName: `Private attendee ${actorId}`,
          eventId: EVENT_ID,
          userId: actorId,
        });
      }
      await repository.cancelCanonicalRegistration({
        eventId: EVENT_ID,
        userId: CANCELLED_ACTOR,
      });

      const members = await runtime.client.query<{
        actor_id: string;
        membership_version: string;
        participant_id: string;
        profile_version: string;
      }>(`
        select
          actor_id,
          membership_version::text as membership_version,
          participant_id,
          profile_version::text as profile_version
        from event_ops_membership_heads
        where workspace_id = $1 and event_id = $2
      `, [workspaceId, EVENT_ID]);
      const membershipByActor = new Map(
        members.rows.map((row) => [row.actor_id, row]),
      );
      const participant = (actorId: string): string => {
        const value = membershipByActor.get(actorId)?.participant_id;
        assert.ok(value, `missing participant for ${actorId}`);
        return value;
      };
      const membershipVersion = (actorId: string): string => {
        const value = membershipByActor.get(actorId)?.membership_version;
        assert.ok(value, `missing membership version for ${actorId}`);
        return value;
      };
      const profileVersion = (actorId: string): string => {
        const value = membershipByActor.get(actorId)?.profile_version;
        assert.ok(value, `missing profile version for ${actorId}`);
        return value;
      };

      await repository.checkInAtomically({
        actorId: ACTOR_A,
        eventId: EVENT_ID,
        kind: "self",
      });
      await repository.checkInAtomically({
        actorId: ACTOR_B,
        eventId: EVENT_ID,
        kind: "self",
      });

      const accepted = await repository.createContactRequestAtomically({
        eventId: EVENT_ID,
        expectedRevision: null,
        requesterActorId: ACTOR_A,
        targetParticipantId: participant(ACTOR_B),
      });
      await repository.respondToContactRequestAtomically({
        accept: true,
        eventId: EVENT_ID,
        expectedRevision: accepted.revision,
        requestId: accepted.requestId,
        targetActorId: ACTOR_B,
      });
      const acceptedPairResult = await runtime.client.query<{
        relationship_pair_id: string;
      }>(`
        select relationship_pair_id
        from event_ops_relationship_pairs
        where workspace_id = $1 and request_id = $2
      `, [workspaceId, accepted.requestId]);
      const acceptedRelationshipPairId =
        acceptedPairResult.rows[0]?.relationship_pair_id;
      assert.ok(acceptedRelationshipPairId);
      const unsuppressedPostEventReminder =
        await readCanonicalPostEventReminderIntents({
          actorId: ACTOR_A,
          now: at(base, 121),
          runtime,
        });
      assert.equal(unsuppressedPostEventReminder.length, 1);
      assert.equal(unsuppressedPostEventReminder[0]?.eventId, EVENT_ID);
      assert.equal(
        JSON.stringify(unsuppressedPostEventReminder).includes(
          acceptedRelationshipPairId,
        ),
        false,
      );
      const declined = await repository.createContactRequestAtomically({
        eventId: EVENT_ID,
        expectedRevision: null,
        requesterActorId: ACTOR_C,
        targetParticipantId: participant(ACTOR_D),
      });
      await repository.respondToContactRequestAtomically({
        accept: false,
        eventId: EVENT_ID,
        expectedRevision: declined.revision,
        requestId: declined.requestId,
        targetActorId: ACTOR_D,
      });
      const withdrawn = await repository.createContactRequestAtomically({
        eventId: EVENT_ID,
        expectedRevision: null,
        requesterActorId: ACTOR_E,
        targetParticipantId: participant(ACTOR_F),
      });
      await repository.withdrawContactRequestAtomically({
        eventId: EVENT_ID,
        expectedRevision: withdrawn.revision,
        requestId: withdrawn.requestId,
        requesterActorId: ACTOR_E,
      });
      await repository.createContactRequestAtomically({
        eventId: EVENT_ID,
        expectedRevision: null,
        requesterActorId: ACTOR_A,
        targetParticipantId: participant(ACTOR_C),
      });

      const configuration = await runtime.client.query<{
        configuration_version: string;
      }>(`
        select configuration_version::text
        from event_ops_configuration_heads
        where workspace_id = $1 and event_id = $2
      `, [workspaceId, EVENT_ID]);
      const configurationVersion = configuration.rows[0]?.configuration_version;
      assert.ok(configurationVersion);
      const generationId = "generation:analytics:published";
      const publishedAt = at(base, -1);
      await runtime.client.query(`
        insert into event_ops_generations (
          workspace_id, generation_id, event_id, organizer_actor_id,
          idempotency_key, configuration_version, snapshot_hash,
          ai_request_fingerprint, status, expected_task_count, completed_at,
          published_at, error_code, error_message, created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6::bigint, $7, $8, 'published', 1, $9,
          $9, null, null, $9, $9
        )
      `, [
        workspaceId,
        generationId,
        EVENT_ID,
        ORGANIZER_ID,
        "analytics-published-generation",
        configurationVersion,
        "snapshot:analytics",
        "fingerprint:analytics",
        publishedAt,
      ]);
      for (const actorId of [ACTOR_A, ACTOR_B]) {
        await runtime.client.query(`
          insert into event_ops_generation_participants (
            workspace_id, generation_id, participant_id, actor_id,
            profile_version, membership_version, ordinal, participant_payload
          ) values ($1, $2, $3, $4, $5::bigint, $6::bigint, $7, '{}'::jsonb)
        `, [
          workspaceId,
          generationId,
          participant(actorId),
          actorId,
          profileVersion(actorId),
          membershipVersion(actorId),
          actorId === ACTOR_A ? 0 : 1,
        ]);
      }
      const publishedParticipantIds = [
        participant(ACTOR_A),
        participant(ACTOR_B),
        ...Array.from(
          { length: 62 },
          (_, index) => `participant:analytics:published:${index + 1}`,
        ),
      ];
      const tableSizes = [6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5];
      const publishedRound = (roundNumber: 1 | 2) => {
        const orderedParticipantIds =
          roundNumber === 1
            ? publishedParticipantIds
            : [
                ...publishedParticipantIds.slice(2, 8),
                ...publishedParticipantIds.slice(0, 2),
                ...publishedParticipantIds.slice(8),
              ];
        let cursor = 0;
        return tableSizes.map((size, tableIndex) => {
          const tableNumber = tableIndex + 1;
          const members = orderedParticipantIds
            .slice(cursor, cursor + size)
            .map((participantId, memberIndex) => ({
              participantId,
              seat: `seat-${tableNumber}-${memberIndex + 1}`,
            }));
          cursor += size;
          return {
            icebreakers: ["One", "Two", "Three"],
            memberPrompts: Object.fromEntries(
              members.map((member) => [
                member.participantId,
                ["Prompt one", "Prompt two"],
              ]),
            ),
            memberRationales: Object.fromEntries(
              members.map((member) => [member.participantId, "Rationale"]),
            ),
            members,
            rationale: "Immutable published grouping test fixture",
            tableNumber,
            theme: `Round ${roundNumber} table ${tableNumber}`,
          };
        });
      };
      const publishedGrouping = {
        roundOne: publishedRound(1),
        roundTwo: publishedRound(2),
      };
      const publicationId = "publication:analytics";
      await runtime.client.query(`
        insert into event_ops_publications (
          workspace_id, publication_id, event_id, generation_id,
          snapshot_hash, dto_hash, published_dto, published_by_actor_id,
          published_at
        ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
      `, [
        workspaceId,
        publicationId,
        EVENT_ID,
        generationId,
        "snapshot:analytics",
        "dto:analytics",
        JSON.stringify({
          directory: [],
          eventId: EVENT_ID,
          generationId,
          graph: { edges: [], nodes: [] },
          grouping: publishedGrouping,
          profileEditDeadlineAt: at(base, 20),
          publishedAt,
          recommendations: [],
          resultsAvailableAt: at(base, -1),
          snapshotHash: "snapshot:analytics",
        }),
        ORGANIZER_ID,
        publishedAt,
      ]);
      await runtime.client.query(`
        insert into event_ops_publication_heads (
          workspace_id, event_id, publication_id, generation_id, revision,
          updated_at
        ) values ($1, $2, $3, $4, 1, $5)
      `, [workspaceId, EVENT_ID, publicationId, generationId, publishedAt]);
      const normalizedGroupingRows = await runtime.client.query<{
        seats: string;
        tables: string;
      }>(`
        select
          (select count(*)::text from event_ops_tables
            where workspace_id = $1 and generation_id = $2) as tables,
          (select count(*)::text from event_ops_seats
            where workspace_id = $1 and generation_id = $2) as seats
      `, [workspaceId, generationId]);
      assert.deepEqual(normalizedGroupingRows.rows[0], {
        seats: "0",
        tables: "0",
      });

      const records = createPostgresLiveRecordStore<Record<string, unknown>>({
        client: runtime.client,
      });
      const encounterService = createHumanEncounterService({
        // Event-scoped capture uses relationshipAuthority instead of the
        // contact graph. The real service still writes the canonical payload
        // and `orbit_records.user_id` fields that the read model requires.
        contactProvider: {} as never,
        now: () => at(base, 0),
        relationshipAuthority: {
          async isCanonicalRelationshipSide(input) {
            return input.eventId === EVENT_ID && input.actorId.startsWith("actor:analytics-");
          },
        },
        store: records,
        workspaceId,
      });
      async function writeEncounter(input: {
        actorId: string;
        contactId?: string;
        id: string;
        observedAt?: string;
        projectionStatus: "completed" | "pending";
      }) {
        const captured = await encounterService.capture({
          actorId: input.actorId,
          contactId: input.contactId ?? `contact:${input.actorId}`,
          eventId: EVENT_ID,
          idempotencyKey: input.id,
          noteText: `${input.actorId} private encounter text`,
          observedAt: input.observedAt ?? at(base, -1),
          privacy: "private",
          talked: "yes",
        });
        await runtime.client.query(`
          update orbit_records
          set payload = jsonb_set(
            payload,
            '{projection,status}',
            to_jsonb($4::text),
            true
          )
          where workspace_id = $1
            and collection_name = 'human_encounters'
            and record_id = $2
            and user_id = $3
        `, [
          workspaceId,
          captured.encounterId,
          input.actorId,
          input.projectionStatus,
        ]);
      }
      await writeEncounter({
        actorId: ACTOR_A,
        id: "encounter:analytics:a:completed",
        projectionStatus: "completed",
      });
      const acceptedSideResult = await runtime.client.query<{ contact_id: string }>(`
        select contact_id
        from event_ops_relationship_sides
        where workspace_id = $1
          and relationship_pair_id = $2
          and owner_actor_id = $3
      `, [workspaceId, acceptedRelationshipPairId, ACTOR_A]);
      const acceptedContactId = acceptedSideResult.rows[0]?.contact_id;
      assert.ok(acceptedContactId);
      await writeEncounter({
        actorId: ACTOR_A,
        contactId: acceptedContactId,
        id: "encounter:analytics:a:effective",
        observedAt: at(base, 1),
        projectionStatus: "completed",
      });
      await writeEncounter({
        actorId: ACTOR_A,
        id: "encounter:analytics:a:pending",
        projectionStatus: "pending",
      });
      await writeEncounter({
        actorId: ACTOR_B,
        id: "encounter:analytics:b:completed",
        projectionStatus: "completed",
      });
      const storedEncounter = await runtime.client.query<{
        payload_actor_id: string;
        payload_event_id: string;
        user_id: string;
      }>(`
        select
          payload ->> 'actorId' as payload_actor_id,
          payload ->> 'eventId' as payload_event_id,
          user_id
        from orbit_records
        where workspace_id = $1
          and collection_name = 'human_encounters'
          and user_id = $2
        limit 1
      `, [workspaceId, ACTOR_A]);
      assert.deepEqual(storedEncounter.rows[0], {
        payload_actor_id: ACTOR_A,
        payload_event_id: EVENT_ID,
        user_id: ACTOR_A,
      });

      async function writeArtifact(input: {
        actorId: string;
        summary: string;
        version: number;
      }) {
        const timestamp = at(base, -1);
        const evidenceId = `evidence:human-encounter:${input.actorId}`;
        await records.upsertRecord({
          collectionName: ATTENDEE_POST_EVENT_AI_ARTIFACT_COLLECTION,
          createdAt: timestamp,
          evidenceIds: [evidenceId],
          lifecycleState: "active",
          occurredAt: timestamp,
          payload: {
            artifact: {
              evidenceHash: `hash:${input.actorId}`,
              evidenceIds: [evidenceId],
              generatedAt: timestamp,
              messageDraft: null,
              summary: input.summary,
              version: input.version,
            },
            attendeeActorId: input.actorId,
            eventId: EVENT_ID,
            evidenceHash: `hash:${input.actorId}`,
            provenance: {
              generationMethod: "ai-provider",
              model: "analytics-test-model",
              promptVersion: 1,
              provider: "analytics-test-provider",
            },
            status: "ready",
            version: input.version,
          },
          recordId: `artifact:analytics:${input.actorId}`,
          searchText: "",
          sourceId: EVENT_ID,
          sourceLabel: "test artifact",
          sourceType: "generated",
          targetId: EVENT_ID,
          targetType: "event",
          updatedAt: timestamp,
          userId: input.actorId,
          workspaceId,
        });
      }
      await writeArtifact({
        actorId: ACTOR_A,
        summary: "A permitted, private artifact.",
        version: 1,
      });
      await writeArtifact({
        actorId: ACTOR_B,
        summary: "B-only secret artifact.",
        version: 2,
      });

      const appointmentStatuses = [
        "draft",
        "awaiting_response",
        "negotiating",
        "confirmed",
        "reschedule_pending",
        "cancelled",
        "completed",
      ] as const;
      for (const status of appointmentStatuses) {
        const involvesA =
          status === "draft" ||
          status === "negotiating" ||
          status === "confirmed" ||
          status === "completed";
        const ownerActorId = involvesA ? ACTOR_A : ACTOR_B;
        const inviteeActorId = involvesA ? ACTOR_C : ACTOR_D;
        const appointmentId = `appointment:analytics:${status}`;
        const timestamp = at(base, -1);
        await runtime.client.query(`
          insert into appointment_aggregates (
            workspace_id, appointment_id, owner_actor_id, invitee_actor_id,
            contact_id, relationship_pair_id, authority_request_id,
            contact_ids_by_actor, event_id, status, version, payload,
            created_at, updated_at
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, 1, $11::jsonb,
            $12, $12
          )
        `, [
          workspaceId,
          appointmentId,
          ownerActorId,
          inviteeActorId,
          `contact:${appointmentId}`,
          `pair:${appointmentId}`,
          `request:${appointmentId}`,
          JSON.stringify({
            [ownerActorId]: `contact:${ownerActorId}`,
            [inviteeActorId]: `contact:${inviteeActorId}`,
          }),
          EVENT_ID,
          status,
          JSON.stringify({
            appointmentId,
            eventId: EVENT_ID,
            privateNote: `${ownerActorId} private appointment payload`,
            status,
          }),
          timestamp,
        ]);
      }
      await runtime.client.query(`
        insert into appointment_aggregates (
          workspace_id, appointment_id, owner_actor_id, invitee_actor_id,
          contact_id, relationship_pair_id, authority_request_id,
          contact_ids_by_actor, event_id, status, version, payload,
          created_at, updated_at
        ) values (
          $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, 'confirmed', 1,
          $10::jsonb, $11, $11
        )
      `, [
        workspaceId,
        "appointment:analytics:effective",
        ACTOR_A,
        ACTOR_B,
        acceptedContactId,
        acceptedRelationshipPairId,
        accepted.requestId,
        JSON.stringify({
          [ACTOR_A]: acceptedContactId,
          [ACTOR_B]: "contact:analytics:accepted:b",
        }),
        EVENT_ID,
        JSON.stringify({
          appointmentId: "appointment:analytics:effective",
          eventId: EVENT_ID,
          relationshipPairId: acceptedRelationshipPairId,
          status: "confirmed",
        }),
        at(base, 1),
      ]);

      const actionId = "agent-action:analytics:roi";
      const runtimeTimestamp = at(base, 1);
      await records.upsertRecord({
        collectionName: "agentActionsV2",
        createdAt: runtimeTimestamp,
        evidenceIds: [],
        lifecycleState: "active",
        payload: {
          entity: {
            actionId,
            operations: [
              {
                operationId: "operation:analytics:strong-draft",
                operationType: "save_message_draft",
                payload: {
                  eventOrigin: {
                    attributedAt: "2099-01-01T00:00:00.000Z",
                    eventId: EVENT_ID,
                    relationshipPairId: acceptedRelationshipPairId,
                    sourceActionId: actionId,
                  },
                },
              },
              {
                operationId: "operation:analytics:strong-reminder",
                operationType: "create_followup_reminder",
                payload: {
                  eventOrigin: {
                    eventId: EVENT_ID,
                    relationshipPairId: acceptedRelationshipPairId,
                    sourceActionId: actionId,
                  },
                },
              },
              {
                operationId: "operation:analytics:declared-incomplete",
                operationType: "save_message_draft",
                payload: { eventOrigin: { eventId: EVENT_ID } },
              },
              {
                operationId: "operation:analytics:other-event",
                operationType: "save_message_draft",
                payload: {
                  eventOrigin: {
                    attributedAt: runtimeTimestamp,
                    eventId: "event:analytics:other",
                    sourceActionId: actionId,
                  },
                },
              },
            ],
          },
        },
        recordId: actionId,
        searchText: "",
        sourceId: actionId,
        sourceLabel: "analytics ROI action",
        sourceType: "agent_action",
        updatedAt: runtimeTimestamp,
        userId: ACTOR_A,
        workspaceId,
      });
      for (const operationId of [
        "operation:analytics:strong-draft",
        "operation:analytics:strong-reminder",
        "operation:analytics:declared-incomplete",
        "operation:analytics:other-event",
      ]) {
        await records.upsertRecord({
          collectionName: "agentExecutionReceipts",
          createdAt: runtimeTimestamp,
          evidenceIds: [],
          lifecycleState: "active",
          payload: {
            entity: {
              actionId,
              operationId,
              receiptId: `receipt:${operationId}`,
              status: "completed",
            },
          },
          recordId: `receipt:${operationId}`,
          searchText: "",
          sourceId: operationId,
          sourceLabel: "analytics ROI receipt",
          sourceType: "agent_action",
          updatedAt: runtimeTimestamp,
          userId: ACTOR_A,
          workspaceId,
        });
      }
      assert.deepEqual(await readCanonicalPostEventReminderIntents({
        actorId: ACTOR_A,
        now: at(base, 121),
        runtime,
      }), []);

      const analytics = createEventAnalyticsReadModel({
        artifactReader: createLiveRecordAttendeePostEventAiArtifactReader({
          store: records,
          workspaceId,
        }),
        runtime,
      });
      const organizer = await analytics.readOrganizerAggregate({ eventId: EVENT_ID });
      assert.deepEqual(organizer, {
        appointments: {
          awaitingResponse: 1,
          cancelled: 1,
          completed: 1,
          confirmed: 2,
          draft: 1,
          negotiating: 1,
          reschedulePending: 1,
        },
        checkIns: { checkedIn: 2 },
        contactRequests: {
          accepted: 1,
          awaitingTargetConsent: 1,
          declined: 1,
          withdrawn: 1,
        },
        encounters: { captured: 4, projected: 3 },
        eventId: EVENT_ID,
        grouping: {
          published: true,
          roundOne: { assignedParticipants: 64, tables: 11 },
          roundTwo: { assignedParticipants: 64, tables: 11 },
        },
        kind: "organizer_aggregate",
        registrations: { active: 6, cancelled: 1 },
        roi: {
          metrics: {
            attributionCoverage: {
              declaredCompletedOperations: 3,
              stronglyAttributedCompletedOperations: 2,
              rate: { denominator: 3, numerator: 2, value: 2 / 3 },
            },
            checkedInParticipants: 2,
            completedAttributedAgentOperations: 2,
            effectiveConnectionPairs: 1,
            effectiveConnectionParticipants: 2,
            effectiveConnectionRate: {
              denominator: 2,
              numerator: 2,
              value: 1,
            },
            mutualConnections: {
              acceptedRelationshipPairs: 1,
              distinctConnectedCheckIns: 2,
              mutuallyCheckedInPairs: 1,
              participationRate: { denominator: 2, numerator: 2, value: 1 },
            },
            strongActions: {
              appointments: 1,
              followupReminders: 1,
              humanEncounterNotes: 1,
              messageDrafts: 1,
            },
          },
          snapshot: {
            finalizedAt: null,
            formulaHash: organizer.roi.snapshot.formulaHash,
            metricVersion: "event-roi-v1",
            revision: null,
            sourceWatermark: organizer.roi.snapshot.sourceWatermark,
            status: "live",
            windowEndsAt: at(base, 120 + 7 * 24 * 60),
          },
        },
      });
      assert.equal(organizer.roi.snapshot.sourceWatermark.configurationVersion, 1);
      assert.equal(organizer.roi.snapshot.sourceWatermark.checkInRevision, 1);

      const finalizer = createEventAnalyticsRoiSnapshotFinalizer({
        now: () => at(base, 120 + 8 * 24 * 60),
        runtime,
      });
      const finalized = await finalizer.finalize({ eventId: EVENT_ID });
      assert.equal(finalized.snapshot.status, "finalized");
      assert.equal(finalized.snapshot.revision, 1);
      const recomputed = await finalizer.finalize({
        eventId: EVENT_ID,
        expectedRevision: 1,
        recomputeReason: "Backfilled a verified strong eventOrigin.",
      });
      assert.equal(recomputed.snapshot.revision, 2);
      const immutableRows = await runtime.client.query<{ count: string }>(`
        select count(*)::text as count
        from event_analytics_roi_snapshots
        where workspace_id = $1 and event_id = $2
      `, [workspaceId, EVENT_ID]);
      assert.equal(immutableRows.rows[0]?.count, "2");
      const snapshottedOrganizer = await analytics.readOrganizerAggregate({
        eventId: EVENT_ID,
      });
      assert.equal(snapshottedOrganizer.roi.snapshot.status, "finalized");
      assert.equal(snapshottedOrganizer.roi.snapshot.revision, 2);
      assert.deepEqual(await finalizer.finalizeDue({ limit: 10 }), {
        finalized: 0,
      });
      const organizerSerialized = JSON.stringify(organizer);
      assert.equal(organizerSerialized.includes(ACTOR_A), false);
      assert.equal(organizerSerialized.includes("Private attendee"), false);
      assert.equal(organizerSerialized.includes("private encounter text"), false);

      const reportA = await analytics.readAttendeeReport({
        actorId: ACTOR_A,
        eventId: EVENT_ID,
      });
      assert.deepEqual(reportA.appointments, {
        awaitingResponse: 0,
        cancelled: 0,
        completed: 1,
        confirmed: 2,
        draft: 1,
        negotiating: 1,
        reschedulePending: 0,
      });
      assert.deepEqual(reportA.contactRequests, {
        accepted: 1,
        awaitingTargetConsent: 1,
        declined: 0,
        withdrawn: 0,
      });
      assert.deepEqual(reportA.encounters, { captured: 3, projected: 2 });
      assert.equal(reportA.checkIn.status, "checked_in");
      assert.deepEqual(reportA.grouping, {
        roundOneTableNumber: 1,
        roundTwoTableNumber: 2,
        status: "available",
      });
      assert.equal(reportA.aiArtifact.status, "ready");
      assert.equal(reportA.aiArtifact.artifact?.summary, "A permitted, private artifact.");
      const reportASerialized = JSON.stringify(reportA);
      assert.equal(reportASerialized.includes(ACTOR_B), false);
      assert.equal(reportASerialized.includes("B-only secret artifact."), false);
      assert.equal(reportASerialized.includes("actor:analytics-b private"), false);

      const reportB = await analytics.readAttendeeReport({
        actorId: ACTOR_B,
        eventId: EVENT_ID,
      });
      assert.deepEqual(reportB.encounters, { captured: 1, projected: 1 });
      assert.equal(reportB.aiArtifact.artifact?.summary, "B-only secret artifact.");
      assert.equal(JSON.stringify(reportB).includes("A permitted, private artifact."), false);

      await runtime.client.query(`
        update event_ops_publications
        set published_dto = jsonb_set(
          published_dto,
          '{resultsAvailableAt}',
          to_jsonb($3::text)
        )
        where workspace_id = $1 and publication_id = $2
      `, [workspaceId, publicationId, at(base, 120)]);
      const lockedReportA = await analytics.readAttendeeReport({
        actorId: ACTOR_A,
        eventId: EVENT_ID,
      });
      assert.deepEqual(lockedReportA.grouping, {
        roundOneTableNumber: null,
        roundTwoTableNumber: null,
        status: "locked",
      });

      await assert.rejects(
        () =>
          analytics.readAttendeeReport({
            actorId: CANCELLED_ACTOR,
            eventId: EVENT_ID,
          }),
        (error: unknown) =>
          error instanceof EventAnalyticsReadModelError &&
          error.code === "EVENT_ANALYTICS_ACTIVE_REGISTRATION_REQUIRED",
      );

      await runtime.client.query(`
        update event_ops_publications
        set published_dto = jsonb_set(
          published_dto,
          '{grouping,roundOne,0,members}',
          'null'::jsonb
        )
        where workspace_id = $1 and publication_id = $2
      `, [workspaceId, publicationId]);
      await assert.rejects(
        () => analytics.readOrganizerAggregate({ eventId: EVENT_ID }),
        /published grouping snapshot is invalid/u,
      );
      await assert.rejects(
        () =>
          analytics.readAttendeeReport({
            actorId: ACTOR_A,
            eventId: EVENT_ID,
          }),
        /published grouping snapshot is invalid/u,
      );
    } finally {
      await runtime.client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
