/**
 * W0051：「洞察」标签的服务端读取与视图（`/app/contacts/dashboard?tab=insight`，只有这个标签读）。
 *
 * 一条只读语句取一页 30 位（排序：相关度／强度档／最近往来；筛选：行业／地区／强度档），档位实时取 W0047 读模型；
 * 0 次模型调用、0 次配额预留、0 写入（易错边界 1）。没有关系目标时仍列出已有行，但每行显示「设置关系目标后生成」。
 */
import { INDUSTRY_CATALOG, isIndustryIdCode, industryLabel } from "../../../../../shared/domain/industries";
import { countryDisplayName, isValidCountryCode, REGION_COMMON_COUNTRY_CODES } from "../../../../../shared/domain/regions";
import type { RelationshipTierGroup } from "../../../../../shared/contract/relationship-strength";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import {
  CONTACT_INSIGHTS_TAB_PAGE_SIZE,
  CONTACT_INSIGHTS_TAB_SORTS,
  readContactInsightsTabPage,
  type ContactInsightsTabPage,
  type ContactInsightsTabQuery,
  type ContactInsightsTabSort,
} from "../../../../../features/contacts/insights/tab-reader";
import { contactInsightView, type ContactInsightView } from "../../../../../features/contacts/insights/view";
import { resolveModuleMode } from "../../../../../shared/services/module-mode";
import { createConfiguredTransactionalPostgresRuntime } from "../../../../../shared/storage/transactional-postgres";
import type { NetworkCopy } from "./network-copy";

export const INSIGHTS_TAB_HREF = "/app/contacts/dashboard?tab=insight";

export interface InsightsTabRow {
  contactId: string;
  href: string;
  name: string;
  subtitle: string;
  tier: RelationshipTierGroup | null;
  industry: NetworkCopy | null;
  insight: ContactInsightView;
}

export interface InsightsTabOption {
  value: string;
  label: NetworkCopy;
}

export interface InsightsTabView {
  state: "ready" | "unavailable";
  hasGoal: boolean;
  rows: InsightsTabRow[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  query: ContactInsightsTabQuery;
  options: { industries: InsightsTabOption[]; countries: InsightsTabOption[] };
}

type SearchValue = string | string[] | undefined;

function single(value: SearchValue): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

/** URL → 查询（未知值一律忽略，回到默认）。 */
export function parseInsightsTabQuery(search: Record<string, SearchValue>): ContactInsightsTabQuery {
  const sort = single(search.sort);
  const industry = single(search.industry);
  const country = single(search.country)?.toUpperCase() ?? null;
  const tier = single(search.tier);
  const page = Number(single(search.page) ?? "1");
  return {
    country: country && isValidCountryCode(country) ? country : null,
    industry: industry && isIndustryIdCode(industry) ? industry : null,
    page: Number.isSafeInteger(page) && page >= 1 && page <= 1000 ? page : 1,
    sort: (CONTACT_INSIGHTS_TAB_SORTS as readonly string[]).includes(sort ?? "") ? (sort as ContactInsightsTabSort) : "relevance",
    tier: tier === "new" || tier === "active" || tier === "core" || tier === "dormant" ? tier : null,
  };
}

export function insightsTabOptions(): InsightsTabView["options"] {
  return {
    countries: REGION_COMMON_COUNTRY_CODES.map((code) => ({ label: { en: countryDisplayName(code, "en"), zh: countryDisplayName(code, "zh") }, value: code })),
    industries: [...INDUSTRY_CATALOG].sort((a, b) => a.sortOrder - b.sortOrder).map((entry) => ({ label: { en: entry.labels.en, zh: entry.labels.zh }, value: entry.id })),
  };
}

export function buildInsightsTabView(input: { page: ContactInsightsTabPage | null; query: ContactInsightsTabQuery; goal: string | null; now: Date }): InsightsTabView {
  const hasGoal = Boolean(input.goal?.trim());
  if (!input.page) {
    return { hasGoal, hasNext: false, options: insightsTabOptions(), page: input.query.page, pageSize: CONTACT_INSIGHTS_TAB_PAGE_SIZE, query: input.query, rows: [], state: "unavailable", total: 0 };
  }
  return {
    hasGoal,
    hasNext: input.page.hasNext,
    options: insightsTabOptions(),
    page: input.query.page,
    pageSize: CONTACT_INSIGHTS_TAB_PAGE_SIZE,
    query: input.query,
    rows: input.page.entries.map((entry) => ({
      contactId: entry.row.contactId,
      href: `/app/contacts/${encodeURIComponent(entry.row.contactId)}`,
      industry: entry.industryId && isIndustryIdCode(entry.industryId) ? { en: industryLabel(entry.industryId, "en"), zh: industryLabel(entry.industryId, "zh") } : null,
      insight: contactInsightView(entry.row, { contactId: entry.row.contactId, goal: input.goal, now: input.now }),
      name: entry.name,
      subtitle: [entry.organization, entry.role].filter(Boolean).join(" · "),
      tier: entry.tier,
    })),
    state: "ready",
    total: input.page.total,
  };
}

export interface InsightsTabLoaderDeps {
  readPage: ((actorId: string, query: ContactInsightsTabQuery) => Promise<ContactInsightsTabPage>) | null;
}

export function defaultInsightsTabLoaderDeps(): InsightsTabLoaderDeps {
  if (resolveModuleMode() !== "live") return { readPage: null };
  const runtime = createConfiguredTransactionalPostgresRuntime();
  if (!runtime) return { readPage: null };
  return { readPage: (actorId, query) => readContactInsightsTabPage({ client: runtime.client, workspaceId: runtime.workspaceId }, actorId, query) };
}

export async function loadInsightsTab(
  input: { actorId: string; search: Record<string, SearchValue>; goal: Promise<string | null> | string | null; now: Date; language?: OrbitLanguage },
  deps: InsightsTabLoaderDeps = defaultInsightsTabLoaderDeps(),
): Promise<InsightsTabView> {
  let query = parseInsightsTabQuery(input.search);
  const [firstPage, goal] = await Promise.all([
    deps.readPage
      ? deps.readPage(input.actorId, query).catch((error: unknown) => {
        console.error(JSON.stringify({ actorId: input.actorId, error: error instanceof Error ? error.name : "unknown", event: "insights_tab_read_failed" }));
        return null;
      })
      : Promise.resolve(null),
    Promise.resolve(input.goal).catch(() => null),
  ]);
  let page = firstPage;
  // review P3：页码越过末页（筛选后变少、旧链接）时按真实总数改读最后一页，而不是显示「还没有洞察」。
  if (page && deps.readPage && page.entries.length === 0 && page.total > 0 && query.page > 1) {
    const last = Math.max(1, Math.ceil(page.total / CONTACT_INSIGHTS_TAB_PAGE_SIZE));
    query = { ...query, page: last };
    page = await deps.readPage(input.actorId, query).catch(() => null);
  }
  return buildInsightsTabView({ goal, now: input.now, page, query });
}
