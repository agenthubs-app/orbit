import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool } from "pg";

import {
  countLegacyChatRecords,
  deleteLegacyChatRecords,
} from "../../features/chat/storage/legacy-chat-cleanup";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

/** Sprint 0104: the legacy chat cleanup against a real PostgreSQL schema. */

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const schema = `legacy_chat_cleanup_${randomUUID().replaceAll("-", "")}`;
const TARGET = `workspace:legacy-cleanup-target:${schema}`;
const OTHER = `workspace:legacy-cleanup-other:${schema}`;

let admin: Pool;
let client: TransactionalPostgresClient;

function row(workspaceId: string, collectionName: string, recordId: string): LiveRecord<Record<string, unknown>> {
  const at = "2026-09-20T00:00:00.000Z";
  return {
    collectionName, createdAt: at, evidenceIds: [], lifecycleState: "active", occurredAt: at, payload: { id: recordId },
    provider: "fixture", providerRecordId: recordId, recordId, searchText: "", sourceId: recordId, sourceLabel: "fixture",
    sourceType: "manual", updatedAt: at, workspaceId,
  };
}

before(async () => {
  if (skip) return;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl!).hostname), "Local database only");
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool });
  await runOrbitRecordsMigration(client);
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  for (const record of [
    row(TARGET, "conversations", "conversation_001"), row(TARGET, "conversations", "conversation_002"),
    row(TARGET, "messages", "message_0001"), row(TARGET, "messages", "message_0002"), row(TARGET, "messages", "message_0003"),
    row(TARGET, "contacts", "contact_001"), row(TARGET, "relationshipConversationDrafts", "relationship-draft:1"),
    row(OTHER, "conversations", "conversation_001"), row(OTHER, "messages", "message_0001"),
  ]) await store.upsertRecord(record);
}, { timeout: 120_000 });

after(async () => {
  if (skip) return;
  try { await client.close(); } catch { /* already closed */ }
  try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
});

async function counts(workspaceId: string) {
  return Object.fromEntries((await client.query<{ collection_name: string; n: number }>(
    "select collection_name, count(*)::int as n from orbit_records where workspace_id=$1 group by 1 order by 1", [workspaceId],
  )).rows.map((item) => [item.collection_name, item.n]));
}

test("cleanup deletes only the target workspace's legacy chat rows and is idempotent", { skip, timeout: 60_000 }, async () => {
  assert.deepEqual(await countLegacyChatRecords(client, TARGET), { conversations: 2, messages: 3 });
  const first = await deleteLegacyChatRecords(client, TARGET);
  assert.deepEqual(first, { counts: { conversations: 2, messages: 3 }, deleted: 5 });
  assert.deepEqual(await counts(TARGET), { contacts: 1, relationshipConversationDrafts: 1 });
  assert.deepEqual(await counts(OTHER), { conversations: 1, messages: 1 }, "other workspaces are untouched");

  const second = await deleteLegacyChatRecords(client, TARGET);
  assert.deepEqual(second, { counts: { conversations: 0, messages: 0 }, deleted: 0 });
});
