import { resolveModuleMode } from "../../shared/services/module-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { AppError } from "../../shared/errors/app-error";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import { createPostgresContactCardReader, GOAL_RELATED_IDS_LIMIT, GOAL_RELATED_READ_IDS_LIMIT, INVITE_LINKED_IDS_LIMIT } from "./storage/contact-list-postgres-reader";
import type { ContactsListSearchFilterInput } from "./contract";

export type ContactCardService = ReturnType<typeof createPostgresContactCardReader>;
export interface ContactCardActor { id: string; workspaceId?: string }

/**
 * R11a：列表读时合并的两组 id（都不落库）——生效目标关联的人（计划，`planGoalRelatedContactIds`）与
 * 生效招待连接的人（本人入力，`inviteLinkedContactIds`）。读不到时按「没有」处理（列表照常、浓度退回不含计划的值），
 * 并在服务端日志留错误名（不记 id）。
 */
export interface ContactNetworkMergeSources {
  goalRelatedIds(actorId: string): Promise<readonly string[]>;
  inviteLinkedIds(actorId: string): Promise<readonly string[]>;
}

function logMergeFailure(event: string, error: unknown): void {
  console.warn(JSON.stringify({ event, error: error instanceof Error ? error.name : "unknown" }));
}

export const defaultContactNetworkMergeSources: ContactNetworkMergeSources = {
  async goalRelatedIds(actorId) {
    try {
      const { planGoalRelatedContactIds } = await import("../plans/v2/active-needs");
      return await planGoalRelatedContactIds(actorId);
    } catch (error) {
      logMergeFailure("contact_network_goal_related_unavailable", error);
      return [];
    }
  },
  async inviteLinkedIds(actorId) {
    try {
      const { inviteLinkedContactIds } = await import("../invite-codes/configured");
      return await inviteLinkedContactIds(actorId);
    } catch (error) {
      logMergeFailure("contact_network_invite_linked_unavailable", error);
      return [];
    }
  },
};

/** Goal-related ids for one request: sorted, de-duplicated, capped (`truncated` when the cap cut some off). */
export function boundedGoalRelatedIds(ids: readonly string[]): { ids: string[]; truncated: boolean } {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.trim() !== ""))].sort();
  return { ids: unique.slice(0, GOAL_RELATED_IDS_LIMIT), truncated: unique.length > GOAL_RELATED_IDS_LIMIT };
}

/**
 * R11a REVIEW M2: goal-related ids for the server's own reads (list, summary, tabs, density, filters) — the whole set,
 * sorted and de-duplicated. Only an absurd input beyond GOAL_RELATED_READ_IDS_LIMIT is cut, and that is logged.
 */
export function internalGoalRelatedIds(ids: readonly string[]): string[] {
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.trim() !== ""))].sort();
  if (unique.length > GOAL_RELATED_READ_IDS_LIMIT) {
    console.warn(JSON.stringify({ event: "contact_network_goal_related_truncated", count: unique.length, limit: GOAL_RELATED_READ_IDS_LIMIT }));
  }
  return unique.slice(0, GOAL_RELATED_READ_IDS_LIMIT);
}

/** Product loaders and HTTP share this bounded reader; no legacy graph fallback. */
export function createContactCardService(actor: ContactCardActor, merge: ContactNetworkMergeSources = defaultContactNetworkMergeSources): ContactCardService {
  if (resolveModuleMode() !== "live") throw new AppError("SERVICE_UNAVAILABLE", "Contact pages require a live provider.");
  const runtime = createConfiguredPostgresLiveRecordStore();
  if (!runtime || (actor.workspaceId && actor.workspaceId !== runtime.workspaceId)) {
    throw new AppError("SERVICE_UNAVAILABLE", "Contact storage is unavailable.");
  }
  const reader = createPostgresContactCardReader({ ...runtime,
    cursorSecret: process.env.ORBIT_READ_CURSOR_SECRET ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "",
  });
  return wrapContactCardReader(reader, actor, merge);
}

/** PX1 design world: local development only, after an explicit variant switch. */
export async function createDesignContactCardService(actor: ContactCardActor): Promise<ContactCardService | null> {
  const listed = (process.env.ORBIT_REDESIGN_MOCK ?? "").split(",").map((item) => item.trim());
  if (process.env.NODE_ENV === "production" || !listed.includes("network")) return null;
  const [{ activeNetworkFixture, NETWORK_FIXTURE_NOW }, { designNetworkContactFixture }, directory] = await Promise.all([
    import("../network-analysis/analysis-fixtures"), import("../network-analysis/design-fixtures/contacts"),
    import("../../shared/api-schema/contact-local-directory"),
  ]);
  const variant = activeNetworkFixture(actor.id).variant;
  if (!variant) return null;
  const fixture = designNetworkContactFixture(variant);
  const asOf = NETWORK_FIXTURE_NOW.toISOString();
  const asLocal = (query: ContactsListSearchFilterInput) => ({
    query: query.query, sourceFilters: query.sourceFilters, statusFilters: query.statusFilters,
    tagFilters: query.tagFilters, valueFilters: query.valueFilters,
    goalRelated: query.goalRelated, needsFollowUp: query.needsFollowUp,
    industryFilters: query.industryFilters, regionFilters: query.regionFilters,
    metFilters: query.metFilters, densityFilters: query.densityFilters, sort: query.sort,
    goalRelatedIds: fixture.goalRelatedIds, followUpContactIds: fixture.followUpContactIds,
    monthStart: "2026-10-01T00:00:00.000Z",
  });
  const check = (actorId: string) => {
    if (actorId !== actor.id) throw new AppError("FORBIDDEN", "Contact access is scoped to one account.");
  };
  return {
    async page(query, actorId) {
      check(actorId);
      const limit = query.limit ?? 30;
      const cursor = query.cursor ?? "0";
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !/^(0|[1-9][0-9]*)$/.test(cursor)) throw new Error("CONTACT_PAGE_INPUT_INVALID");
      const offset = Number(cursor);
      if (!Number.isSafeInteger(offset)) throw new Error("CONTACT_PAGE_INPUT_INVALID");
      const matched = directory.localContactDirectory(fixture.rows, asLocal(query));
      const items = matched.slice(offset, offset + limit).flatMap((row) => row.card ? [row.card] : []);
      const hasMore = offset + limit < matched.length;
      return { items, hasMore, nextCursor: hasMore ? String(offset + limit) : null, asOf };
    },
    async summary(query, actorId) {
      check(actorId);
      return { ...directory.localContactDirectorySummary(fixture.rows, asLocal(query)), asOf };
    },
  };
}

