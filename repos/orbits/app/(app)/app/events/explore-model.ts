import type { OrbitLandingEventView } from "../orbit-landing-route-view-model";
import { eventRegistrationIsOpen, type EventRegistrationAvailability } from "../orbit-event-registration-view-model";

// 探索页的纯筛选/话题/scope 模型。与页面组件分离，供新 UI 直接消费；不含 React、fetch 或路由。

export const EVENT_SCOPES = ["all", "registered", "upcoming", "active", "ended"] as const;
export type EventScope = (typeof EVENT_SCOPES)[number];

export function eventScopeFromValues(values: readonly string[]): EventScope {
  if (values.length !== 1) return "all";
  const value = values[0];
  return value === "registered" ||
    value === "upcoming" ||
    value === "active" ||
    value === "ended"
    ? value
    : "all";
}

export function eventScopeSearchString(
  nextStatus: EventScope,
  currentSearch: string,
): string {
  const nextParams = new URLSearchParams(currentSearch);
  if (nextStatus === "all") nextParams.delete("scope");
  else nextParams.set("scope", nextStatus);
  return nextParams.toString();
}

export function eventCardActionKind(
  status: OrbitLandingEventView["status"],
  registered: boolean,
  registrationAvailability: EventRegistrationAvailability = "unavailable",
): "enter" | "manage" | "register" | "view" {
  if (!registered) {
    return status === "upcoming" && eventRegistrationIsOpen(registrationAvailability) ? "register" : "view";
  }
  if (status === "active") return "enter";
  return status === "upcoming" ? "manage" : "view";
}

// 话题标签中文词典：数据层保留英文/slug 原值（筛选与搜索用），仅展示层翻译；
// 未收录的词原样显示，避免翻译缺失时丢信息。
const TOPIC_LABELS_ZH: Record<string, string> = {
  "AI": "AI",
  "AI / automation": "AI / 自动化",
  "Brand": "品牌",
  "Community": "社群",
  "Consumer": "消费",
  "Cross-border": "跨境",
  "Cross-border commerce": "跨境商务",
  "D2C": "D2C",
  "Design": "设计",
  "Ecommerce": "电商",
  "F&B": "餐饮",
  "Fashion": "时尚",
  "Finance": "金融",
  "Finance / investment": "金融投资",
  "FinTech": "金融科技",
  "Hardware": "硬件",
  "Hospitality": "餐饮酒店",
  "Inbound": "入境消费",
  "Investors": "投资人",
  "Kansai": "关西",
  "Manufacturing": "制造",
  "Partners": "合作伙伴",
  "PoC": "PoC",
  "Relationship building": "人脉拓展",
  "Retail / consumer": "零售消费",
  "Salon": "沙龙",
  "Seed": "种子轮",
  "Semiconductor": "半导体",
  "Sponsorship": "赞助合作",
  "Startup": "创业",
  "Venture": "创投",
};
// 内部来源名不是用户话题，不进标签与筛选。
const INTERNAL_TOPIC = /^(event[ _]import|manual[ _]event.*|organizer[ _]feed|calendar[ _]sync.*)$/iu;

export function topicLabel(topic: string, language: "en" | "ja" | "zh"): string {
  return language === "en" ? topic : TOPIC_LABELS_ZH[topic] ?? topic;
}

export function eventTopics(event: OrbitLandingEventView): string[] {
  return [...new Set([event.industry, ...event.tags].map((item) => item.trim()).filter(Boolean))]
    .filter((item) => !INTERNAL_TOPIC.test(item))
    // 地点已在卡片 meta 行展示，不再作为话题重复出现。
    .filter((item) => item !== event.address && item !== event.place);
}

export function exploreTopicFilters(events: readonly OrbitLandingEventView[]): string[] {
  return [...new Set(events.flatMap(eventTopics))].slice(0, 8);
}

export interface ExploreFilterInput {
  language: "en" | "ja" | "zh";
  query: string;
  status: EventScope;
  topic: string;
}

export function matchesExploreFilters(event: OrbitLandingEventView, input: ExploreFilterInput): boolean {
  const { language, query, status, topic } = input;
  const matchesStatus =
    status === "all" ||
    (status === "registered"
      ? Boolean(event.stats.youRsvped)
      : event.status === status);
  const topics = eventTopics(event);
  const matchesTopic = topic === "all" || topics.includes(topic);
  const matchesQuery =
    !query ||
    event.name.includes(query) ||
    event.code.includes(query) ||
    event.theme.includes(query) ||
    topics.some((item) => item.includes(query) || topicLabel(item, language).includes(query));
  return matchesStatus && matchesTopic && matchesQuery;
}
