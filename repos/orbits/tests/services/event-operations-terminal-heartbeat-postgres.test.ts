import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";
import {
  createEventOperationsPostgresClient,
  type EventOperationsPostgresClient,
  type EventOperationsSqlExecutor,
} from "../../features/events/event-operations/storage/postgres-client";
import { runEventOperationsMigrations } from "../../features/events/event-operations/storage/migrations";
import { loadLocalEnv } from "../../scripts/load-local-env";

loadLocalEnv();
const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;

function createTerminalSqlBarrier() {
  let markReached!: () => void;
  let releaseTerminal!: () => void;
  const reached = new Promise<void>((resolve) => { markReached = resolve; });
  const released = new Promise<void>((resolve) => { releaseTerminal = resolve; });
  return {
    reached,
    release: releaseTerminal,
    async pause() {
      markReached();
      await released;
    },
  };
}

function isTerminalSql(sql: string): boolean {
  return (
    /update\s+event_ops_tasks\s+set\s+status\s*=\s*'completed'/iu.test(sql) ||
    /select\s+attempts,\s*attempt_limit[\s\S]*for\s+update/iu.test(sql)
  );
}

function wrapTerminalTransactions(
  client: EventOperationsPostgresClient,
  barrier: ReturnType<typeof createTerminalSqlBarrier>,
): EventOperationsPostgresClient {
  return {
    close: () => Promise.resolve(),
    query: (sql, values) => client.query(sql, values),
    transaction(operation, options) {
      return client.transaction(async (transaction) => {
        const executor: EventOperationsSqlExecutor = {
          async query<TRow = Record<string, unknown>>(
            sql: string,
            values?: readonly unknown[],
          ) {
            if (isTerminalSql(sql)) {
              assert.ok(values && values.length >= 2);
              await transaction.query(
                `select revision from event_ops_tasks
                  where workspace_id=$1 and task_id=$2`,
                [values[0], values[1]],
              );
              await barrier.pause();
            }
            return transaction.query<TRow>(sql, values);
          },
        };
        return operation(executor);
      }, options);
    },
  };
}

