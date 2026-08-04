import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import type { EventRegistration } from "../../features/events/registration/contract";
import { legacyResponsesFromAnswers } from "../../features/events/registration/interview-response-contract";
import { parseCanonicalMembershipOperatorManifest } from "../../features/events/registration/canonical-migration/operator-manifest";
import { buildCanonicalMembershipMigrationPlan } from "../../features/events/registration/canonical-migration/planner";
import {
  readCanonicalMembershipMigrationSource,
  validateCanonicalMigrationRegistration,
} from "../../features/events/registration/canonical-migration/source-reader";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import {
  isCanonicalMembershipMigrationSnapshot,
  withCanonicalMembershipMigrationSnapshot,
  type CanonicalMembershipMigrationSnapshot,
} from "../../features/events/registration/canonical-migration/snapshot-runner";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const canonicalEventIds = [
  "event_signup_01",
  "event:e2e:orbit-connection-night",
] as const;
const legacyEventIds = [
  "demo-event-1",
  "demo-event-2",
  "event_01",
  "event_02",
  "event_03",
  "event_04",
  "event_05",
  "event_06",
  "event_07",
  "event_08",
  "event_09",
  "event_10",
  "event_signup_02",
  "event_signup_03",
  "event:live-record:20260729",
  "event:live-record:runtime-evidence-forum",
  "event:manual:founder-investor-salon",
] as const;
const allEventIds = [...canonicalEventIds, ...legacyEventIds];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function connectionStringForSchema(connectionString: string, schema: string): string {
  const value = new URL(connectionString);
  value.searchParams.set("options", `-c search_path=${schema}`);
  return value.toString();
}

function readSource(connectionString: string, workspaceId: string) {
  return withCanonicalMembershipMigrationSnapshot({
    connectionString,
    operation: (snapshot) =>
      readCanonicalMembershipMigrationSource({ snapshot, workspaceId }),
  });
}

function registration(input: {
  adaptive?: boolean;
  eventId: string;
  index: number;
  partial?: boolean;
  status: "cancelled" | "rsvped";
  userId?: string;
}): EventRegistration {
  const userId = input.userId ?? `actor:${input.eventId}:${input.index}`;
  const participantProfileId = `event-participant-profile:${encodeURIComponent(input.eventId)}:${encodeURIComponent(userId)}`;
  const registeredAt = "2026-08-01T10:00:00.000Z";
  const answer = `Outcome ${input.index} for ${input.eventId}`;
  const answers = input.partial
    ? { desiredOutcome: answer }
    : {
        desiredOutcome: answer,
        energyStyle: "Focused small-group discussion",
        experienceHighlight: `Led launch ${input.index} in APAC`,
        industry: input.index % 2 === 0 ? "Climate hardware" : "Industrial AI",
        positioning: `Founder ${input.index} building operational technology`,
        targetAttendees: "Operators and strategic investors",
        valueOffered: `Pilot evidence and market access ${input.index}`,
      };
  return {
    cancelledAt: input.status === "cancelled" ? "2026-08-02T10:00:00.000Z" : null,
    eventId: input.eventId,
    id: `event-registration:${encodeURIComponent(input.eventId)}:${encodeURIComponent(userId)}`,
    participantProfile: {
      answers,
      createdAt: registeredAt,
      displayName: `Diverse Participant ${input.index}`,
      eventId: input.eventId,
      id: participantProfileId,
      ...(input.adaptive
        ? {
            interviewResponses: [
            {
              answer: {
                customText: answer,
                displayText: answer,
                selectedOptionIds: [],
              },
              answerSource: "participant",
              answeredAt: registeredAt,
              field: "desiredOutcome",
              generation: {
                method: "orbit-agent-model-adaptive",
                model: "gpt-5.6",
                promptVersion: 4,
                provider: "openai",
              },
              question: {
                fieldLabel: { en: "Desired outcome", zh: "期待结果" },
                inputKind: "single_choice_with_custom",
                language: "en",
                options: [
                  { id: "pilot", label: "Find a pilot partner" },
                  { id: "capital", label: "Meet investors" },
                ],
                prompt: "What concrete outcome would make this event valuable?",
              },
              questionId: `question:${input.index}`,
              questionSource: "ai_adaptive",
              responseId: `response:question:${input.index}`,
              visibility: "matching_only",
            },
          ],
          }
        : {}),
      updatedAt: registeredAt,
      userId,
    },
    participantProfileId,
    reactivatedAt: null,
    registeredAt,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status: input.status,
    updatedAt:
      input.status === "cancelled" ? "2026-08-02T10:00:00.000Z" : registeredAt,
    userId,
  };
}

