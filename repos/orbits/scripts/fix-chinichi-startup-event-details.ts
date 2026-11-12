/**
 * 2026-11-12 one-off data fix (user request): the four imported 「中日创业交流会」 events
 * had no agenda and no organizer name, so the detail page showed an empty agenda card and
 * the opaque 「Organizer #…」 label. This merges two keys into each event's top-level
 * `source_payload` — `agenda` (read by payloadFacts) and `organizerName` (read by
 * organizerNameFrom) — the same place imported events keep them.
 *
 * The agenda times are arranged from each event's own description (its time range and the
 * listed activity format); the organizer name is the one the user gave. Nothing else on the
 * event changes; no organizer profile / public organizer page is created, so the organizer
 * key (follows, edition counts) stays the same.
 *
 * Write path mirrors the host lifecycle's setEvent: per event one transaction, sync commit
 * order lock, optimistic update on event_version, event_version / revision + 1, and one new
 * event_event_versions row. Keys that already have a value are left alone (re-runnable).
 * To revert, remove the two keys again (`source_payload - 'agenda' - 'organizerName'`).
 *
 * Usage:
 *   npx tsx scripts/fix-chinichi-startup-event-details.ts                 # dry run (plan only)
 *   npx tsx scripts/fix-chinichi-startup-event-details.ts --rollback      # write inside a transaction, then roll back
 *   npx tsx scripts/fix-chinichi-startup-event-details.ts --apply         # write
 *   … --only <eventId>   restrict to one event (with --rollback, any event id, for local SQL checks)
 */
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createEventOperationsPostgresClient, type EventOperationsSqlExecutor } from "../features/events/event-operations/storage/postgres-client";
import { acquireSyncCommitOrderLock } from "../features/sync/commit-order-lock";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { loadLocalEnv } from "./load-local-env";

export const ORGANIZER_NAME = "中日创业交流协会";

type AgendaItem = { at: string; title: string };

/** Event id → expected title fragment + agenda (times inside each event's own start–end range). */
export const TARGETS: Readonly<Record<string, { title: string; agenda: readonly AgendaItem[] }>> = {
  // 第1回 · 2026-03-22 18:00–21:00 · ザ 東京タワーズ シータワー
  "00000000-0000-0000-0000-000000000001": {
    title: "第1回 中日创业交流会",
    agenda: [
      { at: "18:00", title: "签到・入场" },
      { at: "18:15", title: "开场・活动说明" },
      { at: "18:30", title: "自我介绍（中日双语）" },
      { at: "19:00", title: "小主题讨论" },
      { at: "20:00", title: "自由交流" },
      { at: "21:00", title: "结束" },
    ],
  },
  // 第2回 · 2026-04-25 18:30–21:00 · ザ 東京タワーズ シータワー
  "d4bb5ca1-ef91-486b-bc89-b9f58c73d8be": {
    title: "第2回 中日创业交流会",
    agenda: [
      { at: "18:30", title: "签到・入场" },
      { at: "18:45", title: "开场・自我介绍（中日双语）" },
      { at: "19:15", title: "小主题讨论" },
      { at: "20:15", title: "自由交流" },
      { at: "21:00", title: "结束" },
    ],
  },
  // 第3回 · 2026-05-24 14:00–17:00 · The Public Stand 银座 Corridor 店（AI 需求分析・分组・资源匹配）
  "c011f958-4d51-4ada-8881-92f14f5c4db6": {
    title: "第3回 中日创业交流会",
    agenda: [
      { at: "14:00", title: "签到・入场" },
      { at: "14:15", title: "开场・活动说明" },
      { at: "14:30", title: "AI 需求分析与分组" },
      { at: "15:00", title: "小主题分组讨论" },
      { at: "16:00", title: "自由交流・资源匹配" },
      { at: "17:00", title: "结束" },
    ],
  },
  // 第4回 · 2026-06-21 18:30–21:00 · ザ 東京タワーズ シータワー（女性参加者为主・小规模）
  "2bd30391-c356-457a-8ab5-c4e142031207": {
    title: "第4回 中日创业交流会",
    agenda: [
      { at: "18:30", title: "签到・入场" },
      { at: "18:45", title: "开场・特邀嘉宾介绍" },
      { at: "19:00", title: "AI 需求分析与分组" },
      { at: "19:30", title: "小主题分组讨论" },
      { at: "20:15", title: "自由交流・资源链接" },
      { at: "21:00", title: "结束" },
    ],
  },
};

const hasAgenda = (payload: Readonly<Record<string, unknown>>) => (Array.isArray(payload.agenda) && payload.agenda.length > 0) || (Array.isArray(payload.timetable) && payload.timetable.length > 0);
const hasOrganizerName = (payload: Readonly<Record<string, unknown>>) => ["organizerName", "organizer", "hostName", "host"].some((key) => typeof payload[key] === "string" && String(payload[key]).trim() !== "");

/** The keys to merge into `source_payload`; null when the event already has both. Never overwrites a value that is there. */
export function planPatch(payload: Readonly<Record<string, unknown>>, agenda: readonly AgendaItem[], organizerName = ORGANIZER_NAME): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  if (!hasAgenda(payload)) patch.agenda = agenda;
  if (!hasOrganizerName(payload)) patch.organizerName = organizerName;
  return Object.keys(patch).length ? patch : null;
}

type Row = { event_id: string; title: string | null; event_version: number | string; source_payload: unknown };

