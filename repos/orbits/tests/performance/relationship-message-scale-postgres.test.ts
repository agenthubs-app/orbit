import assert from "node:assert/strict";
import test from "node:test";
import { createRelationshipBoundedReader } from "../../features/relationship-communication/bounded-reader";
import { readRelationshipUnreadSummary } from "../../features/relationship-communication/unread-summary";
import { SYNC_COMMIT_ORDER_LOCK_SQL } from "../../features/sync/commit-order-lock";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { connect, createRelationshipHarness, relationshipTestDatabaseUrl } from "../support/relationship-message-harness";

/**
 * Sprint 0109 SC-01: the inbox list, the unread badge and a message page read
 * only the caller's rows. Heavy (100 000 users by default), so it runs only when
 * ORBIT_RELATIONSHIP_SCALE_USERS is set together with the test database URL:
 *   ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://localhost:5432/orbit_test \
 *   ORBIT_RELATIONSHIP_SCALE_USERS=100000 npx tsx --test tests/performance/relationship-message-scale-postgres.test.ts
 * The same reads are timed at 1 000 users and after growing to the target, and
 * the real reader SQL is EXPLAINed (ANALYZE, BUFFERS) at the target size.
 */
const target = Number(process.env.ORBIT_RELATIONSHIP_SCALE_USERS ?? 0);
const skip = relationshipTestDatabaseUrl && target >= 2000 ? false : "Set ORBIT_LIFECYCLE_TEST_DATABASE_URL and ORBIT_RELATIONSHIP_SCALE_USERS (>= 2000) to run the scale check";
const MESSAGES_PER_CONVERSATION = 5;

