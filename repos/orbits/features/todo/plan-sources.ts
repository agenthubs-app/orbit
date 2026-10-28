import { z } from "zod";
import type { PlanPoolLike } from "../plans/repository";
import { createPostgresPlanV2Repository } from "../plans/v2/repository";
import type { PlanV2Reader, PlanV2Repository } from "../plans/v2/types";
import { createPlanV2Service } from "../plans/v2/service";
import type { PlanEventFact } from "../plans/v2/overview";
import { localParts } from "../tasks/local-date-time";
import type { TodoSourceReader } from "./service";

export const TODO_PLAN_ROWS_PER_QUERY = 100;
/** A plan's log is read whole (pending decisions, awards and steps all depend on it) and grows with
 * every action on the plan, so it has its own, larger cap; past it the source still fails closed. */
export const TODO_PLAN_LOG_ROWS_PER_QUERY = 1000;
export const TODO_PLAN_QUERY_LIMIT = 32;
/** Two active plans' whole logs plus their other rows. */
export const TODO_PLAN_ROW_LIMIT = 3000;
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
      const perQuery = /\bfrom\s+plan_log\b/i.test(statement) ? TODO_PLAN_LOG_ROWS_PER_QUERY : TODO_PLAN_ROWS_PER_QUERY;
      const result = await client.query(`select * from (${text}) todo_plan_read limit ${perQuery + 1}`, values);
      rows += result.rows.length; bytes += Buffer.byteLength(JSON.stringify(result.rows));
      if (result.rows.length > perQuery || rows > TODO_PLAN_ROW_LIMIT || bytes > TODO_PLAN_BYTE_LIMIT) throw Error("TODO_PLAN_READ_LIMIT");
      return result;
    } };
  } };
}

/** The two plan sources (pending, today's chance) read the same plan rows: within one to-do read
 * (`answers`, created per read() by the to-do service) each read is asked once and its answer
 * shared, handed out as a copy so neither caller can change what the other sees. Writes are refused. */
function sharedPlanReads(repository: PlanV2Repository, answers: Map<string, Promise<unknown>>): PlanV2Repository {
  return {
    transact: () => { throw Error("TODO_PLAN_READ_SHAPE_UNSUPPORTED"); },
    read: (scope, operation) => repository.read(scope, reader => operation(new Proxy(reader, {
      get(target, name) {
        const method = Reflect.get(target, name) as unknown;
        if (typeof method !== "function" || typeof name !== "string") return method;
        return (...args: unknown[]) => {
          const key = JSON.stringify(["todo-plan", scope.workspaceId, scope.actorId, name, args]);
          let answer = answers.get(key);
          if (!answer) {
            answer = (method as (...values: unknown[]) => Promise<unknown>).apply(target, args);
            answers.set(key, answer);
            answer.catch(() => answers.delete(key));
          }
          return answer.then(value => structuredClone(value));
        };
      },
    }) as PlanV2Reader)),
  };
}

export function createTodoPlanReaders(input: { pool: PlanPoolLike; workspaceId: string; now?: () => Date; assertAllowed: (collection: string) => void; events?: (actorId: string, at: Date) => Promise<PlanEventFact[]> }): { plan_pending: TodoSourceReader; plan_today_chance: TodoSourceReader } {
  const makeService = (actorId: string, shared: Map<string, Promise<unknown>> | undefined, events?: () => Promise<PlanEventFact[]>, now = input.now) => {
    for (const collection of collections) input.assertAllowed(collection);
    const repository = createPostgresPlanV2Repository({ pool: boundedReadPool(input.pool) });
    return createPlanV2Service({ repository: shared ? sharedPlanReads(repository, shared) : repository,
      scope: { actorId, workspaceId: input.workspaceId }, now,
      ...(events ? { events } : {}),
    });
  };
  return {
    plan_pending: async query => {
      // pendingItems uses only plans, log, types, candidates and contacts; event
      // facts do not affect it. Do not execute pending()'s optional event loader.
      const items = await makeService(query.actorId, query.shared).pending();
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
      const service = makeService(query.actorId, query.shared, async () => facts, () => at);
      // Only the chance is shown: not summary()'s goal scores, nor the rest of overview().
      const planId = await service.currentPlanId();
      if (!planId) return { entries: [], total: 0, hasMore: false, notImplemented: true };
      if (localParts(at, query.timeZone).date !== query.date) return { entries: [], total: 0, hasMore: false };
      if (input.events) { input.assertAllowed("events"); facts = await input.events(query.actorId, at); }
      const chance = await service.todayChance(planId, { language: "ja", platform: "web", timeZone: query.timeZone });
      if (!chance) return { entries: [], total: 0, hasMore: false };
      const id = `${planId}:${query.date}`;
      return { total: 1, hasMore: false, entries: query.cursor ? [] : [{ cursor: JSON.stringify(id), item: {
        key: `plan_today_chance:${id}`, source: "plan_today_chance", sourceId: id, titlePreview: chance.label.slice(0, 240),
        createdAt: at.toISOString(), draftAvailable: chance.kind === "candidate", ...(chance.basis ? { reasonPreview: chance.basis.slice(0, 320) } : {}),
        ...(chance.eventId ? { eventId: chance.eventId } : {}),
      } }] };
    },
  };
}
