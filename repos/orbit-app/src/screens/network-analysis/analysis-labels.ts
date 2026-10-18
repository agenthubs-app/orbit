// R11b 人脈分析（App）: tabs, bucket / sort / month labels and the hrefs. Mirrors the Web analysis-labels.ts: industry names
// from the shared catalogue, city names from R11a's 人脈 copy (network.city.*), so the analysis and the list say the same thing.
import type { OrbitLanguage } from "../../api/contract/language";
import type { NetworkAnalysisDimension, NetworkAnalysisPeopleSort } from "../../api/contract/network-analysis-view";
import { industryLabel, isIndustryIdCode } from "../../api/domain/industries";
import type { MessageKey, OrbitTranslator } from "../../i18n/messages";
import { NETWORK_CITY_KEYS } from "../network/network-model";

export type AnalysisTab = "structure" | "opportunities" | "insight";
export const ANALYSIS_TABS: readonly AnalysisTab[] = ["structure", "opportunities", "insight"];
export const ANALYSIS_TAB_KEY: Record<AnalysisTab, MessageKey> = {
  structure: "networkAnalysis.tabStructure", opportunities: "networkAnalysis.tabOpportunities", insight: "networkAnalysis.tabInsight",
};
/** B-3: 構造 by default; `?tab=structure|opportunities|insight` deep links. */
export function analysisTabFrom(value: string | string[] | null | undefined): AnalysisTab {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "opportunities" || raw === "insight" ? raw : "structure";
}

export const ANALYSIS_DIMENSIONS: readonly NetworkAnalysisDimension[] = ["industry", "seniority", "region", "met", "opportunity"];
export function analysisDimensionFrom(value: string | string[] | undefined): NetworkAnalysisDimension | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return (ANALYSIS_DIMENSIONS as readonly string[]).includes(raw ?? "") ? raw as NetworkAnalysisDimension : null;
}

/** A route parameter arrives decoded; a still-encoded one (an old link) is decoded once, never twice. */
export function bucketIdFrom(value: string | string[] | undefined): string {
  const raw = (Array.isArray(value) ? value[0] : value) ?? "";
  if (!/%[0-9A-Fa-f]{2}/u.test(raw)) return raw;
  try { return decodeURIComponent(raw); } catch { return raw; }
}

const SENIORITY_KEY: Record<string, MessageKey> = {
  decision: "networkAnalysis.seniorityDecision", manager: "networkAnalysis.seniorityManager", staff: "networkAnalysis.seniorityStaff", unset: "networkAnalysis.seniorityUnset",
};
const MET_KEY: Record<string, MessageKey> = {
  event: "networkAnalysis.metEvent", referral: "networkAnalysis.metReferral", visit: "networkAnalysis.metVisit", other: "networkAnalysis.metOther",
};
const OPPORTUNITY_KEY: Record<string, MessageKey> = { reconnect: "networkAnalysis.oppReconnect", stalled: "networkAnalysis.oppStalled" };

export function industryName(id: string, language: OrbitLanguage): string {
  return isIndustryIdCode(id) ? industryLabel(id, language) : id;
}

export function cityName(city: string, t: OrbitTranslator): string {
  return (NETWORK_CITY_KEYS as readonly string[]).includes(city) ? t(`network.city.${city}` as MessageKey) : city;
}

export function bucketLabel(dimension: NetworkAnalysisDimension, id: string, t: OrbitTranslator, language: OrbitLanguage): string {
  if (id === "rest") return t("networkAnalysis.rest");
  switch (dimension) {
    case "industry": return industryName(id, language);
    case "region": return cityName(id, t);
    case "seniority": return t(SENIORITY_KEY[id] ?? "networkAnalysis.seniorityUnset");
    case "met": return t(MET_KEY[id] ?? "networkAnalysis.metOther");
    case "opportunity": return t(OPPORTUNITY_KEY[id] ?? "networkAnalysis.oppReconnect");
  }
}

export const SORT_KEY: Record<NetworkAnalysisPeopleSort, MessageKey> = {
  goal: "networkAnalysis.sortGoal", recent: "networkAnalysis.sortRecent", name: "networkAnalysis.sortName",
};

/** `YYYY-MM` → 「5月」 / "May". */
export function monthLabel(month: string, t: OrbitTranslator, language: OrbitLanguage): string {
  const m = Number(month.slice(5, 7));
  const mon = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1)));
  return language === "en" ? mon : t("networkAnalysis.monthShort", { m, mon });
}

/** An instant as Tokyo M/D (「10/7 更新」). */
export function tokyoMonthDay(iso: string): string {
  const tokyo = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${tokyo.getUTCMonth() + 1}/${tokyo.getUTCDate()}`;
}

/** B-6: 「N人を人脈一覧で開く」 only where the R11a list shows the same people — it reads `?industry=`; other dimensions have no list parameter. */
export function networkListHref(dimension: NetworkAnalysisDimension, bucketId: string): string | null {
  if (dimension === "industry" && bucketId !== "rest" && isIndustryIdCode(bucketId)) return `/contacts?industry=${encodeURIComponent(bucketId)}`;
  return null;
}

export function analysisListHref(dimension: NetworkAnalysisDimension, bucketId: string): string {
  return `/contacts/analysis/${encodeURIComponent(dimension)}/${encodeURIComponent(bucketId)}`;
}

export function contactHref(contactId: string): string {
  return `/contacts/${encodeURIComponent(contactId)}`;
}
