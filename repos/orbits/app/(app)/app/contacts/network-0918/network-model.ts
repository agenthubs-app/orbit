/**
 * Network v2（Orbit_0918）人脉域纯函数模型。
 * 设计稿：docs/designs/Orbit_0918/Network v2.dc.html renderVals()。
 * 所有数值来自 OrbitContactsViewModel，不含设计 mock。
 */
import type { OrbitContactView } from "../../orbit-contacts-route-view-model";

export type NetworkStage = "explore" | "keep" | "advance" | "archived";
export const NETWORK_STAGES = ["explore", "keep", "advance", "archived"] as const satisfies readonly NetworkStage[];

export const STAGE_LABEL: Record<NetworkStage, { zh: string; en: string }> = {
  explore: { zh: "待了解", en: "Explore" },
  keep: { zh: "保持联系", en: "Keep in touch" },
  advance: { zh: "正在推进", en: "Advancing" },
  // 设计稿写「已建立合作」；真实状态只有 archived，文案按真实语义。
  archived: { zh: "已归档", en: "Archived" },
};

// 设计 stageMeta：[bg, accent, icon, desc]
export const STAGE_STYLE: Record<NetworkStage, { bg: string; fg: string; icon: string; desc: { zh: string; en: string } }> = {
  explore: { bg: "#F0F1F8", fg: "#6B6F99", icon: "◌", desc: { zh: "初步建立联系，进一步了解对方", en: "Just connected, getting to know them" } },
  keep: { bg: "#ECEEFB", fg: "#4B4FC7", icon: "▦", desc: { zh: "已建立联系，定期保持互动", en: "Connected, staying in touch" } },
  advance: { bg: "#E4E5FA", fg: "#2E3270", icon: "➶", desc: { zh: "有明确的合作机会，正在推进中", en: "A concrete opportunity is moving" } },
  archived: { bg: "#E6F1EC", fg: "#2F6B4F", icon: "◈", desc: { zh: "暂时搁置，需要时再唤醒", en: "Set aside for now" } },
};

// 设计 stageStyle（列表 chip）：[bg, fg]
export const STAGE_CHIP: Record<NetworkStage, { bg: string; fg: string }> = {
  explore: { bg: "#F0F1F8", fg: "#3B3F7A" },
  keep: { bg: "#ECEEFB", fg: "#2E3270" },
  advance: { bg: "#DDDEFA", fg: "#2E3270" },
  archived: { bg: "#E6F1EC", fg: "#2F6B4F" },
};

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
