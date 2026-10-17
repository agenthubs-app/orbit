// R11a 人脈（App）: pure view model of the list — tabs, 絞り込み, rows, header and facet options.
// The list itself is the device mirror filtered with the server's rules (api/schema/contact-local-directory);
// this file only turns screen state into that query and cards into rows. No IO, no clock (callers pass `now`).
import type { ContactCardDTO, ContactCardSummaryDTO } from "../../api/contract/contact-card-page";
import type { ContactGoalRelatedLinkDTO } from "../../api/contract/contact-goal-related";
import type { LocalContactDirectoryQuery } from "../../api/contract/contact-local-directory";
import { industryLabel, isIndustryIdCode } from "../../api/domain/industries";
import type { OrbitLanguage } from "../../api/contract/language";

export type NetworkTab = "all" | "goal" | "followUp";
export const NETWORK_TABS: readonly NetworkTab[] = ["all", "goal", "followUp"];

/** 絞り込み groups. 段階 maps to the existing status (代定 12: 知り合い = active, 関係構築 = nurture). */
export interface NetworkFilters {
  statuses: string[];
  industries: string[];
  regions: string[];
  mets: string[];
  densities: string[];
}
export const EMPTY_NETWORK_FILTERS: NetworkFilters = { statuses: [], industries: [], regions: [], mets: [], densities: [] };
export const NETWORK_STAGE_OPTIONS = ["active", "nurture"] as const;
export const NETWORK_MET_OPTIONS = ["event", "referral", "visit", "other"] as const;
export const NETWORK_DENSITY_OPTIONS = ["1", "2", "3"] as const;
/** How many industries / cities get their own chip; the rest fold into その他. */
export const NETWORK_TOP_INDUSTRIES = 5;
export const NETWORK_TOP_REGIONS = 3;
export const OTHER_KEY = "__other__";

export function networkFilterCount(filters: NetworkFilters): number {
  return filters.statuses.length + filters.industries.length + filters.regions.length + filters.mets.length + filters.densities.length;
}

export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export interface FacetOption { key: string; count: number }

/** Top N keys by count (ties by key), then その他 (= every other key, incl. `none`) when it has people. */
export function topFacetOptions(counts: Record<string, number> | undefined, top: number): FacetOption[] {
  const entries = Object.entries(counts ?? {}).filter(([key, count]) => key !== "none" && count > 0)
    .sort(([leftKey, left], [rightKey, right]) => right - left || (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0));
  const shown = entries.slice(0, top).map(([key, count]) => ({ key, count }));
  const rest = Object.entries(counts ?? {}).filter(([key]) => !shown.some((option) => option.key === key)).reduce((sum, [, count]) => sum + count, 0);
  return rest > 0 ? [...shown, { key: OTHER_KEY, count: rest }] : shown;
}

/** その他 → the concrete keys it stands for (everything not shown, incl. `none`). */
export function expandOther(selected: readonly string[], counts: Record<string, number> | undefined, top: number): string[] {
  if (!selected.includes(OTHER_KEY)) return [...selected];
  const shown = new Set(topFacetOptions(counts, top).filter((option) => option.key !== OTHER_KEY).map((option) => option.key));
  const rest = Object.keys(counts ?? {}).filter((key) => !shown.has(key));
  return [...new Set([...selected.filter((key) => key !== OTHER_KEY), ...rest, "none"])];
}

/** `/contacts?industry=<id>` (search 「近い条件なら」, R11-15) preselects that industry. */
export function filtersFromParams(params: { industry?: string | string[] | undefined }): NetworkFilters {
  const raw = Array.isArray(params.industry) ? params.industry : params.industry ? [params.industry] : [];
  const industries = raw.flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean).slice(0, 10);
  return { ...EMPTY_NETWORK_FILTERS, industries };
}

export interface NetworkMerge { goalIds: readonly string[]; followUpIds: readonly string[]; monthStart: string }