test("inbox list, unread badge and message page keep their plans and timings from 1 000 users to the target", { skip, timeout: 900_000 }, async (t) => {
  const h = await createRelationshipHarness({ prefix: "rel_scale", poolSize: 2 });
  t.after(() => h.close());
  const person = (id: string) => ({ accountId: id, displayName: id, email: `${id}@example.test` });
  // The probe account: 30 real conversations with 40 messages each, through the product write path.
  const probe = person("probe");
  const probeConversations: string[] = [];
  for (let n = 0; n < 30; n++) {
    const peer = person(`peer-${n}`);
    const { conversationId, qualificationVersion } = await connect(h, probe, peer, `contact:peer-${n}`);
    probeConversations.push(conversationId);
    for (let m = 0; m < 40; m++) {
      const who = m % 3 === 0 ? probe : peer;
      await h.service(who).sendMessage({ conversationId, qualificationVersion, requestId: `${n}:${m}`, body: `message ${m} in ${n}` });
    }
  }
  // A long history in the first probe conversation: a page must read 30 rows, not the conversation.
  await h.client.transaction(async (tx) => {
    await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
    await tx.query(`insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
      select workspace_id, conversation_id, 40 + n, 'history:'||n, sender_account_id, sender_display_name, body, sent_at + (n||' ms')::interval, qualification_version, 'history:'||n
      from relationship_messages cross join generate_series(1, 5000) n where conversation_id = $1 and seq = 40`, [probeConversations[0]]);
    await tx.query("update relationship_conversations set last_message_seq = 5040 where conversation_id = $1", [probeConversations[0]]);
  });
  const populate = async (from: number, to: number) => {
    await h.client.transaction(async (tx) => {
      await tx.query(SYNC_COMMIT_ORDER_LOCK_SQL);
      // Users u(2k-1) and u(2k) share conversation k.
      await tx.query(`insert into relationship_conversations (workspace_id, conversation_id, inviter_account_id, invitee_account_id, inviter_contact_id, status, qualification_version, last_message_seq, last_message_at, created_at, updated_at)
        select $1, 'scale:'||k, 'u'||(2*k-1), 'u'||(2*k), 'contact:'||k, 'active', 'q', $4, now() - (k||' seconds')::interval, now() - interval '1 day', now()
        from generate_series($2::int, $3::int) k`, [h.workspaceId, from, to, MESSAGES_PER_CONVERSATION]);
      await tx.query(`insert into relationship_conversation_members (workspace_id, conversation_id, account_id, display_name, read_seq, unread_count, last_message_at, updated_at)
        select $1, 'scale:'||k, 'u'||(2*k-1+side), 'User '||(2*k-1+side), 0, 2, now() - (k||' seconds')::interval, now()
        from generate_series($2::int, $3::int) k, generate_series(0, 1) side`, [h.workspaceId, from, to]);
      await tx.query(`insert into relationship_messages (workspace_id, conversation_id, seq, message_id, sender_account_id, sender_display_name, body, sent_at, qualification_version, request_id)
        select $1, 'scale:'||k, s, 'scale-message:'||k||':'||s, 'u'||(2*k-1+(s%2)), 'User', repeat('x', 200), now() - (k||' seconds')::interval + (s||' ms')::interval, 'q', 'r'||s
        from generate_series($2::int, $3::int) k, generate_series(1, $4::int) s`, [h.workspaceId, from, to, MESSAGES_PER_CONVERSATION]);
    });
    await h.client.query("analyze relationship_conversations; analyze relationship_conversation_members; analyze relationship_messages");
  };

  const statements: { sql: string; values: readonly unknown[] }[] = [];
  const recording: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) { statements.push({ sql, values: values ?? [] }); return h.client.query<T>(sql, values); } };
  const reader = createRelationshipBoundedReader({ client: recording, workspaceId: h.workspaceId, actorId: probe.accountId, cursorSecret: "relationship-scale-cursor-secret-xxxxxxxxxxxxxx" });
  const operations = {
    inboxList: () => reader.conversations({ limit: 20 }),
    unreadBadge: () => readRelationshipUnreadSummary({ client: recording, workspaceId: h.workspaceId, actorId: probe.accountId }),
    messagePage: () => reader.messages(probeConversations[0]!, { limit: 30 }),
  };
  const time = async () => {
    const out: Record<string, number> = {};
    for (const [name, run] of Object.entries(operations)) {
      await run();
      const samples: number[] = [];
      for (let i = 0; i < 15; i++) { const started = process.hrtime.bigint(); await run(); samples.push(Number(process.hrtime.bigint() - started) / 1e6); }
      samples.sort((a, b) => a - b);
      out[name] = Number(samples[7]!.toFixed(3));
    }
    return out;
  };

  const small = 1000;
  await populate(1, small / 2);
  const before = await time();
  const expected = { list: (await operations.inboxList()).items.length, unread: (await operations.unreadBadge()).unreadTotal, page: (await operations.messagePage()).items.length };
  await populate(small / 2 + 1, target / 2);
  const counts = (await h.client.query<{ c: string; m: string; x: string }>("select (select count(*) from relationship_conversations)::text c, (select count(*) from relationship_conversation_members)::text m, (select count(*) from relationship_messages)::text x")).rows[0]!;
  const after = await time();
  assert.deepEqual({ list: (await operations.inboxList()).items.length, unread: (await operations.unreadBadge()).unreadTotal, page: (await operations.messagePage()).items.length }, expected, "the probe's results do not change as other users are added");

  const plans: Record<string, string> = {};
  for (const [name, run] of Object.entries(operations)) {
    statements.length = 0;
    await run();
    const statement = statements[0]!;
    const rows = (await h.client.query<{ "QUERY PLAN": string }>(`explain (analyze, buffers, costs off, timing off) ${statement.sql}`, statement.values)).rows;
    plans[name] = rows.map((row) => row["QUERY PLAN"]).join("\n");
  }
  console.info(JSON.stringify({ metric: "relationship_message_scale", users: { small, target }, rows: counts, medianMs: { before, after } }, null, 1));
  for (const [name, plan] of Object.entries(plans)) console.info(`---- EXPLAIN ${name} at ${target} users\n${plan}`);

  for (const [name, plan] of Object.entries(plans)) {
    assert.doesNotMatch(plan, /Seq Scan on relationship_(conversation_members|messages)\b/, `${name} scans a whole table:\n${plan}`);
  }
  assert.match(plans.inboxList!, /relationship_members_inbox_idx/);
  assert.match(plans.unreadBadge!, /relationship_members_inbox_idx/);
  assert.match(plans.messagePage!, /relationship_messages_pkey/);
  for (const name of Object.keys(operations)) {
    const limit = Math.max(before[name]! * 3, before[name]! + 5);
    assert.ok(after[name]! <= limit, `${name}: ${after[name]} ms at ${target} users vs ${before[name]} ms at ${small}`);
  }
});
