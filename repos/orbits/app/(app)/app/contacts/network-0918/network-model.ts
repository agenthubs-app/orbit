/**
 * Network v2（Orbit_0918）人脉域纯函数模型。
 * 设计稿：docs/designs/Orbit_0918/Network v2.dc.html renderVals()。
 * 所有数值来自 OrbitContactsViewModel，不含设计 mock。
 */
import type { RelationshipStrength, RelationshipTierGroup } from "../../../../../shared/contract/relationship-strength";
import type { OrbitContactStrength, OrbitContactView } from "../../orbit-contacts-route-view-model";

export type NetworkStage = "explore" | "keep" | "advance" | "archived";
export const NETWORK_STAGES = ["explore", "keep", "advance", "archived"] as const satisfies readonly NetworkStage[];

// W0055：旧手动阶段的文案与配色（STAGE_LABEL／STAGE_STYLE／STAGE_CHIP）已删除——页面只显示自动推出的关系档位（W0047）。
// relationshipStatus 优先于 pipelineStatus：两者矛盾时以 relationshipStatus 为准（更新更频繁、更贴近真实关系状态）。
export function stageOf(contact: Pick<OrbitContactView, "pipelineStatus" | "relationshipStatus">): NetworkStage {
  if (contact.pipelineStatus === "pending_initialization") return "explore";
  switch (contact.relationshipStatus) {
    case "archived": return "archived";
    case "needs_follow_up": return "explore";
    case "nurture": return "keep";
    case "active": return "advance";
    default: break;
  }
  if (contact.pipelineStatus === "archived") return "archived";
  if (contact.pipelineStatus === "to_contact") return "explore";
  return "advance";
}

/**
 * W0047：关系档位（只由关系时间线自动推出，用户不能手改）。管线四列与详情档位标签用它；
 * 待唤醒（dormant）优先：曾达「有往来」且 60 天没有往来记录的人归入待唤醒列。
 */
export type NetworkTierGroup = RelationshipTierGroup;
export const NETWORK_TIER_GROUPS = ["new", "active", "core", "dormant"] as const satisfies readonly NetworkTierGroup[];

export const TIER_LABEL: Record<NetworkTierGroup, { zh: string; en: string }> = {
  new: { zh: "新认识", en: "New" },
  active: { zh: "有往来", en: "Active" },
  core: { zh: "核心", en: "Core" },
  dormant: { zh: "待唤醒", en: "To re-engage" },
};

export const TIER_STYLE: Record<NetworkTierGroup, { bg: string; fg: string; icon: string; desc: { zh: string; en: string } }> = {
  new: { bg: "#F0F1F8", fg: "#6B6F99", icon: "◌", desc: { zh: "刚建立联系，往来还不多", en: "Recently connected, few interactions yet" } },
  active: { bg: "#ECEEFB", fg: "#4B4FC7", icon: "▦", desc: { zh: "近期有见面、会议或 memo 往来", en: "Recent meetings, encounters or memos" } },
  core: { bg: "#E4E5FA", fg: "#2E3270", icon: "◈", desc: { zh: "往来频繁、互动深入的关系", en: "Frequent, in-depth interactions" } },
  dormant: { bg: "#FBF1DC", fg: "#8A6420", icon: "◷", desc: { zh: "曾经热络，60 天没有往来", en: "Was active, quiet for 60 days" } },
};

export const TIER_CHIP: Record<NetworkTierGroup, { bg: string; fg: string }> = {
  new: { bg: "#F0F1F8", fg: "#3B3F7A" },
  active: { bg: "#ECEEFB", fg: "#2E3270" },
  core: { bg: "#DDDEFA", fg: "#2E3270" },
  dormant: { bg: "#FBF1DC", fg: "#8A6420" },
};

/** 管线看板数据：列头人数统计全部联系人；每列卡片（联系人 id）按最近往来倒序至多 30。 */
export interface NetworkTierBoardView {
  counts: Record<NetworkTierGroup, number>;
  columns: Record<NetworkTierGroup, readonly string[]>;
}

export function tierGroupOf(strength: Pick<RelationshipStrength, "tier" | "dormant"> | null | undefined): NetworkTierGroup | null {
  if (!strength) return null;
  return strength.dormant ? "dormant" : strength.tier;
}

/** 列表里一位联系人的档位（读模型投影）。 */
export type NetworkTierLookup = ReadonlyMap<string, Pick<RelationshipStrength, "tier" | "dormant">>;

/**
 * W0047（W47-4）：所有人脉列表的强弱点改读真实档位——core→strong、active→medium、new→weak、dormant→dormant，
 * 没有缓存行（或没传档位表）→ unscored。不再按价值标签猜。
 */
export function strengthFromTier(entry: Pick<RelationshipStrength, "tier" | "dormant"> | undefined): OrbitContactStrength {
  if (!entry) return "unscored";
  if (entry.dormant) return "dormant";
  return entry.tier === "core" ? "strong" : entry.tier === "active" ? "medium" : "weak";
}

/** W0055：`strengthFromTier` 的反向映射（所有人脉列表「关系档位」列用）；unscored → null（显示「未评估」）。 */
export function tierFromStrength(strength: OrbitContactStrength | undefined): NetworkTierGroup | null {
  switch (strength) {
    case "strong": return "core";
    case "medium": return "active";
    case "weak": return "new";
    case "dormant": return "dormant";
    default: return null;
  }
}

