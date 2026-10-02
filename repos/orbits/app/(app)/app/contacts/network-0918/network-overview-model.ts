/**
 * 「概览」人脉分布与关系档位共用的纯函数／常量（Network v2 第 66–171 行）。
 * 数值只来自全量来源：行业／地区 = ContactsAnalysisView 的全量分布；来源 = 联系人列表 SQL 的全量分面（W0052，
 * 不再用名单 `people` 计数）。驾驶舱四卡改由 `network-overview-cockpit-model.ts` 组装（W0052）。
 */
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import { NETWORK_SOURCES, SOURCE_LABEL, type NetworkSource, type NetworkTierGroup } from "./network-model";

export type DistKey = "industry" | "region" | "source";

export function distributionRows(key: DistKey, analysis: ContactsAnalysisView, sources: Readonly<Record<NetworkSource, number>> | null, language: OrbitLanguage): readonly (readonly [string, number])[] {
  if (key === "source") {
    if (!sources) return [];
    // zh 中文，en 与 ja 英文（沿用 t() 的 ja→en 回退）。
    return NETWORK_SOURCES.filter((s): s is NetworkSource => s !== "all").map((s) => [SOURCE_LABEL[s][language === "zh" ? "zh" : "en"], sources[s]] as const);
  }
  if (analysis.state !== "ready" || analysis.structure.state !== "ready") return [];
  const buckets = analysis.structure.data.dimensions[key === "industry" ? "industry" : "location"];
  return buckets.map((b) => [b.label, b.count] as const);
}

/**
 * 关系档位的图标、文案与配色（W0047 档位；W0052 起结构标签「关系健康」与概览共用这一份，原两处重复的 HEALTH_META 合并）。
 * 文案为 {zh,en}，由渲染方 t()。
 */
export const TIER_HEALTH_META: Readonly<Record<NetworkTierGroup, { icon: string; label: { zh: string; en: string }; desc: { zh: string; en: string }; bg: string; fg: string }>> = {
  new: { icon: "◌", label: { zh: "新认识", en: "New" }, desc: { zh: "刚建立联系，往来还不多", en: "Recently connected, few interactions yet" }, bg: "#F0F1F8", fg: "#3B3F7A" },
  active: { icon: "▦", label: { zh: "有往来", en: "Active" }, desc: { zh: "近期有见面、会议或 memo 往来", en: "Recent meetings, encounters or memos" }, bg: "#ECEEFB", fg: "#2E3270" },
  core: { icon: "◎", label: { zh: "核心", en: "Core" }, desc: { zh: "往来频繁、互动深入的关系", en: "Frequent, in-depth interactions" }, bg: "#E6F1EC", fg: "#2F6B4F" },
  dormant: { icon: "◷", label: { zh: "待唤醒", en: "To re-engage" }, desc: { zh: "曾经热络，60 天没有往来", en: "Was active, quiet for 60 days" }, bg: "#FBF1DC", fg: "#8A6420" },
};
