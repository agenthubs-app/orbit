import assert from "node:assert/strict";
import test from "node:test";
import { lifecycleMigrationHash } from "../../features/connections/lifecycle/migration-plan";
import { createPostgresLifecycleMigrationRepository } from "../../features/connections/lifecycle/migration-repository";
import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";
import { lifecycleMigrationDatabaseTest as databaseTest, lifecycleMigrationFixtureCommand as command, lifecycleMigrationFixtureRecord as record, migrationActorId as actorId, migrationManifest as manifest, migrationNow as now, migrationWorkspaceId as workspaceId, withLifecycleMigrationDatabase as withDatabase } from "../support/lifecycle-migration-fixture";

const repository = (client: TransactionalPostgresClient) => createPostgresLifecycleMigrationRepository({ client, workspaceId });

test("migration dry-run reads a complete source snapshot and never writes", databaseTest, async () => withDatabase(async ({ client, insert, records, receiptCount }) => {
  await insert({ ...record("tasks", "deleted:a", { id: "deleted:a", private: "PRIVATE DELETED" }, "actor:other"), lifecycleState: "deleted", deletedAt: now });
  await insert({ ...record("contacts", "contact:a", { id: "contact:a", private: "PRIVATE OTHER WORKSPACE" }), workspaceId: "workspace:other" });
  const before = await records();
  const repo = repository(client);
  const plan = await repo.dryRun(manifest);
  assert.equal(plan.applyEligible, true);
  assert.equal(plan.changes.length, 2);
  assert.equal(plan.databaseWriteExecuted, false);
  assert.equal(JSON.stringify(plan).includes("PRIVATE"), false);
  assert.deepEqual(await records(), before);
  assert.equal(await receiptCount(), 0);
  await client.query("update orbit_records set payload=payload || '{\"private\":\"changed\"}'::jsonb where collection_name='tasks'");
  assert.notEqual((await repo.dryRun(manifest)).sourceHash, plan.sourceHash);
}));

test("reviewed minimal patches, owner repair, audit and receipt commit atomically", databaseTest, async () => withDatabase(async ({ client, insert, records, receiptCount }) => {
  await client.query("update orbit_records set user_id=null where collection_name='contacts'");
  await client.query("update orbit_records set payload=payload || '{\"stage\":\"legacy\"}'::jsonb where collection_name='connections'");
  await insert(record("contact_detail_states", "detail:a", { actorId, contactId: "contact:a", status: "needs_follow_up", updatedAt: "2026-09-09T01:01:00Z", private: "PRIVATE NOTES" }));
  await insert(record("tasks", "task:a", { id: "task:a", connectionId: "connection:a", contactId: "contact:a", relationshipPurpose: "follow_up", status: "open", title: "PRIVATE TASK", dueAt: "2026-09-12T10:00:00+09:00", createdAt: now, updatedAt: now }));
  await insert({ ...record("contacts", "contact:a", { id: "contact:a", private: "PRIVATE OTHER WORKSPACE" }), workspaceId: "workspace:other" });
  const repaired = { ...manifest, ownerRepairs: [{ collectionName: "contacts" as const, recordId: "contact:a", evidenceId: "evidence:review" }] };
  const repo = repository(client);
  const plan = await repo.dryRun(repaired);
  assert.equal(plan.applyEligible, true);
  const input = { ...command(plan), manifest: repaired };
  const before = await records();
  const receipt = await repo.apply(input);
  assert.equal(receipt.replayed, false);
  assert.equal(receipt.changedRecords, 3);
  assert.equal(receipt.completedAt, now);
  assert.equal(await receiptCount(), 1);
  const after = await records();
  for (const original of before) {
    const next = after.find(row => row.workspace_id === original.workspace_id && row.collection_name === original.collection_name && row.record_id === original.record_id)!;
    const patch = original.workspace_id === workspaceId ? plan.changes.find(change => change.collectionName === original.collection_name && change.recordId === original.record_id) : undefined;
    assert.deepEqual(next, { ...original, user_id: patch?.owner ?? original.user_id, payload: { ...original.payload, ...patch?.payload } });
  }
  const audits = after.filter(row => row.collection_name === "relationship_lifecycle_migration_audits");
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits).includes("PRIVATE"), false);
  assert.equal(JSON.stringify(receipt).includes("PRIVATE"), false);
  assert.equal((await repo.dryRun(repaired).catch(error => error)).code, "INVALID_MANIFEST");
  assert.equal((await repo.dryRun(manifest)).applyEligible, true);
}));

test("source drift including sub-millisecond metadata invalidates external review", databaseTest, async () => withDatabase(async ({ client, records, receiptCount }) => {
  const repo = repository(client);
  for (const sql of ["update orbit_records set payload=payload || '{\"private\":\"changed\"}'::jsonb where collection_name='contacts'", "update orbit_records set updated_at=updated_at + interval '1 microsecond' where collection_name='contacts'"]) {
    const input = command(await repo.dryRun(manifest));
    await client.query(sql);
    const changed = await records();
    await assert.rejects(repo.apply(input), { code: "INVALID_REVIEW" });
    assert.deepEqual(await records(), changed);
    assert.equal(await receiptCount(), 0);
  }
}));

