import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import {
  loadHomeFacts,
  type HomeFactsRouteDependencies,
} from "../../app/(app)/app/agent/home-facts-route-service";
import type { RelationshipLifecycleTaskReadModel } from "../../app/(app)/app/tasks/relationship-lifecycle-tasks";
import {
  createHomeTaskSummaryReader,
  HOME_TASK_SUMMARY_DISPLAY_LIMIT,
  HOME_TASK_SUMMARY_SQL,
  HOME_TASK_TITLE_PREVIEW_LIMIT,
} from "../../features/tasks/home-summary-reader";
import type { TaskItemDTO } from "../../features/tasks/contract";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { taskLiveRecordFromPayload } from "../../features/tasks/task-record";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const SNAPSHOT = "2026-09-17T00:00:00.000Z";
const WINDOW = {
  productDate: "2026-09-17",
  snapshotAt: SNAPSHOT,
  timeZone: "Asia/Tokyo",
  toDate: "2026-09-24",
} as const;
const DATABASE_URL = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;

const emptyFollowups: RelationshipLifecycleTaskReadModel = {
  currentCount: 0,
  currentTasks: [],
  historyCount: 0,
  historyTasks: [],
  orphanCount: 0,
  orphanTasks: [],
  sourceLabel: "test",
  state: "empty",
};

function otherSources(overrides: Partial<HomeFactsRouteDependencies> = {}): HomeFactsRouteDependencies {
  return {
    appointmentService: { async list() { return []; } },
    followupLoader: async () => emptyFollowups,
    personalScheduleService: { async list() { return []; } },
    ...overrides,
  };
}

function task(actorId: string, id: string, patch: Partial<TaskItemDTO> = {}): TaskItemDTO {
  return {
    accountId: actorId,
    category: "work",
    createdAt: "2026-09-16T12:00:00.000Z",
    id,
    ownerUserId: actorId,
    priority: "normal",
    source: "manual",
    status: "open",
    title: `Task ${id}`,
    updatedAt: "2026-09-16T12:00:00.000Z",
    ...patch,
  };
}

test("home task summary executes one bounded projection and validates its exact count envelope", async () => {
  let queryText = "";
  let queryValues: readonly unknown[] = [];
  const reader = createHomeTaskSummaryReader({
    workspaceId: "workspace:home-summary",
    client: {
      async query<TRow>(text, values) {
        queryText = text;
        queryValues = values ?? [];
        return {
          rows: [{ result: {
            ok: true,
            count: 0,
            groupCounts: { overdue: 0, "plan-past": 0, recent: 0, undated: 0 },
            items: [],
          } }] as TRow[],
        };
      },
    },
  });

  const summary = await reader.read("actor:home-summary", WINDOW);

  assert.deepEqual(summary, {
    count: 0,
    groupCounts: { overdue: 0, "plan-past": 0, recent: 0, undated: 0 },
    items: [],
  });
  assert.deepEqual(queryValues, ["workspace:home-summary", "actor:home-summary", SNAPSHOT, "2026-09-17", "2026-09-24", "Asia/Tokyo"]);
  assert.match(queryText, /with owned as materialized[\s\S]*valid as materialized/);
  assert.match(queryText, /limit 3/);
  assert.match(queryText, /left\(t->>'title',240\)/);
  assert.match(queryText, /sort_key collate "C"/);
  assert.match(queryText, /\('tasks:' \|\| record_id\) collate "C"/);
  assert.ok(!/jsonb_build_object\([^)]*'notes'/.test(queryText));
  assert.equal(HOME_TASK_SUMMARY_DISPLAY_LIMIT, 3);
  assert.equal(HOME_TASK_TITLE_PREVIEW_LIMIT, 240);
});

