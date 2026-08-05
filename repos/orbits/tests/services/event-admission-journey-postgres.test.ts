import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { EventAdmissionError } from "../../features/events/admission/contract";
import { createEventAdmissionJourneyService } from "../../features/events/admission/journey-service";
import { createPostgresEventAdmissionRepository } from "../../features/events/admission/storage/postgres-repository";
import { createEventAdmissionService } from "../../features/events/admission/service";
import { createEventCoreService } from "../../features/events/core/service";
import { createPostgresEventCoreRepository } from "../../features/events/core/storage/postgres-repository";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import type { EventParticipantProfileField } from "../../features/events/registration/contract";
import {
  signAdaptiveInterviewQuestion,
  verifyInterviewResponseSubmissions,
} from "../../features/events/registration/interview-question-token.server";
import type { EventInterviewResponseSubmission } from "../../features/events/registration/interview-response-contract";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const signingSecret = "event-admission-journey-postgres-test-secret";

async function insertPublishedCanonicalEvent(input: {
  eventId: string;
  pool: Pool;
  publicCode: string;
  workspaceId: string;
}): Promise<void> {
  await input.pool.query(
    `insert into event_ops_events (
       workspace_id, event_id, organizer_actor_id, lifecycle_state,
       revision, created_at, updated_at, public_code, title, description,
       venue, timezone, starts_at, ends_at, lifecycle_state_v2,
       source_payload, event_version
     ) values (
       $1, $2, 'account:journey-organizer', 'active', 1, now(), now(),
       $3, $4, 'A source-backed canonical admission journey event.',
       'Tokyo', 'Asia/Tokyo', '2099-09-01T10:00:00.000Z',
       '2099-09-01T12:00:00.000Z', 'published',
       '{"evidenceIds":["evidence:journey:postgres"]}'::jsonb, 1
     )`,
    [input.workspaceId, input.eventId, input.publicCode, `Journey ${input.publicCode}`],
  );
  for (const [alias, aliasType] of [
    [input.eventId, "event_id"],
    [input.publicCode, "public_code"],
  ] as const) {
    await input.pool.query(
      `insert into event_aliases (
         workspace_id, normalized_alias, alias_value, alias_type, event_id,
         source_payload
       ) values ($1, lower(btrim($2)), $2, $3, $4, '{}'::jsonb)`,
      [input.workspaceId, alias, aliasType, input.eventId],
    );
  }
}

async function insertOperationsConfiguration(input: {
  eventId: string;
  pool: Pool;
  profileEditDeadlineAt: string;
  registrationCutoffAt: string;
  workspaceId: string;
}): Promise<void> {
  const updatedAt = "2099-01-01T00:00:00.000Z";
  await input.pool.query(
    `insert into event_ops_configurations (
       workspace_id, event_id, configuration_version,
       check_in_opens_at, event_starts_at, event_ends_at,
       profile_edit_deadline_at, registration_cutoff_at,
       results_available_at, round_one_starts_at, round_two_starts_at,
       recommendation_count, table_size, shard_size,
       max_attempts_per_task, created_at, updated_at
     ) values (
       $1, $2, 1, '2099-08-31T08:00:00.000Z',
       '2099-09-01T10:00:00.000Z', '2099-09-01T12:00:00.000Z',
       $3, $4, '2099-09-01T09:00:00.000Z',
       '2099-09-01T10:00:00.000Z', '2099-09-01T11:00:00.000Z',
       3, 6, 24, 2, $5, $5
     )`,
    [
      input.workspaceId,
      input.eventId,
      input.profileEditDeadlineAt,
      input.registrationCutoffAt,
      updatedAt,
    ],
  );
  await input.pool.query(
    `insert into event_ops_configuration_heads (
       workspace_id, event_id, configuration_version, revision, updated_at
     ) values ($1, $2, 1, 1, $3)`,
    [input.workspaceId, input.eventId, updatedAt],
  );
}

function signedResponses(input: {
  actorId: string;
  eventId: string;
}): readonly EventInterviewResponseSubmission[] {
  const fields: readonly EventParticipantProfileField[] = [
    "positioning",
    "targetAttendees",
    "valueOffered",
    "desiredOutcome",
    "energyStyle",
  ];
  return fields.map((field, index) => {
    const answer = `${field} answer ${index + 1} grounded in this event`;
    return {
      answer,
      questionToken: signAdaptiveInterviewQuestion({
        actorId: input.actorId,
        eventId: input.eventId,
        language: "zh",
        question: {
          acknowledgment: index === 0 ? "" : "That adds useful context.",
          field,
          options: [answer, `Alternative ${field} response`],
          prompt: `What concrete ${field} context matters for this event?`,
          provenance: {
            fallbackReason: null,
            generationMethod: "orbit-agent-model-adaptive",
            model: "gemini-2.5-pro",
            provider: "google",
          },
        },
        questionId: `question:${input.actorId}:${field}`,
        secret: signingSecret,
      }),
    };
  });
}

