/**
 * W0041 SC-02 (c)：首页联系人计数（数据库内一条语句）与旧联系人页模型并跑比对。
 *
 * 旧路径：live 联系人服务 + scope reader + 列表投影 → `contactsPayloadViewModel` → `ledger.knownPeople` 与首页
 * `inProgressCount`（statusLabel 不含 archived）。新路径：`createPostgresHomeContactsSummaryReader`。
 * 每个 actor 各造一组边界数据，结果或异常（错误信息）逐项相等；随机 schema，只删自己的。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { contactsPayloadViewModel } from "../../app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model";
import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import {
  createPostgresContactRecordPageReader,
  createStorageContactGraphProvider,
} from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createPostgresHomeContactsSummaryReader } from "../../features/contacts/storage/home-contacts-summary-postgres-reader";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const WORKSPACE = "workspace:w0041-contacts-summary";
const NOW = "2026-09-20T00:00:00.000Z";

test("W0041 contacts summary reader: one statement bound to workspace and actor; SQL failures propagate", async () => {
  const calls: Array<{ text: string; values: readonly unknown[] }> = [];
  const client: LiveRecordSqlClient = {
    async query<TRow>(text: string, values: readonly unknown[] = []) {
      calls.push({ text, values });
      return { rows: [{ invalid_contact_versions: 0, invalid_connection_versions: 0, ambiguous_contacts: 0, known_people: 3, in_progress: 2, payloads_projectable: true }] as TRow[] };
    },
  };
  assert.deepEqual(await createPostgresHomeContactsSummaryReader({ client, workspaceId: WORKSPACE })("account:a"), { inProgress: 2, knownPeople: 3 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.values, [WORKSPACE, "account:a"]);
  assert.doesNotMatch(calls[0]!.text, /\blimit\b/iu, "no 30-row window: every owned contact is counted");
  const failing: LiveRecordSqlClient = { async query() { throw new Error("summary sql failed"); } };
  await assert.rejects(createPostgresHomeContactsSummaryReader({ client: failing, workspaceId: WORKSPACE })("account:a"), /summary sql failed/u);
  for (const [flag, message] of [
    ["invalid_contact_versions", "Invalid contact lifecycle version"],
    ["invalid_connection_versions", "Invalid connection lifecycle version"],
    ["ambiguous_contacts", "CONTACT_DETAIL_AMBIGUOUS_CONNECTION"],
  ] as const) {
    const flagged: LiveRecordSqlClient = {
      async query<TRow>() {
        return { rows: [{ invalid_contact_versions: 0, invalid_connection_versions: 0, ambiguous_contacts: 0, known_people: 1, in_progress: 1, payloads_projectable: true, [flag]: 1 }] as TRow[] };
      },
    };
    await assert.rejects(createPostgresHomeContactsSummaryReader({ client: flagged, workspaceId: WORKSPACE })("account:a"), new RegExp(message, "u"));
  }
});

function contact(id: string, owner: unknown, extra: Record<string, unknown> = {}) {
  return {
    id, accountId: owner, displayName: `Name ${id}`, stage: "active", source: { type: "manual", id: `src:${id}` },
    evidenceIds: [`evidence:${id}`], createdAt: NOW, updatedAt: NOW, ...extra,
  };
}

function connection(id: string, owner: unknown, contactId: string, extra: Record<string, unknown> = {}) {
  return {
    id, accountId: owner, contactId, stage: "active", summary: `Relationship ${id}`, source: { type: "manual", id: `src:${id}` },
    evidenceIds: [`evidence:${id}`], valueTypes: [], createdAt: NOW, updatedAt: NOW, ...extra,
  };
}

interface Row { collection: "contacts" | "connections"; recordId: string; userId: string | null; payload: unknown; lifecycle?: string }

/** One actor per scenario; `throws` is the old verdict (null = succeeds). */
const scenarios: Array<{ actor: string; rows: (actor: string) => Row[]; throws: RegExp | null }> = [];
const C = (recordId: string, userId: string | null, payload: unknown, lifecycle?: string): Row => ({ collection: "contacts", recordId, userId, payload, lifecycle });
const R = (recordId: string, userId: string | null, payload: unknown, lifecycle?: string): Row => ({ collection: "connections", recordId, userId, payload, lifecycle });