test("heartbeat commits between a terminal transaction snapshot and complete/fail without serialization failures", {
  timeout: 120_000,
}, async () => {
  assert.ok(databaseUrl, "ORBIT_EVENT_DATABASE_URL is required");
  const schema = `terminal_heartbeat_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:terminal-heartbeat:${randomUUID()}`;
  const eventId = "event:terminal-heartbeat";
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
  const repository = createPostgresEventOperationsRepository({ client, workspaceId });
  try {
    await admin.query(`create schema ${schema}`);
    await runEventOperationsMigrations(client);
    await client.query(
      `insert into event_ops_events (
         workspace_id,event_id,organizer_actor_id,created_at,updated_at
       ) values ($1,$2,'actor:organizer',now(),now())`,
      [workspaceId, eventId],
    );
    await client.query(
      `insert into event_ops_configurations (
         workspace_id,event_id,configuration_version,check_in_opens_at,
         event_starts_at,event_ends_at,profile_edit_deadline_at,
         registration_cutoff_at,results_available_at,round_one_starts_at,
         round_two_starts_at,recommendation_count,table_size,shard_size,
         max_attempts_per_task,created_at,updated_at
       ) values (
         $1,$2,1,'2026-08-03T08:00:00Z','2026-08-03T09:00:00Z',
         '2026-08-03T13:00:00Z','2026-08-03T07:00:00Z',
         '2026-08-03T08:00:00Z','2026-08-03T08:30:00Z',
         '2026-08-03T09:30:00Z','2026-08-03T10:30:00Z',2,4,2,3,now(),now()
       )`,
      [workspaceId, eventId],
    );

    for (let index = 0; index < 50; index += 1) {
      const generationId = `generation:terminal-heartbeat:${index}`;
      const taskId = `task:terminal-heartbeat:${index}`;
      await client.query(
        `insert into event_ops_generations (
           workspace_id,generation_id,event_id,organizer_actor_id,idempotency_key,
           configuration_version,snapshot_hash,ai_request_fingerprint,status,
           expected_task_count,created_at,updated_at
         ) values ($1,$2,$3,'actor:organizer',$4,1,$5,$6,'queued',1,now(),now())`,
        [
          workspaceId,
          generationId,
          eventId,
          `terminal-heartbeat-${index}`,
          `snapshot:terminal-heartbeat:${index}`,
          `ai-stack:terminal-heartbeat:${index}`,
        ],
      );
      await client.query(
        `insert into event_ops_tasks (
           workspace_id,task_id,generation_id,task_kind,status,participant_ids,
           depends_on_task_ids,attempt_limit,attempts,retry_round,lease_epoch,
           revision,created_at,updated_at
         ) values ($1,$2,$3,'recommendation_shard','queued','{}','{}',3,0,0,0,1,now(),now())`,
        [workspaceId, taskId, generationId],
      );
      const claimed = await repository.claimTasks({
        aiRequestFingerprint: `ai-stack:terminal-heartbeat:${index}`,
        generationId,
        leaseMs: 30_000,
        leaseTokenPrefix: `worker-terminal-${index}`,
        limit: 1,
        now: "1900-01-01T00:00:00.000Z",
        workerId: "worker:terminal-heartbeat",
      });
      assert.equal(claimed.length, 1);
      const lease = claimed[0]!;
      assert.ok(lease.leaseToken);
      const barrier = createTerminalSqlBarrier();
      const terminalRepository = createPostgresEventOperationsRepository({
        client: wrapTerminalTransactions(client, barrier),
        workspaceId,
      });
      const complete = index % 2 === 0;
      const terminal = complete
        ? terminalRepository.completeTask({
            artifact: {
              evidenceMetadata: { aiRequestFingerprint: `ai-stack:terminal-heartbeat:${index}` },
              kind: "recommendation_shard",
              model: "test-model",
              provider: "test-provider",
              requestHash: `request:terminal-heartbeat:${index}`,
              responseHash: `response:terminal-heartbeat:${index}`,
              schemaVersion: 1,
            },
            completedAt: new Date().toISOString(),
            leaseEpoch: lease.leaseEpoch,
            leaseToken: lease.leaseToken,
            output: { kind: "recommendation_shard", recommendations: [] },
            taskId,
            telemetry: null,
          })
        : terminalRepository.failTask({
            code: "EVENT_OPERATIONS_AI_TIMEOUT",
            failedAt: new Date().toISOString(),
            leaseEpoch: lease.leaseEpoch,
            leaseToken: lease.leaseToken,
            message: "The model request timed out.",
            retryable: false,
            taskId,
            telemetry: null,
          });
      await barrier.reached;
      try {
        assert.equal(await repository.heartbeatTask({
          heartbeatAt: "2099-01-01T00:00:00.000Z",
          leaseEpoch: lease.leaseEpoch,
          leaseMs: 30_000,
          leaseToken: lease.leaseToken,
          taskId,
          workerId: "worker:terminal-heartbeat",
        }), true);
      } finally {
        barrier.release();
      }
      assert.equal(await terminal, true, `round ${index}`);

      const attempts = await repository.listTaskAttempts(generationId);
      assert.equal(attempts.length, 1);
      const artifactCount = Number((await client.query<{ count: string }>(
        `select count(*)::text as count from event_ops_ai_artifacts
          where workspace_id=$1 and task_id=$2`,
        [workspaceId, taskId],
      )).rows[0]?.count);
      if (complete) {
        assert.equal(artifactCount, 1);
        assert.equal(attempts[0]?.outcome, "completed");
        assert.equal(await repository.failTask({
          code: "EVENT_OPERATIONS_AI_TIMEOUT",
          failedAt: new Date().toISOString(),
          leaseEpoch: lease.leaseEpoch,
          leaseToken: lease.leaseToken,
          message: "A closed lease must be rejected.",
          retryable: false,
          taskId,
          telemetry: null,
        }), false);
      } else {
        assert.equal(artifactCount, 0);
        assert.equal(attempts[0]?.outcome, "terminal_failed");
        assert.equal(attempts[0]?.failureCode, "EVENT_OPERATIONS_AI_TIMEOUT");
        assert.equal(await repository.completeTask({
          artifact: {
            evidenceMetadata: {}, kind: "recommendation_shard", model: "stale",
            provider: "stale", requestHash: "stale", responseHash: "stale", schemaVersion: 1,
          },
          completedAt: new Date().toISOString(),
          leaseEpoch: lease.leaseEpoch,
          leaseToken: lease.leaseToken,
          output: { kind: "recommendation_shard", recommendations: [] },
          taskId,
          telemetry: null,
        }), false);
      }
    }
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
