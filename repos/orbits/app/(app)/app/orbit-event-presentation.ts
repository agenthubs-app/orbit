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
  OrbitLandingEventView,
  OrbitLandingViewModel,
} from "./orbit-landing-route-view-model";
import {
  sourceEventRangeLabel,
  type SourceAgendaItem,
} from "./orbit-event-temporal";
import { EVENT_CONTENT, type EventLocalizedText } from "./orbit-event-content";

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

// Localized agenda copy. The clock stays on the source-bounded agenda created
// by the route adapter; presentation may translate labels but never replace
// those source-derived times.
const AGENDA_CONTENT_BY_LANG: Record<OrbitLanguage, SourceAgendaItem[]> = {
  zh: [
    { label: "签到与欢迎", description: "入场签到，自由交流与欢迎。" },
    { label: "主题环节", description: "围绕活动主题的分享与圆桌讨论。" },
    { label: "结构化对接", description: "按算法匹配的桌次进行相互介绍。" },
    { label: "后续确认", description: "确认后续负责人、联系方式与下一步。" },
  ],
  en: [
    {
      label: "Check-in & welcome",
      description: "Registration, open mingling and welcome.",
    },
    {
      label: "Main session",
      description: "Theme talk and roundtable discussion.",
    },
    {
      label: "Structured matching",
      description: "Guided introductions at algorithm-matched tables.",
    },
    {
      label: "Follow-up confirmation",
      description: "Confirm owners, contact details and next steps.",
    },
  ],
  ja: [
    { label: "受付・ウェルカム", description: "受付、自由交流とウェルカム。" },
    {
      label: "メインセッション",
      description: "テーマトークとラウンドテーブル。",
    },
    {
      label: "構造化マッチング",
      description: "アルゴリズムが組んだ席で相互紹介。",
    },
    {
      label: "フォローアップ確認",
      description: "担当者、連絡先、次のアクションを確認。",
    },
  ],
};

function sourceLogisticsBody(
  event: OrbitLandingEventView,
  language: OrbitLanguage,
): string {
  const range =
    sourceEventRangeLabel(event.startsAt, event.endsAt, language) ??
    {
      en: "Time TBD",
      ja: "日時未定",
      zh: "时间待确认",
    }[language];
  const venue = event.venue.trim()
    ? event.venue
    : {
        en: "Venue TBD",
        ja: "会場未定",
        zh: "地点待确认",
      }[language];
  const fee = {
    en: "Fee and entry terms follow the organizer's latest source record.",
    ja: "参加費と入場条件は、主催者の最新ソース記録に従います。",
    zh: "费用与入场条件以主办方最新来源记录为准。",
  }[language];

  return `• ${range}\n• ${venue}\n• ${fee}`;
}

function presentEvent(
  event: OrbitLandingEventView,
  language: OrbitLanguage,
): OrbitLandingEventView {
  const content = EVENT_CONTENT[event.id] ?? EVENT_CONTENT[event.code];
  if (!content) {
    return event;
  }

  const summary = pick(content.summary, language);
  const agendaContent =
    AGENDA_CONTENT_BY_LANG[language] ?? AGENDA_CONTENT_BY_LANG.zh;
  const about = content.about.map((section) => ({
    body:
      section.icon === "📍"
        ? sourceLogisticsBody(event, language)
        : pick(section.body, language),
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
    agenda: event.agenda.map((item, index) => ({
      ...item,
      description: agendaContent[index]?.description ?? item.description,
      label: agendaContent[index]?.label ?? item.label,
    })),
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
