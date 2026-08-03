import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

import { createPostgresEventOperationsOutboxRepository } from "../../features/events/event-operations/storage/postgres-outbox-repository";
import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

test("PostgreSQL lease SQL uses database time instead of worker absolute clocks", () => {
  const outbox = readFileSync(
    join(
      projectRoot,
      "features/events/event-operations/storage/postgres-outbox-repository.ts",
    ),
    "utf8",
  );
  const tasks = readFileSync(
    join(
      projectRoot,
      "features/events/event-operations/storage/postgres-repository.ts",
    ),
    "utf8",
  );
  for (const source of [outbox, tasks]) {
    assert.match(source, /statement_timestamp\(\)/);
    assert.match(source, /interval '1 millisecond'/);
    assert.doesNotMatch(source, /lease_expires_at\s*>\s*\$\d/);
    assert.doesNotMatch(source, /lease_expires_at\s*<=\s*\$\d/);
  }
  assert.match(
    tasks,
    /published_dto\s*->>\s*'resultsAvailableAt'[\s\S]*statement_timestamp\(\)/u,
  );
  assert.match(tasks, /ai_request_fingerprint/u);
  assert.match(tasks, /insert into event_ops_task_attempts/u);
  assert.match(tasks, /outcome = 'lease_lost'/u);
  assert.match(tasks, /claimed_at[\s\S]*statement_timestamp\(\)/u);
  assert.match(tasks, /set finished_at = statement_timestamp\(\)/u);
  assert.doesNotMatch(tasks, /provider_adapter_duration_ms\s*=\s*0/u);
  assert.doesNotMatch(tasks, /domain_validation_duration_ms\s*=\s*0/u);
  assert.match(
    tasks,
    /evidence_metadata\s*->>\s*'aiRequestFingerprint'\s*=\s*\$3/u,
  );
});

test(
  "multiple PostgreSQL workers fence one claim, heartbeat it, and reclaim only after a crash lease expires",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_outbox_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool,
    });
    const runtime = { client, workspaceId: "workspace:outbox-pg-test" };
    const workerA = createPostgresEventOperationsOutboxRepository(runtime);
    const workerB = createPostgresEventOperationsOutboxRepository(runtime);

    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      await client.query(
        `
          insert into event_ops_outbox (
            workspace_id, outbox_id, event_id, aggregate_type, aggregate_id,
            event_type, payload, available_at, created_at, updated_at
          ) values ($1, $2, $3, $4, $5, $6, '{}'::jsonb,
            statement_timestamp(), statement_timestamp(), statement_timestamp())
        `,
        [
          runtime.workspaceId,
          "outbox:pg-fencing",
          "event:pg-fencing",
          "test",
          "aggregate:pg-fencing",
          "event.contact_request.created",
        ],
      );

      const [left, right] = await Promise.all([
        workerA.claim({ leaseMs: 140, limit: 1, workerId: "worker:A" }),
        workerB.claim({ leaseMs: 140, limit: 1, workerId: "worker:B" }),
      ]);
      assert.equal(left.length + right.length, 1);
      const first = left[0] ?? right[0];
      assert.ok(first);

      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(
        await (first.workerId === "worker:A" ? workerA : workerB).heartbeat({
          leaseEpoch: first.leaseEpoch,
          leaseMs: 140,
          leaseToken: first.leaseToken,
          outboxId: first.outboxId,
        }),
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(
        (
          await (first.workerId === "worker:A" ? workerB : workerA).claim({
            leaseMs: 140,
            limit: 1,
            workerId: "worker:observer",
          })
        ).length,
        0,
      );

      await new Promise((resolve) => setTimeout(resolve, 160));
      const reclaimed = await (first.workerId === "worker:A" ? workerB : workerA).claim({
        leaseMs: 500,
        limit: 1,
        workerId: "worker:reclaimer",
      });
      assert.equal(reclaimed.length, 1);
      assert.equal(reclaimed[0]?.leaseEpoch, first.leaseEpoch + 1);
      assert.equal(
        await workerA.complete({
          completion: { stale: true },
          leaseEpoch: first.leaseEpoch,
          leaseToken: first.leaseToken,
          outboxId: first.outboxId,
        }),
        false,
      );
      assert.equal(
        await workerB.complete({
          completion: { policy: "canonical_only" },
          leaseEpoch: reclaimed[0]!.leaseEpoch,
          leaseToken: reclaimed[0]!.leaseToken,
          outboxId: reclaimed[0]!.outboxId,
        }),
        true,
      );
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);

