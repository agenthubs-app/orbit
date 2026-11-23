// 2026-11-23 探す 加载慢 ①：listCatalogueSummaries 改成「报名数按活动在 lateral 子查询里算、不再 group by 整个 published_dto」。
// 结果必须与改前逐字段一致：同一份数据上跑改前的 SQL（下面原样保留作对照）和现在的仓库方法，逐行比较。
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { createEventOperationsPostgresClient } from "../../features/events/event-operations/storage/postgres-client";
import { createPostgresEventOperationsRepository } from "../../features/events/event-operations/storage/postgres-repository";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 60_000 };
const W = "workspace:catalogue-summary";

/** The statement as it was before 2026-11-23 (reference only). */
const LEGACY_SQL = `
  select
    event_row.event_id,
    count(membership_head.actor_id) filter (
      where membership_head.status = 'rsvped'
    )::text as active_registration_count,
    (publication.publication_id is not null) as has_published_results,
    (
      publication.publication_id is not null
      and (publication.published_dto ->> 'resultsAvailableAt')::timestamptz
        <= statement_timestamp()
    ) as attendee_results_available
  from event_ops_events event_row
  left join event_ops_membership_heads membership_head
    on membership_head.workspace_id = event_row.workspace_id
    and membership_head.event_id = event_row.event_id
  left join event_ops_publication_heads publication_head
    on publication_head.workspace_id = event_row.workspace_id
    and publication_head.event_id = event_row.event_id
  left join event_ops_publications publication
    on publication.workspace_id = publication_head.workspace_id
    and publication.publication_id = publication_head.publication_id
  where event_row.workspace_id = $1
    and event_row.event_id = any($2::text[])
    and (
      event_row.lifecycle_state_v2 = 'published'
      or (
        event_row.lifecycle_state_v2 is null
        and event_row.lifecycle_state = 'active'
      )
    )
    and event_row.registration_migration_state = 'canonical'
  group by
    event_row.event_id,
    publication.publication_id,
    publication.published_dto
  order by event_row.event_id
`;

// Only the columns the statement reads; the shapes match the production tables.
const SCHEMA_SQL = `
  create table event_ops_events (workspace_id text not null, event_id text not null, lifecycle_state_v2 text, lifecycle_state text, registration_migration_state text, primary key (workspace_id, event_id));
  create table event_ops_membership_heads (workspace_id text not null, event_id text not null, actor_id text not null, status text not null, primary key (workspace_id, event_id, actor_id));
  create table event_ops_publication_heads (workspace_id text not null, event_id text not null, publication_id text not null, primary key (workspace_id, event_id));
  create table event_ops_publications (workspace_id text not null, publication_id text not null, published_dto jsonb not null, primary key (workspace_id, publication_id));
`;

test("catalogue summaries: same rows, field by field, as the statement before the rewrite", options, async (t) => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `catalogue_summary_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  t.after(async () => { try { await pool.end(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await pool.query(SCHEMA_SQL);

  const events: Array<[string, string | null, string | null, string]> = [
    ["e-results-open", "published", null, "canonical"], // results published and visible
    ["e-results-later", "published", null, "canonical"], // results published, not visible yet
    ["e-no-results", "published", null, "canonical"], // registrations, no publication
    ["e-empty", "published", null, "canonical"], // no registrations at all
    ["e-legacy-active", null, "active", "canonical"], // old lifecycle column
    ["e-draft", "draft", null, "canonical"], // not listed
    ["e-not-migrated", "published", null, "legacy"], // not listed
    ["e-other-workspace", "published", null, "canonical"],
  ];
  for (const [eventId, v2, v1, migration] of events) {
    await pool.query("insert into event_ops_events values ($1, $2, $3, $4, $5)", [eventId === "e-other-workspace" ? "workspace:other" : W, eventId, v2, v1, migration]);
  }
  const members: Array<[string, number, number]> = [["e-results-open", 40, 5], ["e-results-later", 12, 3], ["e-no-results", 7, 0], ["e-legacy-active", 2, 1], ["e-draft", 3, 0], ["e-not-migrated", 4, 0]];
  for (const [eventId, rsvped, cancelled] of members) {
    for (let index = 0; index < rsvped + cancelled; index++) {
      await pool.query("insert into event_ops_membership_heads values ($1, $2, $3, $4)", [W, eventId, `actor-${index}`, index < rsvped ? "rsvped" : "cancelled"]);
    }
  }
  const bulky = Array.from({ length: 400 }, (_, index) => ({ id: index, reason: `reason ${index} `.repeat(8) }));
  for (const [eventId, availableAt] of [["e-results-open", "2020-01-01T00:00:00Z"], ["e-results-later", "2099-01-01T00:00:00Z"]] as const) {
    await pool.query("insert into event_ops_publication_heads values ($1, $2, $3)", [W, eventId, `pub-${eventId}`]);
    await pool.query("insert into event_ops_publications values ($1, $2, $3)", [W, `pub-${eventId}`, JSON.stringify({ resultsAvailableAt: availableAt, rows: bulky })]);
  }
  // A superseded publication that the head no longer points at must not count.
  await pool.query("insert into event_ops_publications values ($1, $2, $3)", [W, "pub-old", JSON.stringify({ resultsAvailableAt: "2020-01-01T00:00:00Z" })]);

  const client = createEventOperationsPostgresClient({ connectionString: databaseUrl, pool });
  const repository = createPostgresEventOperationsRepository({ client, workspaceId: W });
  const ids = events.map(([eventId]) => eventId).concat("e-missing");

  const legacy = (await pool.query(LEGACY_SQL, [W, ids])).rows.map((row) => ({
    activeRegistrationCount: Number(row.active_registration_count),
    attendeeResultsAvailable: row.attendee_results_available === true,
    eventId: String(row.event_id),
    hasPublishedResults: row.has_published_results === true,
  }));
  const current = await repository.listCatalogueSummaries(ids);

  assert.deepEqual(current, legacy);
  assert.deepEqual(current.map((row) => row.eventId), ["e-empty", "e-legacy-active", "e-no-results", "e-results-later", "e-results-open"]);
  assert.deepEqual(current.find((row) => row.eventId === "e-results-open"), { activeRegistrationCount: 40, attendeeResultsAvailable: true, eventId: "e-results-open", hasPublishedResults: true });
  assert.deepEqual(current.find((row) => row.eventId === "e-results-later"), { activeRegistrationCount: 12, attendeeResultsAvailable: false, eventId: "e-results-later", hasPublishedResults: true });
  assert.deepEqual(current.find((row) => row.eventId === "e-empty"), { activeRegistrationCount: 0, attendeeResultsAvailable: false, eventId: "e-empty", hasPublishedResults: false });
});
