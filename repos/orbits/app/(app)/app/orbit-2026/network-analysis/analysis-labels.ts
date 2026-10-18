// R11b 人脈分析（Web）: copy hook and the labels of buckets / sorts / months. Industry names come from the shared catalogue,
// city names from R11a's 人脈 copy (same keys as the list's 絞り込み), so the analysis and the list say the same thing.
import { useCallback } from "react";

import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { NetworkAnalysisDimension, NetworkAnalysisPeopleSort } from "../../../../../shared/contract/network-analysis-view";
import { industryLabel, isIndustryIdCode } from "../../../../../shared/domain/industries";
import { networkAnalysisCopy } from "../copy/network-analysis";
import { networkCopy } from "../copy/network";
import { pickCopy } from "../copy/types";
import { useOrbitLanguage } from "../../orbit-language-context";
import { fillCopy } from "../ui";
import { NETWORK_CITY_KEYS } from "../network/network-model";

export type AnalysisKey = keyof typeof networkAnalysisCopy;
export type AnalysisT = (key: AnalysisKey, values?: Record<string, string | number>) => string;

export function useAnalysisT(): AnalysisT {
  const { language } = useOrbitLanguage();
  return useCallback((key, values) => fillCopy(pickCopy(networkAnalysisCopy[key], language), values ?? {}), [language]);
}

export type AnalysisTab = "structure" | "opportunities" | "insight";
export const ANALYSIS_TABS: readonly AnalysisTab[] = ["structure", "opportunities", "insight"];
export function analysisTabFrom(value: string | null | undefined): AnalysisTab {
  return value === "opportunities" || value === "insight" ? value : "structure";
}

const SENIORITY_KEY = { decision: "seniorityDecision", manager: "seniorityManager", staff: "seniorityStaff", unset: "seniorityUnset" } as const;
const MET_KEY = { event: "metEvent", referral: "metReferral", visit: "metVisit", other: "metOther" } as const;
const OPPORTUNITY_KEY = { reconnect: "oppReconnect", stalled: "oppStalled" } as const;

export function cityLabel(city: string, language: OrbitLanguage): string {
  return (NETWORK_CITY_KEYS as readonly string[]).includes(city) ? pickCopy(networkCopy[`city${city}` as keyof typeof networkCopy], language) : city;
}

export function industryName(id: string, language: OrbitLanguage): string {
  return isIndustryIdCode(id) ? industryLabel(id, language) : id;
}

export function bucketLabel(dimension: NetworkAnalysisDimension, id: string, t: AnalysisT, language: OrbitLanguage): string {
  if (id === "rest") return t("rest");
  switch (dimension) {
    case "industry": return industryName(id, language);
    case "region": return cityLabel(id, language);
    case "seniority": return t(SENIORITY_KEY[id as keyof typeof SENIORITY_KEY] ?? "seniorityUnset");
    case "met": return t(MET_KEY[id as keyof typeof MET_KEY] ?? "metOther");
    case "opportunity": return t(OPPORTUNITY_KEY[id as keyof typeof OPPORTUNITY_KEY] ?? "oppReconnect");
  }
}

export const SORT_KEY: Record<NetworkAnalysisPeopleSort, AnalysisKey> = { goal: "sortGoal", recent: "sortRecent", name: "sortName" };

/** `YYYY-MM` → 「5月」 / "May". */
export function monthLabel(month: string, t: AnalysisT, language: OrbitLanguage): string {
  const m = Number(month.slice(5, 7));
  const mon = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1)));
  return language === "en" ? mon : t("monthShort", { m, mon });
}

/** An instant as Tokyo M/D (「10/7 更新」). */
export function tokyoMonthDay(iso: string): string {
  const tokyo = new Date(Date.parse(iso) + 9 * 3_600_000);
  return `${tokyo.getUTCMonth() + 1}/${tokyo.getUTCDate()}`;
}

/**
 * 「N人を人脈一覧で開く」 (PLANNER §6): only where the R11a list can show exactly the same people. The Web 人脈 list reads
 * `?industry=` (R11-15); region / met / seniority / opportunity lists have no list parameter yet, so the button stays hidden.
 */
export function networkListHref(dimension: NetworkAnalysisDimension, bucketId: string): string | null {
  if (dimension === "industry" && bucketId !== "rest" && isIndustryIdCode(bucketId)) return `/app/contacts?industry=${encodeURIComponent(bucketId)}`;
  return null;
}

export function analysisListHref(dimension: NetworkAnalysisDimension, bucketId: string): string {
  return `/app/contacts/analysis/${encodeURIComponent(dimension)}/${encodeURIComponent(bucketId)}`;
}
