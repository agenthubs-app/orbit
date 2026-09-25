/**
 * Reproduce schedule-window exception-history transfer and result-size curves.
 * Local-only: requires an explicitly named loopback test database and creates
 * one random schema which is dropped in finally. Does not load dotenv files.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Pool } from "pg";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient, type TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

const databaseNamePattern = /^orbit_[a-z0-9_]*_test_[0-9]{8}$/;
const counts = [0, 100, 1_000, 5_000] as const;
const workspaceId = "diagnostic:personal-schedule-exception-cost";
const at = "2026-09-25T00:00:00.000Z";
const window = { from: "2026-09-25T00:00:00.000Z", to: "2026-12-24T00:00:00.000Z" };

function localTestDatabaseUrl(): string {
  const value = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
  assert.ok(value, "Set ORBIT_LIFECYCLE_TEST_DATABASE_URL to a dedicated local test database URL.");
  const url = new URL(value);
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol), "PostgreSQL URL required.");
  assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname), "Refusing any non-loopback database host.");
  assert.equal(url.search, "", "Connection URL options are not accepted by this local-only diagnostic.");
  assert.equal(url.hash, "", "Connection URL fragments are not accepted.");
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  assert.match(databaseName, databaseNamePattern, "Use a dedicated database named orbit_<purpose>_test_YYYYMMDD.");
  return url.toString();
}

async function main(): Promise<void> {
  const connectionString = localTestDatabaseUrl();
  const schema = `schedule_exception_cost_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 1 });
  const pool = new Pool({ connectionString, max: 2, options: `-c search_path=${schema} -c statement_timeout=30000` });
  const client = createTransactionalPostgresClient({ connectionString, pool });
  let schemaCreated = false;

  try {
    await admin.query(`create schema ${schema}`);
    schemaCreated = true;
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);

    const reads: { isExceptionRead: boolean; rows: number; bytes: number }[] = [];
    let measuring = false;
    const observe = (executor: TransactionalSqlExecutor): TransactionalSqlExecutor => ({
      async query<T>(sql: string, values?: readonly unknown[]) {
        const result = await executor.query<T>(sql, values);
        if (!measuring || !/^\s*(?:select|with)\b/i.test(sql)) return result;
        reads.push({
          isExceptionRead: /personal_schedule_occurrence_exceptions/i.test(sql)
            || (values?.includes("personal_schedule_occurrence_exceptions") ?? false),
          rows: result.rows.length,
          bytes: Buffer.byteLength(JSON.stringify(result.rows)),
        });
        return result;
      },
    });
    const measuredClient: TransactionalPostgresClient = {
      async query<T>(sql: string, values?: readonly unknown[]) {
        return observe(client).query<T>(sql, values);
      },
      close: () => client.close(),
      async transaction<T>(operation: (transaction: TransactionalSqlExecutor) => Promise<T>) {
        return client.transaction(transaction => operation(observe(transaction)));
      },
    };
    const store = createPostgresLiveRecordStore({ client: measuredClient });
    const service = createPersonalScheduleService({ store, client: measuredClient, workspaceId, now: () => at });
    const curves: Record<string, unknown[]> = { unchangedHistoricalExceptions: [], movedIntoWindow: [] };

    for (const mode of ["unchangedHistoricalExceptions", "movedIntoWindow"] as const) {
      for (const historicalCount of counts) {
        const actorId = `diagnostic:${mode}:${historicalCount}`;
        const { scheduleItem } = await service.create(actorId, {
          title: "Daily diagnostic series",
          startsAt: "1990-01-01T09:00:00.000Z",
          endsAt: "1990-01-01T10:00:00.000Z",
          timeZone: "UTC",
          recurrence: { frequency: "daily" },
          idempotencyKey: `${mode}-${historicalCount}`,
        });

        if (historicalCount > 0) {
          const patch = mode === "movedIntoWindow"
            ? "jsonb_build_object('startsAt','2026-10-01T09:00:00.000Z')"
            : "jsonb_build_object('title',repeat('t',200),'location',repeat('l',400))";
          await pool.query(`
            insert into orbit_records
              (workspace_id,collection_name,record_id,user_id,source_type,source_id,evidence_ids,lifecycle_state,payload,created_at,updated_at)
            select $1,'personal_schedule_occurrence_exceptions',$2||':occurrence:'||occurrence_date,$3,'manual',$2,array[]::text[],'active',
              jsonb_build_object('seriesId',$2::text,'occurrenceDate',occurrence_date,'cancelled',false,'patch',${patch},'updatedAt',$4::text),
              $5::timestamptz,$4::timestamptz
            from (
              select to_char(date '1990-01-01' + n,'YYYY-MM-DD') as occurrence_date
              from generate_series(0,$6::int-1) n
            ) dates
          `, [workspaceId, scheduleItem.id, actorId, at, scheduleItem.createdAt, historicalCount]);
        }

        reads.length = 0;
        const started = performance.now();
        measuring = true;
        let result: Awaited<ReturnType<typeof service.list>>;
        try {
          result = await service.list({ actorId, from: window.from, to: window.to });
        } finally {
          measuring = false;
        }
        const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
        assert.ok(reads.length > 0, "The measurement wrapper must observe the actual list SQL calls.");
        const selectRows = reads.reduce((total, read) => total + read.rows, 0);
        const selectBytes = reads.reduce((total, read) => total + read.bytes, 0);
        const exceptionReads = reads.filter(read => read.isExceptionRead);
        const exceptionRows = exceptionReads.reduce((total, read) => total + read.rows, 0);
        const exceptionBytes = exceptionReads.reduce((total, read) => total + read.bytes, 0);
        const outputBytes = Buffer.byteLength(JSON.stringify(result));

        assert.ok(exceptionRows <= historicalCount, "The reader must not return more exception rows than were seeded.");
        if (historicalCount === 0) assert.equal(exceptionRows, 0, "No exceptions were seeded in the baseline case.");
        assert.equal(result.length, mode === "movedIntoWindow" ? 90 + historicalCount : 90,
          "The diagnostic must keep every legitimate moved-in occurrence and must not cap output.");
        (curves[mode] as unknown[]).push({ historicalCount, selectRows, selectBytes, exceptionRows, exceptionBytes, occurrenceCount: result.length, outputBytes, elapsedMs });
      }
    }

    console.log(JSON.stringify({
      metric: "personal_schedule_window_exception_history_cost",
      measurement: "local PostgreSQL SELECT JSON bytes plus serialized complete list result; exception rows/bytes are a legacy-query subset, not provider billing",
      database: decodeURIComponent(new URL(connectionString).pathname.slice(1)),
      schema,
      window,
      curves,
    }, null, 2));
  } finally {
    try {
      await client.close();
    } finally {
      try {
        if (schemaCreated) await admin.query(`drop schema if exists ${schema} cascade`);
      } finally {
        await admin.end();
      }
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Schedule exception diagnostic failed.");
  process.exitCode = 1;
});