// Rich: 35 counted contacts (archived ones after the 30th), every ownership/validity/stage/override boundary.
scenarios.push({
  actor: "account:rich",
  throws: null,
  rows: (a) => {
    const rows: Row[] = [];
    const stages = ["captured", "reviewing", "active", "needs_follow_up", "nurture"];
    for (let i = 1; i <= 30; i += 1) {
      const extra: Record<string, unknown> = { stage: stages[i % stages.length] };
      if (i === 1) extra.accountId = undefined;
      if (i === 2) extra.accountId = null;
      if (i === 3) extra.lifecycleInitialization = "pending";
      if (i === 4) extra.version = 2;
      if (i === 11) extra.version = 9007199254740991;
      if (i === 12) extra.displayName = "​zero width is not whitespace";
      rows.push(C(`contacts:rich-${i}`, a, contact(`contact:rich-${i}`, a, extra)));
    }
    rows.push(C("contacts:rich-31", a, contact("contact:rich-31", a, { stage: "archived" })));
    rows.push(C("contacts:rich-32", a, contact("contact:rich-32", undefined, { stage: "archived" })));
    rows.push(C("contacts:rich-33", a, contact("contact:rich-33", a, { stage: "active" })));
    rows.push(C("contacts:rich-34", a, contact("contact:rich-34", a, { stage: "archived" })));
    rows.push(C("contacts:rich-35", a, contact("contact:rich-35", a, { stage: "nurture", lifecycleInitialization: "pending" })));
    // never counted
    rows.push(C("contacts:x-name", a, contact("contact:x-name", a, { displayName: "　 \t" })));
    rows.push(C("contacts:x-name-missing", a, contact("contact:x-name-missing", a, { displayName: undefined })));
    rows.push(C("contacts:x-name-number", a, contact("contact:x-name-number", a, { displayName: 7 })));
    rows.push(C("contacts:x-id", a, contact(" ", a)));
    rows.push(C("contacts:x-stage", a, contact("contact:x-stage", a, { stage: "bogus" })));
    rows.push(C("contacts:x-stage-array", a, contact("contact:x-stage-array", a, { stage: ["active"] })));
    rows.push(C("contacts:x-source-type", a, contact("contact:x-source-type", a, { source: { type: "fax", id: "s" } })));
    rows.push(C("contacts:x-source-id", a, contact("contact:x-source-id", a, { source: { type: "manual", id: " " } })));
    rows.push(C("contacts:x-source-array", a, contact("contact:x-source-array", a, { source: ["manual"] })));
    rows.push(C("contacts:x-evidence-blank", a, contact("contact:x-evidence-blank", a, { evidenceIds: ["  ", 3] })));
    rows.push(C("contacts:x-evidence-string", a, contact("contact:x-evidence-string", a, { evidenceIds: "evidence:x" })));
    rows.push(C("contacts:x-created", a, contact("contact:x-created", a, { createdAt: undefined })));
    rows.push(C("contacts:x-updated", a, contact("contact:x-updated", a, { updatedAt: "" })));
    rows.push(C("contacts:x-account-other", a, contact("contact:x-account-other", "account:other")));
    rows.push(C("contacts:x-account-number", a, contact("contact:x-account-number", 123)));
    rows.push(C("contacts:x-user-other", "account:other", contact("contact:x-user-other", a)));
    rows.push(C("contacts:x-user-null", null, contact("contact:x-user-null", a)));
    rows.push(C("contacts:x-deleted", a, contact("contact:x-deleted", a, { version: 0 }), "deleted"));
    // relationships: overrides, non-ambiguous duplicates, foreign / unscoped rows with bad versions
    rows.push(R("connections:rich-33", a, connection("connection:rich-33", a, "contact:rich-33", { stage: "archived", version: 1 })));
    rows.push(R("connections:rich-34", a, connection("connection:rich-34", a, "contact:rich-34", { stage: "active", lifecycleInitialization: "ready" })));
    rows.push(R("connections:rich-35", a, connection("connection:rich-35", a, "contact:rich-35", { stage: "archived", version: 1 })));
    rows.push(R("connections:rich-5a", a, connection("connection:rich-5a", a, "contact:rich-5", { stage: "archived" })));
    rows.push(R("connections:rich-5b", a, connection("connection:rich-5b", a, "contact:rich-5", { stage: "archived", lifecycleInitialization: "weird" })));
    rows.push(R("connections:rich-6a", a, connection("connection:rich-6a", a, "contact:rich-6", { stage: "archived", version: 1 })));
    rows.push(R("connections:rich-6b", a, connection("connection:rich-6b", a, "contact:rich-6", { version: 1, summary: " " })));
    rows.push(R("connections:x-name-a", a, connection("connection:x-name-a", a, "contact:x-name", { version: 1 })));
    rows.push(R("connections:x-name-b", a, connection("connection:x-name-b", a, "contact:x-name", { version: 2 })));
    rows.push(R("connections:rich-7", a, connection("connection:rich-7", a, "contact:rich-7", { stage: "captured", version: 1 })));
    rows.push(R("connections:rich-8", a, connection("connection:rich-8", a, "contact:rich-8", { stage: "archived", lifecycleInitialization: "pending", version: 1 })));
    rows.push(R("connections:rich-9-foreign", "account:other", connection("connection:rich-9-foreign", a, "contact:rich-9", { stage: "archived", version: 0 })));
    rows.push(R("connections:rich-10-account", a, connection("connection:rich-10-account", "account:other", "contact:rich-10", { stage: "archived", version: 0 })));
    rows.push(R("connections:rich-13-null-account", a, connection("connection:rich-13-null-account", null, "contact:rich-13", { stage: "archived", version: 1 })));
    rows.push(R("connections:unscoped", a, connection("connection:unscoped", a, "contact:not-mine", { version: 0 })));
    rows.push(R("connections:rich-14-deleted", a, connection("connection:rich-14-deleted", a, "contact:rich-14", { version: "x" }), "deleted"));
    rows.push(R("connections:rich-15-other-collection", a, { contactId: "contact:rich-15" }));
    return rows;
  },
});
// Own data that must keep failing, with the same message.
for (const [name, version] of [["null", null], ["zero", 0], ["negative", -1], ["fraction", 1.5], ["string", "1"], ["boolean", true], ["unsafe", 9007199254740992], ["object", {}]] as const) {
  scenarios.push({ actor: `account:contact-version-${name}`, throws: /^Invalid contact lifecycle version$/u, rows: (a) => [
    C("contacts:ok", a, contact("contact:ok", a)),
    C("contacts:bad", a, contact("contact:bad", a, { version, displayName: " " })),
  ] });
}
scenarios.push({ actor: "account:relationship-version", throws: /^Invalid connection lifecycle version$/u, rows: (a) => [
  C("contacts:ok", a, contact("contact:ok", a)),
  R("connections:bad", a, connection("connection:bad", a, "contact:ok", { version: 0 })),
] });
scenarios.push({ actor: "account:relationship-version-invalid-contact", throws: /^Invalid connection lifecycle version$/u, rows: (a) => [
  C("contacts:invalid", a, contact("contact:invalid", a, { displayName: "" })),
  R("connections:bad", a, connection("connection:bad", a, "contact:invalid", { version: null, summary: "" })),
] });
scenarios.push({ actor: "account:both-versions", throws: /^Invalid contact lifecycle version$/u, rows: (a) => [
  C("contacts:bad", a, contact("contact:bad", a, { version: 0 })),
  R("connections:bad", a, connection("connection:bad", a, "contact:bad", { version: 0 })),
] });
scenarios.push({ actor: "account:ambiguous-after-30", throws: /^CONTACT_DETAIL_AMBIGUOUS_CONNECTION$/u, rows: (a) => {
  const rows: Row[] = [];
  for (let i = 1; i <= 35; i += 1) rows.push(C(`contacts:${i}`, a, contact(`contact:${i}`, a, { stage: i > 30 ? "archived" : "active" })));
  rows.push(R("connections:33a", a, connection("connection:33a", a, "contact:33", { version: 1 })));
  rows.push(R("connections:33b", a, connection("connection:33b", a, "contact:33")));
  return rows;
} });
scenarios.push({ actor: "account:ambiguous-ready", throws: /^CONTACT_DETAIL_AMBIGUOUS_CONNECTION$/u, rows: (a) => [
  C("contacts:1", a, contact("contact:1", a)),
  R("connections:1a", a, connection("connection:1a", a, "contact:1", { lifecycleInitialization: "ready" })),
  R("connections:1b", a, connection("connection:1b", a, "contact:1")),
] });
scenarios.push({ actor: "account:duplicates-one-invalid", throws: null, rows: (a) => [
  C("contacts:1", a, contact("contact:1", a, { stage: "active" })),
  R("connections:1a", a, connection("connection:1a", a, "contact:1", { version: 1, stage: "archived" })),
  R("connections:1b", a, connection("connection:1b", a, "contact:1", { version: 1, source: { type: "fax", id: "x" } })),
] });
scenarios.push({ actor: "account:duplicates-invalid-contact", throws: null, rows: (a) => [
  C("contacts:1", a, contact("contact:1", a, { stage: "bogus" })),
  C("contacts:2", a, contact("contact:2", a)),
  R("connections:1a", a, connection("connection:1a", a, "contact:1", { version: 1 })),
  R("connections:1b", a, connection("connection:1b", a, "contact:1", { version: 2 })),
] });
scenarios.push({ actor: "account:duplicates-missing-contact", throws: null, rows: (a) => [
  C("contacts:2", a, contact("contact:2", a)),
  R("connections:1a", a, connection("connection:1a", a, "contact:gone", { version: 1 })),
  R("connections:1b", a, connection("connection:1b", a, "contact:gone", { version: 2 })),
] });
scenarios.push({ actor: "account:array-payload", throws: /jsonb_each/u, rows: (a) => [
  C("contacts:ok", a, contact("contact:ok", a)),
  C("contacts:array", a, [1, 2]),
] });
scenarios.push({ actor: "account:nobody", throws: null, rows: () => [] });

