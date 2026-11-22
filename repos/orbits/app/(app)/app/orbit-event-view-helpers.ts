import type { EventDTO } from "../../../shared/domain/contracts";
import { ORBIT_DEFAULT_LANGUAGE, type OrbitLanguage } from "./orbit-language-core";

export function initialFor(value: string, fallback = "O"): string {
  return value.trim().slice(0, 1).toUpperCase() || fallback;
}

export function eventStatusFor(
  event: Pick<EventDTO, "endsAt" | "startsAt">,
  generatedAt: string,
): "active" | "upcoming" | "ended" {
  const now = new Date(generatedAt).getTime();
  const startsAt = new Date(event.startsAt).getTime();
  const endsAt = new Date(event.endsAt ?? event.startsAt).getTime();

  if (!Number.isFinite(now) || !Number.isFinite(startsAt)) {
    return "upcoming";
  }

  if (Number.isFinite(endsAt) && endsAt < now) {
    return "ended";
  }

  if (startsAt <= now) {
    return "active";
  }

  return "upcoming";
}

function normalizedTextFor(event: EventDTO): string {
  return `${event.name} ${event.source.label ?? ""} ${event.location ?? ""}`.toLowerCase();
}

// Keyword patterns (not display text): matched against the event name, source
// label and location in any of the three languages.
const AI_PATTERN = /ai|\u4eba\u5de5|\u81ea\u52d5/;
const FINANCE_PATTERN = /finance|\u6295\u8cc7|\u91d1\u878d/;
const MANUFACTURING_PATTERN = /manufact|\u88fd\u9020|\u534a\u5c0e\u4f53/;
const CROSS_BORDER_PATTERN = /ecommerce|cross-border|\u8d8a\u5883/;
const COMMUNITY_PATTERN = /community|\u30b3\u30df\u30e5\u30cb\u30c6\u30a3/;
const HOSPITALITY_PATTERN = /restaurant|\u98f2\u98df/;

/** Cover glyph id (an internal token, never display text). */
export function eventThemeFor(event: EventDTO): string {
  const text = normalizedTextFor(event);

  if (AI_PATTERN.test(text)) return "ai";
  if (FINANCE_PATTERN.test(text)) return "finance";
  if (MANUFACTURING_PATTERN.test(text)) return "chip";
  if (text.includes("retail") || text.includes("fashion") || text.includes("consumer")) return "fashion";
  if (CROSS_BORDER_PATTERN.test(text)) return "globe";
  if (text.includes("saas") || text.includes("workflow")) return "cloud";

  return "ai";
}

type LocalizedLabel = Record<OrbitLanguage, string>;

const INDUSTRY_LABELS = {
  ai: { ja: "AI・自動化", zh: "AI · 自动化", en: "AI / automation" },
  community: { ja: "コミュニティ", zh: "社群", en: "Community" },
  crossBorder: { ja: "越境EC", zh: "跨境电商", en: "Cross-border commerce" },
  finance: { ja: "金融・投資", zh: "金融 · 投资", en: "Finance / investment" },
  hospitality: { ja: "飲食・ホスピタリティ", zh: "餐饮 · 服务", en: "Hospitality" },
  manufacturing: { ja: "製造", zh: "制造", en: "Manufacturing" },
  relationship: { ja: "人脈づくり", zh: "人脉拓展", en: "Relationship building" },
} satisfies Record<string, LocalizedLabel>;

export type EventIndustryKey = keyof typeof INDUSTRY_LABELS;

export function eventIndustryKeyFor(event: EventDTO): EventIndustryKey {
  const text = normalizedTextFor(event);

  if (/ai|\u81ea\u52d5/.test(text)) return "ai";
  if (FINANCE_PATTERN.test(text)) return "finance";
  if (/ecommerce|\u8d8a\u5883/.test(text)) return "crossBorder";
  if (/manufact|\u88fd\u9020/.test(text)) return "manufacturing";
  if (COMMUNITY_PATTERN.test(text)) return "community";
  if (HOSPITALITY_PATTERN.test(text)) return "hospitality";

  return "relationship";
}

/**
 * Industry label in the page language. Callers that know the language should
 * pass it; the default is the product default (ja).
 */
export function eventIndustryFor(
  event: EventDTO,
  language: OrbitLanguage = ORBIT_DEFAULT_LANGUAGE,
): string {
  return INDUSTRY_LABELS[eventIndustryKeyFor(event)][language];
}

/**
 * Topic row for an event card: industry and place. The source type
 * (`event_import`, …) is an internal token, not a topic, so it is not shown.
 */
export function eventTagsFor(
  event: EventDTO,
  language: OrbitLanguage = ORBIT_DEFAULT_LANGUAGE,
): string[] {
  const industry = eventIndustryFor(event, language);

  return [...new Set([industry, event.location].filter(Boolean))] as string[];
}

const DURATION_COPY = {
  hours: { ja: "時間", zh: " 小时", en: " h" },
  minutes: { ja: "分", zh: " 分钟", en: " min" },
} satisfies Record<string, LocalizedLabel>;

export function formatDuration(
  startValue: string,
  endValue?: string,
  language: OrbitLanguage = ORBIT_DEFAULT_LANGUAGE,
): string {
  const start = new Date(startValue).getTime();
  const end = new Date(endValue ?? startValue).getTime();

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return `30${DURATION_COPY.minutes[language]}`;
  }

  const minutes = Math.round((end - start) / 60_000);

  if (minutes >= 120) {
    return `${Math.round(minutes / 60)}${DURATION_COPY.hours[language]}`;
  }

  return `${minutes}${DURATION_COPY.minutes[language]}`;
}