test("strict registration validator accepts partial/adaptive contracts and rejects all source drift", () => {
  const partial = registration({
    eventId: "event-partial",
    index: 1,
    partial: true,
    status: "rsvped",
  });
  const adaptive = registration({
    adaptive: true,
    eventId: "event-adaptive",
    index: 2,
    partial: true,
    status: "rsvped",
  });
  assert.ok(
    validateCanonicalMigrationRegistration({
      eventId: partial.eventId,
      recordId: partial.id,
      value: partial,
    }).registration,
  );
  const selectedOption = structuredClone(adaptive);
  selectedOption.participantProfile.answers.desiredOutcome = "Find a pilot partner";
  selectedOption.participantProfile.interviewResponses![0]!.answer = {
    customText: null,
    displayText: "Find a pilot partner",
    selectedOptionIds: ["pilot"],
  };
  assert.ok(
    validateCanonicalMigrationRegistration({
      eventId: selectedOption.eventId,
      recordId: selectedOption.id,
      value: selectedOption,
    }).registration,
  );
  const legacySnapshot = structuredClone(partial);
  legacySnapshot.participantProfile.interviewResponses = legacyResponsesFromAnswers(
    legacySnapshot.participantProfile.answers,
    legacySnapshot.registeredAt,
  );
  assert.ok(
    validateCanonicalMigrationRegistration({
      eventId: legacySnapshot.eventId,
      recordId: legacySnapshot.id,
      value: legacySnapshot,
    }).registration,
  );
  const emptyAnswers = registration({
    eventId: "event-empty-answers",
    index: 3,
    status: "rsvped",
  });
  emptyAnswers.participantProfile.answers = {};
  assert.ok(
    validateCanonicalMigrationRegistration({
      eventId: emptyAnswers.eventId,
      recordId: emptyAnswers.id,
      value: emptyAnswers,
    }).registration,
    "registration service permits a genuinely empty Partial answers object",
  );
  assert.ok(
    validateCanonicalMigrationRegistration({
      eventId: adaptive.eventId,
      recordId: adaptive.id,
      value: adaptive,
    }).registration,
  );
  const malformed = {
    ...adaptive,
    participantProfile: {
      ...adaptive.participantProfile,
      answers: { ...adaptive.participantProfile.answers, unknownAnswer: "no" },
    },
  };
  assert.equal(
    validateCanonicalMigrationRegistration({
      eventId: adaptive.eventId,
      recordId: "malformed",
      value: malformed,
    }).registration,
    null,
  );

  const invalidIdentity = structuredClone(partial);
  invalidIdentity.id = "event-registration:wrong";
  const invalidLifecycle = structuredClone(partial);
  invalidLifecycle.reactivatedAt = "2026-08-02T10:00:00.000Z";
  const nonCanonicalTimestamp = structuredClone(partial);
  nonCanonicalTimestamp.registeredAt = "2026-08-01T10:00:00Z";
  const duplicateResponseField = structuredClone(adaptive);
  duplicateResponseField.participantProfile.interviewResponses = [
    ...duplicateResponseField.participantProfile.interviewResponses!,
    {
      ...duplicateResponseField.participantProfile.interviewResponses![0]!,
      responseId: "response:second",
    },
  ];
  const legacyUnknownWithQuestion = structuredClone(adaptive);
  legacyUnknownWithQuestion.participantProfile.interviewResponses = [
    {
      ...legacyUnknownWithQuestion.participantProfile.interviewResponses![0]!,
      questionSource: "legacy_unknown",
    },
  ];
  const unknownSelectedOption = structuredClone(adaptive);
  unknownSelectedOption.participantProfile.interviewResponses![0]!.answer.selectedOptionIds = [
    "not-a-question-option",
  ];
  const privateVisibility = structuredClone(adaptive);
  privateVisibility.participantProfile.interviewResponses![0]!.visibility = "private";
  const selectedWithCustom = structuredClone(selectedOption);
  selectedWithCustom.participantProfile.interviewResponses![0]!.answer.customText =
    "conflicting custom answer";
  const selectedDisplayMismatch = structuredClone(selectedOption);
  selectedDisplayMismatch.participantProfile.interviewResponses![0]!.answer.displayText =
    "Meet investors";
  const customMismatch = structuredClone(adaptive);
  customMismatch.participantProfile.interviewResponses![0]!.answer.customText =
    "different custom answer";
  const responseIdentityMismatch = structuredClone(adaptive);
  responseIdentityMismatch.participantProfile.interviewResponses![0]!.responseId =
    "response:unrelated-question";
  const responseAfterProfileUpdate = structuredClone(adaptive);
  responseAfterProfileUpdate.participantProfile.interviewResponses![0]!.answeredAt =
    "2026-08-01T10:00:00.001Z";
  const rsvpedHistory = structuredClone(partial);
  rsvpedHistory.cancelledAt = "2026-08-01T11:00:00.000Z";
  rsvpedHistory.reactivatedAt = "2026-08-01T12:00:00.000Z";
  rsvpedHistory.updatedAt = "2026-08-01T13:00:00.000Z";
  assert.ok(
    validateCanonicalMigrationRegistration({
      eventId: rsvpedHistory.eventId,
      recordId: rsvpedHistory.id,
      value: rsvpedHistory,
    }).registration,
  );
  const cancelledAfterReactivation = structuredClone(partial);
  cancelledAfterReactivation.status = "cancelled";
  cancelledAfterReactivation.reactivatedAt = "2026-08-01T11:00:00.000Z";
  cancelledAfterReactivation.cancelledAt = "2026-08-01T12:00:00.000Z";
  cancelledAfterReactivation.updatedAt = "2026-08-01T12:00:00.000Z";
  assert.ok(
    validateCanonicalMigrationRegistration({
      eventId: cancelledAfterReactivation.eventId,
      recordId: cancelledAfterReactivation.id,
      value: cancelledAfterReactivation,
    }).registration,
  );
  const cancelledEqualRegistrationReactivation = structuredClone(
    cancelledAfterReactivation,
  );
  cancelledEqualRegistrationReactivation.reactivatedAt =
    cancelledEqualRegistrationReactivation.registeredAt;
  assert.ok(
    validateCanonicalMigrationRegistration({
      eventId: cancelledEqualRegistrationReactivation.eventId,
      recordId: cancelledEqualRegistrationReactivation.id,
      value: cancelledEqualRegistrationReactivation,
    }).registration,
    "the frozen contract permits registeredAt === reactivatedAt",
  );
  const preRegistrationReactivation = structuredClone(cancelledAfterReactivation);
  preRegistrationReactivation.reactivatedAt = "2026-08-01T09:59:59.999Z";
  for (const [name, value] of [
    ["identity", invalidIdentity],
    ["lifecycle", invalidLifecycle],
    ["canonical timestamp", nonCanonicalTimestamp],
    ["duplicate response field", duplicateResponseField],
    ["legacy_unknown null contract", legacyUnknownWithQuestion],
    ["selected option provenance", unknownSelectedOption],
    ["private response visibility", privateVisibility],
    ["selected option custom collision", selectedWithCustom],
    ["selected option display mismatch", selectedDisplayMismatch],
    ["custom display mismatch", customMismatch],
    ["response/question identity mismatch", responseIdentityMismatch],
    ["response after profile update", responseAfterProfileUpdate],
    ["pre-registration reactivation", preRegistrationReactivation],
  ] as const) {
    assert.equal(
      validateCanonicalMigrationRegistration({
        eventId: value.eventId,
        recordId: name,
        value,
      }).registration,
      null,
      name,
    );
  }
  assert.equal(
    validateCanonicalMigrationRegistration({
      eventId: partial.eventId,
      legacyRecordIdentity: {
        providerRecordId: partial.id,
        sourceId: `source:${partial.id}`,
        targetType: "event",
        userId: "actor:metadata-drift",
      },
      recordId: partial.id,
      value: partial,
    }).registration,
    null,
    "legacy record identity must match the registration identity chain",
  );
  const validRecordIdentity = {
    providerRecordId: partial.id,
    sourceId: `source:${partial.id}`,
    targetType: "event",
    userId: partial.userId,
  };
  for (const [name, eventId, recordId, wrapperRegistrationId, identity] of [
    ["record", partial.eventId, "record:drift", partial.id, validRecordIdentity],
    [
      "provider",
      partial.eventId,
      partial.id,
      partial.id,
      { ...validRecordIdentity, providerRecordId: "provider:drift" },
    ],
    [
      "source",
      partial.eventId,
      partial.id,
      partial.id,
      { ...validRecordIdentity, sourceId: "source:drift" },
    ],
    [
      "user",
      partial.eventId,
      partial.id,
      partial.id,
      { ...validRecordIdentity, userId: "actor:drift" },
    ],
    [
      "targetType",
      partial.eventId,
      partial.id,
      partial.id,
      { ...validRecordIdentity, targetType: "contact" },
    ],
    ["targetId", "event-target-drift", partial.id, partial.id, validRecordIdentity],
    ["wrapper", partial.eventId, partial.id, "wrapper:drift", validRecordIdentity],
  ] as const) {
    assert.equal(
      validateCanonicalMigrationRegistration({
        eventId,
        legacyRecordIdentity: identity,
        recordId,
        value: partial,
        wrapperRegistrationId,
      }).registration,
      null,
      `${name} identity drift`,
    );
  }
});

