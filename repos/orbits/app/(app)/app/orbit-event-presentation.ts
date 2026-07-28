// Event presentation layer: trilingual titles, structured "about" sections,
// fitting cover imagery, clean agenda and attendee labels for the seeded events.
// Applied in the page AFTER the route adapter and BEFORE localizeOrbitTree, where
// the page language is known.
//
// Why here (not the zh->en dictionary): the seed carries mixed "日本語 / English"
// titles + raw relationshipContext blobs, and the global localizer is
// zh-canonical + en-dictionary only (no ja). The 13 seeded events are referenced
// ~1,600x by id across attendees/intents/matches/tests, so their ids must stay
// stable — we localize *presentation* by id instead of re-seeding. Unknown ids
// fall back to their existing name/cover.
//
// Authored content (titles, summaries, structured about sections) lives in
// ./orbit-event-content. Cover art under /orbit-covers is bundled
// Creative-Commons / Unsplash imagery for non-commercial demo/testing only.

import type { OrbitLanguage } from "./orbit-language-core";
import type {
  OrbitEventAgendaItem,
  OrbitLandingEventView,
  OrbitLandingViewModel,
} from "./orbit-landing-route-view-model";
import {
  EVENT_CONTENT,
  type EventLocalizedText,
} from "./orbit-event-content";

function pick(text: EventLocalizedText, language: OrbitLanguage): string {
  return text[language] ?? text.zh;
}

/** The localized display title for a seeded event id (or code), if known. */
export function eventTitleForId(
  idOrCode: string | null | undefined,
  language: OrbitLanguage,
): string | null {
  if (!idOrCode) return null;
  const content = EVENT_CONTENT[idOrCode];
  return content ? pick(content.title, language) : null;
}

// A clean, generic agenda per language. Replaces the seed adapters' agenda,
// which packed the raw relationshipContext blob (ids + JA:/ZH:/EN: + operator
// metadata) into the "当晚议程" section.
const AGENDA_BY_LANG: Record<OrbitLanguage, OrbitEventAgendaItem[]> = {
  zh: [
    { time: "18:30", label: "签到与欢迎酒会", description: "入场签到，自由交流与欢迎饮品。" },
    { time: "19:00", label: "主题环节", description: "围绕当晚主题的分享与圆桌讨论。" },
    { time: "20:00", label: "结构化对接", description: "按算法匹配的桌次进行相互介绍。" },
    { time: "21:00", label: "自由交流与合影", description: "延伸交流、交换名片与后续跟进。" },
  ],
  en: [
    { time: "18:30", label: "Check-in & welcome drinks", description: "Registration, open mingling and welcome drinks." },
    { time: "19:00", label: "Main session", description: "Theme talk and roundtable discussion." },
    { time: "20:00", label: "Structured matching", description: "Guided introductions at algorithm-matched tables." },
    { time: "21:00", label: "Open networking", description: "Extended networking, cards and follow-ups." },
  ],
  ja: [
    { time: "18:30", label: "受付・ウェルカムドリンク", description: "受付、自由交流とウェルカムドリンク。" },
    { time: "19:00", label: "メインセッション", description: "テーマトークとラウンドテーブル。" },
    { time: "20:00", label: "構造化マッチング", description: "アルゴリズムが組んだ席で相互紹介。" },
    { time: "21:00", label: "自由交流", description: "延長ネットワーキングと名刺交換。" },
  ],
};

function presentEvent(
  event: OrbitLandingEventView,
  language: OrbitLanguage,
): OrbitLandingEventView {
  const content = EVENT_CONTENT[event.id] ?? EVENT_CONTENT[event.code];
  if (!content) {
    return event;
  }

  const summary = pick(content.summary, language);
  const about = content.about.map((section) => ({
    body: pick(section.body, language),
    icon: section.icon,
    label: pick(section.label, language),
  }));

  return {
    ...event,
    name: pick(content.title, language),
    logoUrl: content.cover,
    detailLogoUrl: content.cover,
    industry: content.industry,
    theme: content.theme,
    tags: [...content.tags],
    agenda: AGENDA_BY_LANG[language] ?? AGENDA_BY_LANG.zh,
    about,
    summaryZh: summary,
    descriptionZh: summary,
  };
}

/** Localize title/summary/about + attach a fitting cover to a single event view. */
export function presentOrbitEvent(
  event: OrbitLandingEventView,
  language: OrbitLanguage,
): OrbitLandingEventView {
  return presentEvent(event, language);
}

/** Localize titles + attach fitting covers to a list of event views. */
export function presentOrbitEvents(
  events: readonly OrbitLandingEventView[],
  language: OrbitLanguage,
): OrbitLandingEventView[] {
  return events.map((event) => presentEvent(event, language));
}

/** Localize titles + attach fitting covers to every event in a landing view. */
export function applyOrbitEventPresentation(
  viewModel: OrbitLandingViewModel,
  language: OrbitLanguage,
): OrbitLandingViewModel {
  return {
    ...viewModel,
    events: presentOrbitEvents(viewModel.events, language),
  };
}