test(
  "PostgreSQL AI task heartbeat uses DB time and stale worker clocks cannot steal or extend a lease",
  { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" },
  async () => {
    assert.ok(databaseUrl);
    const schema = `event_ops_task_lease_${randomUUID().replaceAll("-", "")}`;
    const admin = new Pool({ connectionString: databaseUrl, max: 1 });
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      options: `-c search_path=${schema}`,
    });
    const client = createEventOperationsPostgresClient({
      connectionString: databaseUrl,
      pool,
    });
    const runtime = { client, workspaceId: "workspace:task-lease-pg-test" };
    const repository = createPostgresEventOperationsRepository(runtime);
    try {
      await admin.query(`create schema ${schema}`);
      await runEventOperationsMigrations(client);
      await client.query(
        `
          insert into event_ops_events (
            workspace_id, event_id, organizer_actor_id, created_at, updated_at
          ) values ($1, 'event:task-lease', 'actor:organizer', now(), now())
        `,
        [runtime.workspaceId],
      );
      await client.query(
        `
          insert into event_ops_configurations (
            workspace_id, event_id, configuration_version, check_in_opens_at,
            event_starts_at, event_ends_at, profile_edit_deadline_at,
            registration_cutoff_at, results_available_at, round_one_starts_at,
            round_two_starts_at, recommendation_count, table_size, shard_size,
            max_attempts_per_task, created_at, updated_at
          ) values (
            $1, 'event:task-lease', 1, '2026-08-03T08:00:00Z',
            '2026-08-03T09:00:00Z', '2026-08-03T13:00:00Z',
            '2026-08-03T07:00:00Z', '2026-08-03T08:00:00Z',
            '2026-08-03T08:30:00Z', '2026-08-03T09:30:00Z',
            '2026-08-03T10:30:00Z', 2, 4, 2, 3, now(), now()
          )
        `,
        [runtime.workspaceId],
      );
      await client.query(
        `
          insert into event_ops_generations (
            workspace_id, generation_id, event_id, organizer_actor_id,
            idempotency_key, configuration_version, snapshot_hash,
            ai_request_fingerprint, status, expected_task_count, created_at,
            updated_at
          ) values (
            $1, 'generation:task-lease', 'event:task-lease', 'actor:organizer',
            'task-lease-test', 1, 'snapshot:test', 'ai-stack:test-v1',
            'queued', 1, now(), now()
          )
        `,
        [runtime.workspaceId],
      );
      await client.query(
        `
          insert into event_ops_tasks (
            workspace_id, task_id, generation_id, task_kind, status,
            participant_ids, depends_on_task_ids, attempt_limit, attempts,
            retry_round, lease_epoch, revision, created_at, updated_at
          ) values (
            $1, 'task:task-lease', 'generation:task-lease',
            'recommendation_shard', 'queued', '{}', '{}', 3, 0, 0, 0, 1,
            now(), now()
          )
        `,
        [runtime.workspaceId],
      );

      const first = await repository.claimTasks({
        aiRequestFingerprint: "ai-stack:test-v1",
        generationId: "generation:task-lease",
        leaseMs: 400,
        leaseTokenPrefix: "worker-fast-clock",
        limit: 1,
        now: "2099-01-01T00:00:00.000Z",
        workerId: "worker:A",
      });
      assert.equal(first.length, 1);
      const firstAttempts = await repository.listTaskAttempts(
        "generation:task-lease",
      );
      assert.deepEqual(firstAttempts.map((attempt) => attempt.outcome), [null]);
      assert.ok(firstAttempts[0]!.eligibleAt <= firstAttempts[0]!.claimedAt);
      assert.doesNotMatch(firstAttempts[0]!.claimedAt, /^2099-/u);
      assert.equal(
        (
          await repository.claimTasks({
            aiRequestFingerprint: "ai-stack:test-v1",
            generationId: "generation:task-lease",
            leaseMs: 400,
            leaseTokenPrefix: "worker-even-faster-clock",
            limit: 1,
            now: "2199-01-01T00:00:00.000Z",
            workerId: "worker:B",
          })
        ).length,
        0,
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(
        await repository.heartbeatTask({
          heartbeatAt: "1900-01-01T00:00:00.000Z",
          leaseEpoch: first[0]!.leaseEpoch,
          leaseMs: 400,
          leaseToken: first[0]!.leaseToken!,
          taskId: first[0]!.taskId,
          workerId: "worker:A",
        }),
        true,
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(
        (
          await repository.claimTasks({
            aiRequestFingerprint: "ai-stack:test-v1",
            generationId: "generation:task-lease",
            leaseMs: 400,
            leaseTokenPrefix: "worker:B",
            limit: 1,
            now: "2199-01-01T00:00:00.000Z",
            workerId: "worker:B",
          })
        ).length,
        0,
      );
      await new Promise((resolve) => setTimeout(resolve, 420));
      const reclaimed = await repository.claimTasks({
        aiRequestFingerprint: "ai-stack:test-v1",
        generationId: "generation:task-lease",
        leaseMs: 500,
        leaseTokenPrefix: "worker:B",
        limit: 1,
        now: "1900-01-01T00:00:00.000Z",
        workerId: "worker:B",
      });
      assert.equal(reclaimed.length, 1);
      assert.equal(reclaimed[0]?.leaseEpoch, first[0]!.leaseEpoch + 1);
      const reclaimedAttempts = await repository.listTaskAttempts(
        "generation:task-lease",
      );
      assert.deepEqual(
        reclaimedAttempts.map((attempt) => attempt.outcome),
        ["lease_lost", null],
      );
      assert.equal(
        reclaimedAttempts[1]?.eligibleAt,
        reclaimedAttempts[0]?.finishedAt,
      );
      assert.equal(reclaimedAttempts[0]?.providerAdapterDurationMs, null);
      assert.equal(reclaimedAttempts[0]?.domainValidationDurationMs, null);
      assert.equal(reclaimedAttempts[0]?.requestBytes, null);
      assert.equal(reclaimedAttempts[0]?.responseBytes, null);
      assert.equal(
        await repository.heartbeatTask({
          heartbeatAt: "2099-01-01T00:00:00.000Z",
          leaseEpoch: first[0]!.leaseEpoch,
          leaseMs: 60_000,
          leaseToken: first[0]!.leaseToken!,
          taskId: first[0]!.taskId,
          workerId: "worker:A",
        }),
        false,
      );
      assert.equal(
        await repository.completeTask({
          artifact: {
            evidenceMetadata: {
              aiRequestFingerprint: "ai-stack:test-v1",
            },
            kind: "recommendation_shard",
            model: "stale-model",
            provider: "stale-provider",
            requestHash: "request:stale",
            responseHash: "response:stale",
            schemaVersion: 1,
          },
          completedAt: new Date().toISOString(),
          leaseEpoch: first[0]!.leaseEpoch,
          leaseToken: first[0]!.leaseToken!,
          output: { kind: "recommendation_shard", recommendations: [] },
          taskId: first[0]!.taskId,
          telemetry: null,
        }),
        false,
      );
      assert.equal(
        await repository.failTask({
          code: "EVENT_OPERATIONS_AI_TIMEOUT",
          failedAt: new Date().toISOString(),
          leaseEpoch: first[0]!.leaseEpoch,
          leaseToken: first[0]!.leaseToken!,
          message: "A stale lease cannot close a recovered attempt.",
          retryable: true,
          taskId: first[0]!.taskId,
          telemetry: null,
        }),
        false,
      );
      assert.equal(
        await repository.completeTask({
          artifact: {
            evidenceMetadata: {
              aiRequestFingerprint: "ai-stack:test-v1",
            },
            kind: "recommendation_shard",
            model: "test-model",
            provider: "test-provider",
            requestHash: "request:test",
            responseHash: "response:test",
            schemaVersion: 1,
          },
          completedAt: new Date().toISOString(),
          leaseEpoch: reclaimed[0]!.leaseEpoch,
          leaseToken: reclaimed[0]!.leaseToken!,
          output: { kind: "recommendation_shard", recommendations: [] },
          taskId: reclaimed[0]!.taskId,
          telemetry: {
            domainValidationDurationMs: 2,
            model: "test-model",
            provider: "test-provider",
            providerAdapterDurationMs: 8,
            requestBytes: 128,
            responseBytes: 256,
          },
        }),
        true,
      );
      const completedAttempts = await repository.listTaskAttempts(
        "generation:task-lease",
      );
      assert.deepEqual(
        completedAttempts.map((attempt) => attempt.outcome),
        ["lease_lost", "completed"],
      );
      assert.equal(completedAttempts[1]?.providerAdapterDurationMs, 8);

      await client.query(
        `
          insert into event_ops_tasks (
            workspace_id, task_id, generation_id, task_kind, status,
            participant_ids, depends_on_task_ids, attempt_limit, attempts,
            retry_round, lease_epoch, revision, created_at, updated_at
          ) values (
            $1, 'task:task-lease-fail', 'generation:task-lease',
            'recommendation_shard', 'queued', '{}', '{}', 3, 0, 0, 0, 1,
            now(), now()
          )
        `,
        [runtime.workspaceId],
      );
      const failedClaim = await repository.claimTasks({
        aiRequestFingerprint: "ai-stack:test-v1",
        generationId: "generation:task-lease",
        leaseMs: 500,
        leaseTokenPrefix: "worker:failure",
        limit: 1,
        now: new Date().toISOString(),
        workerId: "worker:failure",
      });
      assert.equal(failedClaim.length, 1);
      assert.equal(
        await repository.failTask({
          code: "EVENT_OPERATIONS_AI_TIMEOUT",
          failedAt: new Date().toISOString(),
          leaseEpoch: failedClaim[0]!.leaseEpoch,
          leaseToken: failedClaim[0]!.leaseToken!,
          message: "Injected timeout without retaining response content.",
          retryable: true,
          taskId: failedClaim[0]!.taskId,
          telemetry: {
            domainValidationDurationMs: 0,
            model: null,
            provider: null,
            providerAdapterDurationMs: 11,
            requestBytes: 64,
            responseBytes: 32,
          },
        }),
        true,
      );
      const failedAttempt = (
        await repository.listTaskAttempts("generation:task-lease")
      ).find((attempt) => attempt.taskId === "task:task-lease-fail");
      assert.equal(failedAttempt?.outcome, "retryable_failed");
      assert.equal(failedAttempt?.failureCode, "EVENT_OPERATIONS_AI_TIMEOUT");
      const retryEligibleAt = (
        await repository.getTask("task:task-lease-fail")
      )?.updatedAt;
      const automaticRetry = await repository.claimTasks({
        aiRequestFingerprint: "ai-stack:test-v1",
        generationId: "generation:task-lease",
        leaseMs: 500,
        leaseTokenPrefix: "worker:automatic-retry",
        limit: 1,
        now: "2199-01-01T00:00:00.000Z",
        workerId: "worker:automatic-retry",
      });
      assert.equal(automaticRetry.length, 1);
      const automaticAttempt = (
        await repository.listTaskAttempts("generation:task-lease")
      ).find(
        (attempt) =>
          attempt.taskId === "task:task-lease-fail" && attempt.attempt === 2,
      );
      assert.equal(automaticAttempt?.eligibleAt, retryEligibleAt);
      assert.doesNotMatch(automaticAttempt?.claimedAt ?? "", /^2199-/u);
      assert.equal(
        await repository.failTask({
          code: "EVENT_OPERATIONS_AI_TIMEOUT",
          failedAt: "1900-01-01T00:00:00.000Z",
          leaseEpoch: automaticRetry[0]!.leaseEpoch,
          leaseToken: automaticRetry[0]!.leaseToken!,
          message: "Terminate the retry to exercise manual requeue.",
          retryable: false,
          taskId: automaticRetry[0]!.taskId,
          telemetry: null,
        }),
        true,
      );
      const finalized = await repository.finalizeGeneration(
        "generation:task-lease",
        "2099-01-01T00:00:00.000Z",
      );
      assert.equal(finalized.status, "failed");
      const retriedGeneration = await repository.retryFailedGeneration(
        "generation:task-lease",
        "1900-01-01T00:00:00.000Z",
      );
      assert.equal(retriedGeneration.status, "queued");
      const manualEligibleAt = (
        await repository.getTask("task:task-lease-fail")
      )?.updatedAt;
      const manualRetry = await repository.claimTasks({
        aiRequestFingerprint: "ai-stack:test-v1",
        generationId: "generation:task-lease",
        leaseMs: 500,
        leaseTokenPrefix: "worker:manual-retry",
        limit: 1,
        now: "2199-01-01T00:00:00.000Z",
        workerId: "worker:manual-retry",
      });
      assert.equal(manualRetry.length, 1);
      const manualAttempt = (
        await repository.listTaskAttempts("generation:task-lease")
      ).find(
        (attempt) =>
          attempt.taskId === "task:task-lease-fail" &&
          attempt.retryRound === 1,
      );
      assert.equal(manualAttempt?.attempt, 1);
      assert.equal(manualAttempt?.eligibleAt, manualEligibleAt);
      assert.doesNotMatch(manualAttempt?.claimedAt ?? "", /^2199-/u);
      const failedArtifacts = await client.query<{ count: string }>(
        `
          select count(*)::text as count
          from event_ops_ai_artifacts
          where workspace_id = $1 and task_id = 'task:task-lease-fail'
        `,
        [runtime.workspaceId],
      );
      assert.equal(failedArtifacts.rows[0]?.count, "0");
    } finally {
      await client.close();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
