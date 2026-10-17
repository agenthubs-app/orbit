// R30 全局搜索的 live 数据源（search/DESIGN.md §3.2）：只编排已有的本人作用域读取，不建索引。
// - 人：联系人列表搜索服务（features/contacts，reader 的 search_blob like；actor / workspace 作用域）；
// - 推進中 / 知り合い：计划关联联系人（features/plans/v2/active-needs.ts，R11-05 同源）；
// - イベント：R27 journey 的 live 服务（规则 A 由它守）；
// - 人数与业界计数：orbit_records contacts 的两条 count 查询（与 journey live 的 contacts 读法同一张表）；
// - 会話：R21 接口到位后在这里接 `conversations`，types 随之出现（现在为 null）。
import type { EventSearchResponse } from "../../../shared/contract/event-search";
import { createConfiguredTransactionalPostgresRuntime } from "../../../shared/storage/transactional-postgres";
import { createContactsListSearchAndFilterService } from "../../contacts/service-factory";
import { configuredJourneyLiveService } from "../../events/journey/handlers";
import { planGoalRelatedContactIds } from "../../plans/v2/active-needs";
import type { ConversationCandidate, IndustryCount, PersonCandidate } from "./core";

export interface GlobalSearchLivePorts {
  /** `terms` are folded (NFKC, lower case) and AND-ed: every term must hit somewhere in the contact. */
  people(actorId: string, terms: readonly string[]): Promise<{ items: PersonCandidate[]; total: number }>;
  planLinked(actorId: string): Promise<ReadonlySet<string> | null>;
  events(actorId: string, query: string, limit: number): Promise<EventSearchResponse | null>;
  /** Total contacts of mine and how many per industry (primary and secondary ids). */
  counts(actorId: string): Promise<{ total: number; industries: IndustryCount[] }>;
  /** R21: conversation search; null = not available (the 会話 chip stays hidden). */
  conversations: ((actorId: string, query: string, limit: number) => Promise<ConversationCandidate[]>) | null;
  semanticAvailable: boolean;
}

/** The reader pages at 50; a query has at most this many terms searched (the rest still rank and highlight). */
const PEOPLE_RECALL = 50;
const MAX_TERMS = 4;

type Query = (sql: string, values: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;

const warn = (event: string) => (error: unknown) => { console.warn(JSON.stringify({ error: error instanceof Error ? error.name : "unknown", event })); return null; };

/** AND across per-term result lists: the rows of the first list that every other list also has (by id), in the first list's order. */
export function intersectById<T extends { id: string }>(lists: readonly (readonly T[])[]): T[] {
  const [first = [], ...rest] = lists;
  const others = rest.map((list) => new Set(list.map((item) => item.id)));
  return first.filter((item) => others.every((ids) => ids.has(item.id)));
}

export function createGlobalSearchLivePorts(): GlobalSearchLivePorts | null {
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return null;
  const workspaceId = runtime.workspaceId;
  const query: Query = (sql, values) => runtime.client.query(sql, values as unknown[]) as Promise<{ rows: Array<Record<string, unknown>> }>;
  return {
    async people(actorId, terms) {
      // The contacts reader matches one string (search_blob like, lower case), so each folded term is searched on its own
      // and the rows are intersected by id — AND across every field the reader searches (notes too). One term keeps the
      // reader's own total; several terms count the intersection of the first PEOPLE_RECALL rows of each.
      const service = createContactsListSearchAndFilterService("live");
      const answers = await Promise.all(terms.slice(0, MAX_TERMS).map((term) => service.searchContacts({ actorId, limit: PEOPLE_RECALL, query: term })));
      if (answers.some((answer) => !answer.success)) return { items: [], total: 0 };
      const lists = answers.map((answer) => (answer.success ? answer.data.contacts : []));
      const items = intersectById(lists).map((item) => ({
        id: item.id, lastInteractionAt: item.lastInteractionAt || null, name: item.displayName, org: item.organization || null,
        other: [item.location, item.profileSnippet, item.relationshipContext, item.nextAction], role: item.role || null,
      }));
      const single = answers.length === 1 && answers[0]!.success ? answers[0]!.data.total : undefined;
      return { items, total: Math.max(single ?? 0, items.length) };
    },
    async planLinked(actorId) {
      const ids = await planGoalRelatedContactIds(actorId).catch(warn("r30_search_plan_failed"));
      return ids && ids.length ? new Set(ids) : ids ? new Set<string>() : null;
    },
    async events(actorId, text, limit) {
      // The journey search matches its own way; the folded, space-joined terms keep full-width and case variants equal.
      const service = await configuredJourneyLiveService().catch(warn("r30_search_events_unconfigured"));
      if (!service) return null;
      return service.search(actorId, text, limit).catch(warn("r30_search_events_failed"));
    },
    async counts(actorId) {
      const result = await query(
        `/* search:r30-global:counts */ select count(*)::int as total
           from orbit_records c
          where c.workspace_id = $1 and c.collection_name = 'contacts' and c.user_id = $2 and c.lifecycle_state <> 'deleted'`,
        [workspaceId, actorId],
      ).catch(warn("r30_search_total_failed"));
      const industries = await query(
        `/* search:r30-global:industries */ select key, count(*)::int as n from (
            select c.payload->>'primaryIndustryId' as key from orbit_records c
             where c.workspace_id = $1 and c.collection_name = 'contacts' and c.user_id = $2 and c.lifecycle_state <> 'deleted'
            union all
            select c.payload->>'secondaryIndustryId' as key from orbit_records c
             where c.workspace_id = $1 and c.collection_name = 'contacts' and c.user_id = $2 and c.lifecycle_state <> 'deleted'
          ) keys where key is not null and key <> '' group by key`,
        [workspaceId, actorId],
      ).catch(warn("r30_search_industries_failed"));
      return {
        industries: (industries?.rows ?? []).map((row) => ({ count: Number(row.n) || 0, id: String(row.key) })),
        total: Number(result?.rows[0]?.total ?? 0) || 0,
      };
    },
    conversations: null,
    semanticAvailable: false,
  };
}