test("legacy client input and fake snapshots are rejected before transaction or query", async () => {
  let transactionCount = 0;
  let queryCount = 0;
  const fakeClient = {
    async close() {},
    async query() {
      queryCount += 1;
      throw new Error("fake query must never execute");
    },
    async transaction() {
      transactionCount += 1;
      throw new Error("fake transaction must never execute");
    },
  };
  if (false) {
    await withCanonicalMembershipMigrationSnapshot({
      // @ts-expect-error The public runner no longer accepts structural clients.
      client: fakeClient,
      operation: async () => null,
    });
  }
  const legacyInput = {
    client: fakeClient,
    operation: async () => null,
  } as unknown as Parameters<typeof withCanonicalMembershipMigrationSnapshot>[0];
  await assert.rejects(
    () => withCanonicalMembershipMigrationSnapshot(legacyInput),
    /snapshot runner input is invalid/u,
  );
  await assert.rejects(
    () =>
      withCanonicalMembershipMigrationSnapshot({
        connectionString: "postgresql://unused.invalid/orbit",
        extra: true,
        operation: async () => null,
      } as unknown as Parameters<typeof withCanonicalMembershipMigrationSnapshot>[0]),
    /snapshot runner input is invalid/u,
  );
  await assert.rejects(
    () =>
      withCanonicalMembershipMigrationSnapshot({
        connectionString: " ",
        operation: async () => null,
      }),
    /snapshot runner input is invalid/u,
  );
  const fakeSnapshot = Object.freeze({
    executor: fakeClient,
  }) as unknown as CanonicalMembershipMigrationSnapshot;
  assert.equal(isCanonicalMembershipMigrationSnapshot(fakeSnapshot), false);
  await assert.rejects(
    () =>
      readCanonicalMembershipMigrationSource({
        snapshot: fakeSnapshot,
        workspaceId: "workspace:fake",
      }),
    /active runtime-attested database snapshot/u,
  );
  assert.equal(transactionCount, 0);
  assert.equal(queryCount, 0);
});