test("W0041 PG home contacts summary equals the old contacts page model on every boundary (counts and failures)", pgSkip, async () => {
  assert.ok(databaseUrl);
  const schema = `w0041_contacts_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const statements: string[] = [];
  let bytes = 0;
  const client: LiveRecordSqlClient = {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      statements.push(text);
      const result = await pool.query(text, values as unknown[]);
      bytes += Buffer.byteLength(JSON.stringify(result.rows));
      return { rows: result.rows as TRow[] };
    },
  };
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    let sequence = 0;
    for (const scenario of scenarios) {
      for (const row of scenario.rows(scenario.actor)) {
        sequence += 1;
        const stamp = new Date(Date.parse(NOW) + sequence * 1000).toISOString();
        await pool.query(
          `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, payload, created_at, updated_at, occurred_at, lifecycle_state)
           values ($1, $2, $3, $4, 'manual', 'w0041', '{}', $5::jsonb, $6, $6, $6, $7)`,
          [WORKSPACE, row.collection, `${scenario.actor}/${row.recordId}`, row.userId, JSON.stringify(row.payload), stamp, row.lifecycle ?? "active"],
        );
      }
    }
    // somebody else's broken rows never affect an actor
    await pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, payload, created_at, updated_at)
       values ($1, 'contacts', 'foreign/bad', 'account:stranger', 'manual', 'x', '{"id":"contact:rich-1","version":0}'::jsonb, now(), now()),
              ($1, 'contacts', 'foreign/array', 'account:stranger', 'manual', 'x', '[1]'::jsonb, now(), now())`,
      [WORKSPACE],
    );
    const store = createPostgresLiveRecordStore({ client });
    const oldService = createLiveContactsListSearchAndFilterService({
      provider: createStorageContactGraphProvider({
        contactRecordPageReader: createPostgresContactRecordPageReader({ client, workspaceId: WORKSPACE }),
        contactScopeRecordReader: createPostgresContactScopeRecordReader({ client, workspaceId: WORKSPACE }),
        store,
        workspaceId: WORKSPACE,
      }),
    });
    const newReader = createPostgresHomeContactsSummaryReader({ client, workspaceId: WORKSPACE });
    const oldCounts = async (actorId: string) => {
      // exactly the home's former input: the contacts page model with no search params
      const result = await oldService.listContacts({ query: null, sourceFilters: [], statusFilters: [], tagFilters: [], valueFilters: [], actorId });
      assert.equal(result.success, true);
      if (!result.success) throw new Error("unexpected structured failure");
      const payload = contactsPayloadViewModel({ payload: result.data, reviewActionRequested: false });
      return {
        inProgress: payload.contacts.filter((item) => !/archived/i.test(item.statusLabel)).length,
        knownPeople: payload.ledger.knownPeople,
      };
    };
    const settle = async <T>(read: () => Promise<T>) => {
      try {
        return { ok: true as const, value: await read() };
      } catch (error) {
        return { ok: false as const, message: (error as Error).message };
      }
    };
    for (const scenario of scenarios) {
      const before = await settle(() => oldCounts(scenario.actor));
      statements.length = 0;
      bytes = 0;
      const after = await settle(() => newReader(scenario.actor));
      if (scenario.throws) {
        assert.equal(before.ok, false, `old rejects for ${scenario.actor}`);
        if (!before.ok) assert.match(before.message, scenario.throws, `old message for ${scenario.actor}`);
      } else {
        assert.equal(before.ok, true, `old succeeds for ${scenario.actor}: ${before.ok ? "" : before.message}`);
      }
      assert.equal(after.ok, before.ok, `same verdict for ${scenario.actor}`);
      if (before.ok && after.ok) assert.deepEqual(after.value, before.value, `same counts for ${scenario.actor}`);
      if (!before.ok && !after.ok) assert.equal(after.message, before.message, `same error for ${scenario.actor}`);
      assert.equal(statements.length, 1, `one statement for ${scenario.actor}`);
      if (after.ok) assert.ok(bytes < 400, `a single small row for ${scenario.actor} (${bytes} B)`);
    }
    const rich = await newReader("account:rich");
    assert.equal(rich.knownPeople, 35, "35 counted contacts (a zero-width space is not whitespace), no 30-row window");
    assert.ok(rich.inProgress < rich.knownPeople);
    // whitespace around the actor is trimmed by the service, not the reader; a padded id owns nothing
    assert.deepEqual(await newReader(" account:rich "), { inProgress: 0, knownPeople: 0 });
  } finally {
    await pool.end();
    try {
      await admin.query(`drop schema if exists ${schema} cascade`);
    } finally {
      await admin.end();
    }
  }
});
