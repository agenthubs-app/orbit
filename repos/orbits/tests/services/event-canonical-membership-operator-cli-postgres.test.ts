import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { parseCanonicalMembershipOperatorManifest } from "../../features/events/registration/canonical-migration/operator-manifest";
import type { EventRegistration } from "../../features/events/registration/contract";
import {
  legacyResponsesFromAnswers,
  type EventProfileResponseSnapshot,
} from "../../features/events/registration/interview-response-contract";
import { loadLocalEnv } from "../../scripts/load-local-env";
import { ORBIT_RECORDS_SCHEMA_SQL, runOrbitRecordsMigration } from "../../shared/storage/migrations";

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

function command(
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): SpawnSyncReturns<string> {
  return spawnSync(
    "npm",
    [
      "--silent",
      "run",
      "events:migrate-canonical-membership",
      "--",
      ...args,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: environment,
      timeout: 60_000,
    },
  ) as SpawnSyncReturns<string>;
}

function output<T>(result: SpawnSyncReturns<string>): T {
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.error, undefined, String(result.error));
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 1, result.stdout);
  return JSON.parse(lines[0]!) as T;
}

function registration(input: {
  adaptive?: boolean;
  eventId: string;
  index: number;
  lifecycle?: "cancelled" | "reactivated" | "rsvped";
}): EventRegistration {
  const lifecycle = input.lifecycle ?? "rsvped";
  const userId = `actor:${input.eventId}:${input.index}`;
  const participantProfileId =
    `event-participant-profile:${encodeURIComponent(input.eventId)}:${encodeURIComponent(userId)}`;
  const registeredAt = "2026-08-01T10:00:00.000Z";
  const answer = `Launch a measurable regional pilot ${input.index}`;
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
  const interviewResponses: readonly EventProfileResponseSnapshot[] | undefined =
    input.adaptive
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
      displayName: `CLI Participant ${input.index}`,
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
       workspace_id,event_id,organizer_actor_id,lifecycle_state,revision,
       created_at,updated_at,public_code,title,timezone,starts_at,ends_at,
       lifecycle_state_v2,source_payload,event_version
     ) values (
       $1,$2,'organizer:canonical-cli','active',1,now(),now(),$2,$2,
       'Asia/Tokyo','2026-09-01T10:00:00.000Z','2026-09-01T14:00:00.000Z',
       'published','{}'::jsonb,1
     )`,
    [input.workspaceId, input.eventId],
  );
  await input.pool.query(
    `insert into event_event_versions (
       workspace_id,event_id,event_version,public_code,title,timezone,
       starts_at,ends_at,lifecycle_state_v2,source_payload,
       organizer_actor_id,content_hash,created_at
     ) values (
       $1,$2,1,$2,$2,'Asia/Tokyo','2026-09-01T10:00:00.000Z',
       '2026-09-01T14:00:00.000Z','published','{}'::jsonb,
       'organizer:canonical-cli',$3,now()
     )`,
    [input.workspaceId, input.eventId, sha256(`cli-event:${input.index}`)],
  );
}

async function insertLegacyRegistration(input: {
  pool: Pool;
  registration: EventRegistration;
  workspaceId: string;
}): Promise<void> {
  await input.pool.query(
    `insert into orbit_records (
       workspace_id,collection_name,record_id,user_id,source_type,source_id,
       evidence_ids,provider_record_id,target_type,target_id,lifecycle_state,
       search_text,payload,created_at,updated_at
     ) values (
       $1,'event_registrations',$2,$3,'manual',$4,'{}',$2,'event',$5,
       'active','',$6::jsonb,now(),now()
     )`,
    [
      input.workspaceId,
      input.registration.id,
      input.registration.userId,
      `source:${input.registration.id}`,
      input.registration.eventId,
      JSON.stringify({
        registration: input.registration,
        registrationId: input.registration.id,
      }),
    ],
  );
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
    organizerActorId: "organizer:canonical-cli",
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

async function stableSnapshot(pool: Pool, workspaceId: string): Promise<string> {
  const tables = [
    "event_ops_events",
    "event_ops_membership_heads",
    "event_ops_membership_versions",
    "event_ops_profile_heads",
    "event_ops_profile_versions",
    "event_ops_profile_response_versions",
    "event_ops_audit_log",
    "event_ops_canonical_membership_migration_runs",
    "event_ops_canonical_membership_migration_events",
    "orbit_records",
  ] as const;
  return JSON.stringify(
    await Promise.all(
      tables.map(async (table) => ({
        table,
        value: (
          await pool.query(
            `select coalesce(jsonb_agg(to_jsonb(item) order by to_jsonb(item)::text),'[]'::jsonb) as value
               from ${table} item where workspace_id=$1`,
            [workspaceId],
          )
        ).rows[0]?.value,
      })),
    ),
  );
}

async function mainSnapshot(pool: Pool, workspaceId: string): Promise<unknown> {
  return (
    await pool.query(
      `select
         (select coalesce(max(version),0)::text from event_ops_schema_migrations) as version,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,'' order by to_jsonb(item)::text),''))
            from event_ops_events item where workspace_id=$1) as events,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,'' order by to_jsonb(item)::text),''))
            from event_ops_membership_heads item where workspace_id=$1) as memberships,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,'' order by to_jsonb(item)::text),''))
            from event_ops_profile_heads item where workspace_id=$1) as profiles,
         (select md5(coalesce(string_agg(to_jsonb(item)::text,'' order by to_jsonb(item)::text),''))
            from orbit_records item where workspace_id=$1) as legacy`,
      [workspaceId],
    )
  ).rows[0];
}

test(
  "real canonical membership CLI reviews, rejects drift, applies, and replays a diverse PostgreSQL workspace",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const schema = `canonical_cli_${randomUUID().replaceAll("-", "")}`;
    const workspaceId = `workspace:${schema}`;
    const connectionString = scopedUrl(databaseUrl, schema);
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 6,
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
    const directory = await mkdtemp(join(tmpdir(), "canonical-cli-pg-"));
    const manifestFile = join(directory, "manifest.json");
    const reviewFile = join(directory, "review.json");
    const manifestLink = join(directory, "manifest-link.json");
    const reviewLink = join(directory, "review-link.json");
    const eventIds = {
      canonical: "event:cli:canonical",
      configured: "event:cli:configured",
      manifest: "event:cli:manifest",
    } as const;
    const environment = {
      ...process.env,
      ORBIT_EVENT_DATABASE_URL: connectionString,
      ORBIT_WORKSPACE_ID: workspaceId,
    };
    const dryArgs = [
      "--dry-run",
      "--workspace-id",
      workspaceId,
      "--manifest-file",
      manifestFile,
    ] as const;
    const applyArgs = (runId: string, selectedReview = reviewFile) =>
      [
        "--apply",
        "--workspace-id",
        workspaceId,
        "--manifest-file",
        manifestFile,
        "--review-file",
        selectedReview,
        "--migration-run-id",
        runId,
      ] as const;
    const observedOutput: string[] = [];
    const invoke = (args: readonly string[]) => {
      const result = command(args, environment);
      observedOutput.push(`${result.stdout}\n${result.stderr}`);
      return result;
    };
    try {
      await admin.query(`create schema ${schema}`);
      await runOrbitRecordsMigration(pool);
      await runEventOperationsMigrations(client);
      for (const [index, eventId] of Object.values(eventIds).entries()) {
        await insertEvent({ eventId, index, pool, workspaceId });
      }
      await saveConfiguration(repository, eventIds.configured);
      await saveConfiguration(repository, eventIds.canonical);
      await repository.activateCanonicalRegistrations(eventIds.canonical, [
        registration({ adaptive: true, eventId: eventIds.canonical, index: 1 }),
      ]);
      for (const value of [
        registration({ adaptive: true, eventId: eventIds.configured, index: 11 }),
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
      ]) {
        await insertLegacyRegistration({ pool, registration: value, workspaceId });
      }
      const rawManifest = JSON.stringify({
        events: {
          [eventIds.manifest]: {
            evidenceId: "operator-evidence:canonical-cli",
            profileEditDeadlineAt: "2026-08-21T10:00:00.000Z",
            source: "operator_manifest",
          },
        },
        schemaVersion: 1,
      });
      await writeFile(manifestFile, rawManifest);

      const beforeDry = await stableSnapshot(pool, workspaceId);
      const dry = invoke(dryArgs);
      assert.equal(dry.status, 0, dry.stderr);
      const firstReview = output<{
        applyEligible: boolean;
        eventCount: number;
        manifestHash: string;
        mode: string;
        planHash: string;
        registrationCounts: { invalid: number; valid: number };
      }>(dry);
      assert.deepEqual(
        {
          applyEligible: firstReview.applyEligible,
          eventCount: firstReview.eventCount,
          invalid: firstReview.registrationCounts.invalid,
          mode: firstReview.mode,
          valid: firstReview.registrationCounts.valid,
        },
        {
          applyEligible: true,
          eventCount: 3,
          invalid: 0,
          mode: "dry-run",
          valid: 4,
        },
      );
      assert.equal(await stableSnapshot(pool, workspaceId), beforeDry);
      await writeFile(reviewFile, dry.stdout.trim());

      await insertLegacyRegistration({
        pool,
        registration: registration({
          eventId: eventIds.manifest,
          index: 23,
        }),
        workspaceId,
      });
      const afterDriftSource = await stableSnapshot(pool, workspaceId);
      const drift = invoke(applyArgs("run:cli:stale-review"));
      assert.equal(drift.status, 73, drift.stdout);
      assert.match(
        drift.stderr,
        /CANONICAL_MEMBERSHIP_MIGRATION_PLAN_DRIFT/u,
      );
      assert.equal(await stableSnapshot(pool, workspaceId), afterDriftSource);

      const refreshedDry = invoke(dryArgs);
      assert.equal(refreshedDry.status, 0, refreshedDry.stderr);
      const refreshedReview = output<{
        planHash: string;
        registrationCounts: { valid: number };
      }>(refreshedDry);
      assert.equal(refreshedReview.registrationCounts.valid, 5);
      assert.notEqual(refreshedReview.planHash, firstReview.planHash);
      await writeFile(reviewFile, refreshedDry.stdout.trim());

      await symlink(manifestFile, manifestLink);
      const linkedManifest = invoke([
        "--dry-run",
        "--workspace-id",
        workspaceId,
        "--manifest-file",
        manifestLink,
      ]);
      assert.equal(linkedManifest.status, 65);
      await symlink(reviewFile, reviewLink);
      assert.equal(invoke(applyArgs("run:cli:linked-review", reviewLink)).status, 65);
      await writeFile(
        reviewFile,
        refreshedDry.stdout.trim().replace(
          '"mode":"dry-run"',
          '"mode":"dry-run","mode":"dry-run"',
        ),
      );
      assert.equal(invoke(applyArgs("run:cli:duplicate-review")).status, 65);
      await writeFile(reviewFile, refreshedDry.stdout.trim());

      const legacyBefore = (
        await pool.query(
          `select record_id,payload,created_at,updated_at from orbit_records
            where workspace_id=$1 and collection_name='event_registrations'
            order by record_id`,
          [workspaceId],
        )
      ).rows;
      const applied = invoke(applyArgs("run:cli:reviewed-v1"));
      assert.equal(applied.status, 0, applied.stderr);
      assert.deepEqual(
        output<{ count: number; mode: string; status: string }>(applied),
        {
          count: 5,
          mode: "apply",
          planHash: refreshedReview.planHash,
          resultHash: output<Record<string, unknown>>(applied).resultHash,
          status: "applied",
        },
      );
      const states = await pool.query<{ state: string }>(
        `select registration_migration_state as state from event_ops_events
          where workspace_id=$1 order by event_id`,
        [workspaceId],
      );
      assert.equal(states.rows.every((row) => row.state === "canonical"), true);
      const ledger = await pool.query<{ count: string; events: string; targets: string }>(
        `select
           (select count(*)::text from event_ops_canonical_membership_migration_runs where workspace_id=$1) as count,
           (select count(*)::text from event_ops_canonical_membership_migration_events where workspace_id=$1) as events,
           (select coalesce(sum(target_count),0)::text from event_ops_canonical_membership_migration_events where workspace_id=$1) as targets`,
        [workspaceId],
      );
      assert.deepEqual(ledger.rows[0], {
        count: "1",
        events: "3",
        targets: "5",
      });
      assert.deepEqual(
        (
          await pool.query(
            `select record_id,payload,created_at,updated_at from orbit_records
              where workspace_id=$1 and collection_name='event_registrations'
              order by record_id`,
            [workspaceId],
          )
        ).rows,
        legacyBefore,
      );

      const replay = invoke(applyArgs("run:cli:reviewed-v1"));
      assert.equal(replay.status, 0, replay.stderr);
      assert.equal(output<{ status: string }>(replay).status, "already_applied");
      const duplicatePlan = invoke(applyArgs("run:cli:duplicate-plan"));
      assert.equal(duplicatePlan.status, 73, duplicatePlan.stderr);

      const disclosure = observedOutput.join("\n");
      for (const secret of [
        connectionString,
        directory,
        "operator-evidence:canonical-cli",
        "CLI Participant",
        "actor:event:cli",
        "Launch a measurable",
      ]) {
        assert.ok(!disclosure.includes(secret), `CLI disclosed ${secret}`);
      }
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
      await rm(directory, { force: true, recursive: true });
    }
  },
);

test(
  "isolated v11 canonical membership CLI is read-only and apply fails not-ready",
  { timeout: 120_000 },
  async () => {
    assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
    const schema = `canonical_cli_v11_${randomUUID().replaceAll("-", "")}`;
    const mainWorkspaceId = `workspace:${schema}`;
    const connectionString = scopedUrl(databaseUrl, schema);
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({ connectionString, max: 1 });
    const directory = await mkdtemp(join(tmpdir(), "canonical-cli-v11-"));
    const manifestFile = join(directory, "manifest.json");
    const reviewFile = join(directory, "review.json");
    const rawManifest = JSON.stringify({ events: {}, schemaVersion: 1 });
    const parsedManifest = parseCanonicalMembershipOperatorManifest(rawManifest);
    const environment = {
      ...process.env,
      ORBIT_EVENT_DATABASE_URL: connectionString,
      ORBIT_WORKSPACE_ID: mainWorkspaceId,
    };
    try {
      await admin.query(`create schema ${schema}`);
      await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
      await runEventOperationsMigrations({ async query(sql) {
        const version = /where version = (\d+)/.exec(sql)?.[1];
        if (!version || Number(version) <= 11) return pool.query(sql);
        return undefined;
      } });
      await pool.query(`insert into orbit_records (workspace_id,collection_name,record_id,source_type,source_id,payload,created_at,updated_at)
        values ($1,'cliReadOnlySentinel','sentinel','manual','cli-test','{"preserve":true}',now(),now())`, [mainWorkspaceId]);
      const tablesBefore = (await pool.query("select tablename from pg_tables where schemaname=current_schema() order by tablename")).rows;
      assert.equal(tablesBefore.some((row) => row.tablename.startsWith("event_ops_canonical_membership_migration_")), false);
      const before = await mainSnapshot(pool, mainWorkspaceId);
      assert.equal((before as { version: string }).version, "11");
      await writeFile(manifestFile, rawManifest);
      const dry = command(
        [
          "--dry-run",
          "--workspace-id",
          mainWorkspaceId,
          "--manifest-file",
          manifestFile,
        ],
        environment,
      );
      assert.ok(dry.status === 0 || dry.status === 2, dry.stderr);
      assert.deepEqual(await mainSnapshot(pool, mainWorkspaceId), before);

      await writeFile(
        reviewFile,
        JSON.stringify({
          applyEligible: true,
          blockerCodes: [],
          diagnosticHash: "d".repeat(64),
          eventCount: 0,
          events: [],
          manifestHash: parsedManifest.manifestHash,
          migrationId: "canonical-membership-v1",
          mode: "dry-run",
          planHash: "e".repeat(64),
          registrationCounts: {
            cancelled: 0,
            invalid: 0,
            raw: 0,
            rsvped: 0,
            valid: 0,
          },
          schemaVersion: 1,
          workspaceId: mainWorkspaceId,
        }),
      );
      const apply = command(
        [
          "--apply",
          "--workspace-id",
          mainWorkspaceId,
          "--manifest-file",
          manifestFile,
          "--review-file",
          reviewFile,
          "--migration-run-id",
          "run:main:not-ready",
        ],
        environment,
      );
      assert.equal(apply.status, 69, apply.stderr);
      assert.match(apply.stderr, /CANONICAL_MEMBERSHIP_MIGRATION_NOT_READY/u);
      assert.deepEqual(await mainSnapshot(pool, mainWorkspaceId), before);
      const disclosure = `${dry.stdout}\n${dry.stderr}\n${apply.stdout}\n${apply.stderr}`;
      assert.ok(!disclosure.includes(databaseUrl));
      assert.ok(!disclosure.includes(connectionString));
      assert.deepEqual((await pool.query("select tablename from pg_tables where schemaname=current_schema() order by tablename")).rows, tablesBefore);
      assert.deepEqual((await pool.query("select payload from orbit_records where workspace_id=$1 and record_id='sentinel'", [mainWorkspaceId])).rows, [{ payload: { preserve: true } }]);
      assert.ok(!disclosure.includes(directory));
    } finally {
      await pool.end();
      try { await admin.query(`drop schema if exists ${schema} cascade`); }
      finally { await admin.end(); }
      await rm(directory, { force: true, recursive: true });
    }
  },
);
