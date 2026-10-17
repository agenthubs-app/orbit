// R30 全局搜索的路由处理（search/DESIGN.md §3.1、§6）。Owner: 甲 (R30).
// - 模式走 `redesignContractRoute("global-search")`：mock / hybrid → 演示世界（shared/mock/demo-world/global-search.ts）；live → live.ts 的数据源 + core.ts 编排。
// - live 要登录（401）；演示账号在 live 下读示例世界。
// - 限流：每人每分钟 60 次（关键词）/ 20 次（意味検索），超出 429 `RATE_LIMITED`（进程内滑动窗口；多实例时各算各的，REPORT 写明）。
// - 查询文本不进应用日志（只记长度、组数、耗时）。
import { globalSearchQueryObject, globalSearchResponseSchema } from "../../../shared/api-schema/global-search";
import { splitSearchTerms } from "../../../shared/compute/search-normalize";
import type { GlobalSearchResponse } from "../../../shared/contract/global-search";
import { AppError } from "../../../shared/errors/app-error";
import { DEMO_ACTOR_ID } from "../../../shared/mock/demo-world/fixtures";
import { demoGlobalSearch } from "../../../shared/mock/demo-world/global-search";
import { resolveAuthenticatedApiActor, type ResolveAuthenticatedApiActor } from "../../../app/api/_shared/authenticated-actor";
import { requestContext } from "../../plans/v2/flow-handlers";
import { redesignContractRoute, type ContractReply } from "../../redesign-contracts/route";
import { buildGlobalSearch } from "./core";
import { createGlobalSearchLivePorts, type GlobalSearchLivePorts } from "./live";

export const GLOBAL_SEARCH_KEYWORD_PER_MINUTE = 60;
export const GLOBAL_SEARCH_SEMANTIC_PER_MINUTE = 20;
/** 「こんな検索もできます」 (live): the keyword-capable ones while semantic search is unavailable (DESIGN §2.3). */
export const GLOBAL_SEARCH_EXAMPLES = ["投資家", "製造業の決裁者", "先月会った人", "紹介してくれそうな人", "3か月 連絡していない人"] as const;
export const GLOBAL_SEARCH_KEYWORD_EXAMPLES = ["投資家", "製造業の決裁者"] as const;

export interface GlobalSearchDeps {
  resolveActor?: ResolveAuthenticatedApiActor;
  /** Tests: the live ports (null = unconfigured). */
  livePorts?: () => GlobalSearchLivePorts | null;
  now?: () => Date;
}

/** Sliding one-minute window per actor; a new instance starts empty. */
export function createRateWindow(now: () => Date) {
  const hits = new Map<string, number[]>();
  return {
    take(key: string, limit: number): boolean {
      const at = now().getTime();
      const recent = (hits.get(key) ?? []).filter((time) => at - time < 60_000);
      if (recent.length >= limit) { hits.set(key, recent); return false; }
      recent.push(at);
      hits.set(key, recent);
      return true;
    },
    reset() { hits.clear(); },
  };
}

const processWindow = createRateWindow(() => new Date());

export function createGlobalSearchHandlers(deps: GlobalSearchDeps = {}) {
  const resolveActor = deps.resolveActor ?? resolveAuthenticatedApiActor;
  const now = deps.now ?? (() => new Date());
  const window = deps.now ? createRateWindow(deps.now) : processWindow;
  const ports = deps.livePorts ?? createGlobalSearchLivePorts;

  const get = redesignContractRoute("global-search", globalSearchResponseSchema, async (request, _params, { service }): Promise<ContractReply> => {
    const url = new URL(request.url);
    const raw = Object.fromEntries([...url.searchParams.entries()].filter(([key]) => !["lang", "platform"].includes(key)));
    const parsed = globalSearchQueryObject.safeParse(raw);
    if (!parsed.success) return { error: new AppError("VALIDATION_ERROR", "Invalid search query.") };
    const input = parsed.data;
    const context = requestContext(request);
    const platform = context.platform === "app" ? "app" : "web";
    const started = now().getTime();

    const actor = await resolveActor().catch(() => null);
    if (service.mode === "live" && !actor) return { error: new AppError("UNAUTHORIZED", "Sign in to access this resource.") };
    const sample = service.mode !== "live" || actor?.id === DEMO_ACTOR_ID;
    const actorKey = actor?.id ?? DEMO_ACTOR_ID;
    if (input.q && !window.take(`${actorKey}:${input.semantic ? "semantic" : "keyword"}`, input.semantic ? GLOBAL_SEARCH_SEMANTIC_PER_MINUTE : GLOBAL_SEARCH_KEYWORD_PER_MINUTE)) {
      return { context: { reason: "RATE_LIMITED" }, error: new AppError("FORBIDDEN", "Too many searches. Try again in a minute."), status: 429 };
    }

    let data: GlobalSearchResponse;
    if (sample) {
      data = demoGlobalSearch({ limit: input.limit, platform, query: input.q, semantic: input.semantic, types: input.types });
    } else {
      const live = ports();
      if (!live) return { context: { reason: "GLOBAL_SEARCH_UNCONFIGURED" }, error: new AppError("SERVICE_UNAVAILABLE", "Search requires a configured live database.") };
      data = await searchLive(live, { actorId: actor!.id, language: context.language, limit: input.limit, now: now(), platform, query: input.q, types: input.types });
    }
    console.info(JSON.stringify({ event: "r30_global_search", groups: [data.people.items.length, data.events.items.length, data.conversations?.items.length ?? 0], ms: now().getTime() - started, mode: service.mode, queryLength: input.q.length, semantic: input.semantic }));
    return { data };
  });

  return { get };
}

export async function searchLive(live: GlobalSearchLivePorts, input: { actorId: string; query: string; limit: number; types?: readonly ("people" | "events" | "conversations")[]; platform: "web" | "app"; language: "ja" | "zh" | "en"; now: Date }): Promise<GlobalSearchResponse> {
  const types: ("people" | "events" | "conversations")[] = live.conversations ? ["people", "events", "conversations"] : ["people", "events"];
  const terms = splitSearchTerms(input.query);
  const examples = live.semanticAvailable ? [...GLOBAL_SEARCH_EXAMPLES] : [...GLOBAL_SEARCH_KEYWORD_EXAMPLES];
  const counts = await live.counts(input.actorId);
  if (!terms.length) {
    return buildGlobalSearch({ conversations: null, events: null, examples, industryCounts: counts.industries, language: input.language, limit: input.limit, now: input.now, people: [], planLinked: null, platform: input.platform, query: input.query, searchedPeople: counts.total, semanticAvailable: live.semanticAvailable, terms, types });
  }
  const wanted = new Set(input.types?.length ? input.types : types);
  const [people, planLinked, events, conversations] = await Promise.all([
    wanted.has("people") ? live.people(input.actorId, input.query, 20) : Promise.resolve([]),
    wanted.has("people") ? live.planLinked(input.actorId) : Promise.resolve(null),
    live.events(input.actorId, input.query, 20),
    wanted.has("conversations") && live.conversations ? live.conversations(input.actorId, input.query, 20) : Promise.resolve(null),
  ]);
  return buildGlobalSearch({ conversations, events, examples, industryCounts: counts.industries, language: input.language, limit: input.limit, now: input.now, people, planLinked, platform: input.platform, query: input.query, searchedPeople: counts.total, semanticAvailable: live.semanticAvailable, terms, types, wanted: input.types });
}