test("blocked plans, wrong review identities and foreign references never write", databaseTest, async () => withDatabase(async ({ client, insert, records, receiptCount }) => {
  const repo = repository(client);
  const input = command(await repo.dryRun(manifest));
  const before = await records();
  for (const patch of [{ actorId: "actor:other" }, { operatorId: "operator:other" }, { review: { ...input.review, workspaceId: "workspace:other" } }]) {
    await assert.rejects(repo.apply({ ...input, ...patch }));
    assert.deepEqual(await records(), before);
  }
  await client.query("update orbit_records set payload=payload-'activeGoal' where collection_name='connections'");
  await assert.rejects(repo.apply(command(await repo.dryRun(manifest))), { code: "REVIEW_REQUIRED" });
  await insert(record("tasks", "task:foreign", { id: "task:foreign", connectionId: "connection:a", private: "PRIVATE FOREIGN" }, "actor:other"));
  const blocked = await repo.dryRun(manifest);
  assert.equal(blocked.applyEligible, false);
  assert.equal(JSON.stringify(blocked).includes("PRIVATE"), false);
  await assert.rejects(repo.apply(command(blocked)), { code: "REVIEW_REQUIRED" });
  assert.equal(await receiptCount(), 0);
}));

test("same-run replay returns the original receipt and different commands conflict", databaseTest, async () => withDatabase(async ({ client, records, receiptCount }) => {
  const repo = repository(client);
  const input = command(await repo.dryRun(manifest));
  const first = await repo.apply(input);
  const committed = await records();
  const cold = repository(client);
  assert.deepEqual(await cold.apply(input), { ...first, replayed: true });
  assert.deepEqual(await records(), committed);
  await assert.rejects(repo.apply({ ...input, operatorId: "operator:other", review: { ...input.review, reviewedBy: "operator:other" } }), { code: "CONFLICT" });
  await assert.rejects(repo.apply({ ...input, review: { ...input.review, sourceHash: "0".repeat(64) } }), { code: "CONFLICT" });
  await assert.rejects(repo.apply({ ...input, now: "2026-09-09T01:00:01.000Z" }), { code: "CONFLICT" });
  assert.equal(await receiptCount(), 1);
  await client.query("update orbit_records set payload=payload-'activeGoal' where collection_name='connections'");
  assert.deepEqual(await cold.apply(input), { ...first, replayed: true });
  assert.equal((await repo.dryRun(manifest)).applyEligible, false);
}));

for (const failure of ["audit", "receipt"]) test(`a ${failure} failure rolls back all migration writes`, databaseTest, async () => withDatabase(async ({ client, records, receiptCount }) => {
  const repo = repository(client);
  const input = command(await repo.dryRun(manifest));
  const before = await records();
  const table = failure === "audit" ? "orbit_records" : "relationship_lifecycle_migration_receipts";
  const condition = failure === "audit" ? "new.collection_name = 'relationship_lifecycle_migration_audits'" : "true";
  await client.query(`create function fail_migration() returns trigger language plpgsql as $$ begin if ${condition} then raise exception 'injected migration failure'; end if; return new; end $$; create trigger fail_migration before insert on ${table} for each row execute function fail_migration();`);
  await assert.rejects(repo.apply(input), /injected migration failure/);
  assert.deepEqual(await records(), before);
  assert.equal(await receiptCount(), 0);
  await client.query(`drop trigger fail_migration on ${table}`);
  assert.equal((await repo.apply(input)).replayed, false);
}));

test("concurrent identical runs commit once and replay once", databaseTest, async () => withDatabase(async ({ client, receiptCount }) => {
  const repo = repository(client);
  const input = command(await repo.dryRun(manifest));
  const receipts = await Promise.all([repo.apply(input), repository(client).apply(input)]);
  assert.deepEqual(receipts.map(receipt => receipt.replayed).sort(), [false, true]);
  assert.equal(await receiptCount(), 1);
}));