test(
  "snapshot attestation is active only inside the transaction and internal clients close on success or throw",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const applicationName = `canonical_snapshot_${randomUUID().replaceAll("-", "")}`;
    const connection = new URL(databaseUrl);
    connection.searchParams.set("application_name", applicationName);
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    let completedSnapshot: CanonicalMembershipMigrationSnapshot | null = null;
    const completed = await withCanonicalMembershipMigrationSnapshot({
      connectionString: connection.toString(),
      operation: async (snapshot) => {
        completedSnapshot = snapshot;
        assert.equal(isCanonicalMembershipMigrationSnapshot(snapshot), true);
        return "completed" as const;
      },
    });
    assert.equal(completed, "completed");
    assert.equal(isCanonicalMembershipMigrationSnapshot(completedSnapshot), false);

    let thrownSnapshot: CanonicalMembershipMigrationSnapshot | null = null;
    await assert.rejects(
      () =>
        withCanonicalMembershipMigrationSnapshot({
          connectionString: connection.toString(),
          operation: async (snapshot) => {
            thrownSnapshot = snapshot;
            assert.equal(isCanonicalMembershipMigrationSnapshot(snapshot), true);
            throw new Error("operation failed after snapshot creation");
          },
        }),
      /operation failed after snapshot creation/u,
    );
    assert.equal(isCanonicalMembershipMigrationSnapshot(thrownSnapshot), false);
    const activity = await adminPool.query<{ count: string }>(
      `select count(*)::text as count
         from pg_stat_activity
        where datname = current_database()
          and application_name = $1`,
      [applicationName],
    );
    assert.equal(activity.rows[0]?.count, "0");
    await adminPool.end();
  },
);