async function fixOne(executor: EventOperationsSqlExecutor, workspaceId: string, eventId: string, expectedTitle: string | null, agenda: readonly AgendaItem[]) {
  await acquireSyncCommitOrderLock(executor);
  const found = await executor.query<Row>(`select event_id, title, event_version, coalesce(source_payload, '{}'::jsonb) as source_payload from event_ops_events where workspace_id = $1 and event_id = $2 for update`, [workspaceId, eventId]);
  const row = found.rows[0];
  if (!row) return { eventId, status: "not_found" as const };
  if (expectedTitle && (row.title ?? "").trim() !== expectedTitle) return { eventId, status: "title_mismatch" as const, title: row.title };
  const payload = (typeof row.source_payload === "string" ? JSON.parse(row.source_payload) : row.source_payload ?? {}) as Record<string, unknown>;
  const patch = planPatch(payload, agenda);
  if (!patch) return { eventId, status: "already_complete" as const, version: Number(row.event_version) };
  const version = Number(row.event_version);
  const updated = await executor.query<{ event_version: number | string; source_payload: unknown; title: string | null; description: string | null; venue: string | null; starts_at: unknown; ends_at: unknown; lifecycle_state_v2: string | null; organizer_actor_id: string; public_code: string | null; timezone: string | null }>(
    `update event_ops_events set source_payload = coalesce(source_payload, '{}'::jsonb) || $3::jsonb,
       event_version = event_version + 1, revision = revision + 1, updated_at = now()
     where workspace_id = $1 and event_id = $2 and event_version = $4
     returning event_version, source_payload, title, description, venue, starts_at, ends_at, lifecycle_state_v2, organizer_actor_id, public_code, timezone`,
    [workspaceId, eventId, JSON.stringify(patch), version],
  );
  const saved = updated.rows[0];
  if (!saved) throw new Error(`VERSION_CONFLICT:${eventId}`);
  const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value == null ? null : new Date(String(value)).toISOString());
  const contentHash = createHash("sha256").update(JSON.stringify({ description: saved.description, endsAt: iso(saved.ends_at), eventId, lifecycle: saved.lifecycle_state_v2, organizerActorId: saved.organizer_actor_id, payload: saved.source_payload, publicCode: saved.public_code, startsAt: iso(saved.starts_at), timezone: saved.timezone, title: saved.title, venue: saved.venue })).digest("hex");
  await executor.query(
    `insert into event_event_versions (
       workspace_id, event_id, event_version, public_code, title, description, venue, timezone, starts_at, ends_at,
       lifecycle_state_v2, source_payload, cancelled_at, archived_at, organizer_actor_id, content_hash, created_at
     ) select workspace_id, event_id, event_version, public_code, title, description, venue, timezone, starts_at, ends_at,
              lifecycle_state_v2, source_payload, cancelled_at, archived_at, organizer_actor_id, $3, now()
       from event_ops_events where workspace_id = $1 and event_id = $2`,
    [workspaceId, eventId, contentHash],
  );
  return { eventId, status: "updated" as const, fromVersion: version, toVersion: Number(saved.event_version), keys: Object.keys(patch) };
}

class Rollback extends Error {}

async function main(argv: readonly string[]) {
  loadLocalEnv();
  const apply = argv.includes("--apply");
  const rollback = argv.includes("--rollback");
  const onlyIndex = argv.indexOf("--only");
  const only = onlyIndex >= 0 ? argv[onlyIndex + 1] : null;
  if (apply && rollback) throw new Error("USAGE: --apply and --rollback are exclusive");
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createEventOperationsPostgresClient({ connectionString: config.connectionString, max: 1 });
  // --rollback with --only may target any event (a local SQL check); everything else is limited to the four targets.
  const ids = only ? [only] : Object.keys(TARGETS);
  if (only && !TARGETS[only] && !rollback) throw new Error(`NOT_A_TARGET:${only}`);
  const results: unknown[] = [];
  try {
    for (const eventId of ids) {
      const target = TARGETS[eventId] ?? { agenda: TARGETS["d4bb5ca1-ef91-486b-bc89-b9f58c73d8be"]!.agenda, title: null };
      if (!apply && !rollback) {
        const found = await client.query<Row>(`select event_id, title, event_version, coalesce(source_payload, '{}'::jsonb) as source_payload from event_ops_events where workspace_id = $1 and event_id = $2`, [config.workspaceId, eventId]);
        const row = found.rows[0];
        const payload = row ? ((typeof row.source_payload === "string" ? JSON.parse(row.source_payload) : row.source_payload ?? {}) as Record<string, unknown>) : null;
        results.push(row ? { eventId, title: row.title, version: Number(row.event_version), plan: planPatch(payload!, target.agenda) } : { eventId, status: "not_found" });
        continue;
      }
      try {
        await client.transaction(async (executor) => {
          const result = await fixOne(executor, config.workspaceId, eventId, target.title, target.agenda);
          results.push(rollback ? { ...result, rolledBack: true } : result);
          if (rollback) throw new Rollback();
        });
      } catch (error) {
        if (!(error instanceof Rollback)) throw error;
      }
    }
    console.info(`chinichi-startup-event-details ${apply ? "APPLIED" : rollback ? "ROLLED_BACK" : "DRY_RUN"} ${JSON.stringify(results)}`);
  } finally {
    await client.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`chinichi-startup-event-details FAILED ${error instanceof Error ? error.message : "unknown"}`);
    process.exitCode = 1;
  });
}
