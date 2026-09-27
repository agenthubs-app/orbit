import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createPostgresContactCardReader } from "../../features/contacts/storage/contact-list-postgres-reader";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

// Sprint 0126: keyword search in the App contact list (card reader) returned 503
// CONTACT_SEARCH_RUNTIME_UNSUPPORTED on every Node except 25.6.0 / ICU 78.2, and on
// any PostgreSQL other than 16.12. The matcher policy is ecmascript-lower-substring-v1:
// PostgreSQL lower(... collate "und-x-icu") must agree with JS toLowerCase().includes().
// This compares the real SQL result with the JS policy on case-mapping edge cases.
// Run it under each Node version that should be accepted.
const people = [
  ["p01", "İstanbul Office", "Bosphorus Trade"],
  ["p02", "Hans Strasse", "STRASSE GmbH"],
  ["p03", "Grete Straße", "Straße AG"],
  ["p04", "ΟΔΥΣΣΕΥΣ Papadakis", "Ithaca Shipping"],
  ["p05", "Kelvin Sign", "K Labs"],
  ["p06", "ＦＵＬＬ Width", "Ｔｏｋｙｏ Ｗｉｄｅ"],
  ["p07", "Ǆemal Dzeko", "Sarajevo Tech"],
  ["p08", "ΣΊΣΥΦΟΣ Rock", "Corinth Hills"],
  ["p09", "東京 太郎", "東京商事"],
  ["p10", "ﬁnance Lead", "ﬂow Capital"],
  ["p11", "ᏣᎳᎩ Speaker", "Cherokee Arts"],
  ["p12", "Plain Person", "Ordinary Inc"],
] as const;
const queries = ["İstanbul", "istanbul", "strasse", "straße", "STRASSE", "σ", "οδυσσευσ", "οδυσσευς", "k labs", "kelvin", "ｆｕｌｌ", "full", "東京", "ǆ", "Ǆ", "ﬁ", "fi", "ꮳꮃꭹ", "ᏣᎳᎩ", "person", "ordinary inc", "tokyo"];

test("App contact keyword search matches the JS lower-substring policy on this Node runtime", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async (t) => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  const schema = `contact_search_parity_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema}` });
  const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
    return { rows: (await pool.query(sql, values ? [...values] : undefined)).rows as T[] };
  } };
  t.diagnostic(`node ${process.versions.node} icu ${process.versions.icu} unicode ${process.versions.unicode}`);
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const at = "2026-09-27T00:00:00.000Z";
    for (const [id, displayName, organization] of people) {
      await store.upsertRecord({ workspaceId: "w", userId: "a", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: at, updatedAt: at,
        lifecycleState: "active", collectionName: "contacts", recordId: id, payload: {
          id, displayName, organization, role: "", stage: "active", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: at, updatedAt: at,
        } });
    }
    const reader = createPostgresContactCardReader({ client, workspaceId: "w", cursorSecret: "local-test-secret-".repeat(3) });
    for (const query of queries) {
      const needle = query.trim().toLowerCase();
      const expected = people.filter(([, displayName, organization]) => `${displayName}  ${organization}`.toLowerCase().includes(needle)).map(([id]) => id).sort();
      const page = await reader.page({ query, limit: 50 }, "a");
      assert.deepEqual(page.items.map(item => item.id).sort(), expected, `query ${JSON.stringify(query)}`);
      assert.equal((await reader.summary({ query }, "a")).total, expected.length, `summary ${JSON.stringify(query)}`);
    }
    // Another actor never sees these contacts, with or without a keyword.
    assert.equal((await reader.page({ query: "person", limit: 50 }, "b")).items.length, 0);
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});

test("a drifted database collation still refuses the fast contact search", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  const schema = `contact_search_drift_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema}` });
  try {
    await pool.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    for (const drift of [{ actual_collversion: "154.1" }, { collprovider: "c" }, { collisdeterministic: false }, { server_encoding: "SQL_ASCII" }, { matcher_policy_version: "other" }]) {
      // A fresh client object per drift: the verified-runtime cache is keyed by client.
      const client: LiveRecordSqlClient = { async query<T>(sql: string, values?: readonly unknown[]) {
        const rows = (await pool.query(sql, values ? [...values] : undefined)).rows as Record<string, unknown>[];
        if (sql.includes("as matcher_policy_version")) return { rows: rows.map(row => ({ ...row, ...drift })) as T[] };
        return { rows: rows as T[] };
      } };
      const reader = createPostgresContactCardReader({ client, workspaceId: "w", cursorSecret: "local-test-secret-".repeat(3) });
      await assert.rejects(reader.page({ query: "person", limit: 5 }, "a"), /CONTACT_SEARCH_RUNTIME_UNSUPPORTED/, JSON.stringify(drift));
      assert.equal((await reader.page({ limit: 5 }, "a")).items.length, 0, "browsing without a keyword is unaffected");
    }
  } finally {
    await pool.query(`drop schema if exists ${schema} cascade`);
    await pool.end();
  }
});
