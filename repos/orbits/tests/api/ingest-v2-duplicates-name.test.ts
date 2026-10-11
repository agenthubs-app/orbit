/**
 * R12：名片 v2 `duplicates` 接口在原有候选之外追加「同名」候选（`matchedOn: ['name']`、`identical: false`），
 * 原有候选（邮箱 / 电话 / 姓名 + 公司）完全不变。纯函数断言 + 一条真实 PostgreSQL 往返。
 */
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createIngestV2DuplicateCandidatesHandler, type IngestV2Runtime } from "../../app/api/contact-drafts/business-card/batches/v2/handlers";
import { createFilesystemDerivativeStore } from "../../features/acquisition/business-card-ingest-v2/derivative-store";
import { runBusinessCardIngestV2Migrations } from "../../features/acquisition/business-card-ingest-v2/migrations";
import { createBusinessCardIngestRepository } from "../../features/acquisition/business-card-ingest-v2/repository";
import { findContactCandidate } from "../../features/contacts/business-card-contact-match";
import { findCardDuplicateCandidate, findNameOnlyCandidates } from "../../features/contacts/contact-duplicate-candidates";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const ACTOR = "actor:test";
const WS = "workspace:test";

function contact(id: string, owner: string, payload: Record<string, unknown>): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: "contacts", createdAt: "2026-10-01T00:00:00.000Z", evidenceIds: [], lifecycleState: "active",
    payload: { id, ...payload }, recordId: id, sourceId: "s", sourceType: "business_card_ocr",
    updatedAt: "2026-10-01T00:00:00.000Z", userId: owner, workspaceId: WS,
  };
}

const card = (overrides: Record<string, string> = {}) => ({ address: "", displayName: "佐々木 芳邦", email: "", organization: "TEN法律事務所", phone: "", role: "", ...overrides });

const RECORDS = [
  contact("c:full", ACTOR, { displayName: "佐々木 芳邦", organization: "TEN法律事務所", primaryPhone: "090-1838-1818" }),
  contact("c:name-only", ACTOR, { displayName: "佐々木芳邦" }),
  contact("c:bob", "actor:bob", { displayName: "佐々木 芳邦" }),
];

test("an existing match is returned unchanged (no name candidate replaces it)", () => {
  const original = findContactCandidate(RECORDS, ACTOR, card());
  assert.deepEqual(findCardDuplicateCandidate(RECORDS, ACTOR, card()), original);
  assert.deepEqual(original?.matchedOn, ["name_organization"]);
});

test("a card that matched nothing gets the same-name candidate, never identical", () => {
  const unmatched = card({ organization: "別の事務所", phone: "03-0000-0000" });
  assert.equal(findContactCandidate(RECORDS, ACTOR, unmatched), null);
  const named = findCardDuplicateCandidate(RECORDS, ACTOR, unmatched);
  assert.equal(named?.contactId, "c:name-only", "the contact without company / email / phone");
  assert.deepEqual(named?.matchedOn, ["name"]);
  assert.equal(named?.identical, false);
  // 两边都有公司且不同的同名人不提示；别人的联系人不出现。
  assert.deepEqual(findNameOnlyCandidates(RECORDS, ACTOR, unmatched).map((c) => c.contactId), ["c:name-only"]);
  assert.equal(findCardDuplicateCandidate(RECORDS, ACTOR, card({ displayName: "別人", organization: "X" })), null);
});

test("duplicates route over PostgreSQL appends the same-name candidate and keeps original candidates", databaseTest, async () => {
  assertLoopbackDatabaseUrl(databaseUrl!);
  const schema = `bc_dup_name_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  try {
    const client = await pool.connect();
    try {
      await runBusinessCardIngestV2Migrations(client);
      await runOrbitRecordsMigration(client);
    } finally {
      client.release();
    }
    for (const record of RECORDS) {
      await pool.query(
        `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, created_at, updated_at)
         values ($1, 'contacts', $2, $3, 'business_card_ocr', 's', 'active', $4::jsonb, now(), now())`,
        [WS, record.recordId, record.userId, JSON.stringify(record.payload)],
      );
    }
    const runtime: IngestV2Runtime = {
      ready: Promise.resolve(),
      repository: createBusinessCardIngestRepository({ pool, workspaceId: WS }),
      store: createFilesystemDerivativeStore({ rootDir: await mkdtemp(join(tmpdir(), "orbit-dup-name-")) }),
      workspaceId: WS,
    };
    const created = await runtime.repository.createBatch({ actorId: ACTOR, idempotencyKey: "dup-name", manifest: [{
      cardId: "card:a", clientDigest: `sha256:${"0".repeat(64)}`, fileName: "a.jpg", mimeType: "image/jpeg", rawSize: 10, seq: 1, side: "front",
    }] });
    const handler = createIngestV2DuplicateCandidatesHandler({ resolveActor: async () => ({ id: ACTOR }), runtime });
    const response = await handler(
      new Request("http://test/duplicates", { body: JSON.stringify({ cards: [
        { cardId: "card:original", fields: card() },
        { cardId: "card:named", fields: card({ organization: "別の事務所", phone: "03-0000-0000" }) },
        { cardId: "card:none", fields: card({ displayName: "別人" }) },
      ] }), method: "POST" }),
      { params: Promise.resolve({ id: created.batch.id }) },
    );
    assert.equal(response.status, 200);
    const matches = ((await response.json()) as { data: { matches: Record<string, { contactId: string; matchedOn: string[]; identical: boolean } | null> } }).data.matches;
    assert.equal(matches["card:original"]?.contactId, "c:full");
    assert.deepEqual(matches["card:original"]?.matchedOn, ["name_organization"]);
    assert.deepEqual([matches["card:named"]?.contactId, matches["card:named"]?.matchedOn, matches["card:named"]?.identical], ["c:name-only", ["name"], false]);
    assert.equal(matches["card:none"], null);
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
    await admin.end();
  }
});
