import { z } from "zod";
import type { PlanPoolLike } from "../plans/repository";
import { createPostgresPlanV2Repository } from "../plans/v2/repository";
import { createPlanV2Service } from "../plans/v2/service";
import type { PlanEventFact } from "../plans/v2/overview";
import { localParts } from "../tasks/local-date-time";
import type { TodoSourceReader } from "./service";

export const TODO_PLAN_ROWS_PER_QUERY = 100;
export const TODO_PLAN_QUERY_LIMIT = 32;
export const TODO_PLAN_ROW_LIMIT = 2000;
export const TODO_PLAN_BYTE_LIMIT = 2 * 1024 * 1024;
const collections = ["plans", "plan_items", "plan_log", "plan_match_candidates", "plan_revisions", "contacts", "contact_detail_states"] as const;

/** This facade is private to the existing PlanV2 read repository. PostgreSQL
 * also enforces READ ONLY. An over-limit relation fails the source: passing a
 * truncated log to pending() could resurrect a previously dismissed decision. */
function boundedReadPool(pool: PlanPoolLike): PlanPoolLike {
  let queries = 0, rows = 0, bytes = 0;
  return { async connect() {
    const client = await pool.connect();
    return { release: client.release.bind(client), async query(text, values) {
      const statement = text.replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (/^(begin isolation level repeatable read read only|commit|rollback)$/i.test(statement)) return client.query(text, values);
      // These are the SELECT shapes used by summary()/pending(). No flow,
      // mutation, intake, arbitrary table, or lock statement is admitted.
      if (!/^select\b/i.test(statement) || !/\bfrom\s+(plans|plan_items|plan_log|plan_match_candidates|plan_revisions|orbit_records)\b/i.test(statement)
        || /\b(insert|update|delete|nextval|set_config|pg_advisory|for\s+update)\b/i.test(statement)) throw Error("TODO_PLAN_READ_SHAPE_UNSUPPORTED");
      if (++queries > TODO_PLAN_QUERY_LIMIT) throw Error("TODO_PLAN_READ_LIMIT");
      const result = await client.query(`select * from (${text}) todo_plan_read limit ${TODO_PLAN_ROWS_PER_QUERY + 1}`, values);
      rows += result.rows.length; bytes += Buffer.byteLength(JSON.stringify(result.rows));
      if (result.rows.length > TODO_PLAN_ROWS_PER_QUERY || rows > TODO_PLAN_ROW_LIMIT || bytes > TODO_PLAN_BYTE_LIMIT) throw Error("TODO_PLAN_READ_LIMIT");
      return result;
    } };
  } };
}

export function createTodoPlanReaders(input: { pool: PlanPoolLike; workspaceId: string; now?: () => Date; assertAllowed: (collection: string) => void; events?: (actorId: string, at: Date) => Promise<PlanEventFact[]> }): { plan_pending: TodoSourceReader; plan_today_chance: TodoSourceReader } {
  const makeService = (actorId: string, events?: () => Promise<PlanEventFact[]>, now = input.now) => {
    for (const collection of collections) input.assertAllowed(collection);
    return createPlanV2Service({ repository: createPostgresPlanV2Repository({ pool: boundedReadPool(input.pool) }),
      scope: { actorId, workspaceId: input.workspaceId }, now,
      ...(events ? { events } : {}),
    });
  };
  return {
    plan_pending: async query => {
      // pendingItems uses only plans, log, types, candidates and contacts; event
      // facts do not affect it. Do not execute pending()'s optional event loader.
      const items = await makeService(query.actorId).pending();
      const unique = [...new Map(items.map(item => [item.id, item])).values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const after = query.cursor ? z.string().min(1).max(2048).parse(JSON.parse(query.cursor)) : null;
      const remaining = unique.filter(item => !after || item.id > after);
      return { total: Math.min(100, unique.length), capped: unique.length > 100, hasMore: remaining.length > query.limit,
        entries: remaining.slice(0, query.limit).map(item => ({ cursor: JSON.stringify(item.id), item: {
          key: `plan_pending:${item.id}`, source: "plan_pending", sourceId: item.id, titlePreview: item.title.slice(0, 240), createdAt: item.createdAt,
          ...(item.detail ? { reasonPreview: item.detail.slice(0, 320) } : {}), ...(item.contactId ? { contactId: item.contactId } : {}), actions: ["accept", "dismiss", "open"],
        } })) };
    },
    plan_today_chance: async query => {
      let facts: PlanEventFact[] = [];
      const at = input.now?.() ?? new Date();
      const service = makeService(query.actorId, async () => facts, () => at);
      const current = (await service.summary()).current;
      if (!current) return { entries: [], total: 0, hasMore: false, notImplemented: true };
      if (localParts(at, query.timeZone).date !== query.date) return { entries: [], total: 0, hasMore: false };
      if (input.events) { input.assertAllowed("events"); facts = await input.events(query.actorId, at); }
      const chance = (await service.overview(current.planId, { language: "ja", platform: "web", timeZone: query.timeZone }))?.todayChance;
      if (!chance) return { entries: [], total: 0, hasMore: false };
      const id = `${current.planId}:${query.date}`;
      return { total: 1, hasMore: false, entries: query.cursor ? [] : [{ cursor: JSON.stringify(id), item: {
        key: `plan_today_chance:${id}`, source: "plan_today_chance", sourceId: id, titlePreview: chance.label.slice(0, 240),
        createdAt: at.toISOString(), draftAvailable: chance.kind === "candidate", ...(chance.basis ? { reasonPreview: chance.basis.slice(0, 320) } : {}),
        ...(chance.eventId ? { eventId: chance.eventId } : {}),
      } }] };
    },
  };
}
