/**
 * 「概览」与「AI 人脉分析」纯函数模型（Network v2 第 66–171 / 393–609 行）。
 * 数值只来自 ContactsAnalysisView 与 OrbitContactsViewModel，不含设计 mock。
 */
import type { OrbitLanguage } from "../../../../../shared/contract/language";
import type { ContactsAnalysisView } from "../analysis/contacts-analysis-view-model";
import { NETWORK_SOURCES, SOURCE_LABEL, sourceCounts, type NetworkPerson } from "./network-model";

export type DistKey = "industry" | "region" | "source";

export function distributionRows(key: DistKey, analysis: ContactsAnalysisView, people: readonly NetworkPerson[], language: OrbitLanguage): readonly (readonly [string, number])[] {
  if (key === "source") {
    const c = sourceCounts(people);
    return NETWORK_SOURCES.filter((s) => s !== "all").map((s) => [SOURCE_LABEL[s][language === "en" ? "en" : "zh"], c[s]] as const);
  }
  if (analysis.state !== "ready" || analysis.structure.state !== "ready") return [];
  const buckets = analysis.structure.data.dimensions[key === "industry" ? "industry" : "location"];
  return buckets.map((b) => [b.label, b.count] as const);
}

export interface CockpitCard { icon: string; title: { zh: string; en: string }; desc: { zh: string; en: string }; n: number | null; tag: { zh: string; en: string }; tagBg: string; tagFg: string; href: string }

// 设计 cockpit 四卡的图标/色块保留；标题改为真实计数句式，置信度 mock 文案替换为数据来源标签。
export function cockpit(analysis: ContactsAnalysisView): CockpitCard[] {
  const m = analysis.state === "ready" ? analysis.metrics : null;
  return [
    { icon: "◎", n: m?.highValue ?? null, title: { zh: "高价值关系", en: "High-value relationships" }, desc: { zh: "价值评估为高的联系人，优先维护。", en: "Contacts rated high value; keep them warm." }, tag: { zh: "来自关系评估", en: "From relationship scoring" }, tagBg: "#E6F1EC", tagFg: "#2F6B4F", href: "/app/contacts/dashboard?tab=opportunities" },
    { icon: "➶", n: m?.pendingFollowups ?? null, title: { zh: "待跟进联系人", en: "Follow-ups due" }, desc: { zh: "有明确下一步但尚未执行的关系。", en: "Relationships with a next step still open." }, tag: { zh: "来自跟进记录", en: "From follow-up records" }, tagBg: "#E6F1EC", tagFg: "#2F6B4F", href: "/app/contacts/pipeline" },
    { icon: "⇢", n: m?.newContacts ?? null, title: { zh: "新增人脉", en: "New contacts" }, desc: { zh: "最近加入你人脉网络的联系人。", en: "Recently added to your network." }, tag: { zh: "来自导入记录", en: "From import history" }, tagBg: "#FBF1DC", tagFg: "#8A6420", href: "/app/contacts?source=all" },
    { icon: "◷", n: m?.dormant ?? null, title: { zh: "沉睡联系人", en: "Dormant contacts" }, desc: { zh: "曾有互动但已较久未联系。", en: "Had good interactions, quiet for a while." }, tag: { zh: "来自互动频率", en: "From interaction frequency" }, tagBg: "#FBF1DC", tagFg: "#8A6420", href: "/app/contacts/dashboard?tab=opportunities" },
  ];
}

export interface HealthRow { icon: string; label: { zh: string; en: string }; n: number | string; tag: { zh: string; en: string }; desc: { zh: string; en: string }; iconBg: string; iconFg: string }

// 设计 health 第四块「决策层占比」无数据来源，不渲染；只映射 structure.health 真实返回的行。文案为 {zh,en}，由渲染方 t()。
const HEALTH_META = {
  strong: { icon: "◎", label: { zh: "核心人脉", en: "Core network" }, tag: { zh: "稳定", en: "Stable" }, desc: { zh: "值得持续维护的核心关系", en: "Core relationships worth maintaining" }, iconBg: "#E6F1EC", iconFg: "#2F6B4F" },
  warm: { icon: "◷", label: { zh: "进行中", en: "In progress" }, tag: { zh: "需要留意", en: "Needs attention" }, desc: { zh: "有互动但需加强维护", en: "Active, but needs more nurturing" }, iconBg: "#ECEEFB", iconFg: "#2E3270" },
  weak: { icon: "◌", label: { zh: "外圈人脉", en: "Outer circle" }, tag: { zh: "待唤醒", en: "To re-engage" }, desc: { zh: "有潜力重新建立联系", en: "Worth reconnecting with" }, iconBg: "#FBF1DC", iconFg: "#8A6420" },
} as const;

export function healthRows(analysis: ContactsAnalysisView): HealthRow[] {
  if (analysis.state !== "ready" || analysis.structure.state !== "ready") return [];
  return analysis.structure.data.health.map((h) => ({ ...HEALTH_META[h.id], n: h.count }));
}