/** The read-budget gate, scope check and R11a merge around a card reader (exported for tests). */
export function wrapContactCardReader(reader: ContactCardService, actor: ContactCardActor, merge: ContactNetworkMergeSources): ContactCardService {
  const check = (actorId: string) => {
    if (actorId !== actor.id) throw new AppError("FORBIDDEN", "Contact scope does not match.");
    // R11a：要フォロー 读 tasks（普通任务 + 关系跟进任务）、目標に関係 读计划。
    for (const collectionName of ["contacts", "connections", "contact_detail_states", "evidence", "tasks", "plans"]) {
      resolveSharedReadBudgetGate()?.assertAllowed({ collectionName });
    }
  };
  const merged = async (query: ContactsListSearchFilterInput, actorId: string): Promise<ContactsListSearchFilterInput> => {
    const [goal, invite] = await Promise.all([merge.goalRelatedIds(actorId), merge.inviteLinkedIds(actorId)]);
    // R11a REVIEW M2：内部读取用完整集合（页签 / 浓度 / 筛选不漏人）；500 上限只用于公开的 goal-related-ids 接口。
    return { ...query, goalRelatedContactIds: internalGoalRelatedIds(goal),
      inviteLinkedContactIds: [...new Set(invite)].slice(0, INVITE_LINKED_IDS_LIMIT) };
  };
  return {
    async page(query, actorId) { check(actorId); return reader.page(await merged(query, actorId), actorId); },
    async summary(query, actorId) { check(actorId); return reader.summary(await merged(query, actorId), actorId); },
  };
}

function sortParam(params: URLSearchParams): "recent" | "added" {
  const value = params.get("sort");
  if (value === null || value === "" || value === "recent") return "recent";
  if (value === "added") return "added";
  throw new Error("CONTACT_PAGE_INPUT_INVALID");
}

function flag(params: URLSearchParams, key: string): boolean {
  const values = params.getAll(key);
  if (values.length > 1) throw new Error("CONTACT_PAGE_INPUT_INVALID");
  const value = values[0];
  if (value === undefined || value === "" || value === "0" || value === "false") return false;
  if (value === "1" || value === "true") return true;
  throw new Error("CONTACT_PAGE_INPUT_INVALID");
}

export function readContactCardQuery(params: URLSearchParams): ContactsListSearchFilterInput {
  for (const key of ["query", "cursor", "limit", "sort"]) {
    if (params.getAll(key).length > 1) throw new Error("CONTACT_PAGE_INPUT_INVALID");
  }
  const list = (key: string) => params.getAll(key).flatMap(v => v.split(",")).map(v => v.trim()).filter(Boolean);
  const goalRelated = flag(params, "goalRelated");
  const needsFollowUp = flag(params, "needsFollowUp");
  return { query: params.get("query"), cursor: params.get("cursor"),
    limit: params.has("limit") ? Number(params.get("limit")) : 30,
    sourceFilters: list("source"), statusFilters: list("status"), tagFilters: list("tag"), valueFilters: list("value"),
    ...(list("tier").length ? { tierFilters: list("tier") } : {}),
    // R11a：页签与絞り込み（没带的不进查询，旧请求与旧游标不变）。
    ...(goalRelated ? { goalRelated } : {}),
    ...(needsFollowUp ? { needsFollowUp } : {}),
    ...(list("industry").length ? { industryFilters: list("industry") } : {}),
    ...(list("region").length ? { regionFilters: list("region") } : {}),
    ...(list("met").length ? { metFilters: list("met") } : {}),
    ...(list("density").length ? { densityFilters: list("density") } : {}),
    // RD-33：`sort=added` 按加入时间倒序（R10 首页「最近 4 人」）；缺省 / `recent` = 原顺序，旧请求与旧游标不变。
    ...(sortParam(params) === "added" ? { sort: "added" as const } : {}) };
}

export function contactCardReadError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : "";
  if (message === "CONTACT_CURSOR_INVALID") return new AppError("VALIDATION_ERROR", "分页已失效，请从第一页重新加载。");
  if (message === "CONTACT_PAGE_INPUT_INVALID") return new AppError("VALIDATION_ERROR", "分页或筛选参数无效。");
  if (message === "CONTACT_SEARCH_RUNTIME_UNSUPPORTED") return new AppError("SERVICE_UNAVAILABLE", "当前环境暂不支持此搜索，请清除关键词后浏览联系人。");
  return new AppError("SERVICE_UNAVAILABLE", "联系人暂时无法读取，请稍后重试。");
}
