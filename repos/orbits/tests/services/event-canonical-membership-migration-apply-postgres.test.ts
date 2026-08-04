import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import {
  applyCanonicalMembershipMigration,
  CanonicalMembershipMigrationApplyError,
  canonicalMembershipMigrationLedgerResultHash,
} from "../../features/events/registration/canonical-migration/apply-repository";
import { parseCanonicalMembershipOperatorManifest } from "../../features/events/registration/canonical-migration/operator-manifest";
import { buildCanonicalMembershipMigrationPlan } from "../../features/events/registration/canonical-migration/planner";
import { readCanonicalMembershipMigrationSource } from "../../features/events/registration/canonical-migration/source-reader";
import { withCanonicalMembershipMigrationSnapshot } from "../../features/events/registration/canonical-migration/snapshot-runner";
import type { EventRegistration } from "../../features/events/registration/contract";
import {
  legacyResponsesFromAnswers,
  type EventProfileResponseSnapshot,
} from "../../features/events/registration/interview-response-contract";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function scopedUrl(value: string, schema: string): string {
  const url = new URL(value);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function registration(input: {
  adaptive?: boolean;
  eventId: string;
  index: number;
  lifecycle?: "cancelled" | "reactivated" | "rsvped";
}): EventRegistration {
  const lifecycle = input.lifecycle ?? "rsvped";
  const userId = `actor:${input.eventId}:${input.index}`;
  const participantProfileId = `event-participant-profile:${encodeURIComponent(input.eventId)}:${encodeURIComponent(userId)}`;
  const registeredAt = "2026-08-01T10:00:00.000Z";
  const answer = `Build a concrete cross-border pilot ${input.index}`;
  const cancelledAt =
    lifecycle === "rsvped" ? null : "2026-08-02T10:00:00.000Z";
  const reactivatedAt =
    lifecycle === "reactivated" ? "2026-08-03T10:00:00.000Z" : null;
  const status = lifecycle === "cancelled" ? "cancelled" : "rsvped";
  const updatedAt = reactivatedAt ?? cancelledAt ?? registeredAt;
  const answers = {
    desiredOutcome: answer,
    energyStyle:
      input.index % 2 === 0
        ? "Focused one-to-one exchange"
        : "Structured small-group discussion",
    experienceHighlight: `Scaled a multilingual product launch ${input.index}`,
    industry: input.index % 2 === 0 ? "Climate hardware" : "Industrial AI",
    positioning: `Operator ${input.index} building regional infrastructure`,
    targetAttendees: "Strategic operators, investors, and technical partners",
    valueOffered: `Pilot evidence and market access ${input.index}`,
  };
  const interviewResponses: readonly EventProfileResponseSnapshot[] | undefined = input.adaptive
    ? legacyResponsesFromAnswers(answers, registeredAt).map((response) =>
        response.field === "desiredOutcome"
          ? {
              answer: {
                customText: answer,
                displayText: answer,
                selectedOptionIds: [],
              },
              answerSource: "participant" as const,
              answeredAt: registeredAt,
              field: "desiredOutcome" as const,
              generation: {
                method: "orbit-agent-model-adaptive",
                model: "gpt-5.6",
                promptVersion: 4,
                provider: "openai",
              },
              question: {
                fieldLabel: { en: "Desired outcome", zh: "期待结果" },
                inputKind: "single_choice_with_custom" as const,
                language: "en" as const,
                options: [
                  { id: "pilot", label: "Find a pilot partner" },
                  { id: "capital", label: "Meet investors" },
                ],
                prompt: "What concrete outcome would make this event valuable?",
              },
              questionId: `question:${input.index}`,
              questionSource: "ai_adaptive" as const,
              responseId: `response:question:${input.index}`,
              visibility: "matching_only" as const,
            }
          : response,
      )
    : undefined;
  return {
    cancelledAt,
    eventId: input.eventId,
    id: `event-registration:${encodeURIComponent(input.eventId)}:${encodeURIComponent(userId)}`,
    participantProfile: {
      answers,
      createdAt: registeredAt,
      displayName: `Diverse Participant ${input.index}`,
      eventId: input.eventId,
      id: participantProfileId,
      ...(interviewResponses ? { interviewResponses } : {}),
      updatedAt: registeredAt,
      userId,
    },
    participantProfileId,
    reactivatedAt,
    registeredAt,
    sideEffects: {
      calendarUpdateExecuted: false,
      emailSent: false,
      globalProfileWriteExecuted: false,
      notificationDelivered: false,
      organizerMessageSent: false,
      refundRequested: false,
    },
    status,
    updatedAt,
    userId,
  };
}

async function insertEvent(input: {
  eventId: string;
  index: number;
  pool: Pool;
  workspaceId: string;
}): Promise<void> {
  await input.pool.query(
    `insert into event_ops_events (
       workspace_id, event_id, organizer_actor_id, lifecycle_state,
       revision, created_at, updated_at, public_code, title, timezone,
       starts_at, ends_at, lifecycle_state_v2, source_payload, event_version
     ) values (
       $1, $2, 'organizer:canonical-apply', 'active', 1, now(), now(),
       $2, $2, 'Asia/Tokyo', '2026-09-01T10:00:00.000Z',
       '2026-09-01T14:00:00.000Z', 'published', '{}'::jsonb, 1
     )`,
    [input.workspaceId, input.eventId],
  );
  await input.pool.query(
    `insert into event_event_versions (
       workspace_id, event_id, event_version, public_code, title, timezone,
       starts_at, ends_at, lifecycle_state_v2, source_payload,
       organizer_actor_id, content_hash, created_at
     ) values (
       $1, $2, 1, $2, $2, 'Asia/Tokyo',
       '2026-09-01T10:00:00.000Z', '2026-09-01T14:00:00.000Z',
       'published', '{}'::jsonb, 'organizer:canonical-apply', $3, now()
     )`,
    [input.workspaceId, input.eventId, sha256(`event-content:${input.index}`)],
  );
}

async function insertLegacyRegistration(input: {
  pool: Pool;
  registration: EventRegistration;
  workspaceId: string;
}): Promise<void> {
  const value = input.registration;
  await input.pool.query(
    `insert into orbit_records (
       workspace_id, collection_name, record_id, user_id, source_type,
       source_id, evidence_ids, provider_record_id, target_type, target_id,
       lifecycle_state, search_text, payload, created_at, updated_at
     ) values (
       $1, 'event_registrations', $2, $3, 'manual', $4, '{}', $2,
       'event', $5, 'active', '', $6::jsonb, now(), now()
     )`,
    [
      input.workspaceId,
      value.id,
      value.userId,
      `source:${value.id}`,
      value.eventId,
      JSON.stringify({ registration: value, registrationId: value.id }),
    ],
  );
}

async function buildPlan(input: {
  connectionString: string;
  rawManifest: string;
  workspaceId: string;
}) {
  const parsedManifest = parseCanonicalMembershipOperatorManifest(
    input.rawManifest,
  );
  assert.deepEqual(parsedManifest.blockers, []);
  const source = await withCanonicalMembershipMigrationSnapshot({
    connectionString: input.connectionString,
    operation: (snapshot) =>
      readCanonicalMembershipMigrationSource({
        snapshot,
        workspaceId: input.workspaceId,
      }),
  });
  const plan = buildCanonicalMembershipMigrationPlan({
    facts: source.facts,
    parsedManifest,
    sourceBlockers: source.blockers,
  });
  assert.equal(plan.applyEligible, true, JSON.stringify(plan.blockers));
  assert.match(plan.applyPlanHash ?? "", /^[a-f0-9]{64}$/u);
  return { plan, source };
}

async function saveConfiguration(
  repository: ReturnType<typeof createPostgresEventOperationsRepository>,
  eventId: string,
): Promise<void> {
  await repository.saveConfiguration({
    checkInOpensAt: "2026-09-01T09:00:00.000Z",
    eventEndsAt: "2026-09-01T14:00:00.000Z",
    eventId,
    eventStartsAt: "2026-09-01T10:00:00.000Z",
    maxAttemptsPerTask: 3,
    organizerActorId: "organizer:canonical-apply",
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
}

async function canonicalDomainSnapshot(
  pool: Pool,
  workspaceId: string,
  eventIds: readonly string[],
) {
  const parameters = [workspaceId, [...eventIds]];
  const queries = [
    `select * from event_ops_membership_heads where workspace_id=$1 and event_id=any($2::text[]) order by event_id,actor_id`,
    `select * from event_ops_profile_heads where workspace_id=$1 and event_id=any($2::text[]) order by event_id,participant_id`,
    `select * from event_ops_membership_versions where workspace_id=$1 and event_id=any($2::text[]) order by event_id,actor_id,membership_version`,
    `select * from event_ops_profile_versions where workspace_id=$1 and event_id=any($2::text[]) order by event_id,participant_id,profile_version`,
    `select * from event_ops_profile_response_versions where workspace_id=$1 and event_id=any($2::text[]) order by event_id,participant_id,profile_version,response_id`,
    `select * from event_ops_audit_log where workspace_id=$1 and event_id=any($2::text[]) order by event_id,audit_id`,
  ];
  return Promise.all(queries.map(async (query) => (await pool.query(query, parameters)).rows));
}

async function withIsolatedEventDatabase(
  label: string,
  operation: (input: {
    connectionString: string;
    pool: Pool;
  }) => Promise<void>,
): Promise<void> {
  assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
  const schema = `${label}_${randomUUID().replaceAll("-", "")}`;
  const connectionString = scopedUrl(databaseUrl, schema);
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 8,
    options: `-c search_path=${schema}`,
  });
  const client = createEventOperationsPostgresClient({
    connectionString,
    pool,
  });
  try {
    await admin.query(`create schema ${schema}`);
    await runOrbitRecordsMigration(pool);
    await runEventOperationsMigrations(client);
    await operation({
      connectionString,
      pool,
    });
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

test(
  "global canonical apply atomically migrates a diverse workspace and replays the immutable ledger",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const schema = `canonical_apply_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${schema}`;
    const connectionString = scopedUrl(databaseUrl, schema);
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString,
      pool,
    });
    const repository = createPostgresEventOperationsRepository({
      client,
      workspaceId,
    });
    const eventIds = {
      canonicalPopulated: "event:canonical:populated",
      canonicalZero: "event:canonical:zero",
      configured: "event:legacy:configured",
      manifest: "event:legacy:manifest",
      zero: "event:legacy:zero",
    } as const;
    const allEventIds = Object.values(eventIds);
    const canonicalEventIds = [
      eventIds.canonicalPopulated,
      eventIds.canonicalZero,
    ] as const;
    try {
      await admin.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(pool);
      await runEventOperationsMigrations(client);
      for (const [index, eventId] of allEventIds.entries()) {
        await insertEvent({ eventId, index, pool, workspaceId });
      }
      for (const eventId of [
        eventIds.configured,
        ...canonicalEventIds,
      ]) {
        await saveConfiguration(repository, eventId);
      }
      await repository.activateCanonicalRegistrations(
        eventIds.canonicalPopulated,
        [
          registration({ eventId: eventIds.canonicalPopulated, index: 1 }),
          registration({
            adaptive: true,
            eventId: eventIds.canonicalPopulated,
            index: 2,
          }),
        ],
      );
      await repository.activateCanonicalRegistrations(eventIds.canonicalZero, []);

      const legacyRegistrations = [
        registration({
          adaptive: true,
          eventId: eventIds.configured,
          index: 11,
        }),
        registration({
          eventId: eventIds.manifest,
          index: 21,
          lifecycle: "reactivated",
        }),
        registration({
          eventId: eventIds.manifest,
          index: 22,
          lifecycle: "cancelled",
        }),
      ];
      for (const value of legacyRegistrations) {
        await insertLegacyRegistration({
          pool,
          registration: value,
          workspaceId,
        });
      }

      const rawManifest = JSON.stringify({
        events: {
          [eventIds.manifest]: {
            evidenceId: "operator-evidence:legacy-manifest",
            profileEditDeadlineAt: "2026-08-21T10:00:00.000Z",
            source: "operator_manifest",
          },
          [eventIds.zero]: {
            evidenceId: "operator-evidence:legacy-zero",
            profileEditDeadlineAt: "2026-08-22T10:00:00.000Z",
            source: "operator_manifest",
          },
        },
        schemaVersion: 1,
      });
      const { plan } = await buildPlan({
        connectionString,
        rawManifest,
        workspaceId,
      });
      assert.equal(plan.eventCount, 5);
      assert.equal(plan.total.validRegistrations, 5);
      const command = {
        connectionString,
        expectedCount: plan.total.validRegistrations,
        expectedPlanHash: plan.applyPlanHash!,
        manifestHash: plan.manifestHash,
        migrationRunId: "canonical-membership-run:mixed-v1",
        workspaceId,
      } as const;

      const legacyProjectionBefore = (
        await pool.query(
          `select record_id, payload, created_at, updated_at
             from orbit_records
            where workspace_id=$1 and collection_name='event_registrations'
            order by record_id`,
          [workspaceId],
        )
      ).rows;
      const canonicalBefore = await canonicalDomainSnapshot(
        pool,
        workspaceId,
        canonicalEventIds,
      );

      for (const [candidate, expectedCode] of [
        [
          { command, manifest: "{}" },
          "CANONICAL_MEMBERSHIP_MIGRATION_MANIFEST_INVALID",
        ],
        [
          {
            command: { ...command, expectedPlanHash: "f".repeat(64) },
            manifest: rawManifest,
          },
          "CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT",
        ],
        [
          {
            command: { ...command, expectedCount: command.expectedCount + 1 },
            manifest: rawManifest,
          },
          "CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT",
        ],
      ] as const) {
        await assert.rejects(
          applyCanonicalMembershipMigration(
            {
              ...candidate.command,
              migrationRunId: `${candidate.command.migrationRunId}:${expectedCode}`,
            },
            candidate.manifest,
          ),
          (error: unknown) =>
            error instanceof CanonicalMembershipMigrationApplyError &&
            error.code === expectedCode,
        );
      }
      assert.equal(
        Number(
          (
            await pool.query(
              `select count(*)::text as count
                 from event_ops_canonical_membership_migration_runs
                where workspace_id=$1`,
              [workspaceId],
            )
          ).rows[0]?.count,
        ),
        0,
      );

      const concurrent = await Promise.all([
        applyCanonicalMembershipMigration(command, rawManifest),
        applyCanonicalMembershipMigration(command, rawManifest),
      ]);
      assert.deepEqual(
        concurrent.map((value) => value.status).sort(),
        ["already_applied", "applied"],
      );
      assert.equal(concurrent[0]!.resultHash, concurrent[1]!.resultHash);

      const states = await pool.query<{
        event_id: string;
        registration_migration_state: string;
      }>(
        `select event_id, registration_migration_state
           from event_ops_events
          where workspace_id=$1
          order by event_id`,
        [workspaceId],
      );
      assert.equal(
        states.rows.every(
          (row) => row.registration_migration_state === "canonical",
        ),
        true,
      );
      assert.deepEqual(
        await canonicalDomainSnapshot(pool, workspaceId, canonicalEventIds),
        canonicalBefore,
      );
      assert.deepEqual(
        (
          await pool.query(
            `select record_id, payload, created_at, updated_at
               from orbit_records
              where workspace_id=$1 and collection_name='event_registrations'
              order by record_id`,
            [workspaceId],
          )
        ).rows,
        legacyProjectionBefore,
      );

      const run = (
        await pool.query<{
          expected_count: number;
          manifest_hash: string;
          migration_id: "canonical-membership-v1";
          plan_hash: string;
          result_hash: string;
          schema_version: 1;
        }>(
          `select migration_id,schema_version,plan_hash,manifest_hash,
                  expected_count,result_hash
             from event_ops_canonical_membership_migration_runs
            where workspace_id=$1 and migration_run_id=$2`,
          [workspaceId, command.migrationRunId],
        )
      ).rows[0]!;
      const ledgerRows = (
        await pool.query<{
          authority: "canonical_membership" | "legacy_registration";
          deadline_evidence_hash: string | null;
          event_aggregate_hash: string;
          event_id: string;
          target_count: number;
        }>(
          `select event_id,authority,event_aggregate_hash,
                  deadline_evidence_hash,target_count
             from event_ops_canonical_membership_migration_events
            where workspace_id=$1 and migration_run_id=$2
            order by event_id collate "C"`,
          [workspaceId, command.migrationRunId],
        )
      ).rows;
      assert.equal(ledgerRows.length, 5);
      assert.equal(
        ledgerRows.reduce((sum, row) => sum + Number(row.target_count), 0),
        command.expectedCount,
      );
      const independentlyComputed = canonicalMembershipMigrationLedgerResultHash({
        events: ledgerRows.map((row) => ({
          action:
            row.authority === "canonical_membership"
              ? ("verify_canonical" as const)
              : ("activate" as const),
          authority: row.authority,
          deadlineEvidenceHash: row.deadline_evidence_hash,
          eventAggregateHash: row.event_aggregate_hash,
          eventId: row.event_id,
          targetCount: Number(row.target_count),
        })),
        run: {
          expectedCount: Number(run.expected_count),
          manifestHash: run.manifest_hash,
          migrationId: run.migration_id,
          planHash: run.plan_hash,
          schemaVersion: Number(run.schema_version) as 1,
        },
      });
      assert.equal(independentlyComputed, run.result_hash);
      assert.doesNotMatch(
        JSON.stringify({ ledgerRows, run }),
        /Diverse Participant|Build a concrete|actor:/u,
      );

      const lifecycle = await pool.query<{
        actor_id: string;
        versions: string;
      }>(
        `select actor_id, count(*)::text as versions
           from event_ops_membership_versions
          where workspace_id=$1 and event_id=$2
          group by actor_id order by actor_id`,
        [workspaceId, eventIds.manifest],
      );
      assert.deepEqual(
        lifecycle.rows.map((row) => Number(row.versions)).sort(),
        [2, 3],
      );
      const responses = await pool.query<{
        adaptive: string;
        total: string;
      }>(
        `select count(*)::text as total,
                count(*) filter (where question_source='ai_adaptive')::text as adaptive
           from event_ops_profile_response_versions
          where workspace_id=$1 and event_id=$2`,
        [workspaceId, eventIds.configured],
      );
      assert.deepEqual(responses.rows[0], { adaptive: "1", total: "7" });
      assert.equal(
        Number(
          (
            await pool.query(
              `select count(*)::text as count
                 from event_ops_audit_log
                where workspace_id=$1
                  and event_id=any($2::text[])
                  and action='registration_migration_activated'`,
              [
                workspaceId,
                [eventIds.configured, eventIds.manifest, eventIds.zero],
              ],
            )
          ).rows[0]?.count,
        ),
        3,
      );

      assert.equal(
        (
          await applyCanonicalMembershipMigration(command, undefined)
        ).status,
        "already_applied",
      );
      await assert.rejects(
        applyCanonicalMembershipMigration(
          { ...command, expectedCount: command.expectedCount + 1 },
          undefined,
        ),
        (error: unknown) =>
          error instanceof CanonicalMembershipMigrationApplyError &&
          error.code === "CANONICAL_MEMBERSHIP_MIGRATION_REPLAY_MISMATCH",
      );
      await assert.rejects(
        applyCanonicalMembershipMigration(
          { ...command, migrationRunId: "canonical-membership-run:duplicate" },
          rawManifest,
        ),
        (error: unknown) =>
          error instanceof CanonicalMembershipMigrationApplyError &&
          error.code ===
            "CANONICAL_MEMBERSHIP_MIGRATION_PLAN_ALREADY_APPLIED",
      );

      const zeroWorkspace = `${workspaceId}:zero`;
      const zeroEventId = "event:all-zero";
      await insertEvent({
        eventId: zeroEventId,
        index: 100,
        pool,
        workspaceId: zeroWorkspace,
      });
      const zeroManifest = JSON.stringify({
        events: {
          [zeroEventId]: {
            evidenceId: "operator-evidence:all-zero",
            profileEditDeadlineAt: "2026-08-23T10:00:00.000Z",
            source: "operator_manifest",
          },
        },
        schemaVersion: 1,
      });
      const zeroPlan = (
        await buildPlan({
          connectionString,
          rawManifest: zeroManifest,
          workspaceId: zeroWorkspace,
        })
      ).plan;
      assert.equal(zeroPlan.total.validRegistrations, 0);
      const zeroCommand = {
        connectionString,
        expectedCount: 0,
        expectedPlanHash: zeroPlan.applyPlanHash!,
        manifestHash: zeroPlan.manifestHash,
        migrationRunId: "canonical-membership-run:all-zero",
        workspaceId: zeroWorkspace,
      } as const;
      const competingZeroCommand = {
        ...zeroCommand,
        migrationRunId: "canonical-membership-run:all-zero:competing",
      } as const;
      const competingPlan = await Promise.allSettled([
        applyCanonicalMembershipMigration(zeroCommand, zeroManifest),
        applyCanonicalMembershipMigration(competingZeroCommand, zeroManifest),
      ]);
      const successfulIndex = competingPlan.findIndex(
        (result) => result.status === "fulfilled",
      );
      assert.notEqual(successfulIndex, -1);
      assert.equal(
        competingPlan.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const failed = competingPlan.find(
        (result) => result.status === "rejected",
      );
      assert.ok(failed && failed.status === "rejected");
      assert.equal(
        failed.reason instanceof CanonicalMembershipMigrationApplyError
          ? failed.reason.code
          : null,
        "CANONICAL_MEMBERSHIP_MIGRATION_PLAN_ALREADY_APPLIED",
      );
      const successfulZeroCommand =
        successfulIndex === 0 ? zeroCommand : competingZeroCommand;
      assert.equal(
        (
          await applyCanonicalMembershipMigration(successfulZeroCommand, undefined)
        ).status,
        "already_applied",
      );
      assert.equal(
        Number(
          (
            await pool.query(
              `select count(*)::text as count
                 from event_ops_membership_heads
                where workspace_id=$1`,
              [zeroWorkspace],
            )
          ).rows[0]?.count,
        ),
        0,
      );
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);

test(
  "global canonical apply rolls back ledger and every event when a later activation fails",
  { timeout: 120_000 },
  async () => {
    await withIsolatedEventDatabase(
      "canonical_apply_rollback",
      async ({ connectionString, pool }) => {
        const workspaceId = "workspace:canonical-rollback";
        const eventIds = ["event:rollback:a", "event:rollback:z"] as const;
        for (const [index, eventId] of eventIds.entries()) {
          await insertEvent({ eventId, index, pool, workspaceId });
          await insertLegacyRegistration({
            pool,
            registration: registration({ eventId, index: 40 + index }),
            workspaceId,
          });
        }
        const rawManifest = JSON.stringify({
          events: Object.fromEntries(
            eventIds.map((eventId, index) => [
              eventId,
              {
                evidenceId: `operator-evidence:rollback:${index}`,
                profileEditDeadlineAt: `2026-08-${24 + index}T10:00:00.000Z`,
                source: "operator_manifest",
              },
            ]),
          ),
          schemaVersion: 1,
        });
        const plan = (
          await buildPlan({ connectionString, rawManifest, workspaceId })
        ).plan;
        const command = {
          connectionString,
          expectedCount: plan.total.validRegistrations,
          expectedPlanHash: plan.applyPlanHash!,
          manifestHash: plan.manifestHash,
          migrationRunId: "canonical-membership-run:rollback",
          workspaceId,
        } as const;
        await pool.query(`
          create function reject_late_canonical_activation()
          returns trigger language plpgsql as $body$
          begin
            if new.workspace_id = 'workspace:canonical-rollback'
               and new.event_id = 'event:rollback:z' then
              raise exception 'forced late activation failure' using errcode='P0001';
            end if;
            return new;
          end
          $body$;
          create trigger reject_late_canonical_activation_trigger
          before insert on event_ops_membership_versions
          for each row execute function reject_late_canonical_activation();
        `);

        await assert.rejects(
          applyCanonicalMembershipMigration(command, rawManifest),
          (error: unknown) =>
            error instanceof CanonicalMembershipMigrationApplyError &&
            error.code === "CANONICAL_MEMBERSHIP_MIGRATION_DATABASE_FAILED",
        );
        const counts = await pool.query<{
          audits: string;
          event_ledger: string;
          heads: string;
          run_ledger: string;
        }>(
          `select
             (select count(*)::text from event_ops_canonical_membership_migration_runs where workspace_id=$1) as run_ledger,
             (select count(*)::text from event_ops_canonical_membership_migration_events where workspace_id=$1) as event_ledger,
             (select count(*)::text from event_ops_membership_heads where workspace_id=$1) as heads,
             (select count(*)::text from event_ops_audit_log where workspace_id=$1 and action='registration_migration_activated') as audits`,
          [workspaceId],
        );
        assert.deepEqual(counts.rows[0], {
          audits: "0",
          event_ledger: "0",
          heads: "0",
          run_ledger: "0",
        });
        const states = await pool.query<{ state: string }>(
          `select registration_migration_state as state
             from event_ops_events where workspace_id=$1 order by event_id`,
          [workspaceId],
        );
        assert.deepEqual(states.rows.map((row) => row.state), ["legacy", "legacy"]);
      },
    );
  },
);

test(
  "activation serialization and deadlock SQLSTATEs rebuild the whole reviewed plan on a fresh transaction",
  { timeout: 120_000 },
  async () => {
    await withIsolatedEventDatabase(
      "canonical_apply_retry",
      async ({ connectionString, pool }) => {
        for (const [index, state] of ["40001", "40P01"].entries()) {
          const workspaceId = `workspace:canonical-retry:${index}`;
          const eventId = `event:retry:${index}`;
          await insertEvent({ eventId, index, pool, workspaceId });
          await insertLegacyRegistration({
            pool,
            registration: registration({ eventId, index: 70 + index }),
            workspaceId,
          });
          const rawManifest = JSON.stringify({
            events: {
              [eventId]: {
                evidenceId: `operator-evidence:retry:${index}`,
                profileEditDeadlineAt: `2026-08-${26 + index}T10:00:00.000Z`,
                source: "operator_manifest",
              },
            },
            schemaVersion: 1,
          });
          const plan = (
            await buildPlan({ connectionString, rawManifest, workspaceId })
          ).plan;
          const functionName = `force_retry_${index}`;
          const sequenceName = `force_retry_sequence_${index}`;
          await pool.query(`
            create sequence ${sequenceName};
            create function ${functionName}()
            returns trigger language plpgsql as $body$
            begin
              if new.workspace_id = '${workspaceId}'
                 and nextval('${sequenceName}') = 1 then
                raise exception 'forced retry' using errcode='${state}';
              end if;
              return new;
            end
            $body$;
            create trigger ${functionName}_trigger
            before insert on event_ops_membership_versions
            for each row execute function ${functionName}();
          `);
          const result = await applyCanonicalMembershipMigration(
            {
              connectionString,
              expectedCount: plan.total.validRegistrations,
              expectedPlanHash: plan.applyPlanHash!,
              manifestHash: plan.manifestHash,
              migrationRunId: `canonical-membership-run:retry:${index}`,
              workspaceId,
            },
            rawManifest,
          );
          assert.equal(result.status, "applied");
          assert.equal(
            Number(
              (
                await pool.query(
                  `select last_value::text as value from ${sequenceName}`,
                )
              ).rows[0]?.value,
            ),
            2,
          );
          assert.equal(
            Number(
              (
                await pool.query(
                  `select count(*)::text as count
                     from event_ops_canonical_membership_migration_runs
                    where workspace_id=$1`,
                  [workspaceId],
                )
              ).rows[0]?.count,
            ),
            1,
          );
        }
      },
    );
  },
);

test(
  "replay rejects an internally inconsistent event ledger before reading manifest or source",
  { timeout: 120_000 },
  async () => {
    await withIsolatedEventDatabase(
      "canonical_apply_corrupt",
      async ({ connectionString, pool }) => {
        const workspaceId = "workspace:canonical-corrupt";
        const planHash = "a".repeat(64);
        const manifestHash = "b".repeat(64);
        await pool.query(
          `insert into event_ops_canonical_membership_migration_runs (
             workspace_id,migration_run_id,migration_id,schema_version,
             plan_hash,manifest_hash,expected_count,result_hash,
             applied_at,created_at
           ) values ($1,$2,'canonical-membership-v1',1,$3,$4,0,$5,now(),now())`,
          [
            workspaceId,
            "canonical-membership-run:corrupt",
            planHash,
            manifestHash,
            "c".repeat(64),
          ],
        );
        await assert.rejects(
          applyCanonicalMembershipMigration(
            {
              connectionString,
              expectedCount: 0,
              expectedPlanHash: planHash,
              manifestHash,
              migrationRunId: "canonical-membership-run:corrupt",
              workspaceId,
            },
            undefined,
          ),
          (error: unknown) =>
            error instanceof CanonicalMembershipMigrationApplyError &&
            error.code === "CANONICAL_MEMBERSHIP_MIGRATION_LEDGER_CORRUPT",
        );
      },
    );
  },
);

test(
  "readiness rejects migration and ledger relations resolved from different schemas",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const suffix = randomUUID().replaceAll("-", "");
    const reviewSchema = `canonical_review_${suffix}`;
    const ledgerSchema = `canonical_ledger_${suffix}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const ledgerPool = new Pool({
      connectionString: databaseUrl,
      max: 1,
      options: `-c search_path=${ledgerSchema}`,
    });
    const ledgerClient = createEventOperationsPostgresClient({
      connectionString: scopedUrl(databaseUrl, ledgerSchema),
      pool: ledgerPool,
    });
    try {
      await admin.query(`create schema ${reviewSchema}`);
      await admin.query(`create schema ${ledgerSchema}`);
      await runEventOperationsMigrations(ledgerClient);
      await admin.query(
        `create table ${reviewSchema}.event_ops_schema_migrations
           (like ${ledgerSchema}.event_ops_schema_migrations including all)`,
      );
      await admin.query(
        `insert into ${reviewSchema}.event_ops_schema_migrations
         select * from ${ledgerSchema}.event_ops_schema_migrations`,
      );
      const mixed = new URL(databaseUrl);
      mixed.searchParams.set(
        "options",
        `-c search_path=${reviewSchema},${ledgerSchema}`,
      );
      await assert.rejects(
        applyCanonicalMembershipMigration(
          {
            connectionString: mixed.toString(),
            expectedCount: 0,
            expectedPlanHash: "a".repeat(64),
            manifestHash: "b".repeat(64),
            migrationRunId: "canonical-membership-run:mixed-schema",
            workspaceId: "workspace:mixed-schema",
          },
          undefined,
        ),
        (error: unknown) =>
          error instanceof CanonicalMembershipMigrationApplyError &&
          error.code === "CANONICAL_MEMBERSHIP_MIGRATION_NOT_READY",
      );
      assert.equal(
        Number(
          (
            await ledgerPool.query(
              `select count(*)::text as count
                 from event_ops_canonical_membership_migration_runs`,
            )
          ).rows[0]?.count,
        ),
        0,
      );
    } finally {
      await ledgerClient.close();
      await admin.query(`drop schema if exists ${reviewSchema} cascade`);
      await admin.query(`drop schema if exists ${ledgerSchema} cascade`);
      await admin.end();
    }
  },
);
