/**
 * W0051：「洞察」标签的一页（`/app/contacts/dashboard?tab=insight`，服务端分页 30 条）。只读一条语句：
 * 本人洞察行 × 本人已确认联系人（归属谓词同快照）× W0047 强度读模型（档位实时取，R-10）。
 * 排序：相关度／强度档／最近往来；筛选：行业（一级）／地区（国家）／强度档。0 次模型调用、0 写入。
 * 表未迁移（42P01）时返回 unavailable。
 */
import { confirmedContactPredicate } from "../../network-analysis/repository";
import type { RelationshipTierGroup } from "../../../shared/contract/relationship-strength";
import { toContactInsightRow, type ContactInsightRow, type InsightSqlExecutor } from "./repository";

export const CONTACT_INSIGHTS_TAB_PAGE_SIZE = 30;
export const CONTACT_INSIGHTS_TAB_SORTS = ["relevance", "tier", "recent"] as const;
export type ContactInsightsTabSort = (typeof CONTACT_INSIGHTS_TAB_SORTS)[number];

export interface ContactInsightsTabQuery {
  sort: ContactInsightsTabSort;
  industry: string | null;
  country: string | null;
  tier: RelationshipTierGroup | null;
  /** 从 1 开始。 */
  page: number;
}

export interface ContactInsightsTabEntry {
  row: ContactInsightRow;
  name: string;
  organization: string | null;
  role: string | null;
  industryId: string | null;
  countryCode: string | null;
  city: string | null;
  tier: RelationshipTierGroup | null;
  lastSignalAt: string | null;
}

export interface ContactInsightsTabPage {
  entries: ContactInsightsTabEntry[];
  total: number;
  hasNext: boolean;
}

const ORDER_BY: Readonly<Record<ContactInsightsTabSort, string>> = {
  recent: "last_signal_at desc nulls last, relevance desc nulls last, contact_id",
  relevance: "relevance desc nulls last, last_signal_at desc nulls last, contact_id",
  tier: "case tier_group when 'core' then 0 when 'active' then 1 when 'new' then 2 when 'dormant' then 3 else 4 end, relevance desc nulls last, contact_id",
};

export function contactInsightsTabSql(sort: ContactInsightsTabSort): string {
  return `/* contact-insights:tab-page:${sort} */
  with entries as (
    select i.contact_id, i.status, i.goal_relation, i.next_step, i.evidence, i.relevance, i.goal_hash,
      i.dirty_at, i.deferred_until, i.ai_state, i.lease_expires_at,
      c.payload->>'displayName' as name, c.payload->>'organization' as organization, c.payload->>'role' as role,
      c.payload->>'primaryIndustryId' as industry_id, c.payload->'region'->>'countryCode' as country_code, c.payload->'region'->>'city' as city,
      case when (s.payload->>'dormant')::boolean then 'dormant' else s.payload->>'tier' end as tier_group,
      s.payload->>'lastSignalAt' as last_signal_at
    from contact_insights i
    join orbit_records c on c.record_id = i.contact_id and ${confirmedContactPredicate("c")}
    left join orbit_records s on s.workspace_id = $1 and s.collection_name = 'relationship_strengths'
      and s.record_id = 'relationship-strength:' || $2 || ':' || i.contact_id and s.user_id = $2 and s.lifecycle_state <> 'deleted'
    where i.workspace_id = $1 and i.actor_id = $2
      and ($3::text is null or c.payload->>'primaryIndustryId' = $3)
      and ($4::text is null or c.payload->'region'->>'countryCode' = $4)
      and ($5::text is null or (case when (s.payload->>'dormant')::boolean then 'dormant' else s.payload->>'tier' end) = $5)
  ), counted as (
    select count(*)::int as total from entries
  )
  -- review P3：总数与分页分开取，越界页码也能拿到真实总数（左连接保证至少一行）。
  select counted.total, page.* from counted
  left join lateral (
    select * from entries order by ${ORDER_BY[sort]} limit $6 offset $7
  ) page on true`;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const TIERS = new Set(["new", "active", "core", "dormant"]);

export async function readContactInsightsTabPage(
  input: { client: InsightSqlExecutor; workspaceId: string },
  actorId: string,
  query: ContactInsightsTabQuery,
): Promise<ContactInsightsTabPage> {
  const page = Math.max(1, Math.min(1000, Math.floor(query.page) || 1));
  const result = await input.client.query<Record<string, unknown>>(contactInsightsTabSql(query.sort), [
    input.workspaceId, actorId, query.industry, query.country, query.tier,
    CONTACT_INSIGHTS_TAB_PAGE_SIZE + 1, (page - 1) * CONTACT_INSIGHTS_TAB_PAGE_SIZE,
  ]);
  const total = Number(result.rows[0]?.total ?? 0) || 0;
  const pageRows = result.rows.filter((row) => row.contact_id !== null && row.contact_id !== undefined);
  const rows = pageRows.slice(0, CONTACT_INSIGHTS_TAB_PAGE_SIZE);
  return {
    entries: rows.map((row) => ({
      city: text(row.city),
      countryCode: text(row.country_code),
      industryId: text(row.industry_id),
      lastSignalAt: text(row.last_signal_at),
      name: text(row.name) ?? "",
      organization: text(row.organization),
      role: text(row.role),
      row: toContactInsightRow(row),
      tier: typeof row.tier_group === "string" && TIERS.has(row.tier_group) ? (row.tier_group as RelationshipTierGroup) : null,
    })),
    hasNext: pageRows.length > CONTACT_INSIGHTS_TAB_PAGE_SIZE,
    total,
  };
}