test(
  "Postgres snapshot reader preserves concurrent consistency, inventories all events, and aggregates blockers",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 30_000 },
  async () => {
    assert.ok(databaseUrl);
    const schema = `canonical_membership_reader_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${schema}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 6,
      options: `-c search_path=${schema}`,
    });
    const scopedDatabaseUrl = connectionStringForSchema(databaseUrl, schema);
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool: scopedPool,
    });
    const repository = createPostgresEventOperationsRepository({ client, workspaceId });

    const insertRecord = async (
      _diagnosticLabel: string,
      targetId: string,
      value: EventRegistration,
      payload: unknown = { registration: value, registrationId: value.id },
    ) => {
      const recordId = value.id;
      await scopedPool.query(
        `insert into orbit_records (
           workspace_id, collection_name, record_id, user_id, source_type,
           source_id, evidence_ids, provider_record_id, target_type, target_id, lifecycle_state,
           search_text, payload, created_at, updated_at
         ) values (
           $1, 'event_registrations', $2, $3, 'manual', $4, '{}', $2,
           'event', $5, 'active', '', $6::jsonb, now(), now()
         )`,
        [
          workspaceId,
          recordId,
          value.userId,
          `source:${recordId}`,
          targetId,
          JSON.stringify(payload),
        ],
      );
    };

    try {
      await adminPool.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(scopedPool);
      await runEventOperationsMigrations(client);
      let leakedSnapshot: CanonicalMembershipMigrationSnapshot | null = null;
      let pendingRead:
        | ReturnType<typeof readCanonicalMembershipMigrationSource>
        | undefined;
      await withCanonicalMembershipMigrationSnapshot({
        connectionString: scopedDatabaseUrl,
        operation: async (snapshot) => {
          leakedSnapshot = snapshot;
          pendingRead = readCanonicalMembershipMigrationSource({
            snapshot,
            workspaceId,
          });
          void pendingRead.catch(() => undefined);
        },
      });
      assert.equal(isCanonicalMembershipMigrationSnapshot(leakedSnapshot), false);
      assert.ok(pendingRead);
      await assert.rejects(
        pendingRead,
        /snapshot is no longer active|active runtime-attested database snapshot/u,
      );
      for (const [index, eventId] of allEventIds.entries()) {
        await scopedPool.query(
          `insert into event_ops_events (
             workspace_id, event_id, organizer_actor_id, lifecycle_state,
             revision, created_at, updated_at, public_code, title, timezone,
             starts_at, ends_at, lifecycle_state_v2, source_payload,
             event_version
           ) values (
             $1, $2, 'organizer-source-reader', 'active', 1, now(), now(),
             $2, $2, 'Asia/Tokyo', '2026-09-01T10:00:00.000Z',
             '2026-09-01T14:00:00.000Z', 'published', '{}'::jsonb, 1
           )`,
          [workspaceId, eventId],
        );
        await scopedPool.query(
          `insert into event_event_versions (
             workspace_id, event_id, event_version, public_code, title,
             timezone, starts_at, ends_at, lifecycle_state_v2, source_payload,
             organizer_actor_id, content_hash, created_at
           ) values (
             $1, $2, 1, $2, $2, 'Asia/Tokyo',
             '2026-09-01T10:00:00.000Z', '2026-09-01T14:00:00.000Z',
             'published', '{}'::jsonb, 'organizer-source-reader', $3, now()
           )`,
          [workspaceId, eventId, sha256(`content-hash-${index}`)],
        );
      }
      for (const eventId of canonicalEventIds) {
        await repository.saveConfiguration({
          checkInOpensAt: "2026-09-01T09:00:00.000Z",
          eventEndsAt: "2026-09-01T14:00:00.000Z",
          eventId,
          eventStartsAt: "2026-09-01T10:00:00.000Z",
          maxAttemptsPerTask: 3,
          organizerActorId: "organizer-source-reader",
          profileEditDeadlineAt: "2026-08-20T10:00:00.000Z",
          recommendationCount: 4,
          registrationCutoffAt: "2026-08-25T10:00:00.000Z",
          resultsAvailableAt: "2026-08-26T10:00:00.000Z",
          roundOneStartsAt: "2026-09-01T11:00:00.000Z",
          roundTwoStartsAt: "2026-09-01T12:00:00.000Z",
          shardSize: 8,
          tableSize: 6,
          updatedAt: "2026-08-04T10:00:00.000Z",
        });
        const values = [
          ...Array.from({ length: 63 }, (_, index) =>
            registration({ eventId, index, status: "rsvped" }),
          ),
          ...Array.from({ length: 6 }, (_, offset) =>
            registration({ eventId, index: 63 + offset, status: "cancelled" }),
          ),
        ];
        await repository.activateCanonicalRegistrations(eventId, values);
        const postActivationAnswers = {
          desiredOutcome: `Post-activation outcome for ${eventId}`,
          energyStyle: "Focused one-to-one exchange",
          experienceHighlight: "Scaled a multilingual enterprise launch",
          industry: "Cross-border infrastructure",
          positioning: "Operator building regional partnerships",
          targetAttendees: "Technical partners and strategic operators",
          valueOffered: "Market-entry evidence and partner access",
        };
        await repository.registerCanonicalParticipant({
          answers: postActivationAnswers,
          displayName: `Post Activation ${eventId}`,
          eventId,
          interviewResponses: [
            ...legacyResponsesFromAnswers(
              postActivationAnswers,
              "2026-08-04T10:00:00.000Z",
            ),
          ],
          userId: `actor:${eventId}:post-activation`,
        });
      }
      await scopedPool.query(
        `update event_ops_audit_log
         set after_payload = jsonb_build_object(
               'count', after_payload->'count',
               'hash', after_payload->'hash'
             ),
             evidence_ids = '{}'
         where workspace_id = $1
           and event_id = $2
           and action = 'registration_migration_activated'`,
        [workspaceId, canonicalEventIds[0]],
      );
      await repository.activateCanonicalRegistrations(canonicalEventIds[0], []);
      const cleanPostActivation = await readSource(scopedDatabaseUrl, workspaceId);
      assert.deepEqual(cleanPostActivation.blockers, []);
      assert.ok(
        cleanPostActivation.facts
          .filter((fact) => fact.authority === "canonical_membership")
          .every(
            (fact) =>
              fact.rawRegistrationCount === 70 &&
              fact.validRegistrationCount === 70 &&
              fact.invalidRegistrationCount === 0 &&
              fact.activationBaselineValid,
          ),
        "post-activation writes change current inventory without changing immutable activation baselines",
      );
      for (const eventId of canonicalEventIds) {
        await scopedPool.query(
          `update event_ops_profile_versions profile_version
           set profile_payload = jsonb_set(
             profile_payload,
             '{registrationProfile,answers,desiredOutcome}',
             '""'::jsonb
           )
           where (profile_version.workspace_id, profile_version.event_id,
                  profile_version.participant_id, profile_version.profile_version) in (
             select profile_head.workspace_id, profile_head.event_id,
                    profile_head.participant_id, profile_head.profile_version
             from event_ops_profile_heads profile_head
             where profile_head.workspace_id = $1 and profile_head.event_id = $2
             order by profile_head.participant_id
             limit 12
           )`,
          [workspaceId, eventId],
        );
      }

      await insertRecord(
        "legacy:event_signup_02",
        "event_signup_02",
        registration({ eventId: "event_signup_02", index: 1, partial: true, status: "rsvped" }),
      );
      const filteredDeleted = registration({
        eventId: "event_02",
        index: 999,
        status: "rsvped",
      });
      await insertRecord(
        "filtered:lifecycle-deleted",
        "event_02",
        filteredDeleted,
        { unexpected: "must be ignored by lifecycle_state" },
      );
      await scopedPool.query(
        `update orbit_records
         set lifecycle_state = 'deleted'
         where workspace_id = $1 and record_id = $2`,
        [workspaceId, filteredDeleted.id],
      );
      await insertRecord(
        "legacy:event_signup_03",
        "event_signup_03",
        registration({ adaptive: true, eventId: "event_signup_03", index: 1, partial: true, status: "rsvped" }),
      );
      await insertRecord(
        "legacy:event_01",
        "event_01",
        registration({ eventId: "event_01", index: 1, status: "cancelled" }),
      );
      await insertRecord(
        "legacy:event-live-record",
        "event:live-record:20260729",
        registration({ eventId: "event:live-record:20260729", index: 1, status: "cancelled" }),
      );
      for (let index = 0; index < 70; index += 1) {
        const drift = registration({
          eventId: "event_signup_01",
          index: 1_000 + index,
          status: index < 65 ? "rsvped" : "cancelled",
        });
        const payload =
          index === 0
            ? { malicious: true, registrationId: drift.id }
            : { registration: drift, registrationId: drift.id };
        await scopedPool.query(
          `insert into orbit_records (
             workspace_id, collection_name, record_id, user_id, source_type,
             source_id, evidence_ids, target_type, target_id, lifecycle_state,
             search_text, payload, created_at, updated_at
           ) values ($1, 'event_registrations', $2, $3, 'manual', $2, '{}',
                     'event', 'event_signup_01', 'active', '', $4::jsonb, now(), now())`,
          [workspaceId, `canonical-drift:${index}`, drift.userId, JSON.stringify(payload)],
        );
      }

      const source = await readSource(scopedDatabaseUrl, workspaceId);
      assert.equal(
        source.blockers.filter(
          (value) => value.code === "REGISTRATION_SOURCE_INVALID",
        ).length,
        24,
      );
      assert.equal(
        source.blockers.filter(
          (value) => value.code === "CANONICAL_ACTIVATION_BASELINE_INVALID",
        ).length,
        0,
        "exact historical v1 and newly written v2 audits are both valid baselines",
      );
      assert.ok(
        source.blockers
          .filter((value) => value.recordId !== null)
          .every((value) => /^record-sha256:[a-f0-9]{64}$/u.test(value.recordId!)),
      );
      const blockerJson = JSON.stringify(source.blockers);
      for (const forbidden of [
        "actor:event_signup_01:0",
        "event-registration:event_signup_01",
        "Outcome 0 for event_signup_01",
      ]) {
        assert.equal(blockerJson.includes(forbidden), false);
      }
      const emptyManifest = parseCanonicalMembershipOperatorManifest({
        events: {},
        schemaVersion: 1,
      });
      const plan = buildCanonicalMembershipMigrationPlan({
        facts: source.facts,
        parsedManifest: emptyManifest,
        sourceBlockers: source.blockers,
      });
      assert.equal(plan.eventCount, 19);
      assert.equal(plan.events.filter((event) => event.action === "verify_canonical").length, 0);
      assert.equal(plan.events.filter((event) => event.action === "blocked").length, 19);
      assert.equal(
        plan.blockers.filter((value) => value.code === "MISSING_PROFILE_EDIT_DEADLINE").length,
        17,
      );
      assert.equal(plan.total.registrations, 144);
      assert.equal(plan.total.validRegistrations, 120);
      assert.equal(plan.total.invalidRegistrations, 24);
      assert.equal(plan.total.rsvped, 106);
      assert.equal(plan.total.cancelled, 14);
      assert.equal(plan.total.rsvped + plan.total.cancelled, plan.total.validRegistrations);
      assert.equal(plan.applyPlanHash, null);
      assert.deepEqual(
        source.facts
          .filter((fact) => fact.authority === "canonical_membership")
          .map((fact) => [
            fact.eventId,
            fact.rawRegistrationCount,
            fact.validRegistrationCount,
            fact.invalidRegistrationCount,
            fact.activationBaselineValid,
          ]),
        [
          ["event_signup_01", 70, 58, 12, false],
          ["event:e2e:orbit-connection-night", 70, 58, 12, false],
        ],
      );
      const canonicalHashes = Object.fromEntries(
        plan.events
          .filter((event) => event.authority === "canonical_membership")
          .map((event) => [event.eventId, event.source.hash]),
      );
      await scopedPool.query(
        `delete from event_ops_configuration_heads
         where workspace_id = $1 and event_id = any($2::text[])`,
        [workspaceId, canonicalEventIds],
      );
      const configurationDriftRead = await readSource(scopedDatabaseUrl, workspaceId);
      const configurationDriftPlan = buildCanonicalMembershipMigrationPlan({
        facts: configurationDriftRead.facts,
        parsedManifest: emptyManifest,
        sourceBlockers: configurationDriftRead.blockers,
      });
      assert.deepEqual(
        Object.fromEntries(
          configurationDriftPlan.events
            .filter((event) => event.authority === "canonical_membership")
            .map((event) => [event.eventId, event.source.hash]),
        ),
        canonicalHashes,
      );
      assert.deepEqual(configurationDriftRead.blockers, source.blockers);
      assert.ok(
        configurationDriftRead.facts
          .filter((fact) => fact.authority === "canonical_membership")
          .every((fact) => fact.configurationDeadline === null),
      );
      await scopedPool.query(
        `update orbit_records
         set payload = '{"changed":"still ignored"}'::jsonb
         where workspace_id = $1 and target_id = 'event_signup_01'`,
        [workspaceId],
      );
      const reread = await readSource(scopedDatabaseUrl, workspaceId);
      const replay = buildCanonicalMembershipMigrationPlan({
        facts: reread.facts,
        parsedManifest: emptyManifest,
        sourceBlockers: reread.blockers,
      });
      assert.deepEqual(
        Object.fromEntries(
          replay.events
            .filter((event) => event.authority === "canonical_membership")
            .map((event) => [event.eventId, event.source.hash]),
        ),
        canonicalHashes,
      );

      const concurrentRegistration = registration({
        eventId: "event_06",
        index: 600,
        status: "rsvped",
      });
      const withinSnapshot = await withCanonicalMembershipMigrationSnapshot({
        connectionString: scopedDatabaseUrl,
        operation: async (snapshot) => {
          const before = await readCanonicalMembershipMigrationSource({
            snapshot,
            workspaceId,
          });
          await insertRecord(
            "concurrent:new-registration",
            "event_06",
            concurrentRegistration,
          );
          const writer = await scopedPool.connect();
          try {
            await writer.query("begin");
            await writer.query(
              `insert into event_event_versions (
                 workspace_id, event_id, event_version, public_code, title,
                 timezone, starts_at, ends_at, lifecycle_state_v2,
                 source_payload, organizer_actor_id, content_hash, created_at
               )
               select workspace_id, event_id, 2, public_code, title,
                      timezone, starts_at, ends_at, lifecycle_state_v2,
                      source_payload, organizer_actor_id, $3, now()
               from event_event_versions
               where workspace_id = $1 and event_id = $2 and event_version = 1`,
              [workspaceId, "event_06", sha256("event-06-concurrent-head-v2")],
            );
            await writer.query(
              `update event_ops_events
               set event_version = 2
               where workspace_id = $1 and event_id = $2`,
              [workspaceId, "event_06"],
            );
            await writer.query("commit");
          } catch (error) {
            await writer.query("rollback");
            throw error;
          } finally {
            writer.release();
          }
          const same = await readCanonicalMembershipMigrationSource({
            snapshot,
            workspaceId,
          });
          return { before, same };
        },
      });
      const beforeConcurrent = withinSnapshot.before.facts.find(
        (fact) => fact.eventId === "event_06",
      )!;
      const sameConcurrent = withinSnapshot.same.facts.find(
        (fact) => fact.eventId === "event_06",
      )!;
      assert.deepEqual(sameConcurrent, beforeConcurrent);
      const nextSnapshot = await readSource(scopedDatabaseUrl, workspaceId);
      const nextConcurrent = nextSnapshot.facts.find(
        (fact) => fact.eventId === "event_06",
      )!;
      assert.equal(nextConcurrent.rawRegistrationCount, 1);
      assert.equal(nextConcurrent.validRegistrationCount, 1);
      assert.equal(nextConcurrent.eventVersion, 2);
      assert.notEqual(nextConcurrent.contentHash, beforeConcurrent.contentHash);

      const duplicate = registration({
        eventId: "event_signup_02",
        index: 2,
        partial: true,
        status: "rsvped",
        userId: "actor:event_signup_02:1",
      });
      await scopedPool.query(
        `alter table orbit_records drop constraint orbit_records_pkey`,
      );
      await insertRecord("invalid:duplicate", "event_signup_02", duplicate);
      await insertRecord(
        "invalid:unknown-event",
        "event:unknown",
        registration({ eventId: "event:unknown", index: 1, status: "rsvped" }),
      );
      const unknownAnswer = registration({ eventId: "event_02", index: 1, status: "rsvped" });
      (unknownAnswer.participantProfile.answers as Record<string, string>).unknown = "invalid";
      await insertRecord("invalid:answer", "event_02", unknownAnswer);
      const sideEffect = registration({ eventId: "event_03", index: 1, status: "rsvped" });
      (sideEffect.sideEffects as unknown as Record<string, boolean>).emailSent = true;
      await insertRecord("invalid:side-effect", "event_03", sideEffect);
      const nested = registration({ adaptive: true, eventId: "event_04", index: 1, partial: true, status: "rsvped" });
      const nestedResponse = nested.participantProfile.interviewResponses![0]!;
      (nestedResponse.question as unknown as Record<string, unknown>).extra = true;
      await insertRecord("invalid:nested", "event_04", nested);
      const invalidWrapper = registration({ eventId: "event_05", index: 1, status: "rsvped" });
      await insertRecord(
        "invalid:wrapper-extra-key",
        "event_05",
        invalidWrapper,
        { extra: true, registration: invalidWrapper, registrationId: invalidWrapper.id },
      );
      await scopedPool.query(
        `update event_ops_events
         set registration_migration_count = registration_migration_count + 1
         where workspace_id = $1 and event_id = 'event_signup_01'`,
        [workspaceId],
      );
      await scopedPool.query(
        `update event_ops_audit_log
         set after_payload = after_payload - 'profileDeadlineReason'
         where workspace_id = $1 and event_id = $2
           and action = 'registration_migration_activated'`,
        [workspaceId, canonicalEventIds[1]],
      );
      await scopedPool.query(
        `update event_event_versions
         set content_hash = 'not-a-sha256'
         where workspace_id = $1 and event_id = 'event_05' and event_version = 1`,
        [workspaceId],
      );
      const corrupted = await readSource(scopedDatabaseUrl, workspaceId);
      const corruptedBlockerJson = JSON.stringify(corrupted.blockers);
      for (const forbidden of [
        "actor:event_signup_02:1",
        "event-registration:event_signup_02",
        "Outcome 1 for event_02",
      ]) {
        assert.equal(corruptedBlockerJson.includes(forbidden), false);
      }
      assert.ok(
        corrupted.blockers.some(
          (value) => value.code === "EVENT_CORE_CURRENT_VERSION_INVALID",
        ),
      );
      assert.ok(
        corrupted.blockers.some(
          (value) => value.code === "CANONICAL_ACTIVATION_BASELINE_INVALID",
        ),
      );
      assert.ok(
        corrupted.blockers.some(
          (value) => value.code === "REGISTRATION_SOURCE_DUPLICATE_IDENTITY",
        ),
      );
      assert.ok(
        corrupted.blockers.some(
          (value) => value.code === "LEGACY_REGISTRATION_EVENT_UNKNOWN",
        ),
      );
      const invalidRegistrationBlockers = corrupted.blockers.filter(
        (value) => value.code === "REGISTRATION_SOURCE_INVALID",
      );
      assert.equal(invalidRegistrationBlockers.length, 28);
      assert.equal(
        invalidRegistrationBlockers.filter((value) =>
          canonicalEventIds.includes(value.eventId as (typeof canonicalEventIds)[number]),
        ).length,
        24,
      );
      assert.equal(
        invalidRegistrationBlockers.filter(
          (value) =>
            !canonicalEventIds.includes(
              value.eventId as (typeof canonicalEventIds)[number],
            ),
        ).length,
        4,
      );
      const duplicateFact = corrupted.facts.find(
        (fact) => fact.eventId === "event_signup_02",
      )!;
      assert.deepEqual(
        {
          invalid: duplicateFact.invalidRegistrationCount,
          raw: duplicateFact.rawRegistrationCount,
          valid: duplicateFact.validRegistrationCount,
        },
        { invalid: 2, raw: 2, valid: 0 },
      );
      assert.equal(
        buildCanonicalMembershipMigrationPlan({
          facts: corrupted.facts,
          parsedManifest: emptyManifest,
          sourceBlockers: corrupted.blockers,
        }).applyPlanHash,
        null,
      );
      const invalidLegacyPlan = buildCanonicalMembershipMigrationPlan({
        facts: corrupted.facts,
        parsedManifest: emptyManifest,
        sourceBlockers: corrupted.blockers,
      }).events.find((event) => event.eventId === "event_02");
      assert.equal(invalidLegacyPlan?.action, "blocked");
      assert.ok(
        invalidLegacyPlan?.blockers.some(
          (value) => value.code === "REGISTRATION_SOURCE_INVALID",
        ),
      );
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
