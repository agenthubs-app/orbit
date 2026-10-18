// R11a 人脈（Web）: pure helpers for the list page and the contact drawer. Same rules as the App
// (orbit-app src/screens/network/network-model.ts): その他 folding, rows, header counts, last-touch wording.
import type { ContactCardDTO, ContactCardSummaryDTO } from "../../../../../shared/contract/contact-card-page";
import type { ContactGoalRelatedLinkDTO } from "../../../../../shared/contract/contact-goal-related";
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import { industryLabel, isIndustryIdCode } from "../../../../../shared/domain/industries";

export type NetworkTab = "all" | "goal" | "followUp";
export interface NetworkFilters { statuses: string[]; industries: string[]; regions: string[]; mets: string[]; densities: string[] }
export const EMPTY_FILTERS: NetworkFilters = { statuses: [], industries: [], regions: [], mets: [], densities: [] };
export const STAGE_OPTIONS = ["active", "nurture"] as const;
export const MET_OPTIONS = ["event", "referral", "visit", "other"] as const;
export const DENSITY_OPTIONS = ["1", "2", "3"] as const;
export const TOP_INDUSTRIES = 5;
export const TOP_REGIONS = 3;
export const OTHER_KEY = "__other__";
export const PAGE_SIZE = 30;
/** 人脈分析 opens from this many people (b5:487 / app.html:469 「10人から使えます · あと N人」); R11b page lock, not the 3-person analysis-threshold. */
export { NETWORK_ANALYSIS_UNLOCK_CONTACTS } from "../../../../../features/network-analysis/page-lock";
export const NETWORK_CITY_KEYS = ["Tokyo", "Osaka", "Nagoya", "Yokohama", "Kyoto", "Fukuoka", "Sapporo", "Kobe", "Sendai", "Shanghai", "Beijing", "Shenzhen", "Singapore", "Seoul"] as const;
export type NetworkCityKey = (typeof NETWORK_CITY_KEYS)[number];

export function filterCount(filters: NetworkFilters): number {
  return filters.statuses.length + filters.industries.length + filters.regions.length + filters.mets.length + filters.densities.length;
}

export function toggle(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export interface FacetOption { key: string; count: number }

export function topFacetOptions(counts: Record<string, number> | undefined, top: number): FacetOption[] {
  const entries = Object.entries(counts ?? {}).filter(([key, count]) => key !== "none" && count > 0)
    .sort(([leftKey, left], [rightKey, right]) => right - left || (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0));
  const shown = entries.slice(0, top).map(([key, count]) => ({ key, count }));
  const rest = Object.entries(counts ?? {}).filter(([key]) => !shown.some((option) => option.key === key)).reduce((sum, [, count]) => sum + count, 0);
  return rest > 0 ? [...shown, { key: OTHER_KEY, count: rest }] : shown;
}

export function expandOther(selected: readonly string[], counts: Record<string, number> | undefined, top: number): string[] {
  if (!selected.includes(OTHER_KEY)) return [...selected];
  const shown = new Set(topFacetOptions(counts, top).filter((option) => option.key !== OTHER_KEY).map((option) => option.key));
  const rest = Object.keys(counts ?? {}).filter((key) => !shown.has(key));
  return [...new Set([...selected.filter((key) => key !== OTHER_KEY), ...rest, "none"])];
}

/** Screen state → GET /api/contacts/page|summary query (the server merges plan / invite ids itself). */
export function networkQuery(input: { query: string; tab: NetworkTab; filters: NetworkFilters; facets: ContactCardSummaryDTO | null; cursor?: string | null; limit?: number }): string {
  const params = new URLSearchParams();
  if (input.query.trim()) params.set("query", input.query.trim());
  const add = (key: string, values: readonly string[]) => values.forEach((value) => params.append(key, value));
  add("status", input.filters.statuses);
  add("industry", expandOther(input.filters.industries, input.facets?.industries, TOP_INDUSTRIES));
  add("region", expandOther(input.filters.regions, input.facets?.regions, TOP_REGIONS));
  add("met", input.filters.mets);
  add("density", input.filters.densities);
  if (input.tab === "goal") params.set("goalRelated", "1");
  if (input.tab === "followUp") params.set("needsFollowUp", "1");
  if (input.limit) params.set("limit", String(input.limit));
  if (input.cursor) params.set("cursor", input.cursor);
  return params.toString();
}

export function filtersFromSearch(params: URLSearchParams | null): NetworkFilters {
  const industries = (params?.getAll("industry") ?? []).flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean).slice(0, 10);
  return { ...EMPTY_FILTERS, industries };
}