test("concurrent distinct runs cannot both apply one reviewed source snapshot", databaseTest, async () => withDatabase(async ({ client, receiptCount }) => {
  const repo = repository(client);
  const input = command(await repo.dryRun(manifest));
  const results = await Promise.allSettled([repo.apply(input), repo.apply({ ...input, runId: "run:second" })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason.code, "INVALID_REVIEW");
  assert.equal(await receiptCount(), 1);
}));

test("migration arguments cannot change while SQL awaits", databaseTest, async () => withDatabase(async ({ client, records }) => {
  const input = command(await repository(client).dryRun(manifest));
  const original = structuredClone(input);
  let changed = false;
  const wrapped: TransactionalPostgresClient = { ...client, transaction: operation => client.transaction(sql => operation({ query: async <T>(text: string, values?: readonly unknown[]) => {
    if (!changed) { changed = true; input.actorId = "actor:forged"; input.manifest.actorId = "actor:forged"; input.review.sourceHash = "0".repeat(64); input.operatorId = "operator:forged"; }
    return sql.query<T>(text, values);
  } })) };
  const receipt = await repository(wrapped).apply(input);
  assert.equal(receipt.actorId, original.actorId);
  assert.equal(receipt.operatorId, original.operatorId);
  assert.equal(receipt.sourceHash, original.review.sourceHash);
  assert.ok((await records()).filter(row => row.workspace_id === workspaceId).every(row => row.user_id === actorId));
}));

test("malformed or cross-identity stored receipts fail closed without mutations", databaseTest, async () => withDatabase(async ({ client, records, receiptCount }) => {
  const repo = repository(client);
  const input = command(await repo.dryRun(manifest));
  const receipt = await repo.apply(input);
  const before = await records();
  await client.query("update relationship_lifecycle_migration_receipts set response_hash=$1", ["0".repeat(64)]);
  await assert.rejects(repo.apply(input), { code: "INVALID_RECEIPT" });
  for (const invalid of [null, { ...receipt, actorId: "actor:other" }, { ...receipt, workspaceId: "workspace:other" }, { ...receipt, runId: "run:other" }, { ...receipt, operatorId: "operator:other" }, { ...receipt, changedRecords: "2" }, { ...receipt, completedAt: "tomorrow" }, { ...receipt, sourceHash: "0".repeat(64) }, { ...receipt, replayed: true }, { ...receipt, extra: "PRIVATE EXTRA" }]) {
    await client.query("update relationship_lifecycle_migration_receipts set response_receipt=$1,response_hash=$2", [JSON.stringify(invalid), lifecycleMigrationHash(invalid)]);
    await assert.rejects(repo.apply(input), { code: "INVALID_RECEIPT" });
    assert.deepEqual(await records(), before);
    assert.equal(await receiptCount(), 1);
  }
}));

test("unexpected update cardinality and trigger changes roll back reviewed patches", databaseTest, async () => withDatabase(async ({ client, records, receiptCount }) => {
  const input = command(await repository(client).dryRun(manifest));
  const before = await records();
  const wrapped: TransactionalPostgresClient = { ...client, transaction: operation => client.transaction(sql => operation({ query: async <T>(text: string, values?: readonly unknown[]) => {
    const result = await sql.query<T>(text, values);
    return text.startsWith("update orbit_records") ? { rows: [] } : result;
  } })) };
  await assert.rejects(repository(wrapped).apply(input), { code: "CONFLICT" });
  assert.deepEqual(await records(), before);
  await client.query("create function alter_patch() returns trigger language plpgsql as $$ begin new.payload = new.payload || '{\"unexpected\":true}'::jsonb; return new; end $$; create trigger alter_patch before update on orbit_records for each row execute function alter_patch();");
  await assert.rejects(repository(client).apply(input), { code: "CONFLICT" });
  assert.deepEqual(await records(), before);
  assert.equal(await receiptCount(), 0);
}));

test("migration transaction retries have three attempts and only retry known transient races", async () => {
  for (const [code, constraint, expected] of [["40001", undefined, 3], ["40P01", undefined, 3], ["23505", "relationship_lifecycle_migration_receipts_pkey", 3], ["23505", "orbit_records_pkey", 1], ["08006", undefined, 1]] as const) {
    let attempts = 0;
    const failure = Object.assign(new Error("injected transaction failure"), { code, constraint });
    const client: TransactionalPostgresClient = { query: async () => { throw new Error("outside transaction"); }, transaction: async () => { attempts++; throw failure; }, close: async () => {} };
    await assert.rejects(repository(client).dryRun(manifest), error => error === failure);
    assert.equal(attempts, expected);
  }
});

test("invalid administrative inputs fail before any SQL", async () => {
  let queries = 0;
  const client: TransactionalPostgresClient = { query: async () => { queries++; return { rows: [] }; }, transaction: async operation => operation(client as TransactionalSqlExecutor), close: async () => {} };
  const repo = repository(client);
  await assert.rejects(repo.dryRun({ ...manifest, workspaceId: "workspace:other" }));
  await assert.rejects(repo.apply({ manifest, actorId, operatorId: "operator:a", runId: "", now, review: null as never }));
  assert.equal(queries, 0);
});

for (const target of ["audit", "receipt"]) test(`the final source check detects ${target} trigger changes after patch writes`, databaseTest, async () => withDatabase(async ({ client, records, receiptCount }) => {
  const repo = repository(client);
  const input = command(await repo.dryRun(manifest));
  const before = await records();
  const table = target === "audit" ? "orbit_records" : "relationship_lifecycle_migration_receipts";
  const condition = target === "audit" ? "new.collection_name='relationship_lifecycle_migration_audits'" : "true";
  await client.query(`create function tamper_after_patch() returns trigger language plpgsql as $$ begin if ${condition} then update orbit_records set payload=payload || '{"activeGoal":"UNREVIEWED GOAL"}'::jsonb where collection_name='connections'; end if; return new; end $$; create trigger tamper_after_patch after insert on ${table} for each row execute function tamper_after_patch();`);
  await assert.rejects(repo.apply(input), { code: "CONFLICT" });
  assert.deepEqual(await records(), before);
  assert.equal(await receiptCount(), 0);
}));