test(
  "real PostgreSQL journey applies, reviews, waitlists, withdraws, and projects canonical membership",
  {
    skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured",
    timeout: 90_000,
  },
  async () => {
    assert.ok(databaseUrl);
    const suffix = randomUUID().replaceAll("-", "");
    const schema = `event_admission_journey_${suffix}`;
    const workspaceId = `workspace:admission-journey:${suffix}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const operationPool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      max: 4,
      pool: operationPool,
    });
    const instantEventId = "event:journey:instant";
    const reviewEventId = "event:journey:review";
    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(operationPool);
      await insertPublishedCanonicalEvent({
        eventId: instantEventId,
        pool: operationPool,
        publicCode: "JOURNEY-INSTANT",
        workspaceId,
      });
      await insertPublishedCanonicalEvent({
        eventId: reviewEventId,
        pool: operationPool,
        publicCode: "JOURNEY-REVIEW",
        workspaceId,
      });
      const admissionService = createEventAdmissionService({
        async requireCapability(actorId) {
          if (actorId !== "account:journey-organizer") {
            throw new Error("Only the organizer configures or reviews policy.");
          }
        },
        repository: createPostgresEventAdmissionRepository({ client, workspaceId }),
      });
      const openWindow = {
        profileEditDeadlineAt: "2099-08-31T00:00:00.000Z",
        registrationClosesAt: "2099-08-31T00:00:00.000Z",
        registrationOpensAt: "2000-01-01T00:00:00.000Z",
      };
      for (const eventId of [instantEventId, reviewEventId]) {
        await insertOperationsConfiguration({
          eventId,
          pool: operationPool,
          profileEditDeadlineAt: openWindow.profileEditDeadlineAt,
          registrationCutoffAt: openWindow.registrationClosesAt,
          workspaceId,
        });
      }
      await admissionService.configurePolicy("account:journey-organizer", {
        ...openWindow,
        admissionMode: "instant",
        capacity: 1,
        eventId: instantEventId,
        waitlistEnabled: true,
      });
      await admissionService.configurePolicy("account:journey-organizer", {
        ...openWindow,
        admissionMode: "approval_required",
        capacity: 10,
        eventId: reviewEventId,
        waitlistEnabled: true,
      });
      const journey = createEventAdmissionJourneyService({
        admissionService,
        eventCoreService: createEventCoreService(
          createPostgresEventCoreRepository({ client, workspaceId }),
        ),
        verifyResponses(input) {
          return verifyInterviewResponseSubmissions({
            ...input,
            secret: signingSecret,
          });
        },
      });
      const admittedActor = "account:journey-admitted";
      const waitingActor = "account:journey-waiting";
      const reviewActor = "account:journey-review";

      const admitted = await journey.apply({
        actorId: admittedActor,
        displayName: "Aiko Mori",
        eventReference: "JOURNEY-INSTANT",
        responses: signedResponses({ actorId: admittedActor, eventId: instantEventId }),
      });
      const waitlisted = await journey.apply({
        actorId: waitingActor,
        displayName: "Ken Ito",
        eventReference: "JOURNEY-INSTANT",
        responses: signedResponses({ actorId: waitingActor, eventId: instantEventId }),
      });
      const pending = await journey.apply({
        actorId: reviewActor,
        displayName: "Lin Chen",
        eventReference: "JOURNEY-REVIEW",
        responses: signedResponses({ actorId: reviewActor, eventId: reviewEventId }),
      });

      assert.equal(admitted.status, "admitted");
      assert.equal(waitlisted.status, "waitlisted");
      assert.equal(pending.status, "pending_review");
      assert.equal(pending.profilePayload.interviewResponses?.length, 5);
      assert.equal(
        (await journey.getState({
          actorId: reviewActor,
          eventReference: "JOURNEY-REVIEW",
        })).application?.status,
        "pending_review",
      );

      const withdrawn = await journey.withdraw({
        actorId: admittedActor,
        eventReference: "JOURNEY-INSTANT",
        expectedApplicationVersion: admitted.applicationVersion,
      });
      assert.equal(withdrawn.status, "withdrawn");
      const retriedWithdrawal = await journey.withdraw({
        actorId: admittedActor,
        eventReference: "JOURNEY-INSTANT",
        expectedApplicationVersion: admitted.applicationVersion,
      });
      assert.deepEqual(retriedWithdrawal, withdrawn);
      await assert.rejects(
        journey.withdraw({
          actorId: admittedActor,
          eventReference: "JOURNEY-INSTANT",
          expectedApplicationVersion: withdrawn.applicationVersion,
        }),
        (error: unknown) =>
          error instanceof EventAdmissionError && error.code === "INVALID_TRANSITION",
      );
      assert.equal(
        (await journey.getState({
          actorId: waitingActor,
          eventReference: "JOURNEY-INSTANT",
        })).application?.status,
        "admitted",
      );

      const withdrawalAudits = await operationPool.query<{ total: number }>(
        `select count(*)::int as total
         from event_ops_audit_log
         where workspace_id = $1
           and event_id = $2
           and action = 'admission.application.withdrawn'
           and actor_id = $3`,
        [workspaceId, instantEventId, admittedActor],
      );
      assert.equal(withdrawalAudits.rows[0]?.total, 1);

      const memberships = await operationPool.query<{
        actor_id: string;
        origin: string;
        status: string;
      }>(
        `select head.actor_id, head.status, version.origin
         from event_ops_membership_heads head
         join event_ops_membership_versions version
           on version.workspace_id = head.workspace_id
          and version.event_id = head.event_id
          and version.actor_id = head.actor_id
          and version.membership_version = head.membership_version
         where head.workspace_id = $1 and head.event_id = $2
         order by head.actor_id`,
        [workspaceId, instantEventId],
      );
      assert.deepEqual(memberships.rows, [
        { actor_id: admittedActor, origin: "admission_application", status: "cancelled" },
        { actor_id: waitingActor, origin: "admission_application", status: "rsvped" },
      ]);
      const responseCount = await operationPool.query<{ count: number }>(
        `select count(*)::int count from event_ops_profile_response_versions
         where workspace_id = $1 and event_id = $2`,
        [workspaceId, instantEventId],
      );
      assert.equal(responseCount.rows[0]?.count, 10);
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