export type NetworkSource = "event" | "referral" | "contact" | "scan" | "other";
export const NETWORK_SOURCES = ["all", "event", "referral", "contact", "scan", "other"] as const;
export const SOURCE_LABEL: Record<NetworkSource | "all", { zh: string; en: string }> = {
  all: { zh: "全部联系人", en: "All contacts" },
  event: { zh: "活动认识", en: "Met at events" },
  referral: { zh: "朋友引荐", en: "Referred" },
  contact: { zh: "通讯录", en: "Address book" },
  scan: { zh: "名片导入", en: "Business cards" },
  other: { zh: "其他来源", en: "Other" },
};
export const SOURCE_ICON: Record<NetworkSource | "all", string> = { all: "◎", event: "▦", referral: "⇢", contact: "▤", scan: "▭", other: "···" };

export function sourceOf(contact: Pick<OrbitContactView, "source">): NetworkSource {
  switch (contact.source) {
    case "event": return "event";
    case "referral": return "referral";
    case "contact": return "contact";
    case "scan": return "scan";
    default: return "other";
  }
}

// 来源说明只放真实的来源句（活动名等）。存量数据里 `met` 形如
// `Business card · confirmed by <账号邮箱>`（write service 把确认者写进了来源），
// 账号邮箱与「confirmed by」句绝不能当作正文出现在页面上（旧详情 metLabel 的守卫）。
const EMAIL_LIKE = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/;
const ACTOR_SENTENCE = /\bconfirmed by\b/i;
const TRAILING_ACTOR = /\s*[·•|,;:-]?\s*\bconfirmed by\b.*$/i;

export function metSummary(met: string | null | undefined): string {
  const stripped = (met ?? "").replace(TRAILING_ACTOR, "").trim();
  if (!stripped || ACTOR_SENTENCE.test(stripped) || EMAIL_LIKE.test(stripped)) return "";
  return stripped;
}

export interface NetworkPerson {
  id: string; name: string; initial: string; org: string; title: string; orgTitle: string; industry: string;
  source: NetworkSource; stage: NetworkStage; pendingInit: boolean; last: string; next: string; region: string; tags: string[]; href: string;
}

export function toPerson(contact: OrbitContactView): NetworkPerson {
  const org = contact.company.trim();
  const title = contact.title.trim();
  return {
    id: contact.id,
    name: contact.displayName,
    initial: contact.initial || contact.displayName.slice(0, 1),
    org, title,
    orgTitle: [org, title].filter(Boolean).join(" · "),
    industry: contact.industry,
    source: sourceOf(contact),
    stage: stageOf(contact),
    pendingInit: contact.pipelineStatus === "pending_initialization",
    last: contact.lastInteraction || "",
    next: contact.nextAction?.text ?? contact.seeking ?? "",
    region: contact.location ?? "",
    tags: [...contact.valueTags],
    href: `/app/contacts/${encodeURIComponent(contact.id)}`,
  };
}

export function matchesQuery(p: NetworkPerson, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${p.name}${p.org}${p.title}${p.industry}`.toLowerCase().includes(q);
}

export function sourceCounts(people: readonly NetworkPerson[]): Record<NetworkSource | "all", number> {
  const out: Record<NetworkSource | "all", number> = { all: people.length, event: 0, referral: 0, contact: 0, scan: 0, other: 0 };
  for (const p of people) out[p.source] += 1;
  return out;
}

export function stageCounts(people: readonly NetworkPerson[]): Record<NetworkStage, number> {
  const out: Record<NetworkStage, number> = { explore: 0, keep: 0, advance: 0, archived: 0 };
  for (const p of people) out[p.stage] += 1;
  return out;
}

export const DONUT_COLORS = ["#4B4FC7", "#5B8C7A", "#9C7A3E", "#8A8FB0", "#6B8FB5", "#2E3270", "#C9CBEA"] as const;
export interface DonutRow { label: string; n: number; pct: string; color: string }

export function donut(rows: readonly (readonly [string, number])[]): { bg: string; rows: DonutRow[] } {
  const sum = rows.reduce((a, r) => a + r[1], 0) || 1;
  let acc = 0;
  const stops = rows.map((r, i) => { const a = acc / sum * 360; acc += r[1]; return `${DONUT_COLORS[i % DONUT_COLORS.length]} ${a}deg ${acc / sum * 360}deg`; });
  return {
    bg: `conic-gradient(${stops.join(", ")})`,
    rows: rows.map((r, i) => ({ label: r[0], n: r[1], pct: `${Math.round(r[1] / sum * 100)}%`, color: DONUT_COLORS[i % DONUT_COLORS.length] })),
  };
}

export const STAGE_BAR_BG = ["#E8E9F6", "#DDDEFA", "#B9BCEB", "#2E3270"] as const;
export const STAGE_BAR_FG = ["#3B3F7A", "#3B3F7A", "#2E3270", "#FFFFFF"] as const;

export function stageClip(index: 0 | 1 | 2 | 3): string {
  if (index === 0) return "polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)";
  if (index === 3) return "polygon(0 0,100% 0,100% 100%,0 100%,14px 50%)";
  return "polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%,14px 50%)";
}

/**
 * 列表 VM 没有互动时间戳（后端为存储顺序），所以「最近联系人」不用列表切片伪装；
 * 概览屏用 ContactsAnalysisView.activity（真实 occurredAt）渲染该区块，见任务 4。
 */
export function personByName(people: readonly NetworkPerson[], name: string): NetworkPerson | undefined {
  return people.find((p) => p.name === name);
}
