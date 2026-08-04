import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { EventRegistrationWindowError } from "../../features/events/registration/deadline-gated-service";
import { createDeadlineGatedEventRegistrationService } from "../../features/events/registration/deadline-gated-service";
import {
  createEventRegistrationService,
  createMemoryEventRegistrationProvider,
} from "../../features/events/registration/service";
import { createEventOperationsRegistrationWindowProvider } from "../../features/events/registration/storage/event-operations-window-provider";
import { legacyResponsesFromAnswers } from "../../features/events/registration/interview-response-contract";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

test(
  "canonical registration commits version heads, audit, and outbox atomically under database-clock gates",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_registration_${randomUUID().replaceAll("-", "")}`;
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool: scopedPool,
    });
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId: "workspace-registration-test",
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      const dbClock = await scopedPool.query<{ now: Date }>(
        "select statement_timestamp() as now",
      );
      const base = dbClock.rows[0]!.now.getTime();
      const canonicalConfiguration = {
        checkInOpensAt: at(base, -5),
        eventEndsAt: at(base, 180),
        eventId: "event-canonical-registration",
        eventStartsAt: at(base, 30),
        maxAttemptsPerTask: 3,
        organizerActorId: "organizer-1",
        profileEditDeadlineAt: at(base, 10),
        recommendationCount: 4,
        registrationCutoffAt: at(base, 20),
        resultsAvailableAt: at(base, 25),
        roundOneStartsAt: at(base, 45),
        roundTwoStartsAt: at(base, 90),
        shardSize: 6,
        tableSize: 6,
        updatedAt: at(base, 0),
      };
      await repository.saveConfiguration(canonicalConfiguration);
      const migrationBaseline = await repository.activateCanonicalRegistrations(
        "event-canonical-registration",
        [],
      );

      const firstAnswers = { industry: "Climate", valueOffered: "Grid operations" };
      const first = await repository.registerCanonicalParticipant({
        answers: firstAnswers,
        displayName: "Ari",
        eventId: "event-canonical-registration",
        interviewResponses: legacyResponsesFromAnswers(firstAnswers, at(base, -1)),
        userId: "actor-ari",
      });
      const duplicate = await repository.registerCanonicalParticipant({
        answers: firstAnswers,
        displayName: "Ari",
        eventId: "event-canonical-registration",
        interviewResponses: legacyResponsesFromAnswers(firstAnswers, at(base, -1)),
        userId: "actor-ari",
      });
      assert.deepEqual(duplicate, first);

      const editedAnswers = { industry: "Climate", valueOffered: "Market design" };
      const edited = await repository.registerCanonicalParticipant({
        answers: editedAnswers,
        displayName: "Ari",
        eventId: "event-canonical-registration",
        interviewResponses: legacyResponsesFromAnswers(editedAnswers, at(base, 1)),
        userId: "actor-ari",
      });
      assert.equal(edited.participantProfile.answers.valueOffered, "Market design");
      const cancelled = await repository.cancelCanonicalRegistration({
        eventId: "event-canonical-registration",
        userId: "actor-ari",
      });
      assert.equal(cancelled?.status, "cancelled");
      assert.deepEqual(
        await repository.listCatalogueSummaries([
          "event-canonical-registration",
        ]),
        [
          {
            activeRegistrationCount: 0,
            attendeeResultsAvailable: false,
            eventId: "event-canonical-registration",
            hasPublishedResults: false,
          },
        ],
      );

      const counts = await scopedPool.query<{
        audit_count: string;
        membership_count: string;
        outbox_count: string;
        profile_count: string;
        response_count: string;
      }>(`
        select
          (select count(*) from event_ops_profile_versions)::text as profile_count,
          (select count(*) from event_ops_profile_response_versions)::text as response_count,
          (select count(*) from event_ops_membership_versions)::text as membership_count,
          (select count(*) from event_ops_outbox)::text as outbox_count,
          (select count(*) from event_ops_audit_log)::text as audit_count
      `);
      assert.deepEqual(counts.rows[0], {
        audit_count: "4",
        membership_count: "3",
        outbox_count: "3",
        profile_count: "2",
        response_count: "4",
      });
      assert.deepEqual(
        await repository.activateCanonicalRegistrations(
          "event-canonical-registration",
          [first],
        ),
        migrationBaseline,
        "normal canonical writes must not change the immutable migration baseline",
      );
      await repository.saveConfiguration({
        ...canonicalConfiguration,
        updatedAt: at(base, 2),
      });
      assert.deepEqual(
        await repository.activateCanonicalRegistrations(
          "event-canonical-registration",
          [],
        ),
        migrationBaseline,
        "configuration changes must not require a new migration baseline",
      );
      const replayCounts = await scopedPool.query<{
        activation_audit_count: string;
        audit_count: string;
        head_count: string;
        membership_count: string;
        outbox_count: string;
        profile_count: string;
      }>(`
        select
          (select count(*) from event_ops_profile_versions)::text as profile_count,
          (select count(*) from event_ops_membership_heads)::text as head_count,
          (select count(*) from event_ops_membership_versions)::text as membership_count,
          (select count(*) from event_ops_outbox)::text as outbox_count,
          (select count(*) from event_ops_audit_log)::text as audit_count,
          (select count(*) from event_ops_audit_log
            where action = 'registration_migration_activated')::text
            as activation_audit_count
      `);
      assert.deepEqual(replayCounts.rows[0], {
        activation_audit_count: "1",
        audit_count: "4",
        head_count: "1",
        membership_count: "3",
        outbox_count: "3",
        profile_count: "2",
      });

      await scopedPool.query(`
        create function reject_registration_outbox() returns trigger
        language plpgsql as $$
        begin
          if new.aggregate_id like '%actor-rollback%' then
            raise exception 'deliberate outbox failure';
          end if;
          return new;
        end
        $$;
        create trigger reject_registration_outbox_trigger
          before insert on event_ops_outbox
          for each row execute function reject_registration_outbox();
      `);
      await assert.rejects(
        repository.registerCanonicalParticipant({
          eventId: "event-canonical-registration",
          userId: "actor-rollback",
        }),
        /deliberate outbox failure/i,
      );
      const rolledBack = await scopedPool.query<{ count: string }>(`
        select count(*)::text as count
        from event_ops_membership_heads
        where actor_id = 'actor-rollback'
      `);
      assert.equal(rolledBack.rows[0]?.count, "0");

      await repository.saveConfiguration({
        checkInOpensAt: at(base, -60),
        eventEndsAt: at(base, 180),
        eventId: "event-closed-registration",
        eventStartsAt: at(base, 30),
        maxAttemptsPerTask: 3,
        organizerActorId: "organizer-1",
        profileEditDeadlineAt: at(base, -20),
        recommendationCount: 4,
        registrationCutoffAt: at(base, -10),
        resultsAvailableAt: at(base, 0),
        roundOneStartsAt: at(base, 45),
        roundTwoStartsAt: at(base, 90),
        shardSize: 6,
        tableSize: 6,
        updatedAt: at(base, 0),
      });
      await repository.activateCanonicalRegistrations(
        "event-closed-registration",
        [],
      );
      await assert.rejects(
        repository.registerCanonicalParticipant({
          eventId: "event-closed-registration",
          userId: "actor-late",
        }),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_CUTOFF_PASSED",
      );

      const legacyProvider = createMemoryEventRegistrationProvider();
      const legacyService = createEventRegistrationService({
        now: () => at(base, -120),
        provider: legacyProvider,
      });
      const legacyRegistration = await legacyService.register({
        answers: { industry: "Robotics" },
        displayName: "Legacy Mina",
        eventId: "event-shadow-import",
        userId: "actor-legacy-mina",
      });
      await repository.saveConfiguration({
        checkInOpensAt: at(base, -5),
        eventEndsAt: at(base, 180),
        eventId: "event-shadow-import",
        eventStartsAt: at(base, 30),
        maxAttemptsPerTask: 3,
        organizerActorId: "organizer-1",
        profileEditDeadlineAt: at(base, 10),
        recommendationCount: 4,
        registrationCutoffAt: at(base, 20),
        resultsAvailableAt: at(base, 25),
        roundOneStartsAt: at(base, 45),
        roundTwoStartsAt: at(base, 90),
        shardSize: 6,
        tableSize: 6,
        updatedAt: at(base, 0),
      });
      const canonicalService = {
        cancel: repository.cancelCanonicalRegistration.bind(repository),
        get: ({ eventId, userId }: { eventId: string; userId: string }) =>
          repository.getCanonicalRegistration(eventId, userId),
        list: ({ eventId }: { eventId: string }) =>
          repository.listCanonicalRegistrations(eventId),
        register: repository.registerCanonicalParticipant.bind(repository),
      };
      const switchingService = createDeadlineGatedEventRegistrationService({
        baseService: legacyService,
        canonicalService,
        projectionProvider: legacyProvider,
        windowProvider: createEventOperationsRegistrationWindowProvider({
          client,
          workspaceId: "workspace-registration-test",
        }),
      });
      assert.deepEqual(
        await switchingService.list({ eventId: "event-shadow-import" }),
        [legacyRegistration],
        "the importing state must keep the legacy read model visible",
      );
      await assert.rejects(
        switchingService.register({
          eventId: "event-shadow-import",
          userId: "actor-during-import",
        }),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
      );
      const activation = await repository.activateCanonicalRegistrations(
        "event-shadow-import",
        [legacyRegistration],
      );
      const activationReplay = await repository.activateCanonicalRegistrations(
        "event-shadow-import",
        [legacyRegistration],
      );
      assert.deepEqual(activationReplay, activation);
      const canonicalRows = await switchingService.list({
        eventId: "event-shadow-import",
      });
      assert.deepEqual(canonicalRows, [legacyRegistration]);
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);

test(
  "canonical membership activation requires audited deadline evidence without AI configuration",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_membership_migration_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = "workspace-membership-migration-test";
    const adminPool = new Pool({ connectionString: databaseUrl, max: 1 });
    const scopedPool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool: scopedPool,
    });
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId,
    });

    try {
      await adminPool.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      const dbClock = await scopedPool.query<{ now: Date }>(
        "select statement_timestamp() as now",
      );
      const base = dbClock.rows[0]!.now.getTime();
      const startsAt = at(base, 30);
      const endsAt = at(base, 180);
      const manifestDeadline = at(base, 10);

      for (const eventId of [
        "event-core-operator-manifest",
        "event-core-zero-registration",
        "event-core-missing-manifest",
      ]) {
        await scopedPool.query(
          `
            insert into event_ops_events (
              workspace_id, event_id, organizer_actor_id, lifecycle_state,
              revision, created_at, updated_at, public_code, title, description,
              venue, timezone, starts_at, ends_at, lifecycle_state_v2,
              source_payload
            ) values (
              $1, $2, 'organizer-core', 'active', 1, $3, $3,
              $2, $2, 'Canonical event without operations configuration',
              'Tokyo', 'Asia/Tokyo', $4, $5, 'published', '{}'::jsonb
            )
          `,
          [workspaceId, eventId, at(base, -180), startsAt, endsAt],
        );
      }
      for (const [eventId, lifecycleState] of [
        ["event-core-draft", "draft"],
        ["event-core-cancelled", "cancelled"],
      ] as const) {
        await scopedPool.query(
          `insert into event_ops_events (
             workspace_id, event_id, organizer_actor_id, lifecycle_state,
             revision, created_at, updated_at, public_code, title, description,
             venue, timezone, starts_at, ends_at, lifecycle_state_v2,
             source_payload
           ) values (
             $1, $2, 'organizer-core', 'active', 1, $3, $3,
             $2, $2, 'Non-public canonical lifecycle fixture',
             'Tokyo', 'Asia/Tokyo', $4, $5, $6, '{}'::jsonb
           )`,
          [
            workspaceId,
            eventId,
            at(base, -180),
            startsAt,
            endsAt,
            lifecycleState,
          ],
        );
      }
      const legacyService = createEventRegistrationService({
        now: () => at(base, -120),
        provider: createMemoryEventRegistrationProvider(),
      });
      const legacyRegistration = await legacyService.register({
        answers: {
          desiredOutcome: "Find a manufacturing partner for a pilot in Kansai",
          energyStyle: "Thoughtful one-to-one conversations",
          experienceHighlight: "Scaled climate hardware across three markets",
          industry: "Industrial climate technology",
          positioning: "Founder building grid-aware thermal storage",
          targetAttendees: "Factory operators and strategic investors",
          valueOffered: "Pilot design, energy modelling, and APAC market context",
        },
        displayName: "Mina Takahashi",
        eventId: "event-core-operator-manifest",
        userId: "actor-mina-core",
      });
      for (const invalidOptions of [
        {
          evidenceId: "",
          profileEditDeadlineAt: manifestDeadline,
          source: "operator_manifest" as const,
        },
        {
          evidenceId: "operator-manifest:invalid-time",
          profileEditDeadlineAt: "2026-08-04 10:00:00",
          source: "operator_manifest" as const,
        },
        {
          evidenceId: "operator-manifest:invalid-source",
          profileEditDeadlineAt: manifestDeadline,
          source: "unsupported_source" as never,
        },
      ]) {
        await assert.rejects(
          repository.activateCanonicalRegistrations(
            "event-core-operator-manifest",
            [legacyRegistration],
            invalidOptions,
          ),
          (error: unknown) =>
            error instanceof EventRegistrationWindowError &&
            error.code === "EVENT_REGISTRATION_WINDOW_INVALID",
        );
      }
      const activation = await repository.activateCanonicalRegistrations(
        "event-core-operator-manifest",
        [legacyRegistration],
        {
          evidenceId: "operator-manifest:membership-migration-2026-08-04",
          profileEditDeadlineAt: manifestDeadline,
          source: "operator_manifest",
        },
      );
      const projectionDrift = {
        ...legacyRegistration,
        participantProfile: {
          ...legacyRegistration.participantProfile,
          answers: {
            ...legacyRegistration.participantProfile.answers,
            desiredOutcome: "A stale legacy projection must not overwrite canonical data",
          },
        },
      };
      assert.deepEqual(
        await repository.activateCanonicalRegistrations(
          "event-core-operator-manifest",
          [projectionDrift],
        ),
        activation,
        "canonical replay verifies canonical heads and ignores legacy projection drift",
      );
      await repository.activateCanonicalRegistrations(
        "event-core-zero-registration",
        [],
        {
          evidenceId: "operator-manifest:membership-migration-2026-08-04",
          profileEditDeadlineAt: manifestDeadline,
          source: "operator_manifest",
        },
      );
      for (const eventId of ["event-core-draft", "event-core-cancelled"]) {
        await repository.activateCanonicalRegistrations(eventId, [], {
          evidenceId: "operator-manifest:lifecycle-visibility-test",
          profileEditDeadlineAt: manifestDeadline,
          source: "operator_manifest",
        });
      }
      await repository.saveConfiguration({
        checkInOpensAt: at(base, -5),
        eventEndsAt: endsAt,
        eventId: "event-core-legacy-active",
        eventStartsAt: startsAt,
        maxAttemptsPerTask: 3,
        organizerActorId: "organizer-core",
        profileEditDeadlineAt: manifestDeadline,
        recommendationCount: 4,
        registrationCutoffAt: at(base, 20),
        resultsAvailableAt: at(base, 25),
        roundOneStartsAt: at(base, 45),
        roundTwoStartsAt: at(base, 90),
        shardSize: 6,
        tableSize: 6,
        updatedAt: at(base, 0),
      });
      await repository.activateCanonicalRegistrations(
        "event-core-legacy-active",
        [],
      );

      assert.deepEqual(
        await repository.listCatalogueSummaries([
          "event-core-zero-registration",
          "event-core-operator-manifest",
          "event-core-missing-manifest",
          "event-core-draft",
          "event-core-cancelled",
          "event-core-legacy-active",
        ]),
        [
          {
            activeRegistrationCount: 0,
            attendeeResultsAvailable: false,
            eventId: "event-core-legacy-active",
            hasPublishedResults: false,
          },
          {
            activeRegistrationCount: 1,
            attendeeResultsAvailable: false,
            eventId: "event-core-operator-manifest",
            hasPublishedResults: false,
          },
          {
            activeRegistrationCount: 0,
            attendeeResultsAvailable: false,
            eventId: "event-core-zero-registration",
            hasPublishedResults: false,
          },
        ],
      );

      const audit = await scopedPool.query<{
        after_payload: {
          profileDeadlineAt: string;
          profileDeadlineEvidenceId: string;
          profileDeadlineReason: string;
          profileDeadlineSource: string;
        };
        evidence_ids: string[];
      }>(
        `select after_payload, evidence_ids
         from event_ops_audit_log
         where workspace_id = $1
           and event_id = 'event-core-operator-manifest'
           and action = 'registration_migration_activated'`,
        [workspaceId],
      );
      assert.equal(
        new Date(audit.rows[0]!.after_payload.profileDeadlineAt).toISOString(),
        manifestDeadline,
      );
      assert.equal(
        audit.rows[0]!.after_payload.profileDeadlineSource,
        "operator_manifest",
      );
      assert.equal(
        audit.rows[0]!.after_payload.profileDeadlineEvidenceId,
        "operator-manifest:membership-migration-2026-08-04",
      );
      assert.equal(
        audit.rows[0]!.after_payload.profileDeadlineReason,
        "OPERATOR_MANIFEST_PROFILE_DEADLINE",
      );
      assert.deepEqual(audit.rows[0]!.evidence_ids, [
        "operator-manifest:membership-migration-2026-08-04",
      ]);

      await assert.rejects(
        repository.activateCanonicalRegistrations(
          "event-core-missing-manifest",
          [],
        ),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
      );
      const missingManifestState = await scopedPool.query<{
        audit_count: string;
        head_count: string;
        registration_migration_state: string;
      }>(
        `select
           event_row.registration_migration_state,
           (select count(*)::text from event_ops_membership_heads membership_head
             where membership_head.workspace_id = event_row.workspace_id
               and membership_head.event_id = event_row.event_id) as head_count,
           (select count(*)::text from event_ops_audit_log audit
             where audit.workspace_id = event_row.workspace_id
               and audit.event_id = event_row.event_id) as audit_count
         from event_ops_events event_row
         where event_row.workspace_id = $1
           and event_row.event_id = 'event-core-missing-manifest'`,
        [workspaceId],
      );
      assert.deepEqual(missingManifestState.rows[0], {
        audit_count: "0",
        head_count: "0",
        registration_migration_state: "legacy",
      });

      await scopedPool.query(
        `update event_ops_events
         set registration_migration_count = registration_migration_count + 1
         where workspace_id = $1 and event_id = 'event-core-operator-manifest'`,
        [workspaceId],
      );
      await assert.rejects(
        repository.activateCanonicalRegistrations(
          "event-core-operator-manifest",
          [legacyRegistration],
        ),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_WINDOW_INVALID" &&
          /audit does not match the immutable migration baseline/i.test(
            error.message,
          ),
      );
      await scopedPool.query(
        `update event_ops_events
         set registration_migration_count = registration_migration_count - 1
         where workspace_id = $1 and event_id = 'event-core-operator-manifest'`,
        [workspaceId],
      );

      await scopedPool.query(
        `insert into event_ops_audit_log (
           workspace_id, audit_id, event_id, actor_id, action,
           aggregate_type, aggregate_id, after_payload, evidence_ids, occurred_at
         ) values (
           $1, 'audit:duplicate-registration-migration',
           'event-core-operator-manifest', null,
           'registration_migration_activated', 'event',
           'event-core-operator-manifest', $2::jsonb, '{}', statement_timestamp()
         )`,
        [workspaceId, JSON.stringify({ count: 1, hash: activation.hash })],
      );
      await assert.rejects(
        repository.activateCanonicalRegistrations(
          "event-core-operator-manifest",
          [],
        ),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_WINDOW_INVALID" &&
          /audit identity is missing or ambiguous/i.test(error.message),
      );
      await scopedPool.query(
        `delete from event_ops_audit_log
         where workspace_id = $1
           and audit_id = 'audit:duplicate-registration-migration'`,
        [workspaceId],
      );

      await scopedPool.query(
        `update event_ops_audit_log
         set after_payload = jsonb_set(after_payload, '{count}', '"1"'::jsonb)
         where workspace_id = $1
           and event_id = 'event-core-operator-manifest'
           and action = 'registration_migration_activated'`,
        [workspaceId],
      );
      await assert.rejects(
        repository.activateCanonicalRegistrations(
          "event-core-operator-manifest",
          [],
        ),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_WINDOW_INVALID" &&
          /audit does not match the immutable migration baseline/i.test(
            error.message,
          ),
      );
      await scopedPool.query(
        `delete from event_ops_audit_log
         where workspace_id = $1
           and event_id = 'event-core-operator-manifest'
           and action = 'registration_migration_activated'`,
        [workspaceId],
      );
      await assert.rejects(
        repository.activateCanonicalRegistrations(
          "event-core-operator-manifest",
          [],
        ),
        (error: unknown) =>
          error instanceof EventRegistrationWindowError &&
          error.code === "EVENT_REGISTRATION_WINDOW_INVALID" &&
          /audit identity is missing or ambiguous/i.test(error.message),
      );
    } finally {
      await client.close();
      await adminPool.query(`drop schema if exists ${schema} cascade`);
      await adminPool.end();
    }
  },
);