test("real PostgreSQL home task summary matches memory grouping, offset normalization, and UTF-8 tie rules", { skip: !DATABASE_URL }, async () => {
  const url = new URL(DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.search, "");
  const schema = `home_task_summary_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({
    connectionString: url.toString(),
    max: 1,
    options: `-c search_path=${schema} -c statement_timeout=30000`,
  });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const service = createTaskService({ repository: createTaskRepository({ store, workspaceId: "w" }) });
    const reader = createHomeTaskSummaryReader({ client: pool, workspaceId: "w" });
    const save = async (value: TaskItemDTO) => store.upsertRecord(taskLiveRecordFromPayload({
      workspaceId: "w",
      payload: { version: 1, task: value, activities: [] },
    }));

    const dated = [
      task("actor:dates", "overdue:offset-a", { dueAt: "2026-09-17T08:59:59.999+09:00", plannedDate: "2026-09-22" }),
      task("actor:dates", "overdue:offset-b", { dueAt: "2026-09-16T23:59:59.999Z" }),
      task("actor:dates", "plan-past", { plannedDate: "2026-09-16" }),
      task("actor:dates", "recent:due", { dueAt: "2026-09-23T23:59:59.999+09:00" }),
      task("actor:dates", "recent:plan", { plannedDate: "2026-09-23" }),
      task("actor:dates", "undated"),
      task("actor:dates", "outside:boundary", { dueAt: "2026-09-24T00:00:00.000+09:00" }),
      task("actor:dates", "future", { plannedDate: "2026-09-25" }),
      task("actor:dates", "done", {
        status: "completed",
        completedAt: SNAPSHOT,
        completedBy: "actor:dates",
        completionSource: "user",
      }),
    ];
    for (const value of dated) await save(value);

    const baseline = await loadHomeFacts({ actorId: "actor:dates", snapshotAt: SNAPSHOT }, otherSources({ taskService: service }));
    const actual = await loadHomeFacts({ actorId: "actor:dates", snapshotAt: SNAPSHOT }, otherSources({ taskSummaryReader: reader }));
    assert.deepEqual(actual.tasks, baseline.tasks);
    assert.deepEqual(actual.tasks.groups.map(({ key, count }) => [key, count]), [
      ["overdue", 2], ["plan-past", 1], ["recent", 2], ["undated", 1],
    ]);

    const unicodeIds = ["é", "e\u0301", "中", "10", "2", "A", "a", "!"];
    for (const id of unicodeIds) {
      await save(task("actor:unicode", id, {
        title: id === "!" ? "🙂".repeat(300) : `Unicode ${id}`,
      }));
    }
    const unicodeBaseline = await loadHomeFacts({ actorId: "actor:unicode", snapshotAt: SNAPSHOT }, otherSources({ taskService: service }));
    const unicodeActual = await loadHomeFacts({ actorId: "actor:unicode", snapshotAt: SNAPSHOT }, otherSources({ taskSummaryReader: reader }));
    assert.deepEqual(unicodeActual.tasks, unicodeBaseline.tasks);
    assert.deepEqual(unicodeActual.tasks.items.map(({ id }) => id), ["!", "10", "2"]);
    assert.equal(Array.from(unicodeActual.tasks.items[0]!.title).length, 240);
    assert.equal(unicodeActual.tasks.items[0]!.title.length, 480);
    assert.equal((await service.get({ actorId: "actor:unicode", taskId: "!" }))?.title.length, 600);

    await save(task("actor:bad-date", "bad:day", { dueAt: "2026-02-31T00:00:00.000Z" }));
    await assert.rejects(reader.read("actor:bad-date", WINDOW), /HOME_TASK_SUMMARY_INVALID/);
    const badDate = await loadHomeFacts(
      { actorId: "actor:bad-date", snapshotAt: SNAPSHOT },
      otherSources({ taskSummaryReader: reader }),
    );
    assert.equal(badDate.tasks.state, "unavailable");
    assert.equal(badDate.tasks.count, null);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});

test("real PostgreSQL task summary keeps result bytes bounded as private task data grows", { skip: !DATABASE_URL }, async () => {
  const url = new URL(DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.search, "");
  const schema = `home_task_cost_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({
    connectionString: url.toString(),
    max: 1,
    options: `-c search_path=${schema} -c statement_timeout=30000`,
  });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`insert into orbit_records(
      workspace_id,collection_name,record_id,user_id,source_type,source_id,source_label,
      evidence_ids,target_type,target_id,occurred_at,lifecycle_state,search_text,payload,
      created_at,updated_at
    )
    select 'w','tasks','growth:'||n,'actor:cost','manual','growth','Home task cost',
      '{}'::text[],'task','growth:'||n,$1::timestamptz,'active','',
      jsonb_build_object('version',1,'activities','[]'::jsonb,'task',jsonb_build_object(
        'id','growth:'||n,'accountId','actor:cost','ownerUserId','actor:cost',
        'title',repeat('🙂',300),'notes',repeat('private-body-',80),'status','open',
        'category','work','priority','normal','source','manual','createdAt',$2::text,'updatedAt',$2::text
      )), $1::timestamptz,$1::timestamptz
    from generate_series(1,10000) n`, ["2026-09-16T12:00:00.000Z", "2026-09-16T12:00:00.000Z"]);

    let queryCount = 0;
    let resultBytes = 0;
    const reader = createHomeTaskSummaryReader({
      workspaceId: "w",
      client: {
        async query<TRow>(text, values) {
          const result = await pool.query(text, values as unknown[]);
          queryCount += 1;
          resultBytes += Buffer.byteLength(JSON.stringify(result.rows));
          return { rows: result.rows as TRow[] };
        },
      },
    });

    const summary = await reader.read("actor:cost", WINDOW);

    assert.equal(summary.count, 10000);
    assert.deepEqual(summary.groupCounts, { overdue: 0, "plan-past": 0, recent: 0, undated: 10000 });
    assert.equal(summary.items.length, 3);
    assert.equal(Array.from(summary.items[0]!.title).length, 240);
    assert.equal(summary.items[0]!.title.length, 480);
    assert.equal(queryCount, 1);
    assert.ok(resultBytes < 5000, `Expected a compact summary, got ${resultBytes} bytes`);
    assert.ok(!JSON.stringify(summary).includes("private-body"));
    console.log(JSON.stringify({ metric: "home_task_summary", count: summary.count, resultBytes, queryCount }));
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});
