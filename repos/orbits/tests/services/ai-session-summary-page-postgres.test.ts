import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import {
  createStorageOrbitAgentChatSessionProvider,
  orbitAgentChatSessionActorWorkspaceId,
} from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_AGENT_SESSION_TEST_DATABASE_URL;

function isLocalDedicatedTestDatabase(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
    const databaseName = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
    return ["localhost", "127.0.0.1", "::1"].includes(hostname)
      && !url.search
      && databaseName.includes("test");
  } catch {
    return false;
  }
}

const postgresTest = {
  skip: isLocalDedicatedTestDatabase(databaseUrl)
    ? false
    : "Requires an explicit localhost database whose name includes test",
  timeout: 30_000,
};

test("session summary pages stay bounded and enforce actor/filter-bound server pagination", postgresTest, async () => {
  assert.ok(databaseUrl);
  const schema = `ai_session_page_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = `workspace:session-page:${randomUUID()}`;
  const aliceId = "actor:alice";
  const bobId = "actor:bob";
  const aliceWorkspaceId = orbitAgentChatSessionActorWorkspaceId(workspaceId, aliceId);
  const bobWorkspaceId = orbitAgentChatSessionActorWorkspaceId(workspaceId, bobId);
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
    max: 3,
    options: `-c search_path=${schema} -c statement_timeout=15000`,
  });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, max: 3, pool });
  const observed: Array<{ sql: string; rows: number; bytes: number }> = [];
  let observeReads = false;
  const summaryClient = {
    async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
      const result = await client.query<Row>(sql, values);
      if (observeReads && sql.includes("owned_sessions as materialized")) {
        observed.push({ sql, rows: result.rows.length, bytes: Buffer.byteLength(JSON.stringify(result.rows)) });
      }
      return result;
    },
  };
  const secret = "local-test-only-ai-session-page-cursor-secret";
  const createProvider = (actorId: string) => createStorageOrbitAgentChatSessionProvider({
    actorId,
    summaryPageClient: summaryClient,
    summaryPageSecret: secret,
    store: createPostgresLiveRecordStore({ client }),
    workspaceId,
  });
  const alice = createProvider(aliceId);
  const bob = createProvider(bobId);
  const createdAt = "2026-09-25T00:00:00.000Z";

  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    await pool.query(`
      insert into orbit_records (
        workspace_id,collection_name,record_id,user_id,source_type,source_id,
        evidence_ids,lifecycle_state,search_text,payload,created_at,updated_at
      )
      select $1,'orbit_agent_chat_sessions',session_id,$2,'manual',session_id,
        array[]::text[],'active',search_text,
        jsonb_build_object(
          'id',session_id,
          'title',case when n=0 then '标题'||repeat('😀',125) else '会话 '||n end,
          'firstUserMessage',case when n=0 then repeat('🟦',300) else '问题 '||n end,
          'lastMessagePreview',case when n=0 then repeat('🟩',300) else '回答 '||n end,
          'createdAt',(($3::timestamptz - n * interval '1 second')::text),
          'updatedAt',(($3::timestamptz - n * interval '1 second')::text),
          'messageRevision',1,
          'customTitle',case when n=0 then 'legacy-title-that-is-hidden' else null end,
          'pinned',false,
          'messages',jsonb_build_array(jsonb_build_object('role','user','text',
            case when n=0 then repeat('private message body ',600) else 'stored message' end))
        ),
        $3::timestamptz - n * interval '1 second',
        $3::timestamptz - n * interval '1 second'
      from (
        select n,'session-'||lpad(n::text,5,'0') as session_id,
          case when n=10000 then 'oldest-search-marker' else 'question-'||n end as search_text
        from generate_series(0,10000) as n
      ) sessions`, [aliceWorkspaceId, aliceId, createdAt]);
    await pool.query(`
      insert into orbit_records (
        workspace_id,collection_name,record_id,user_id,source_type,source_id,
        evidence_ids,lifecycle_state,payload,created_at,updated_at
      ) values ($1,'orbit_agent_chat_sessions','bob-session',$2,'manual','bob-session',
        array[]::text[],'active',jsonb_build_object('id','bob-session','title','Bob',
          'firstUserMessage','private to Bob','lastMessagePreview','Bob reply',
          'createdAt',$3::text,'updatedAt',$3::text,'messageRevision',0,'pinned',false),$3::timestamptz,$3::timestamptz)`,
    [bobWorkspaceId, bobId, createdAt]);

    await pool.query(`
      insert into orbit_records (
        workspace_id,collection_name,record_id,user_id,source_type,source_id,
        evidence_ids,lifecycle_state,payload,created_at,updated_at
      ) values
        ($1,'orbit_agent_chat_session_organizations','owned-org',$2,'manual','session-00000',
          array[]::text[],'active',jsonb_build_object('sessionId','session-00000','customTitle',null,
            'groupId','group:owned','pinned',true,'revision',3),$3::timestamptz,$3::timestamptz),
        ($1,'orbit_agent_chat_session_organizations','wrong-user-org','actor:bob','manual','session-00001',
          array[]::text[],'active',jsonb_build_object('sessionId','session-00001','customTitle','secret title',
            'groupId','group:secret','pinned',true,'revision',9),$3::timestamptz,$3::timestamptz),
        ($4,'orbit_agent_chat_session_organizations','wrong-workspace-org',$2,'manual','session-00002',
          array[]::text[],'active',jsonb_build_object('sessionId','session-00002','customTitle','foreign title',
            'groupId','group:foreign','pinned',true,'revision',9),$3::timestamptz,$3::timestamptz)`,
    [workspaceId, aliceId, createdAt, `${workspaceId}:foreign`]);

    assert.equal((await pool.query<{ count: string }>(
      "select count(*)::text as count from orbit_records where workspace_id=$1 and collection_name='orbit_agent_chat_sessions'",
      [aliceWorkspaceId],
    )).rows[0]?.count, "10001");

    observed.length = 0;
    observeReads = true;
    const first = await alice.listSessionSummariesPage({ limit: 20 });
    observeReads = false;
    assert.equal(first.items.length, 20);
    assert.equal(first.hasMore, true);
    assert.ok(first.nextCursor);
    assert.equal(first.items[0]?.id, "session-00000");
    assert.equal(first.items[0]?.organization.customTitle, null);
    assert.equal(first.items[0]?.organization.groupId, "group:owned");
    assert.equal(first.items[0]?.organization.pinned, true);
    assert.equal(Array.from(first.items[0]?.title ?? "").length, 120);
    assert.equal(Array.from(first.items[0]?.firstUserText ?? "").length, 240);
    assert.equal(Array.from(first.items[0]?.lastMessagePreview ?? "").length, 240);
    assert.equal(Object.hasOwn(first.items[0]!, "messages"), false);
    assert.equal(Object.hasOwn(first.items[0]!, "origin"), false);
    assert.equal(Object.hasOwn(first.items[0]!, "panel"), false);
    assert.equal(observed.length, 1);
    assert.equal(observed[0]?.rows, 21);
    assert.ok((observed[0]?.bytes ?? Infinity) < 32_000, "only bounded summaries should leave PostgreSQL");
    assert.doesNotMatch(observed[0]?.sql ?? "", /orbit_agent_chat_messages/u);

    const second = await alice.listSessionSummariesPage({ cursor: first.nextCursor, limit: 20 });
    assert.equal(second.items.length, 20);
    assert.equal(second.items.some((item) => first.items.some((previous) => previous.id === item.id)), false);
    assert.ok(second.items[0]!.createdAt < first.items.at(-1)!.createdAt);

    const oldest = await alice.listSessionSummariesPage({ limit: 20, q: "oldest-search-marker" });
    assert.deepEqual(oldest.items.map((item) => item.id), ["session-10000"]);
    assert.equal(oldest.hasMore, false);

    const pinned = await alice.listSessionSummariesPage({ limit: 20, pinned: true });
    assert.deepEqual(pinned.items.map((item) => item.id), ["session-00000"]);
    const inOwnedGroup = await alice.listSessionSummariesPage({ limit: 20, groupId: "group:owned" });
    assert.deepEqual(inOwnedGroup.items.map((item) => item.id), ["session-00000"]);
    const ungrouped = await alice.listSessionSummariesPage({ limit: 20, groupId: "ungrouped" });
    assert.equal(ungrouped.items.some((item) => item.id === "session-00000"), false);
    assert.equal((await alice.listSessionSummariesPage({ limit: 20, q: "legacy-title-that-is-hidden" })).items.length, 0);

    await assert.rejects(alice.listSessionSummariesPage({ cursor: first.nextCursor, groupId: "group:owned", limit: 20 }), /SESSION_PAGE_CURSOR_INVALID/u);
    await assert.rejects(alice.listSessionSummariesPage({ cursor: first.nextCursor, q: "changed-filter", limit: 20 }), /SESSION_PAGE_CURSOR_INVALID/u);
    await assert.rejects(bob.listSessionSummariesPage({ cursor: first.nextCursor, limit: 20 }), /SESSION_PAGE_CURSOR_INVALID/u);
    await assert.rejects(alice.listSessionSummariesPage({ cursor: `${first.nextCursor}x`, limit: 20 }), /SESSION_PAGE_CURSOR_INVALID/u);
    await assert.rejects(alice.listSessionSummariesPage({ limit: 51 }), /SESSION_PAGE_INPUT_INVALID/u);

    const bobPage = await bob.listSessionSummariesPage({ limit: 20 });
    assert.deepEqual(bobPage.items.map((item) => item.id), ["bob-session"]);
    assert.equal(bobPage.items.some((item) => item.id.startsWith("session-")), false);
  } finally {
    observeReads = false;
    await client.close();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});
