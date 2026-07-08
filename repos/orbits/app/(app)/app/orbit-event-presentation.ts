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
  OrbitEventAgendaItem,
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

// Clean one-line summaries per language, replacing the raw seed description blob
// (which concatenated ids/evidence and JA:/ZH:/EN: metadata) on the detail page.
const EVENT_SUMMARY: Record<string, LocalizedText> = {
  event_01: {
    en: "A small forum for restaurant operators and community marketers on booking flows, reviews and repeat visits.",
    zh: "面向餐饮经营者与社群营销人的小型交流会，聚焦预约转化、口碑与复购。",
    ja: "飲食店オーナーとコミュニティマーケター向けの小規模フォーラム。予約導線・口コミ・リピートを議論。",
  },
  event_02: {
    en: "A roundtable pairing Japan-China teams to scope AI workflow-automation proofs of concept.",
    zh: "日中团队圆桌，共同界定 AI 业务自动化的 PoC 方案。",
    ja: "日中チームでAI業務自動化のPoCを策定するラウンドテーブル。",
  },
  event_03: {
    en: "A meetup for operators opening cross-border ecommerce channels and partnerships.",
    zh: "面向跨境电商渠道拓展与合作的运营者交流会。",
    ja: "越境ECのチャネル開拓とパートナー連携のためのミートアップ。",
  },
  event_04: {
    en: "A matching salon connecting seed-stage founders with operator-investors.",
    zh: "连接种子期创业者与运营型投资人的配对沙龙。",
    ja: "シード期の創業者とオペレーター投資家をつなぐマッチング会。",
  },
  event_05: {
    en: "A salon for the Chinese business community in Japan on sponsorship and partnerships.",
    zh: "在日华人商业社群的赞助与合作沙龙。",
    ja: "在日華人ビジネスコミュニティのスポンサーシップと連携の会。",
  },
  event_06: {
    en: "A hands-on workshop turning scanned business cards into rich relationship profiles.",
    zh: "将名片扫描转化为丰富人脉档案的实操工作坊。",
    ja: "名刺スキャンから充実した人脈プロフィールを生成する実践ワークショップ。",
  },
  event_07: {
    en: "A working session to plan source-backed follow-ups after an event.",
    zh: "会后跟进策略工作会，规划有据可循的后续动作。",
    ja: "イベント後のフォローアップを設計する作戦会議。",
  },
  event_08: {
    en: "A lab on reactivating dormant, high-value relationships without cold outreach.",
    zh: "重新激活沉睡高价值关系的实验室，避免冷启动式打扰。",
    ja: "休眠した高価値の関係を再活性化するラボ。",
  },
  event_09: {
    en: "A clinic for reviewing and merging duplicate contacts with source evidence.",
    zh: "带来源证据地审阅并合并重复联系人的诊断会。",
    ja: "重複コンタクトを証拠付きで確認・統合するクリニック。",
  },
  event_10: {
    en: "A review of how low-quality matches are filtered before recommendations.",
    zh: "复盘在推荐前如何过滤低质量匹配。",
    ja: "推薦前に低品質マッチをどう除外するかのレビュー会。",
  },
  event_signup_01: {
    en: "A signup test lab for Kansai cross-border business programs.",
    zh: "关西跨境商务项目的报名测试会。",
    ja: "関西の越境ビジネス向け申込テスト会。",
  },
  event_signup_02: {
    en: "A registration meetup for Tokyo AI implementation partners.",
    zh: "东京 AI 落地伙伴的报名会。",
    ja: "東京のAI実装パートナー向け申込会。",
  },
  event_signup_03: {
    en: "A signup salon for Japan-China investors and founders.",
    zh: "日中投资人与创业者的报名沙龙。",
    ja: "日中の投資家・創業者向け申込サロン。",
  },
};

// A clean, generic agenda per language. Replaces the seed adapters' agenda,
// which packed the raw relationshipContext blob (ids + JA:/ZH:/EN: + operator
// metadata) into the "当晚议程" section.
const AGENDA_BY_LANG: Record<OrbitLanguage, OrbitEventAgendaItem[]> = {
  zh: [
    { time: "10:00", label: "开场与背景", description: "活动目标与今日议题概览。" },
    { time: "10:30", label: "主题环节", description: "围绕核心议题的分享与讨论。" },
    { time: "11:30", label: "交流与对接", description: "结构化的相互介绍与后续跟进。" },
  ],
  en: [
    { time: "10:00", label: "Welcome & framing", description: "Overview of the goal and today's topics." },
    { time: "10:30", label: "Main session", description: "Sharing and discussion on the core topic." },
    { time: "11:30", label: "Networking", description: "Structured introductions and follow-ups." },
  ],
  ja: [
    { time: "10:00", label: "開会・背景共有", description: "目的と本日のテーマの概要。" },
    { time: "10:30", label: "メインセッション", description: "中心テーマに関する共有と議論。" },
    { time: "11:30", label: "ネットワーキング", description: "体系的な紹介とフォローアップ。" },
  ],
};

const ATTENDEE_ROLE_BY_LANG: Record<OrbitLanguage, string> = {
  zh: "参会者",
  en: "Attendee",
  ja: "参加者",
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
  const summaryText = EVENT_SUMMARY[event.id] ?? EVENT_SUMMARY[event.code];
  const summary = summaryText
    ? summaryText[language] ?? summaryText.zh
    : undefined;

  return {
    ...event,
    name: title,
    logoUrl: preset.cover,
    detailLogoUrl: preset.cover,
    industry: preset.industry,
    theme: preset.theme,
    tags: [...preset.tags],
    agenda: AGENDA_BY_LANG[language] ?? AGENDA_BY_LANG.zh,
    stats: {
      ...event.stats,
      attendees: event.stats.attendees.map((attendee) => ({
        ...attendee,
        role: ATTENDEE_ROLE_BY_LANG[language] ?? ATTENDEE_ROLE_BY_LANG.zh,
      })),
    },
    ...(summary ? { summaryZh: summary, descriptionZh: summary } : {}),
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
