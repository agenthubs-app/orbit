import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { loadRelationshipLifecycleTasks } from "../../app/(app)/app/tasks/relationship-lifecycle-tasks";
import {
  createRelationshipLifecycleFactsReader,
  RELATIONSHIP_LIFECYCLE_FACTS_SQL,
} from "../../features/followups/storage/relationship-lifecycle-facts-reader";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_W5_F_TEST_DATABASE_URL;
const databaseTest = {
  skip: databaseUrl ? false : "ORBIT_W5_F_TEST_DATABASE_URL is not configured",
};
const workspaceId = "workspace:w5-f-postgres";
const actorId = "actor:w5-f-postgres";
const foreignActor = "actor:w5-f-foreign";
const at = "2026-09-17T00:00:00.000Z";
const source = { type: "manual", id: "source:w5-f-pg", label: "W5 PG" };

function assertApprovedLoopbackDatabase(urlValue: string): URL {
  const parsed = new URL(urlValue);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  assert.ok(
    parsed.protocol === "postgresql:" || parsed.protocol === "postgres:",
    "W5 F PostgreSQL URL must use a postgres protocol",
  );
  assert.equal(parsed.search, "", "W5 F PostgreSQL URL must not contain query overrides");
  assert.equal(parsed.hash, "", "W5 F PostgreSQL URL must not contain fragment overrides");
  assert.ok(
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1",
    "W5 F PostgreSQL must be loopback-only",
  );
  assert.equal(
    decodeURIComponent(parsed.pathname.replace(/^\//u, "")),
    "orbit_w5_f_test",
    "W5 F PostgreSQL database must be orbit_w5_f_test",
  );
  return parsed;
}

function schemaName(): string {
  return `w5_f_${randomUUID().replaceAll("-", "")}`;
}

function assertApprovedSchema(schema: string): void {
  assert.match(schema, /^w5_f_[0-9a-f]{32}$/u);
}

function record(
  collectionName: string,
  recordId: string,
  payload: Record<string, unknown>,
  options: Partial<LiveRecord> = {},
): LiveRecord {
  return {
    workspaceId,
    collectionName,
    recordId,
    userId: actorId,
    sourceType: "manual",
    sourceId: "source:w5-f-pg",
    sourceLabel: "W5 PG",
    provider: "w5-f-test",
    providerRecordId: recordId,
    evidenceIds: ["evidence:w5-f-pg"],
    targetType: null,
    targetId: null,
    occurredAt: at,
    lifecycleState: "active",
    searchText: "PRIVATE SEARCH SHOULD NOT LEAK",
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    payload,
    ...options,
  };
}

function taskPayload(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    title: `Task ${id}`,
    status: "open",
    contactId: "contact:shared",
    connectionId: "connection:shared",
    dueAt: "2026-09-18T01:00:00.000Z",
    source,
    evidenceIds: ["evidence:w5-f-pg"],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function connectionPayload(
  id: string,
  contactId: string,
  accountId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    accountId,
    contactId,
    stage: "active",
    summary: `Connection ${id}`,
    source,
    evidenceIds: ["evidence:w5-f-pg"],
    createdAt: at,
    updatedAt: at,
    ...overrides,
  };
}

function contactPayload(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    displayName: `Contact ${id}`,
    organization: "Orbit Labs",
    stage: "active",
    source,
    evidenceIds: ["evidence:w5-f-pg"],
    createdAt: at,
    updatedAt: at,
    notes: "PRIVATE NOTES MUST NOT CROSS THE READER",
    primaryEmail: "private@example.test",
    primaryPhone: "+81-00-0000-0000",
    profileSnippet: "PRIVATE PROFILE MUST NOT CROSS THE READER",
    ...overrides,
  };
}

async function insert(pool: Pool, row: LiveRecord): Promise<void> {
  await pool.query(
    `insert into orbit_records (
      workspace_id, collection_name, record_id, user_id, source_type, source_id,
      source_label, provider, provider_record_id, evidence_ids, target_type,
      target_id, occurred_at, lifecycle_state, search_text, payload, created_at,
      updated_at, deleted_at
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      row.workspaceId,
      row.collectionName,
      row.recordId,
      row.userId ?? null,
      row.sourceType,
      row.sourceId,
      row.sourceLabel ?? null,
      row.provider ?? null,
      row.providerRecordId ?? null,
      [...row.evidenceIds],
      row.targetType ?? null,
      row.targetId ?? null,
      row.occurredAt ?? null,
      row.lifecycleState,
      row.searchText ?? "",
      row.payload,
      row.createdAt,
      row.updatedAt,
      row.deletedAt ?? null,
    ],
  );
}

async function withDatabase(
  operation: (input: { pool: Pool; workspaceId: string; actorId: string; schema: string }) => Promise<void>,
): Promise<void> {
  assert.ok(databaseUrl);
  const approvedUrl = assertApprovedLoopbackDatabase(databaseUrl);
  const schema = schemaName();
  const admin = new Pool({ connectionString: approvedUrl.toString(), max: 1, connectionTimeoutMillis: 2_000 });
  const pool = new Pool({
    connectionString: approvedUrl.toString(),
    max: 4,
    connectionTimeoutMillis: 2_000,
    options: `-c search_path=${schema} -c statement_timeout=10000`,
  });
  let schemaCreated = false;
  try {
    assertApprovedSchema(schema);
    await admin.query(`create schema ${schema}`);
    schemaCreated = true;
    const created = await admin.query<{ schema_name: string }>(
      "select schema_name from information_schema.schemata where schema_name = $1",
      [schema],
    );
    assert.equal(created.rows[0]?.schema_name, schema);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await operation({ pool, workspaceId, actorId, schema });
  } finally {
    try {
      await pool.end();
    } finally {
      try {
        if (schemaCreated) await admin.query(`drop schema if exists ${schema} cascade`);
      } finally {
        await admin.end();
      }
    }
  }
}

test("PostgreSQL test guard accepts only the approved loopback database", () => {
  assert.doesNotThrow(() => assertApprovedLoopbackDatabase("postgresql://w5_f_owner@127.0.0.1:56149/orbit_w5_f_test"));
  assert.doesNotThrow(() => assertApprovedLoopbackDatabase("postgresql://w5_f_owner@[::1]:56149/orbit_w5_f_test"));
  assert.throws(() => assertApprovedLoopbackDatabase("postgresql://w5_f_owner@192.0.2.10:56149/orbit_w5_f_test"), /loopback/i);
  assert.throws(() => assertApprovedLoopbackDatabase("postgresql://w5_f_owner@127.0.0.1:56149/orbit_w5_f_test?host=evil"), /query/i);
  assert.throws(() => assertApprovedLoopbackDatabase("postgresql://w5_f_owner@127.0.0.1:56149/other"), /orbit_w5_f_test/i);
});

test("PostgreSQL facts reader applies actor/workspace/domain authorization and narrow projection", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    await insert(pool, record("connections", "storage:connection:shared", connectionPayload("connection:shared", "contact:shared", actorId), { userId: null }));
    await insert(pool, record("connections", "storage:connection:non-c", connectionPayload("connection:non-c", "contact:non-c", "account:not-the-actor"), { userId: actorId }));
    await insert(pool, record("contacts", "storage:contact:shared", contactPayload("contact:shared"), { userId: foreignActor }));
    await insert(pool, record("contacts", "storage:contact:non-c", contactPayload("contact:non-c"), { userId: foreignActor }));
    await insert(pool, record("contacts", "storage:contact:owned", contactPayload("contact:owned"), { userId: actorId }));
    await insert(pool, record("contacts", "storage:contact:unrelated", contactPayload("contact:unrelated"), { userId: actorId }));
    await insert(pool, record("tasks", "storage:task:owned", taskPayload("task:owned", { contactId: "contact:owned", connectionId: null })));
    await insert(pool, record("tasks", "storage:task:account", taskPayload("task:account", { contactId: "contact:shared", connectionId: "connection:shared", accountId: actorId }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:non-c", taskPayload("task:non-c", { contactId: "contact:non-c", connectionId: null }), { userId: actorId }));
    await insert(pool, record("tasks", "storage:task:task-only-foreign", taskPayload("task:task-only-foreign", { contactId: "contact:task-only", connectionId: null })));
    await insert(pool, record("contacts", "storage:contact:task-only", contactPayload("contact:task-only"), { userId: foreignActor }));
    await insert(pool, record("tasks", "storage:task:task-only-account-id", taskPayload("task:task-only-account-id", { contactId: "contact:task-only-account-id", connectionId: null, accountId: actorId }), { userId: actorId }));
    await insert(pool, record("contacts", "storage:contact:task-only-account-id", contactPayload("contact:task-only-account-id", { accountId: actorId }), { userId: foreignActor }));
    await insert(pool, record("tasks", "storage:task:bad-number", taskPayload("task:bad-number", { contactId: "contact:bad-number", connectionId: null, accountId: 7 }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:bad-object", taskPayload("task:bad-object", { accountId: { actorId } }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:bad-array", taskPayload("task:bad-array", { accountId: [actorId] }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:bad-null", taskPayload("task:bad-null", { accountId: null }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:foreign", taskPayload("task:foreign", { contactId: "contact:foreign", connectionId: null }), { userId: foreignActor }));
    await insert(pool, record("contacts", "storage:contact:foreign", contactPayload("contact:foreign"), { userId: foreignActor }));
    await insert(pool, record("connections", "storage:connection:foreign", connectionPayload("connection:foreign", "contact:foreign", foreignActor), { userId: foreignActor }));
    await insert(pool, record("connections", "storage:connection:deleted", connectionPayload("connection:deleted", "contact:deleted", actorId), { lifecycleState: "deleted" }));
    await insert(pool, record("contacts", "storage:contact:deleted", contactPayload("contact:deleted"), { userId: foreignActor }));
    await insert(pool, record("tasks", "storage:task:deleted-connection", taskPayload("task:deleted-connection", { contactId: "contact:deleted", connectionId: "connection:deleted" })));
    await insert(pool, record("connections", "storage:connection:cross-workspace", connectionPayload("connection:cross-workspace", "contact:cross-workspace", actorId), { workspaceId: "workspace:foreign" }));
    await insert(pool, record("tasks", "storage:task:cross-workspace", taskPayload("task:cross-workspace", { contactId: "contact:cross-workspace", connectionId: "connection:cross-workspace" })));
    await insert(pool, record("contacts", "storage:contact:cross-workspace", contactPayload("contact:cross-workspace"), { workspaceId: "workspace:foreign" }));
    await insert(pool, record("tasks", "storage:task:deleted", taskPayload("task:deleted"), { lifecycleState: "deleted" }));
    await insert(pool, record("tasks", "storage:task:invalid", taskPayload("task:invalid", { status: "invalid" })));
    await insert(pool, record("contacts", "storage:contact:invalid", contactPayload("contact:invalid", { stage: "invalid" })));

    const reader = createRelationshipLifecycleFactsReader({
      client: pool,
      workspaceId,
      sourceLabel: "W5 PostgreSQL facts",
    });
    const facts = await reader.readRelationshipLifecycleFacts(actorId);

    assert.deepEqual(facts.tasks.map((item) => item.id).sort(), ["task:cross-workspace", "task:deleted-connection", "task:non-c", "task:owned", "task:task-only-account-id", "task:task-only-foreign"]);
    assert.deepEqual(facts.connections.map((item) => item.id), []);
    assert.deepEqual(facts.contacts.map((item) => item.id).sort(), ["contact:owned"]);
    assert.equal(JSON.stringify(facts).includes("PRIVATE"), false);
    assert.equal(JSON.stringify(facts).includes("primaryEmail"), false);
    assert.equal(JSON.stringify(facts).includes("searchText"), false);

    const model = await loadRelationshipLifecycleTasks({ actorId, reader });
    assert.equal(model.state, "success");
    assert.equal(model.currentCount, 1);
    assert.equal(model.orphanCount, 5);
    assert.deepEqual(model.currentTasks.map((item) => item.id).sort(), ["task:owned"]);
    assert.deepEqual(model.orphanTasks.map((item) => item.id).sort(), ["task:cross-workspace", "task:deleted-connection", "task:non-c", "task:task-only-account-id", "task:task-only-foreign"]);
  });
});

test("PostgreSQL reader emits false ownership and true connection authorization for a NULL-owner contact", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    const contactId = "contact:null-owner";
    const connectionId = "connection:full-actor";
    await insert(pool, record(
      "connections",
      "storage:connection:full-actor",
      connectionPayload(connectionId, contactId, actorId),
      { userId: actorId },
    ));
    await insert(pool, record(
      "contacts",
      "storage:contact:null-owner",
      contactPayload(contactId),
      { userId: null },
    ));
    await insert(pool, record(
      "tasks",
      "storage:task:null-owner",
      taskPayload("task:null-owner", { contactId, connectionId: null }),
      { userId: actorId },
    ));

    let queryCount = 0;
    let rawEnvelope: unknown;
    const countingClient = {
      async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
        queryCount += 1;
        const result = await pool.query<TRow>(text, values ? [...values] : undefined);
        rawEnvelope = (result.rows[0] as { envelope?: unknown } | undefined)?.envelope;
        return result;
      },
    };
    const reader = createRelationshipLifecycleFactsReader({ client: countingClient, workspaceId });
    const model = await loadRelationshipLifecycleTasks({ actorId, reader });

    assert.equal(queryCount, 1);
    assert.ok(rawEnvelope);
    const rawContacts = (rawEnvelope as {
      contacts: readonly {
        id: string;
        authorization: { actorOwned: boolean; connectionAuthorized: boolean };
      }[];
    }).contacts;
    assert.deepEqual(rawContacts.find((contact) => contact.id === contactId)?.authorization, {
      actorOwned: false,
      connectionAuthorized: true,
    });
    assert.equal(model.state, "success");
    assert.equal(model.currentCount, 1);
    assert.equal(model.currentTasks[0]?.operationHref, "/app/contacts/contact%3Anull-owner");
  });
});

test("PostgreSQL reader keeps valid statuses and enforces source/evidence decoder parity", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    await insert(pool, record("tasks", "storage:task:valid", taskPayload("task:valid", { status: "scheduled", contactId: "contact:valid", connectionId: "connection:valid", evidenceIds: [1, "evidence:valid", " "] })));
    await insert(pool, record("tasks", "storage:task:completed", taskPayload("task:completed", { status: "completed", contactId: "contact:valid", connectionId: "connection:valid" })));
    await insert(pool, record("tasks", "storage:task:dismissed", taskPayload("task:dismissed", { status: "dismissed", contactId: "contact:valid", connectionId: "connection:valid" })));
    await insert(pool, record("tasks", "storage:task:invalid-source", taskPayload("task:invalid-source", { contactId: "contact:valid", connectionId: "connection:valid", source: { type: "not-source", id: "x" } })));
    await insert(pool, record("tasks", "storage:task:empty-evidence", taskPayload("task:empty-evidence", { contactId: "contact:valid", connectionId: "connection:valid", evidenceIds: [] })));
    await insert(pool, record("tasks", "storage:task:blank-id", taskPayload("task:blank-id", { contactId: "contact:valid", connectionId: "connection:valid", id: " " })));
    await insert(pool, record("tasks", "storage:task:blank-title", taskPayload("task:blank-title", { contactId: "contact:valid", connectionId: "connection:valid", title: " " })));
    await insert(pool, record("connections", "storage:connection:valid", connectionPayload("connection:valid", "contact:valid", actorId)));
    await insert(pool, record("connections", "storage:connection:invalid-id", connectionPayload("connection:invalid-id", "contact:valid", actorId, { id: " " })));
    await insert(pool, record("connections", "storage:connection:invalid-account", connectionPayload("connection:invalid-account", "contact:valid", actorId, { accountId: " " })));
    await insert(pool, record("connections", "storage:connection:invalid-contact", connectionPayload("connection:invalid-contact", "contact:valid", actorId, { contactId: " " })));
    await insert(pool, record("connections", "storage:connection:invalid-summary", connectionPayload("connection:invalid-summary", "contact:valid", actorId, { summary: " " })));
    await insert(pool, record("connections", "storage:connection:invalid-source", connectionPayload("connection:invalid-source", "contact:valid", actorId, { source: { type: "bad", id: "x" } })));
    await insert(pool, record("connections", "storage:connection:invalid-evidence", connectionPayload("connection:invalid-evidence", "contact:valid", actorId, { evidenceIds: [] })));
    await insert(pool, record("contacts", "storage:contact:blank-id", contactPayload("contact:blank-id", { id: " " }), { userId: actorId }));
    await insert(pool, record("contacts", "storage:contact:blank-name", contactPayload("contact:blank-name", { displayName: " " }), { userId: actorId }));
    await insert(pool, record("contacts", "storage:contact:invalid-source", contactPayload("contact:invalid-source", { source: { type: "bad", id: "x" } }), { userId: actorId }));
    await insert(pool, record("contacts", "storage:contact:invalid-evidence", contactPayload("contact:invalid-evidence", { evidenceIds: [] }), { userId: actorId }));
    await insert(pool, record("contacts", "storage:contact:valid", contactPayload("contact:valid"), { userId: actorId }));

    const reader = createRelationshipLifecycleFactsReader({ client: pool, workspaceId });
    const facts = await reader.readRelationshipLifecycleFacts(actorId);

    assert.deepEqual(facts.tasks.map((item) => item.id).sort(), ["task:completed", "task:dismissed", "task:valid"]);
    assert.equal(facts.connections[0]?.id, "connection:valid");
    assert.equal(facts.contacts[0]?.id, "contact:valid");
  });
});

test("PostgreSQL reader fails closed for duplicate domain identity and does not confuse storage record ids", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    await insert(pool, record("connections", "storage:connection:a", connectionPayload("connection:duplicate", "contact:a", actorId)));
    await insert(pool, record("connections", "storage:connection:b", connectionPayload("connection:duplicate", "contact:b", actorId)));
    await insert(pool, record("contacts", "storage:contact:a", contactPayload("contact:a"), { userId: actorId }));
    await insert(pool, record("contacts", "storage:contact:b", contactPayload("contact:b"), { userId: actorId }));
    await insert(pool, record("tasks", "storage:task:duplicate-reference", taskPayload("task:duplicate-reference", { contactId: "contact:a", connectionId: "connection:duplicate" }), { userId: actorId }));
    const reader = createRelationshipLifecycleFactsReader({ client: pool, workspaceId });

    await assert.rejects(reader.readRelationshipLifecycleFacts(actorId), /duplicate|identity|conflict/i);
  });
});

test("PostgreSQL authorization requires a consistent row owner; account aliases never grant access", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    const numericActor = "7";
    await insert(pool, record("tasks", "storage:task:string-account", taskPayload("task:string-account", { accountId: numericActor, contactId: null, connectionId: null }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:number-account", taskPayload("task:number-account", { accountId: 7, contactId: null, connectionId: null }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:object-account", taskPayload("task:object-account", { accountId: { value: numericActor }, contactId: null, connectionId: null }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:array-account", taskPayload("task:array-account", { accountId: [numericActor], contactId: null, connectionId: null }), { userId: null }));
    await insert(pool, record("tasks", "storage:task:owner-wins", taskPayload("task:owner-wins", { accountId: "account:foreign", contactId: null, connectionId: null }), { userId: numericActor }));
    await insert(pool, record("tasks", "storage:task:account-wins", taskPayload("task:account-wins", { accountId: numericActor, contactId: null, connectionId: null }), { userId: foreignActor }));
    await insert(pool, record("connections", "storage:connection:string-account", connectionPayload("connection:string-account", "contact:string-account", numericActor), { userId: null }));
    await insert(pool, record("connections", "storage:connection:number-account", connectionPayload("connection:number-account", "contact:number-account", 7 as unknown as string), { userId: null }));
    await insert(pool, record("connections", "storage:connection:object-account", connectionPayload("connection:object-account", "contact:object-account", numericActor, { accountId: { value: numericActor } as unknown as string }), { userId: null }));
    await insert(pool, record("connections", "storage:connection:owner-wins", connectionPayload("connection:owner-wins", "contact:owner-wins", "account:foreign"), { userId: numericActor }));
    await insert(pool, record("contacts", "storage:contact:string-account", contactPayload("contact:string-account"), { userId: foreignActor }));
    await insert(pool, record("contacts", "storage:contact:owner-wins", contactPayload("contact:owner-wins"), { userId: foreignActor }));
    await insert(pool, record("tasks", "storage:task:connection-reference", taskPayload("task:connection-reference", { accountId: numericActor, contactId: "contact:string-account", connectionId: "connection:string-account" }), { userId: numericActor }));
    await insert(pool, record("tasks", "storage:task:non-c-contact", taskPayload("task:non-c-contact", { accountId: numericActor, contactId: "contact:owner-wins", connectionId: null }), { userId: numericActor }));

    const reader = createRelationshipLifecycleFactsReader({ client: pool, workspaceId });
    const facts = await reader.readRelationshipLifecycleFacts(numericActor);

    assert.deepEqual(facts.tasks.map((item) => item.id).sort(), ["task:connection-reference", "task:non-c-contact"]);
    assert.deepEqual(facts.connections.map((item) => item.id), []);
    assert.deepEqual(facts.contacts.map((item) => item.id), []);
  });
});

test("PostgreSQL reader drops selected invalid T/C/H business fields with legacy decoder parity", databaseTest, async () => {
  await withDatabase(async ({ pool }) => {
    await insert(pool, record("connections", "storage:connection:good", connectionPayload("connection:good", "contact:good", actorId)));
    await insert(pool, record("contacts", "storage:contact:good", contactPayload("contact:good"), { userId: actorId }));
    await insert(pool, record("tasks", "storage:task:good", taskPayload("task:good", { contactId: "contact:good", connectionId: "connection:good" })));

    for (const [index, patch] of [
      { id: " ", title: "Task invalid id" },
      { id: "task:invalid-title", title: " " },
      { id: "task:invalid-status", status: "nope" },
      { id: "task:invalid-source", source: { type: "nope", id: "source" } },
      { id: "task:invalid-source-id", source: { type: "manual", id: "" } },
      { id: "task:invalid-evidence", evidenceIds: [] },
      { id: "task:invalid-created-at", createdAt: " " },
      { id: "task:invalid-updated-at", updatedAt: " " },
    ].entries()) {
      await insert(pool, record("tasks", `storage:task:invalid:${index}`, taskPayload(`task:invalid:${index}`, { contactId: "contact:good", connectionId: "connection:good", ...patch })));
    }

    for (const [index, patch] of [
      { id: " ", accountId: actorId },
      { id: "connection:invalid-account", accountId: " " },
      { id: "connection:invalid-contact", contactId: " " },
      { id: "connection:invalid-summary", summary: " " },
      { id: "connection:invalid-stage", stage: "nope" },
      { id: "connection:invalid-source", source: { type: "nope", id: "source" } },
      { id: "connection:invalid-source-id", source: { type: "manual", id: "" } },
      { id: "connection:invalid-evidence", evidenceIds: [] },
      { id: "connection:invalid-created-at", createdAt: " " },
      { id: "connection:invalid-updated-at", updatedAt: " " },
    ].entries()) {
      const connectionId = typeof patch.id === "string" && patch.id.trim() ? patch.id : `connection:invalid-id:${index}`;
      const contactId = `contact:invalid-connection:${index}`;
      const selectedConnectionId = patch.id === " " ? "" : connectionId;
      await insert(pool, record("connections", `storage:${connectionId}`, connectionPayload(connectionId, contactId, actorId, { ...patch, id: selectedConnectionId })));
      await insert(pool, record("tasks", `storage:task:invalid-connection:${index}`, taskPayload(`task:invalid-connection:${index}`, { contactId, connectionId: selectedConnectionId, status: "invalid" })));
      await insert(pool, record("contacts", `storage:${contactId}`, contactPayload(contactId), { userId: actorId }));
    }

    for (const [index, patch] of [
      { id: " " },
      { id: "contact:invalid-name", displayName: " " },
      { id: "contact:invalid-stage", stage: "nope" },
      { id: "contact:invalid-source", source: { type: "nope", id: "source" } },
      { id: "contact:invalid-source-id", source: { type: "manual", id: "" } },
      { id: "contact:invalid-evidence", evidenceIds: [] },
      { id: "contact:invalid-created-at", createdAt: " " },
      { id: "contact:invalid-updated-at", updatedAt: " " },
    ].entries()) {
      const contactId = typeof patch.id === "string" && patch.id.trim() ? patch.id : `contact:invalid-id:${index}`;
      const selectedContactId = patch.id === " " ? "" : contactId;
      await insert(pool, record("contacts", `storage:${contactId}`, contactPayload(contactId, { ...patch, id: selectedContactId }), { userId: actorId }));
      await insert(pool, record("tasks", `storage:task:invalid-contact:${index}`, taskPayload(`task:invalid-contact:${index}`, { contactId: selectedContactId, connectionId: null, status: "invalid" })));
    }

    const reader = createRelationshipLifecycleFactsReader({ client: pool, workspaceId });
    const facts = await reader.readRelationshipLifecycleFacts(actorId);

    assert.deepEqual(facts.tasks.map((item) => item.id), ["task:good"]);
    assert.deepEqual(facts.connections.map((item) => item.id), ["connection:good"]);
    assert.deepEqual(facts.contacts.map((item) => item.id).sort(), [
      "contact:good",
      "contact:invalid-connection:0",
      "contact:invalid-connection:1",
      "contact:invalid-connection:2",
      "contact:invalid-connection:3",
      "contact:invalid-connection:4",
      "contact:invalid-connection:5",
      "contact:invalid-connection:6",
      "contact:invalid-connection:7",
      "contact:invalid-connection:8",
      "contact:invalid-connection:9",
    ]);
  });
});

test("PostgreSQL reader keeps fixed actor T/C/H raw rows and JSON bytes stable as foreign data grows", databaseTest, async () => {
  let baselineBytes: number | undefined;
  for (const scale of [10, 100, 1000]) {
    await withDatabase(async ({ pool, schema }) => {
      await insert(pool, record("connections", "storage:connection:shared", connectionPayload("connection:shared", "contact:shared", actorId), { userId: actorId }));
      await insert(pool, record("connections", "storage:connection:non-c", connectionPayload("connection:non-c", "contact:non-c", "account:foreign"), { userId: actorId }));
      await insert(pool, record("contacts", "storage:contact:shared", contactPayload("contact:shared"), { userId: foreignActor }));
      await insert(pool, record("contacts", "storage:contact:non-c", contactPayload("contact:non-c"), { userId: foreignActor }));
      await insert(pool, record("tasks", "storage:task:shared", taskPayload("task:shared", { contactId: "contact:shared", connectionId: "connection:shared" }), { userId: actorId }));
      await insert(pool, record("tasks", "storage:task:non-c", taskPayload("task:non-c", { contactId: "contact:non-c", connectionId: null }), { userId: actorId }));
      for (let index = 0; index < scale; index += 1) {
        const foreignContactId = `contact:foreign-bench:${scale}:${index}`;
        await insert(pool, record("contacts", `storage:${foreignContactId}`, contactPayload(foreignContactId), { userId: foreignActor }));
        await insert(pool, record("connections", `storage:connection:foreign-bench:${scale}:${index}`, connectionPayload(`connection:foreign-bench:${scale}:${index}`, foreignContactId, foreignActor), { userId: foreignActor }));
        await insert(pool, record("tasks", `storage:task:foreign-bench:${scale}:${index}`, taskPayload(`task:foreign-bench:${scale}:${index}`, { contactId: foreignContactId, connectionId: null }), { userId: foreignActor }));
      }

      let readerQueryCount = 0;
      let rawRows: readonly { envelope?: unknown }[] = [];
      const countingClient = {
        async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
          readerQueryCount += 1;
          const result = await pool.query<TRow>(text, values ? [...values] : undefined);
          rawRows = result.rows as readonly { envelope?: unknown }[];
          return result;
        },
      };
      const reader = createRelationshipLifecycleFactsReader({ client: countingClient, workspaceId });
      const startedAt = Date.now();
      const facts = await reader.readRelationshipLifecycleFacts(actorId);
      const elapsedMs = Date.now() - startedAt;
      const rawEnvelope = rawRows[0]?.envelope;
      const rawBytes = Buffer.byteLength(JSON.stringify(rawEnvelope));
      const analyze = async () => pool.query<{ "QUERY PLAN": unknown }>(
        `explain (analyze, buffers, verbose, format json) ${RELATIONSHIP_LIFECYCLE_FACTS_SQL}`,
        [workspaceId, actorId],
      );
      const beforeAnalyze = await analyze();
      const beforeAnalyzePlan = beforeAnalyze.rows[0]?.["QUERY PLAN"];
      const beforeAnalyzeNodes = explainNodes(beforeAnalyzePlan);
      const beforeAnalyzeWork = explainWork(beforeAnalyzePlan);
      const beforeAnalyzeTiming = explainTiming(beforeAnalyzePlan);
      await pool.query("analyze orbit_records");
      const afterAnalyze = await analyze();
      const afterAnalyzePlan = afterAnalyze.rows[0]?.["QUERY PLAN"];
      const afterAnalyzeNodes = explainNodes(afterAnalyzePlan);
      const afterAnalyzeWork = explainWork(afterAnalyzePlan);
      const afterAnalyzeTiming = explainTiming(afterAnalyzePlan);

      assert.equal(readerQueryCount, 1);
      assert.equal(rawRows.length, 1);
      assert.equal((rawEnvelope as { tasks: unknown[] }).tasks.length, 2);
      assert.equal((rawEnvelope as { connections: unknown[] }).connections.length, 1);
      assert.equal((rawEnvelope as { contacts: unknown[] }).contacts.length, 1);
      assert.equal(facts.tasks.length, 2);
      assert.equal(facts.connections.length, 1);
      assert.equal(facts.contacts.length, 1);
      const rawJson = JSON.stringify(rawEnvelope);
      assert.doesNotMatch(rawJson, /foreign-bench|task:foreign|contact:foreign|PRIVATE|primaryEmail|searchText/u);
      assert.ok(beforeAnalyzeWork <= scale * 100 + 1000, `unexpected pre-ANALYZE foreign EXPLAIN work at scale ${scale}: ${beforeAnalyzeWork}`);
      assert.ok(afterAnalyzeWork <= scale * 100 + 1000, `unexpected post-ANALYZE foreign EXPLAIN work at scale ${scale}: ${afterAnalyzeWork}`);
      if (baselineBytes === undefined) baselineBytes = rawBytes;
      else assert.equal(rawBytes, baselineBytes);
      console.log(JSON.stringify({ benchmark: "foreign-growth", scale, rawRows: rawRows.length, rawBytes, elapsedMs, readerQueryCount, beforeAnalyzeWork, afterAnalyzeWork, beforeAnalyzeTiming, afterAnalyzeTiming, beforeAnalyzeNodes, afterAnalyzeNodes, schema }, null, 2));
      console.log(JSON.stringify({ beforeAnalyzePlan, afterAnalyzePlan }, null, 2));
    });
  }
});

function explainNodes(value: unknown): {
  actualLoops: number;
  actualRows: number;
  rowsRemovedByFilter: number;
  rowsRemovedByJoinFilter: number;
}[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => explainNodes(item));
  const node = value as Record<string, unknown>;
  const plan = node.Plan && typeof node.Plan === "object"
    ? node.Plan as Record<string, unknown>
    : node;
  const actualRows = typeof plan["Actual Rows"] === "number" ? plan["Actual Rows"] : 0;
  const removedByFilter = typeof plan["Rows Removed by Filter"] === "number" ? plan["Rows Removed by Filter"] : 0;
  const removedByJoinFilter = typeof plan["Rows Removed by Join Filter"] === "number" ? plan["Rows Removed by Join Filter"] : 0;
  const actualLoops = typeof plan["Actual Loops"] === "number" ? plan["Actual Loops"] : 1;
  const children = Array.isArray(plan.Plans) ? plan.Plans : [];
  return [
    { actualRows, rowsRemovedByFilter: removedByFilter, rowsRemovedByJoinFilter: removedByJoinFilter, actualLoops },
    ...children.flatMap((child) => explainNodes(child)),
  ];
}

function explainWork(value: unknown): number {
  return explainNodes(value).reduce(
    (sum, node) => (node.actualRows + node.rowsRemovedByFilter + node.rowsRemovedByJoinFilter) * node.actualLoops + sum,
    0,
  );
}

function explainTiming(value: unknown): { executionMs: number | null; planningMs: number | null } {
  const root = Array.isArray(value) ? value[0] : value;
  if (!root || typeof root !== "object") return { executionMs: null, planningMs: null };
  const record = root as Record<string, unknown>;
  return {
    executionMs: typeof record["Execution Time"] === "number" ? record["Execution Time"] : null,
    planningMs: typeof record["Planning Time"] === "number" ? record["Planning Time"] : null,
  };
}

test("PostgreSQL reader scales actor associations with one query and bounded recursive EXPLAIN work", databaseTest, async () => {
  for (const scale of [10, 100, 1000]) {
    await withDatabase(async ({ pool, schema }) => {
      for (let index = 0; index < scale; index += 1) {
        const ownContactId = `contact:own-bench:${scale}:${index}`;
        const ownConnectionId = `connection:own-bench:${scale}:${index}`;
        await insert(pool, record("contacts", `storage:${ownContactId}`, contactPayload(ownContactId), { userId: null }));
        await insert(pool, record("connections", `storage:${ownConnectionId}`, connectionPayload(ownConnectionId, ownContactId, actorId), { userId: actorId }));
        await insert(pool, record("tasks", `storage:task:own-bench:${scale}:${index}`, taskPayload(`task:own-bench:${scale}:${index}`, { contactId: ownContactId, connectionId: ownConnectionId }), { userId: actorId }));
      }

      let readerQueryCount = 0;
      let rawRows: readonly { envelope?: unknown }[] = [];
      const countingClient = {
        async query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]) {
          readerQueryCount += 1;
          const result = await pool.query<TRow>(text, values ? [...values] : undefined);
          rawRows = result.rows as readonly { envelope?: unknown }[];
          return result;
        },
      };
      const reader = createRelationshipLifecycleFactsReader({ client: countingClient, workspaceId });
      const startedAt = Date.now();
      const facts = await reader.readRelationshipLifecycleFacts(actorId);
      const elapsedMs = Date.now() - startedAt;
      const rawEnvelope = rawRows[0]?.envelope;
      const rawBytes = Buffer.byteLength(JSON.stringify(rawEnvelope));
      assert.ok(rawEnvelope);
      const rawContacts = (rawEnvelope as {
        contacts: readonly {
          id: string;
          authorization: { actorOwned: boolean; connectionAuthorized: boolean };
        }[];
      }).contacts;
      const analyze = async () => pool.query<{ "QUERY PLAN": unknown }>(
        `explain (analyze, buffers, verbose, format json) ${RELATIONSHIP_LIFECYCLE_FACTS_SQL}`,
        [workspaceId, actorId],
      );
      const beforeAnalyze = await analyze();
      const beforeAnalyzePlan = beforeAnalyze.rows[0]?.["QUERY PLAN"];
      const beforeAnalyzeNodes = explainNodes(beforeAnalyzePlan);
      const beforeAnalyzeWork = explainWork(beforeAnalyzePlan);
      const beforeAnalyzeTiming = explainTiming(beforeAnalyzePlan);
      await pool.query("analyze orbit_records");
      const afterAnalyze = await analyze();
      const afterAnalyzePlan = afterAnalyze.rows[0]?.["QUERY PLAN"];
      const afterAnalyzeNodes = explainNodes(afterAnalyzePlan);
      const afterAnalyzeWork = explainWork(afterAnalyzePlan);
      const afterAnalyzeTiming = explainTiming(afterAnalyzePlan);

      assert.equal(readerQueryCount, 1);
      assert.equal(rawRows.length, 1);
      assert.equal(rawContacts.length, scale);
      assert.ok(rawContacts.every((contact) => contact.authorization.actorOwned === false && contact.authorization.connectionAuthorized === true));
      assert.doesNotMatch(JSON.stringify(rawEnvelope), /PRIVATE|primaryEmail|searchText/u);
      assert.equal(facts.contacts.length, scale);
      assert.equal(facts.connections.length, scale);
      assert.equal(facts.tasks.length, scale);
      assert.ok(beforeAnalyzeWork <= scale * 100 + 1000, `unexpected pre-ANALYZE recursive EXPLAIN work at scale ${scale}: ${beforeAnalyzeWork}`);
      assert.ok(afterAnalyzeWork <= scale * 100 + 1000, `unexpected post-ANALYZE recursive EXPLAIN work at scale ${scale}: ${afterAnalyzeWork}`);
      console.log(JSON.stringify({ benchmark: "actor-association-growth", scale, rows: facts.tasks.length + facts.connections.length + facts.contacts.length, rawRows: rawRows.length, rawBytes, elapsedMs, readerQueryCount, beforeAnalyzeWork, afterAnalyzeWork, beforeAnalyzeTiming, afterAnalyzeTiming, beforeAnalyzeNodes, afterAnalyzeNodes, schema }, null, 2));
      console.log(JSON.stringify({ beforeAnalyzePlan, afterAnalyzePlan }, null, 2));
    });
  }
});
