/**
 * Backfill the two display fields every event read path needs: the canonical
 * title and the cover path.
 *
 * Why this exists: `orbit_records.events.payload.name` in long-lived dev and QA
 * databases is stale import原文 — for several events it is a bilingual
 * "日本語 / English" string left over from an older fixture catalogue, while
 * `event_ops_events.title` carries the current Chinese title that the events
 * list and the event detail page already show. The home recommendation feed
 * reads the record payload, so it displayed the stale bilingual string and no
 * artwork at all.
 *
 * The canonical head stays the single authority. This writes a derived display
 * copy (`payload.title`) plus `payload.coverPath` onto the record so every read
 * path serves the same title and the same cover.
 *
 * Usage:
 *   npx tsx scripts/backfill-event-display-fields.ts                 # dry run
 *   npx tsx scripts/backfill-event-display-fields.ts --apply <receipt.json>
 */
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

import { eventCoverPathFor } from "../features/events/storage/event-cover-catalogue";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

interface PlannedChange {
  eventId: string;
  currentTitle: string | null;
  canonicalTitle: string;
  currentName: string | null;
  coverPath: string | null;
  changes: string[];
}

export function planEventDisplayFields(
  rows: readonly {
    event_id: string;
    canonical_title: string | null;
    payload_title: string | null;
    payload_name: string | null;
    payload_cover: string | null;
  }[],
): PlannedChange[] {
  const planned: PlannedChange[] = [];
  for (const row of rows) {
    const canonicalTitle = row.canonical_title?.trim() ?? "";
    // Without a canonical title there is no authority to copy from; leave the
    // record untouched and let the report list it rather than inventing a title.
    if (!canonicalTitle) continue;
    const coverPath = eventCoverPathFor(row.event_id);
    const changes: string[] = [];
    if (row.payload_title?.trim() !== canonicalTitle) changes.push("title");
    if (coverPath && row.payload_cover?.trim() !== coverPath) changes.push("coverPath");
    if (changes.length === 0) continue;
    planned.push({
      eventId: row.event_id,
      currentTitle: row.payload_title,
      canonicalTitle,
      currentName: row.payload_name,
      coverPath,
      changes,
    });
  }
  return planned;
}

const SELECT_SQL = `
  select
    r.record_id as event_id,
    e.title as canonical_title,
    r.payload->>'title' as payload_title,
    r.payload->>'name' as payload_name,
    r.payload->>'coverPath' as payload_cover
  from orbit_records r
  left join event_ops_events e
    on e.workspace_id = r.workspace_id and e.event_id = r.record_id
  where r.workspace_id = $1
    and r.collection_name = 'events'
    and r.deleted_at is null
  order by r.record_id
`;

async function main(argv: readonly string[]): Promise<void> {
  loadLocalEnv();
  const apply = argv[0] === "--apply";
  const receiptPath = argv[1];
  assert.ok(
    argv.length === 0 || (apply && argv.length === 2 && receiptPath && isAbsolute(receiptPath)),
    "Usage: no arguments for a dry run; --apply /absolute/receipt.json to write",
  );

  const database = resolveLiveDatabaseConnectionConfig();
  assert.ok(database, "Configure ORBIT_EVENT_DATABASE_URL before backfilling event display fields.");
  const client = createEventOperationsPostgresClient({ connectionString: database.connectionString });

  try {
    const receipt = await client.transaction(async (transaction) => {
      const rows = (await transaction.query(SELECT_SQL, [database.workspaceId])).rows as Parameters<typeof planEventDisplayFields>[0];
      const planned = planEventDisplayFields(rows);
      const withoutCanonical = rows.filter((row) => !row.canonical_title?.trim()).map((row) => row.event_id);
      const withoutCover = rows.filter((row) => !eventCoverPathFor(row.event_id)).map((row) => row.event_id);
      const now = new Date().toISOString();

      if (apply) {
        for (const change of planned) {
          const result = await transaction.query(
            `update orbit_records
               set payload = jsonb_set(
                     case when $3::text is null then payload else jsonb_set(payload, '{coverPath}', to_jsonb($3::text)) end,
                     '{title}', to_jsonb($2::text)),
                   updated_at = $4
             where workspace_id = $5 and collection_name = 'events' and record_id = $1 and deleted_at is null`,
            [change.eventId, change.canonicalTitle, change.coverPath, now, database.workspaceId],
          );
          assert.equal(result.rowCount, 1, `Event display update not acknowledged for ${change.eventId}`);
        }
        const verified = (await transaction.query(SELECT_SQL, [database.workspaceId])).rows as Parameters<typeof planEventDisplayFields>[0];
        assert.equal(planEventDisplayFields(verified).length, 0, "Backfill did not converge");
      }

      return {
        database: database.connectionString.replace(/\/\/[^@]*@/u, "//<redacted>@"),
        workspaceId: database.workspaceId,
        applied: apply,
        checkedAt: now,
        total: rows.length,
        planned: planned.length,
        eventsWithoutCanonicalTitle: withoutCanonical,
        eventsWithoutCover: withoutCover,
        changes: planned,
      };
    });

    if (apply && receiptPath) writeFileSync(receiptPath, JSON.stringify(receipt, null, 2), { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ ...receipt, changes: receipt.changes.map((change) => ({ eventId: change.eventId, from: change.currentTitle, to: change.canonicalTitle, changes: change.changes })) }, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Backfill failed"}\n`);
    process.exitCode = 1;
  });
}
