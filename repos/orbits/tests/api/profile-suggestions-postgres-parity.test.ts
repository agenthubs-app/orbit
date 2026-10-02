/**
 * W0042 SC-03：接口与 App 行为不变（接口级并跑）。
 *
 * 同一快照数据 seed 进两个独立随机 schema：旧 provider（PG store 整 workspace + JS 过滤）读写 schema A，
 * 新 provider（`createTransactionalStorageProfileSignalProvider`，W0042 读取器）读写 schema B。固定 `now`，
 * 两边各装进 `createLiveProfileSignalReviewQueueService`，逐步比对完整 JSON 与写入的决定记录；
 * 新读取器的调用次数按它的 SQL 标记计。最后三个 handler 走 configured 路径，读取异常时 reject。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createLiveProfileSignalReviewQueueService } from "../../features/profile/live-signal-service";
import {
  createStorageProfileSignalProvider,
  createTransactionalStorageProfileSignalProvider,
} from "../../features/profile/storage/profile-signal-live-record-provider";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { MOCK_FIXTURE_COLLECTION_NAMES } from "../../shared/mock/fixtures";
import {
  createConfiguredTransactionalPostgresRuntime,
  createTransactionalPostgresClient,
} from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const WORKSPACE = "workspace:w0042-parity";
const ACTOR = "account_orbit_generated";
const SEEDED_AT = "2026-07-02T05:00:00.000Z";
const READER_MARK = "w0042-profile-signal-graph";
const SOURCE_LABEL = "Profile signal parity storage";

if (databaseUrl) assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "PG tests must target localhost");

async function seededSchema(prefix: string) {
  assert.ok(databaseUrl);
  const schema = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema}` });
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  const statements: string[] = [];
  const client: LiveRecordSqlClient = {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      statements.push(text);
      return { rows: (await pool.query(text, values as unknown[])).rows as TRow[] };
    },
  };
  await seedGeneratedRelationshipFixturesIntoLiveStore({
    collectionNames: MOCK_FIXTURE_COLLECTION_NAMES,
    now: () => SEEDED_AT,
    store: createPostgresLiveRecordStore({ client }),
    workspaceId: WORKSPACE,
  });
  // The generated rows share timestamps; ties may legitimately order differently between the
  // whole-workspace read and the actor read (W0042 accepted difference). Give every row distinct
  // sort keys, identically on both schemas, so the full JSON comparison is exact.
  await pool.query(
    `update orbit_records o
        set occurred_at = coalesce(o.occurred_at, o.updated_at) + r.n * interval '1 millisecond',
            updated_at = o.updated_at + r.n * interval '1 millisecond'
       from (select collection_name, record_id, row_number() over (order by collection_name, record_id) n
               from orbit_records where workspace_id = $1) r
      where o.workspace_id = $1 and o.collection_name = r.collection_name and o.record_id = r.record_id`,
    [WORKSPACE],
  );
  statements.length = 0;
  return {
    schema, pool, client, statements,
    readerCalls: () => statements.filter((text) => text.includes(READER_MARK)).length / 3,
    decisions: async () => (await pool.query(
      "select record_id, user_id, evidence_ids, target_type, target_id, occurred_at, lifecycle_state, payload, created_at, updated_at from orbit_records where collection_name = 'profileSuggestionDecisions' order by record_id",
    )).rows,
    async close() {
      await pool.end();
      try {
        await admin.query(`drop schema if exists ${schema} cascade`);
      } finally {
        await admin.end();
      }
    },
  };
}

test("W0042 SC-03 (a)(b) PG: list / accept / dismiss JSON and written decisions equal the old provider; reader called only on graph branches", pgSkip, async () => {
  const oldSide = await seededSchema("w0042_parity_old");
  const newSide = await seededSchema("w0042_parity_new");
  try {
    let tick = 0;
    const clock = () => () => new Date(Date.parse("2026-07-03T00:00:00.000Z") + tick * 1000).toISOString();
    const oldService = createLiveProfileSignalReviewQueueService({
      now: clock(),
      provider: createStorageProfileSignalProvider({ sourceLabel: SOURCE_LABEL, store: createPostgresLiveRecordStore({ client: oldSide.client }), workspaceId: WORKSPACE }),
    });
    const transactional = createTransactionalPostgresClient({
      connectionString: databaseUrl!,
      pool: {
        query: (text, values) => {
          newSide.statements.push(text);
          return newSide.pool.query(text, values);
        },
        connect: async () => {
          const connection = await newSide.pool.connect();
          return {
            query: (text: string, values?: unknown[]) => {
              newSide.statements.push(text);
              return connection.query(text, values);
            },
            release: (destroy?: boolean) => connection.release(destroy),
          };
        },
        end: async () => undefined,
      },
    });
    const newService = createLiveProfileSignalReviewQueueService({
      now: clock(),
      provider: createTransactionalStorageProfileSignalProvider({ client: transactional, sourceLabel: SOURCE_LABEL, workspaceId: WORKSPACE }),
    });
    const both = async <T>(label: string, run: (service: typeof oldService) => T | Promise<T>, expectedReaderCalls: number): Promise<T> => {
      tick += 1;
      const readerBefore = newSide.readerCalls();
      const before = await run(oldService);
      const after = await run(newService);
      assert.deepStrictEqual(after, before, label);
      assert.equal(newSide.readerCalls() - readerBefore, expectedReaderCalls, `${label}: new reader calls`);
      return after;
    };

    // (a) list
    let suggestionIds: string[] = [];
    for (const language of ["zh", "ja", "en"]) {
      for (const scenario of [undefined, "success", "empty", "pending"]) {
        const result = await both(`list ${scenario ?? "default"} ${language}`, (s) => s.listUpdateSuggestions({ actorId: ACTOR, scenario, language }), 1);
        if (result.success && scenario === undefined) suggestionIds = result.data.suggestions.map((item) => item.id);
      }
      await both(`list failure ${language}`, (s) => s.listUpdateSuggestions({ actorId: ACTOR, scenario: "failure", language }), 0);
      await both(`list no actor ${language}`, (s) => s.listUpdateSuggestions({ actorId: "  ", language }), 0);
    }
    assert.ok(suggestionIds.length >= 2, "the seeded actor has at least two suggestions");
    const unconfigured = createLiveProfileSignalReviewQueueService({ now: clock(), provider: null });
    tick += 1;
    assert.equal((await unconfigured.listUpdateSuggestions({ actorId: ACTOR })).success, false);
    assert.equal((await unconfigured.acceptUpdateSuggestion(suggestionIds[0]!, { actorId: ACTOR })).success, false);
    assert.equal((await unconfigured.dismissUpdateSuggestion(suggestionIds[0]!, { actorId: ACTOR })).success, false);

    // (b) decisions
    const [first, second] = suggestionIds as [string, string];
    await both("accept first", (s) => s.acceptUpdateSuggestion(first, { actorId: ACTOR, mutationId: "m-accept", language: "en" }), 1);
    await both("accept replay", (s) => s.acceptUpdateSuggestion(first, { actorId: ACTOR, mutationId: "m-accept", language: "en" }), 1);
    await both("dismiss after accept (conflict)", (s) => s.dismissUpdateSuggestion(first, { actorId: ACTOR, mutationId: "m-x" }), 1);
    await both("dismiss second", (s) => s.dismissUpdateSuggestion(second, { actorId: ACTOR, mutationId: "m-dismiss", language: "ja" }), 1);
    await both("dismiss replay", (s) => s.dismissUpdateSuggestion(second, { actorId: ACTOR, mutationId: "m-dismiss", language: "ja" }), 1);
    await both("accept after dismiss (conflict)", (s) => s.acceptUpdateSuggestion(second, { actorId: ACTOR, mutationId: "m-y" }), 1);
    await both("accept legacy mutation id", (s) => s.acceptUpdateSuggestion(second, { actorId: ACTOR }), 1);
    await both("accept not found", (s) => s.acceptUpdateSuggestion("live-profile-suggestion-missing", { actorId: ACTOR }), 1);
    await both("dismiss not found", (s) => s.dismissUpdateSuggestion("live-profile-suggestion-missing", { actorId: ACTOR }), 1);
    await both("accept no actor", (s) => s.acceptUpdateSuggestion(first, { actorId: "" }), 0);
    await both("dismiss no actor", (s) => s.dismissUpdateSuggestion(first, {}), 0);
    await both("list after decisions", (s) => s.listUpdateSuggestions({ actorId: ACTOR }), 1);
    const written = await newSide.decisions();
    assert.equal(written.length, 2);
    assert.deepStrictEqual(written, await oldSide.decisions(), "the same decision records");
  } finally {
    await oldSide.close();
    await newSide.close();
  }
});

test("W0042 SC-03 (c) PG: the three handlers still reject when the configured read throws; structured failures keep their envelope", pgSkip, async () => {
  const side = await seededSchema("w0042_handlers");
  const keys = ["ORBIT_FEATURE_MODE", "ORBIT_MODULE_MODE", "ORBIT_EVENT_DATABASE_URL", "ORBIT_WORKSPACE_ID", "ORBIT_DATABASE_TARGET"] as const;
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const url = new URL(databaseUrl!);
  url.searchParams.set("options", `-c search_path=${side.schema}`);
  try {
    process.env.ORBIT_FEATURE_MODE = "live";
    process.env.ORBIT_MODULE_MODE = "live";
    process.env.ORBIT_EVENT_DATABASE_URL = url.toString();
    process.env.ORBIT_WORKSPACE_ID = WORKSPACE;
    delete process.env.ORBIT_DATABASE_TARGET;
    const { createProfileSuggestionGetHandler } = await import("../../app/api/profile/update-suggestions/handler");
    const { createProfileSuggestionAcceptPostHandler } = await import("../../app/api/profile/update-suggestions/[id]/accept/handler");
    const { createProfileSuggestionDismissPostHandler } = await import("../../app/api/profile/update-suggestions/[id]/dismiss/handler");
    const { profileSuggestionDecisionResponse } = await import("../../app/api/profile/update-suggestions/route-support");
    const resolveActor = async () => ({ id: ACTOR }) as never;
    const get = createProfileSuggestionGetHandler(resolveActor);
    const accept = createProfileSuggestionAcceptPostHandler(resolveActor);
    const dismiss = createProfileSuggestionDismissPostHandler(resolveActor);
    const params = (id: string) => ({ params: Promise.resolve({ id }) });

    // configured (new) path works and a structured failure keeps the old envelope and status
    const ok = await get(new Request("https://orbit.local/api/profile/update-suggestions"));
    assert.equal(ok.status, 200);
    const notFound = await accept(new Request("https://orbit.local/api/profile/update-suggestions/missing/accept", { method: "POST" }), params("missing"));
    const oldNotFound = await createLiveProfileSignalReviewQueueService({
      provider: createStorageProfileSignalProvider({ sourceLabel: "Profile signal Postgres live storage", source: `postgres-live-record-store:profile-signals:${WORKSPACE}`, store: createPostgresLiveRecordStore({ client: side.client }), workspaceId: WORKSPACE }),
    }).acceptUpdateSuggestion("missing", { actorId: ACTOR });
    const reference = profileSuggestionDecisionResponse(oldNotFound, "live");
    assert.equal(notFound.status, reference.status);
    const strip = (body: unknown) => JSON.parse(JSON.stringify(body, (key, value) => (/^(collectedAt|generatedAt|requestId|timestamp|occurredAt)$/u.test(key) ? "<time>" : value)));
    assert.deepEqual(strip(await notFound.json()), strip(await reference.json()));

    // a row with an invalid JSON string payload makes every read throw (unchanged W42-3 semantics)
    await side.pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at)
       values ($1, 'evidence', 'w0042:broken', 'account:stranger', 'manual', 'w0042', $2::jsonb, now(), now())`,
      [WORKSPACE, JSON.stringify("{not json")],
    );
    await assert.rejects(get(new Request("https://orbit.local/api/profile/update-suggestions")), SyntaxError);
    await assert.rejects(accept(new Request("https://orbit.local/api/profile/update-suggestions/x/accept", { method: "POST" }), params("x")), SyntaxError);
    await assert.rejects(dismiss(new Request("https://orbit.local/api/profile/update-suggestions/x/dismiss", { method: "POST" }), params("x")), SyntaxError);
  } finally {
    const runtime = createConfiguredTransactionalPostgresRuntime();
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    await runtime?.client.close();
    await side.close();
  }
});