/** Screen state → the device directory query (the server's /api/contacts/page meaning). */
export function networkDirectoryQuery(input: { query: string; tab: NetworkTab; filters: NetworkFilters; summary: ContactCardSummaryDTO | null; merge: NetworkMerge }): LocalContactDirectoryQuery {
  const { filters, summary } = input;
  return {
    query: input.query.trim() || null,
    statusFilters: filters.statuses,
    industryFilters: expandOther(filters.industries, summary?.industries, NETWORK_TOP_INDUSTRIES),
    regionFilters: expandOther(filters.regions, summary?.regions, NETWORK_TOP_REGIONS),
    metFilters: filters.mets,
    densityFilters: filters.densities,
    goalRelated: input.tab === "goal",
    needsFollowUp: input.tab === "followUp",
    goalRelatedIds: input.merge.goalIds,
    followUpContactIds: input.merge.followUpIds,
    monthStart: input.merge.monthStart,
  };
}

/** The first instant of the current Tokyo month (JST has no daylight saving); same as the server's tokyoMonthStart. */
export function tokyoMonthStart(nowMs: number): string {
  const tokyo = new Date(nowMs + 9 * 3_600_000);
  return new Date(Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), 1) - 9 * 3_600_000).toISOString();
}

export type NetworkChipKey = "meishi" | "linkedin" | "phone" | "manual" | "self" | "event";

export interface NetworkRow {
  id: string;
  name: string;
  /** 「会社 · 役職」, or null when both are empty (会社・役職 未登録). */
  subtitle: string | null;
  goal: { label: string; talked: boolean } | null;
  density: 1 | 2 | 3;
  chip: NetworkChipKey;
}

export function networkRow(card: ContactCardDTO, goal: ReadonlyMap<string, ContactGoalRelatedLinkDTO>, goalIds: ReadonlySet<string>): NetworkRow {
  const subtitle = [card.organization.trim(), card.role.trim()].filter(Boolean).join(" · ");
  const link = goal.get(card.id);
  const goalRelated = goalIds.has(card.id) || card.goalRelated === true;
  const base = card.density === 2 || card.density === 3 ? card.density : 1;
  return {
    id: card.id,
    name: card.displayName,
    subtitle: subtitle || null,
    goal: link && link.label ? { label: link.label, talked: link.talked } : null,
    density: goalRelated ? 3 : base,
    chip: card.sourceChip ?? "manual",
  };
}

/** Header: 「N人 · 今月 +M」 counts every contact (not the tab or the filters). */
export function networkHeaderCounts(summary: ContactCardSummaryDTO | null): { total: number; added: number } | null {
  if (!summary) return null;
  const counts = summary.densityCounts;
  const total = counts ? counts[1] + counts[2] + counts[3] : summary.total;
  return { total, added: summary.addedThisMonth ?? 0 };
}

export function networkTabCounts(summary: ContactCardSummaryDTO | null): Record<NetworkTab, number> {
  const header = networkHeaderCounts(summary);
  return { all: header?.total ?? 0, goal: summary?.tabCounts?.goalRelated ?? 0, followUp: summary?.tabCounts?.needsFollowUp ?? 0 };
}

export function industryOptionLabel(key: string, language: OrbitLanguage, other: string): string {
  if (key === OTHER_KEY) return other;
  return isIndustryIdCode(key) ? industryLabel(key, language) : key;
}

/** Canonical English city → Japanese / Chinese label for the 地域 chips (W0045 cities); unknown cities stay as stored. */
const CITY_LABELS: Record<string, { ja: string; zh: string }> = {
  Tokyo: { ja: "東京", zh: "东京" }, Osaka: { ja: "大阪", zh: "大阪" }, Nagoya: { ja: "名古屋", zh: "名古屋" },
  Yokohama: { ja: "横浜", zh: "横滨" }, Kyoto: { ja: "京都", zh: "京都" }, Fukuoka: { ja: "福岡", zh: "福冈" },
  Sapporo: { ja: "札幌", zh: "札幌" }, Kobe: { ja: "神戸", zh: "神户" }, Sendai: { ja: "仙台", zh: "仙台" },
  Shanghai: { ja: "上海", zh: "上海" }, Beijing: { ja: "北京", zh: "北京" }, Shenzhen: { ja: "深圳", zh: "深圳" },
  Singapore: { ja: "シンガポール", zh: "新加坡" }, Seoul: { ja: "ソウル", zh: "首尔" },
};

export function regionOptionLabel(key: string, language: OrbitLanguage, other: string): string {
  if (key === OTHER_KEY) return other;
  const label = CITY_LABELS[key];
  if (!label || language === "en") return key;
  return language === "zh" ? label.zh : label.ja;
}
