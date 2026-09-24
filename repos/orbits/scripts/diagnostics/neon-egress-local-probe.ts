/** Local-only replacement for the original /tmp audit probe. Never loads .env. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import ts from "typescript";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createReadCostLedger } from "../../tests/performance/read-cost-ledger";
import { createStorageContactGraphProvider, createPostgresContactRecordPageReader } from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";

async function main() {
  const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
  assert.ok(databaseUrl, "Explicit ORBIT_LIFECYCLE_TEST_DATABASE_URL required");
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local PostgreSQL only");
  // Execute only this pinned historical, type-import-only reader, not an arbitrary ref/path.
  const source = execFileSync("git", ["show", "1618d772:repos/orbits/features/contacts/storage/contact-scope-postgres-reader.ts"], { encoding: "utf8" });
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  assert.ok(!js.includes("require("), "Historical reader must have no runtime dependencies");
  const historical: { createPostgresContactScopeRecordReader?: typeof createPostgresContactScopeRecordReader } = {};
  new Function("exports", js)(historical);
  assert.ok(historical.createPostgresContactScopeRecordReader);
  const schema = `egress_probe_${randomUUID().replaceAll("-", "")}`;
  const workspaceId = "workspace:read-cost:fixed", actorId = "account_orbit_generated";
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const ledger = createReadCostLedger();
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool, readMetrics: ledger.observer });
  const store = createPostgresLiveRecordStore({ client });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId, now: () => "2026-09-18T00:00:00.000Z" });
    const oldScope = historical.createPostgresContactScopeRecordReader({ client, workspaceId });
    const currentScope = createPostgresContactScopeRecordReader({ client, workspaceId });
    const contacts = (scope: typeof oldScope) => createLiveContactsListSearchAndFilterService({ provider: createStorageContactGraphProvider({
      store, workspaceId, contactScopeRecordReader: scope,
      contactRecordPageReader: createPostgresContactRecordPageReader({ client, workspaceId }),
    }) });
    const old = await ledger.measure("contacts.old-reader.same-fixture", async () => contacts(oldScope).listContacts({ actorId }));
    const current = await ledger.measure("contacts.current-reader.same-fixture", async () => contacts(currentScope).listContacts({ actorId }));
    assert.ok(old.result.success && current.result.success);
    assert.deepEqual(current.result.data, old.result.data, "Same generated fixture must return identical contacts");
    const oldKeys = await ledger.measure("scope.old", async () => oldScope(actorId));
    const newKeys = await ledger.measure("scope.current", async () => currentScope(actorId));
    assert.equal(current.cost.rows - old.cost.rows, newKeys.cost.rows - oldKeys.cost.rows);
    assert.equal(current.cost.bytes - old.cost.bytes, newKeys.cost.bytes - oldKeys.cost.bytes);
    assert.equal(newKeys.cost.rows - oldKeys.cost.rows, newKeys.result.evidenceRecordIds?.length);
    const page = await ledger.measure("contacts.current.page20", async () => contacts(currentScope).listContacts({ actorId, limit: 20 }));
    assert.ok(page.result.success && page.result.data.contacts.length <= 20);
    console.log(JSON.stringify({
      kind: "local_synthetic_decoded_json_not_neon_billing", historicalScopeRef: "1618d772", sameFixtureAndContactResults: true,
      addedEvidenceKeys: newKeys.result.evidenceRecordIds?.length,
      delta: { rows: current.cost.rows - old.cost.rows, bytes: current.cost.bytes - old.cost.bytes },
      measured: ledger.book(),
    }, null, 2));
  } finally {
    await client.close();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Probe failed"); process.exitCode = 1; });
