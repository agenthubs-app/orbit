import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import * as inventory from "../support/industry-fixture-inventory";

const beforeVersion = "2026-09-14T00:00:00.000Z";
const afterVersion = "2026-09-15T00:00:00.000Z";
const selection = { primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.enterprise_software" };
const modulePath = new URL("../../scripts/backfill-test-secondary-industries.ts", import.meta.url);

async function subject() {
  const loaded = existsSync(modulePath) ? await import("../../scripts/backfill-test-secondary-industries") : {};
  assert.equal(typeof Reflect.get(loaded, "buildTestIndustryBackfillPlan"), "function", "maintenance must build a reviewed dry-run plan");
  return loaded as typeof import("../../scripts/backfill-test-secondary-industries");
}

function input() {
  return {
    environment: "isolated-test-fixtures",
    appliedAt: afterVersion,
    targets: [{
      workspaceId: "qa-workspace", collectionName: "contacts", recordId: "qa-contact", userId: "qa-owner",
      personId: "qa-person", expectedUpdatedAt: beforeVersion, basis: "Reviewed software publisher fixture",
      selection, paths: [[], ["publicProfile"]],
    }],
    records: [{
      workspaceId: "qa-workspace", collectionName: "contacts", recordId: "qa-contact", userId: "qa-owner",
      updatedAt: beforeVersion, lifecycleState: "active", deletedAt: null,
      payload: { name: "Private fixture name", notes: "Unrelated private notes", primaryIndustryId: "technology_internet", publicProfile: { bio: "Keep this bio", primaryIndustryId: "technology_internet" } },
    }],
  };
}

// Only the SQL transport is replaced: production transaction begin/commit/rollback,
// plan validation, conditional predicates and receipt checks run unchanged.
function database(record: ReturnType<typeof input>["records"][number], updateRows = true) {
  let persisted = { payload: structuredClone(record.payload), updated_at: record.updatedAt };
  let staged = structuredClone(persisted);
  const queries: { text: string; values: unknown[] }[] = [];
  const query = async (text: string, values: unknown[] = []) => {
    queries.push({ text, values });
    if (text.startsWith("begin")) staged = structuredClone(persisted);
    else if (text === "commit") persisted = structuredClone(staged);
    else if (text === "rollback") staged = structuredClone(persisted);
    else {
      assert.match(text, /workspace_id = \$1/u);
      assert.match(text, /collection_name = \$2/u);
      assert.match(text, /record_id = \$3/u);
      assert.match(text, /user_id = \$4/u);
      assert.match(text, /lifecycle_state = 'active'/u);
      assert.match(text, /deleted_at is null/u);
      assert.deepEqual(values.slice(0, 4), ["qa-workspace", "contacts", "qa-contact", "qa-owner"]);
      if (text.startsWith("select")) {
        assert.match(text, /for update/u);
        return { rows: [structuredClone(staged)] };
      }
      assert.match(text, /^update orbit_records set payload = \$5::jsonb, updated_at = \$6::timestamptz/u);
      assert.match(text, /updated_at = \$7::timestamptz and payload = \$8::jsonb/u);
      assert.equal(values[6], beforeVersion);
      assert.deepEqual(JSON.parse(values[7] as string), record.payload);
      if (!updateRows) return { rows: [] };
      staged = { payload: JSON.parse(values[4] as string), updated_at: values[5] as string };
      return { rows: [structuredClone(staged)] };
    }
    return { rows: [] };
  };
  const client = createTransactionalPostgresClient({
    connectionString: "postgresql://unused.invalid/never-connect",
    pool: { query, connect: async () => ({ query, release() {} }), end: async () => {} },
  });
  return { client, queries, value: () => structuredClone(persisted) };
}

test("normal inventory aggregates actual projections without hiding missing classifications or pending sources", async () => {
  const read = Reflect.get(inventory, "readIndustryFixtureCoverage");
  assert.equal(typeof read, "function", "coverage must keep normal objects and unclassified people in one denominator");
  const coverage = await read();
  assert.deepEqual(coverage.counts, { people: 20, confirmedPeople: 17, missingBasisPeople: 3, projections: 56, exceptions: 2, nonPersonRecords: 10, pendingSources: 10 });
  assert.equal(coverage.complete, false);
  assert.deepEqual(coverage.people.filter((person: { classification: string }) => person.classification === "missing_basis").map((person: { personId: string }) => person.personId), ["orbit-person-9cb4ed0cd2-07", "orbit-person-9cb4ed0cd2-10", "orbit-person-9cb4ed0cd2-11"]);
});

test("normal inventory refuses a projection that no longer matches its person's reviewed mapping", async () => {
  const read = Reflect.get(inventory, "readIndustryFixtureCoverage");
  const { mockContactListItems } = await import("../../features/contacts/fixtures");
  const contact = mockContactListItems[0];
  const previous = contact.secondaryIndustryId;
  try {
    contact.secondaryIndustryId = "technology_internet.ai_data";
    await assert.rejects(read(), /industry projection/u);
  } finally { contact.secondaryIndustryId = previous; }
});

test("dry-run changes only explicit industry projections and keeps a recoverable original without mutating its input", async () => {
  const api = await subject();
  const source = input();
  const original = structuredClone(source);
  const plan = api.buildTestIndustryBackfillPlan(source);
  assert.deepEqual(source, original);
  assert.deepEqual(plan.counts, { total: 1, projections: 2, alreadyValid: 0, repairable: 1, conflict: 0, missingBasis: 0 });
  assert.deepEqual(plan.entries[0].before.payload, original.records[0].payload);
  assert.deepEqual(plan.entries[0].after.payload, {
    name: "Private fixture name", notes: "Unrelated private notes", ...selection,
    publicProfile: { bio: "Keep this bio", ...selection },
  });
  assert.equal(plan.entries[0].after.updatedAt, afterVersion);
  assert.equal(api.buildTestIndustryBackfillPlan(source).hash, plan.hash);
});

test("dry-run separates already valid, conflicting and missing-basis records and never overwrites existing classifications", async () => {
  const api = await subject();
  const source = input();
  Object.assign(source.records[0].payload, selection);
  Object.assign(source.records[0].payload.publicProfile, selection);
  assert.equal(api.buildTestIndustryBackfillPlan(source).entries[0].status, "already_valid");
  source.records[0].payload.publicProfile["secondaryIndustryId"] = "technology_internet.ai_data";
  assert.equal(api.buildTestIndustryBackfillPlan(source).entries[0].status, "conflict");
  source.targets[0].basis = "";
  assert.equal(api.buildTestIndustryBackfillPlan(source).entries[0].status, "missing_basis");
});

test("missing records, wrong owner, changed version and deleted targets fail closed", async () => {
  const api = await subject();
  for (const mutate of [
    (source: ReturnType<typeof input>) => { source.records = []; },
    (source: ReturnType<typeof input>) => { source.records[0].userId = "another-owner"; },
    (source: ReturnType<typeof input>) => { source.records[0].updatedAt = afterVersion; },
    (source: ReturnType<typeof input>) => { source.records[0].lifecycleState = "deleted"; },
  ]) {
    const source = input(); mutate(source);
    assert.equal(api.buildTestIndustryBackfillPlan(source).entries[0].status, "conflict");
  }
});

test("invalid pair, missing projection and conflicting linked-person mappings cannot become repairs", async () => {
  const api = await subject();
  const invalid = input(); invalid.targets[0].selection = { ...selection, secondaryIndustryId: "finance_investment.banking" };
  assert.equal(api.buildTestIndustryBackfillPlan(invalid).entries[0].status, "conflict");
  const missing = input(); missing.targets[0].paths = [["absent"]];
  assert.equal(api.buildTestIndustryBackfillPlan(missing).entries[0].status, "conflict");
  const linked = input();
  linked.targets.push({ ...linked.targets[0], recordId: "another-projection", selection: { ...selection, secondaryIndustryId: "technology_internet.ai_data" } });
  assert.throws(() => api.buildTestIndustryBackfillPlan(linked), /inconsistent person mapping/u);
});

test("invalid or ambiguous scope and duplicate targets are rejected before any plan is approved", async () => {
  const api = await subject();
  for (const mutate of [
    (source: ReturnType<typeof input>) => { source.environment = ""; },
    (source: ReturnType<typeof input>) => { source.targets[0].userId = ""; },
    (source: ReturnType<typeof input>) => { source.targets.push(source.targets[0]); },
    (source: ReturnType<typeof input>) => { source.records.push(source.records[0]); },
    (source: ReturnType<typeof input>) => { source.targets[0].paths = [["__proto__"]]; },
    (source: ReturnType<typeof input>) => { source.appliedAt = beforeVersion; },
  ]) {
    const source = input(); mutate(source);
    assert.throws(() => api.buildTestIndustryBackfillPlan(source));
  }
});

test("apply requires an unchanged reviewed hash and refuses unresolved targets before beginning a transaction", async () => {
  const api = await subject();
  const source = input();
  const plan = api.buildTestIndustryBackfillPlan(source);
  const db = database(source.records[0]);
  await assert.rejects(api.applyTestIndustryBackfillPlan(db.client, plan, "wrong-hash"), /reviewed plan/u);
  const changed = structuredClone(plan); changed.entries[0].after.payload.name = "Unapproved change";
  await assert.rejects(api.applyTestIndustryBackfillPlan(db.client, changed, plan.hash), /reviewed plan/u);
  source.targets[0].basis = "";
  const unresolved = api.buildTestIndustryBackfillPlan(source);
  await assert.rejects(api.applyTestIndustryBackfillPlan(db.client, unresolved, unresolved.hash), /unresolved/u);
  assert.equal(db.queries.length, 0);
});

test("conditional apply preserves other fields and replaying the reviewed plan performs no second update", async () => {
  const api = await subject();
  const source = input();
  const plan = api.buildTestIndustryBackfillPlan(source);
  const db = database(source.records[0]);
  assert.deepEqual(await api.applyTestIndustryBackfillPlan(db.client, plan, plan.hash), { applied: 1, alreadyValid: 0 });
  assert.deepEqual(await api.applyTestIndustryBackfillPlan(db.client, plan, plan.hash), { applied: 0, alreadyValid: 1 });
  assert.equal(db.queries.filter(query => query.text.startsWith("update")).length, 1);
  assert.deepEqual(db.value().payload, plan.entries[0].after.payload);
  assert.equal(db.value().updated_at, afterVersion);
});

test("a stale payload or conditional update miss rolls back without a success receipt", async () => {
  const api = await subject();
  const source = input();
  const plan = api.buildTestIndustryBackfillPlan(source);
  const changed = structuredClone(source.records[0]); changed.payload.notes = "Newer user text";
  for (const db of [database(changed), database(source.records[0], false)]) {
    const before = db.value();
    await assert.rejects(api.applyTestIndustryBackfillPlan(db.client, plan, plan.hash), /conflict/u);
    assert.deepEqual(db.value(), before);
    assert.equal(db.queries.at(-1)?.text, "rollback");
    assert.equal(db.queries.some(query => query.text === "commit"), false);
  }
});

test("a later linked-record conflict rolls back an earlier industry update in the same transaction", async () => {
  const api = await subject();
  const source = input();
  source.targets.push({ ...source.targets[0], recordId: "linked-contact" });
  source.records.push({ ...structuredClone(source.records[0]), recordId: "linked-contact" });
  const plan = api.buildTestIndustryBackfillPlan(source);
  const db = database(source.records[0]);
  const before = db.value();
  const client: Pick<TransactionalPostgresClient, "transaction"> = {
    transaction: operation => db.client.transaction(sql => operation({
      query: async (text, values) => values?.[2] === "linked-contact" ? { rows: [] } : sql.query(text, values),
    })),
  };
  await assert.rejects(api.applyTestIndustryBackfillPlan(client, plan, plan.hash), /record conflict/u);
  assert.equal(db.queries.filter(query => query.text.startsWith("update")).length, 1);
  assert.equal(db.queries.at(-1)?.text, "rollback");
  assert.deepEqual(db.value(), before);
});

test("mutating the caller's plan while a transaction starts cannot change the approved payload", async () => {
  const api = await subject();
  const source = input();
  const plan = api.buildTestIndustryBackfillPlan(source);
  const db = database(source.records[0]);
  const client: Pick<TransactionalPostgresClient, "transaction"> = {
    transaction: operation => {
      plan.entries[0].after.payload.notes = "Unapproved concurrent text";
      return db.client.transaction(operation);
    },
  };
  await api.applyTestIndustryBackfillPlan(client, plan, plan.hash);
  assert.equal(db.value().payload.notes, "Unrelated private notes");
});

test("dry-run command defaults to local input, refuses apply, and redacts private payload and target identifiers", async () => {
  const api = await subject();
  const source = input();
  let reads = 0;
  const output = await api.runTestIndustryBackfillDryRun(["--input", "review.json"], async path => {
    assert.equal(path, "review.json"); reads++; return JSON.stringify(source);
  });
  assert.equal(reads, 1);
  assert.equal(output.mode, "dry-run");
  assert.equal(output.counts.repairable, 1);
  for (const privateText of ["Private fixture name", "Unrelated private notes", "qa-contact", "qa-owner"]) assert.equal(JSON.stringify(output).includes(privateText), false);
  await assert.rejects(api.runTestIndustryBackfillDryRun(["--input", "review.json", "--apply"], async () => { throw new Error("must not read"); }), /--input/u);
});

test("the direct command produces a dry-run without loading a database or provider configuration", async () => {
  await subject();
  const directory = await mkdtemp(join(tmpdir(), "orbit-industry-dry-run-"));
  try {
    const path = join(directory, "input.json");
    await writeFile(path, JSON.stringify(input()));
    const result = spawnSync(process.execPath, ["--import", "tsx", modulePath.pathname, "--input", path], { encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).counts.repairable, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
