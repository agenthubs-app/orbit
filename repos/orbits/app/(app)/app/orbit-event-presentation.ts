// Event presentation layer: trilingual titles + fitting cover imagery for the
// seeded events. Applied in the page AFTER the route adapter and BEFORE
// localizeOrbitTree, where the page language is known.
//
// Why here (not the zh->en dictionary): the seed carries mixed "日本語 / English"
// titles and the global localizer is zh-canonical + en-dictionary only (no ja).
// The 13 seeded events are referenced ~1,600× by id across attendees/intents/
// matches/tests, so their ids must stay stable — we localize *presentation* by
// id instead of re-seeding. Unknown ids fall back to their existing name/cover.
//
// Cover art under /orbit-covers is bundled Creative-Commons / Unsplash imagery
// for non-commercial demo/testing only.

import type { OrbitLanguage } from "./orbit-language-core";
import type {
  OrbitLandingEventView,
  OrbitLandingViewModel,
} from "./orbit-landing-route-view-model";

interface LocalizedText {
  en: string;
  ja: string;
  zh: string;
}

interface EventPresentation {
  cover: string; // /orbit-covers/*.jpg
  industry: string;
  tags: readonly string[];
  theme: string;
  title: LocalizedText;
}

// Trilingual titles derived from each event's source label (JP / ZH / EN),
// plus a category-fit cover, theme, industry and short language-neutral tags.
const EVENT_PRESENTATION: Record<string, EventPresentation> = {
  event_01: {
    title: {
      ja: "東京インバウンド飲食店成長会",
      zh: "东京餐饮入境客增长会",
      en: "Tokyo Inbound Restaurant Growth Forum",
    },
    cover: "/orbit-covers/restaurant.jpg",
    theme: "consumer",
    industry: "F&B",
    tags: ["Inbound", "F&B"],
  },
  event_02: {
    title: {
      ja: "日中AI業務自動化PoCラウンドテーブル",
      zh: "日中 AI 业务自动化 PoC 圆桌",
      en: "Japan-China AI Workflow PoC Roundtable",
    },
    cover: "/orbit-covers/ai.jpg",
    theme: "ai",
    industry: "AI",
    tags: ["AI", "PoC"],
  },
  event_03: {
    title: {
      ja: "越境ECチャネル開拓ミートアップ",
      zh: "跨境电商渠道拓展交流会",
      en: "Cross-Border Ecommerce Channel Meetup",
    },
    cover: "/orbit-covers/ecommerce.jpg",
    theme: "consumer",
    industry: "Ecommerce",
    tags: ["Ecommerce", "Cross-border"],
  },
  event_04: {
    title: {
      ja: "投資家・創業者シード面談会",
      zh: "投资人与创业者种子轮会谈",
      en: "Seed Investor and Founder Matching Salon",
    },
    cover: "/orbit-covers/finance.jpg",
    theme: "finance",
    industry: "Venture",
    tags: ["Investors", "Seed"],
  },
  event_05: {
    title: {
      ja: "在日華人ビジネスコミュニティスポンサー会",
      zh: "在日华人商业社群赞助合作会",
      en: "Chinese Business Community Sponsorship Salon",
    },
    cover: "/orbit-covers/community.jpg",
    theme: "community",
    industry: "Community",
    tags: ["Community", "Sponsorship"],
  },
  event_06: {
    title: {
      ja: "名刺プロフィール生成ワークショップ",
      zh: "名片资料生成工作坊",
      en: "Business Card Profile Generation Workshop",
    },
    cover: "/orbit-covers/workshop.jpg",
    theme: "product",
    industry: "Product",
    tags: ["Workshop", "Product"],
  },
  event_07: {
    title: {
      ja: "イベント後フォローアップ作戦会議",
      zh: "会后跟进策略会",
      en: "Post-Event Follow-Up Strategy Session",
    },
    cover: "/orbit-covers/meeting.jpg",
    theme: "relationship",
    industry: "Relationship",
    tags: ["Follow-up", "Strategy"],
  },
  event_08: {
    title: {
      ja: "休眠関係リカバリー会",
      zh: "沉睡关系重新激活会",
      en: "Dormant Relationship Reactivation Lab",
    },
    cover: "/orbit-covers/networking.jpg",
    theme: "relationship",
    industry: "Relationship",
    tags: ["Reactivation", "Network"],
  },
  event_09: {
    title: {
      ja: "重複コンタクト整理クリニック",
      zh: "重复联系人合并诊断会",
      en: "Duplicate Contact Merge Clinic",
    },
    cover: "/orbit-covers/office.jpg",
    theme: "product",
    industry: "Data",
    tags: ["Data", "Merge"],
  },
  event_10: {
    title: {
      ja: "低品質マッチ排除レビュー",
      zh: "低质量匹配过滤复盘会",
      en: "Bad Match Filtering Review",
    },
    cover: "/orbit-covers/chip.jpg",
    theme: "ai",
    industry: "AI",
    tags: ["Matching", "Quality"],
  },
  event_signup_01: {
    title: {
      ja: "関西越境ビジネス申込テスト会",
      zh: "关西跨境商务报名测试会",
      en: "Kansai Cross-Border Business Signup Lab",
    },
    cover: "/orbit-covers/globe.jpg",
    theme: "consumer",
    industry: "Cross-border",
    tags: ["Cross-border", "Signup"],
  },
  event_signup_02: {
    title: {
      ja: "東京AI実装パートナー申込会",
      zh: "东京 AI 落地伙伴报名会",
      en: "Tokyo AI Implementation Partner Registration Meetup",
    },
    cover: "/orbit-covers/cloud.jpg",
    theme: "ai",
    industry: "AI",
    tags: ["AI", "Partners"],
  },
  event_signup_03: {
    title: {
      ja: "日中投資家・創業者申込サロン",
      zh: "日中投资人与创业者报名沙龙",
      en: "Japan-China Investor Founder Signup Salon",
    },
    cover: "/orbit-covers/finance.jpg",
    theme: "finance",
    industry: "Venture",
    tags: ["Investors", "Signup"],
  },
};

function presentEvent(
  event: OrbitLandingEventView,
  language: OrbitLanguage,
): OrbitLandingEventView {
  const preset = EVENT_PRESENTATION[event.id] ?? EVENT_PRESENTATION[event.code];
  if (!preset) {
    return event;
  }

  const title = preset.title[language] ?? preset.title.zh;

  return {
    ...event,
    name: title,
    logoUrl: preset.cover,
    detailLogoUrl: preset.cover,
    industry: preset.industry,
    theme: preset.theme,
    tags: [...preset.tags],
  };
}

/** Localize + re-cover a single event view (event-detail page). */
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