export type ChipKey = "meishi" | "linkedin" | "phone" | "manual" | "self" | "event";

export interface NetworkRow {
  id: string;
  name: string;
  organization: string;
  role: string;
  goal: { label: string; talked: boolean } | null;
  density: 1 | 2 | 3;
  chip: ChipKey;
  addedAt: string | null;
  lastInteractionAt: string | null;
}

export function networkRow(card: ContactCardDTO, links: ReadonlyMap<string, ContactGoalRelatedLinkDTO>): NetworkRow {
  const link = links.get(card.id);
  const base = card.density === 2 || card.density === 3 ? card.density : 1;
  return {
    id: card.id,
    name: card.displayName,
    organization: card.organization.trim(),
    role: card.role.trim(),
    goal: link && link.label ? { label: link.label, talked: link.talked } : null,
    density: card.goalRelated ? 3 : base,
    chip: card.sourceChip ?? "manual",
    addedAt: card.addedAt ?? null,
    lastInteractionAt: card.lastInteractionAt ?? null,
  };
}

export function headerCounts(summary: ContactCardSummaryDTO | null): { total: number; added: number; goal: number; followUp: number } | null {
  if (!summary) return null;
  const counts = summary.densityCounts;
  return {
    total: counts ? counts[1] + counts[2] + counts[3] : summary.total,
    added: summary.addedThisMonth ?? 0,
    goal: summary.tabCounts?.goalRelated ?? 0,
    followUp: summary.tabCounts?.needsFollowUp ?? 0,
  };
}

const DAY = 86_400_000;
const tokyo = (ms: number) => new Date(ms + 9 * 3_600_000);
function tokyoDayNumber(ms: number): number { const date = tokyo(ms); return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY; }

export type LastTouch =
  | { kind: "today" } | { kind: "yesterday" } | { kind: "daysAgo"; n: number }
  | { kind: "connected"; year: number; month: number } | { kind: "added"; date: string } | null;

/** 最終接点: the latest interaction (今日 / 昨日 / n日前), else when they joined — LinkedIn connections as 「YYYY年M月につながる」, others 「M/D 登録」. */
export function lastTouch(row: Pick<NetworkRow, "lastInteractionAt" | "addedAt" | "chip">, nowMs: number): LastTouch {
  const interaction = row.lastInteractionAt ? Date.parse(row.lastInteractionAt) : NaN;
  if (Number.isFinite(interaction)) {
    const days = tokyoDayNumber(nowMs) - tokyoDayNumber(interaction);
    if (days <= 0) return { kind: "today" };
    if (days === 1) return { kind: "yesterday" };
    if (days < 30) return { kind: "daysAgo", n: days };
  }
  const added = row.addedAt ? Date.parse(row.addedAt) : NaN;
  if (!Number.isFinite(added)) return null;
  const date = tokyo(added);
  if (row.chip === "linkedin") return { kind: "connected", year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
  return { kind: "added", date: `${date.getUTCMonth() + 1}/${date.getUTCDate()}` };
}

export function tokyoMonthDay(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  const date = tokyo(ms);
  return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

export function industryOptionLabel(key: string, language: OrbitLanguage, other: string): string {
  if (key === OTHER_KEY) return other;
  return isIndustryIdCode(key) ? industryLabel(key, language) : key;
}

export function regionLabel(key: string, cityLabel: (city: NetworkCityKey) => string, other: string): string {
  if (key === OTHER_KEY) return other;
  return (NETWORK_CITY_KEYS as readonly string[]).includes(key) ? cityLabel(key as NetworkCityKey) : key;
}
