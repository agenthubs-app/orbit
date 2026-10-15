/**
 * R27 活动参加者整条路的示例世界（mock 模式；DESIGN §8 / PLANNER「示例 fixture」）。Owner: 甲 (R27).
 *
 * 一场活动：CFO Night Tokyo vol.18（参加者 128、プランに合う 18、知り合い 3；会場 R2 B-4；会後 9 人、46 → 56），探す 28 件。
 * 人名、公司、分数、日期照 b2-events-flow #6–#48（画板的「今天」= 2026-10-07（水））。每条都带 `sample: true`；
 * 本模块只是数据，不读时钟、不写库；变体（空 / 少 / 多）由 `EventJourneyVariant` 选。
 * 本人：佐藤 健一（ミナトリンク CEO），计划「シリーズA 資金調達」。
 */
import type { EventAfterResponse } from "../../contract/event-after";
import type { EventDiscoverResponse, EventDiscoverRow } from "../../contract/event-discover";
import type { EventOverviewAttendee, EventOverviewResponse } from "../../contract/event-overview";
import type { EventPrepResponse } from "../../contract/event-prep";
import type { EventSearchResponse } from "../../contract/event-search";
import type { EventVenuePerson, EventVenueResponse } from "../../contract/event-venue";

export const JOURNEY_EVENT_ID = "demo-event-cfo-night-18";
export const JOURNEY_ME = { company: "ミナトリンク", name: "佐藤 健一", role: "CEO" } as const;
export const JOURNEY_GOAL = "シリーズA 資金調達";

/** 画板的时刻：会う準備（开始前 3:12）、会場（20:22 · ラウンド 2 / 3）、会後（当日夜）。 */
export const JOURNEY_NOW = {
  discover: "2026-10-07T03:00:00.000Z",
  prep: "2026-10-07T06:48:00.000Z",
  venue: "2026-10-07T11:22:00.000Z",
  after: "2026-10-07T13:00:00.000Z",
} as const;

export type EventJourneyVariant = "empty" | "few" | "many";

export interface JourneyPerson {
  id: string;
  name: string;
  company: string;
  role: string;
  /** なぜ (short) — same line in 詳細 / 会う準備 / 会場. */
  why: string;
}

/** 本场活动里出现的人（一人一个名字、一个公司；demo-world-consistency 守）。 */
export const JOURNEY_PEOPLE: readonly JourneyPerson[] = [
  { company: "Sorae Capital", id: "jp-shimizu", name: "清水 玲奈", role: "プリンシパル", why: "シリーズA・B2B SaaS に注力。今年 5社に出資" },
  { company: "ブルーム証券", id: "jp-mori", name: "森 拓也", role: "投資銀行部 VP", why: "IPO 準備企業の資本政策を担当" },
  { company: "ノードワークス", id: "jp-inoue", name: "井上 早紀", role: "CFO", why: "昨年シリーズAを 4億円で調達。投資家交渉の経験" },
  { company: "東邦銀行", id: "jp-kimura", name: "木村 大和", role: "スタートアップ支援部", why: "ベンチャーデットの窓口。調達の選択肢が増える" },
  { company: "クオリス", id: "jp-hayashi", name: "林 美穂", role: "経営企画部長", why: "CVC 立ち上げを準備中。SaaS 領域を探索" },
  { company: "ミライ会計事務所", id: "jp-matsumoto", name: "松本 亮", role: "公認会計士", why: "スタートアップの監査 30社。監査法人選びに詳しい" },
  { company: "青葉ベンチャーズ", id: "jp-takahashi", name: "高橋 美咲", role: "パートナー", why: "知り合い" },
  { company: "アクシス商事", id: "jp-kato", name: "加藤 健太", role: "営業本部長", why: "知り合い" },
  { company: "株式会社ハルモニア", id: "jp-ito", name: "伊藤 直子", role: "CFO", why: "キーノート登壇。資本政策の相談相手" },
  { company: "テクノハブ", id: "jp-okada", name: "岡田 悠", role: "CEO", why: "同じテーブル" },
  { company: "リベルタ", id: "jp-nishimura", name: "西村 葵", role: "経営企画", why: "同じテーブル" },
];

const person = (id: string): JourneyPerson => {
  const found = JOURNEY_PEOPLE.find((item) => item.id === id);
  if (!found) throw new Error(`unknown journey person ${id}`);
  return found;
};
const initial = (name: string) => name.trim().charAt(0);
const family = (name: string) => name.split(" ")[0] ?? name;

export const JOURNEY_AGENDA = [
  { at: "19:00", detail: "ウェルカムドリンク", title: "受付・開場" },
  { at: "19:15", detail: "主催挨拶", title: "オープニング" },
  { at: "19:30", detail: "「シリーズA前後の資本政策」伊藤 直子", title: "キーノート" },
  { at: "20:00", detail: "テーマ別 6名卓", title: "テーブルトーク R1" },
  { at: "20:10", detail: "席替えあり", title: "テーブルトーク R2" },
  { at: "20:40", detail: "席替えあり", title: "テーブルトーク R3" },
  { at: "21:10", detail: null, title: "フリー交流" },
  { at: "21:30", detail: null, title: "終了" },
] as const;

const CFO_NIGHT_BASE = {
  description: "上場を目指すスタートアップの CFO・経営陣と、投資家・金融機関が本音で話す夜。キーノートのあと、テーブルトークを 3ラウンド。席は申込内容をもとに主催者が決めます。",
  emoji: "🥂",
  endsAt: "2026-10-07T21:30:00+09:00",
  eventId: JOURNEY_EVENT_ID,
  startsAt: "2026-10-07T19:00:00+09:00",
  title: "CFO Night Tokyo vol.18",
  venue: "渋谷ストリーム 4F ホール",
} as const;

// ---------- 探す ----------

const REASON_DETAIL_APP = `プラン「${JOURNEY_GOAL}」で今月会うべき「VC パートナー」「CFO 経験者」と重なるため。根拠：公式の登壇者リスト。`;

function row(input: Omit<EventDiscoverRow, "href" | "sample">): EventDiscoverRow {
  return { ...input, href: `/events/${input.eventId}`, sample: true };
}

const SUMMIT = row({ area: "tokyo", emoji: "🎤", eventId: "demo-event-saas-summit-2026", organizerId: "org-saas-summit", organizerName: "Japan SaaS Summit 実行委員会", priceYen: 15000, reason: "VC パートナー 3名が登壇", reasonDetail: REASON_DETAIL_APP, score: 82, startsAt: "2026-10-16T10:00:00+09:00", title: "Japan SaaS Summit 2026 秋", venue: "東京国際フォーラム", verdict: "recommend", meetCandidates: [{ emoji: "💼", label: "VC パートナー 3名（登壇）" }, { emoji: "🏭", label: "製造業 DX 責任者（展示 12社）" }, { emoji: "👋", label: "高橋さん・加藤さんも参加予定" }] });
const CVC = row({ area: "tokyo", emoji: "🤝", eventId: "demo-event-cvc-meetup-7", organizerId: "org-cvc", organizerName: "CVC Lab", priceYen: 3000, reason: "CVC 担当者 20名が参加予定", reasonDetail: REASON_DETAIL_APP, score: 77, startsAt: "2026-10-27T19:00:00+09:00", title: "スタートアップ×CVC ミートアップ #7", venue: "大手町", verdict: "recommend" });
const SERIES_A = row({ area: "online", emoji: "📚", eventId: "demo-event-series-a-study", organizerId: "org-series-a", organizerName: "シリーズA 実務研究会", priceYen: 0, reason: "伊藤さん（ハルモニア CFO）が登壇", reasonDetail: REASON_DETAIL_APP, score: 71, startsAt: "2026-11-12T13:00:00+09:00", title: "シリーズA 実務勉強会", venue: "オンライン", verdict: "recommend" });
const ASAKAI = row({ area: "tokyo", emoji: "☕", eventId: "demo-event-marunouchi-asakai-42", organizerId: "org-marunouchi-lab", organizerName: "丸の内イノベーションラボ", priceYen: 1000, score: 41, startsAt: "2026-10-21T08:00:00+09:00", title: "丸の内スタートアップ朝会 #42", venue: "丸の内", verdict: "skip" });
const MFG_DX = row({ area: "osaka", emoji: "🏭", eventId: "demo-event-mfg-dx-osaka", organizerId: "org-mfg-dx", organizerName: "製造業DX推進協議会", priceYen: 0, score: 68, startsAt: "2026-10-23T13:00:00+09:00", title: "製造業DXカンファレンス 大阪", venue: "グランフロント大阪", verdict: "conditional" });
const FINTECH = row({ area: "tokyo", emoji: "🎤", eventId: "demo-event-fintech-forum", organizerId: "org-fintech", organizerName: "FinTech Forum", priceYen: 8000, score: 58, startsAt: "2026-11-05T13:00:00+09:00", title: "FinTech Forum Tokyo", venue: "虎ノ門ヒルズ", verdict: "conditional" });

const COMMUNITY: readonly EventDiscoverRow[] = [
  row({ area: "tokyo", badges: ["members_only"], communityReason: "following", emoji: "🤝", eventId: "demo-event-marunouchi-lab-43", organizerId: "org-marunouchi-lab", organizerName: "丸の内イノベーションラボ", startsAt: "2026-10-21T19:00:00+09:00", title: "丸の内イノベーションラボ 定例会 #43", venue: "丸の内" }),
  row({ area: "tokyo", badges: ["early_access"], communityReason: "attended", emoji: "🥂", eventId: "demo-event-cfo-night-19", organizerId: "org-cfo-night", organizerName: "CFO Night 実行委員会", priceYen: 5000, startsAt: "2026-11-04T19:00:00+09:00", title: "CFO Night Tokyo vol.19", venue: "渋谷" }),
];

/** 探す · 少量（Web #12：今週 · 東京 · 製造業DX 的筛选结果）。 */
const FEW_DETAIL = `プラン「${JOURNEY_GOAL}」で会うべき人と重なるため。根拠：公式の登壇者リスト · 過去回の参加者構成。`;
const FEW_ROWS: readonly EventDiscoverRow[] = [
  row({ area: "tokyo", emoji: "🤝", eventId: "demo-event-mfg-saas-night", knownAttendees: ["高橋", "加藤"], meetCandidates: [{ emoji: "💼", label: "VC パートナー 3名（登壇）" }, { emoji: "🏭", label: "製造業 DX 責任者（展示 12社）" }, { emoji: "👋", label: "高橋さん・加藤さんも参加予定" }], priceYen: 2000, reason: "製造業の DX 責任者 15名", reasonDetail: FEW_DETAIL, score: 64, startsAt: "2026-10-09T19:00:00+09:00", title: "製造業 × SaaS ナイト", venue: "日本橋", verdict: "conditional" }),
  row({ area: "tokyo", emoji: "🏭", eventId: "demo-event-smart-factory-expo", priceYen: 0, reason: "出展 40社 · 決裁者は少なめ", reasonDetail: FEW_DETAIL, score: 55, startsAt: "2026-10-08T10:00:00+09:00", title: "スマートファクトリー EXPO 内覧", venue: "有明", verdict: "conditional" }),
  row({ area: "tokyo", emoji: "🛠️", eventId: "demo-event-iot-mokumoku", priceYen: 500, reason: "エンジニア中心 · 決裁者なし", reasonDetail: FEW_DETAIL, score: 38, startsAt: "2026-10-10T13:00:00+09:00", title: "IoT 実装もくもく会", venue: "五反田", verdict: "skip" }),
];

export function journeyDiscover(variant: EventJourneyVariant): EventDiscoverResponse {
  if (variant === "empty") {
    // 没有计划：人气顺；画板 #6 / #11 的「プランができると」示例行是界面上的固定示例（文案），不是数据。
    return { all: [], community: [], planFit: [], planFitTotal: 0, planGoal: null, popularityFallback: true, total: 0 };
  }
  if (variant === "few") {
    return { all: FEW_ROWS, community: [], planFit: FEW_ROWS.filter((item) => item.verdict !== "skip"), planFitTotal: 2, planGoal: JOURNEY_GOAL, popularityFallback: false, total: 3, widen: [{ extra: 9, kind: "period", value: "this_month" }, { extra: 2, kind: "area", value: "osaka" }, { extra: 6, kind: "theme", value: "funding" }] };
  }
  return {
    all: [SUMMIT, ASAKAI, MFG_DX, CVC, FINTECH, SERIES_A].map((item) => ({ ...item, reasonDetail: FEW_DETAIL })),
    community: COMMUNITY,
    planFit: [SUMMIT, CVC, SERIES_A],
    planFitTotal: 6,
    planGoal: JOURNEY_GOAL,
    popularityFallback: false,
    total: 28,
  };
}

/** 未登录的公开列表（b12 #324）：只有「すべて」，没有分数 / 依据 / 主办 id。 */
export function journeyPublicDiscover(): EventDiscoverResponse {
  const strip = (row: EventDiscoverRow): EventDiscoverRow => ({ area: row.area ?? null, emoji: row.emoji, eventId: row.eventId, href: row.href, organizerId: null, organizerName: row.organizerName ?? null, priceYen: row.priceYen ?? null, sample: true, startsAt: row.startsAt, title: row.title, venue: row.venue ?? null });
  return { all: [SUMMIT, CVC, SERIES_A, COMMUNITY[1]!].map(strip), community: [], planFit: [], planFitTotal: 0, popularityFallback: true, signedOut: true, total: 4 };
}

// ---------- 検索（「CFO」） ----------

export function journeySearch(query: string): EventSearchResponse {
  const q = query.trim().toLowerCase();
  const events = [
    { emoji: "🥂", eventId: JOURNEY_EVENT_ID, href: `/events/${JOURNEY_EVENT_ID}`, myStatus: "registered" as const, score: 74, startsAt: CFO_NIGHT_BASE.startsAt, title: CFO_NIGHT_BASE.title, venue: "渋谷" },
    { badges: ["early_access" as const], emoji: "🥂", eventId: "demo-event-cfo-night-19", href: "/events/demo-event-cfo-night-19", score: 76, startsAt: "2026-11-04T19:00:00+09:00", title: "CFO Night Tokyo vol.19", venue: "渋谷" },
    { emoji: "🥂", eventId: "demo-event-startup-cfo-mixer", href: "/events/demo-event-startup-cfo-mixer", priceYen: 3000, score: 69, startsAt: "2026-10-28T19:00:00+09:00", title: "スタートアップ CFO 交流会", venue: "新宿" },
    { emoji: "📚", eventId: "demo-event-young-cfo-study", href: "/events/demo-event-young-cfo-study", priceYen: 0, score: 52, startsAt: "2026-11-18T19:00:00+09:00", title: "若手 CFO 勉強会", venue: "オンライン" },
  ].filter((hit) => !q || hit.title.toLowerCase().includes(q));
  const organizers = [{ emoji: "🥂", eventCount: 18, following: true, name: "CFO Night 実行委員会", organizerId: "org-cfo-night" }].filter((hit) => !q || hit.name.toLowerCase().includes(q));
  const ito = person("jp-ito");
  const people = [{ contactId: "demo-contact-ito", eventCount: 2, initial: initial(ito.name), name: ito.name, org: "ハルモニア", role: ito.role }].filter((hit) => !q || `${hit.name} ${hit.org} ${hit.role}`.toLowerCase().includes(q));
  return { events, eventsTotal: events.length, organizers, people, query, sample: true };
}

// ---------- 詳細 ----------

const ATTENDEE_ORDER = ["jp-shimizu", "jp-mori", "jp-inoue", "jp-kimura", "jp-hayashi", "jp-matsumoto", "jp-takahashi", "jp-kato"] as const;

function attendee(id: string, wanted: boolean): EventOverviewAttendee {
  const p = person(id);
  const known = id === "jp-takahashi" || id === "jp-kato" || id === "jp-ito";
  return { attendeeId: id, initial: initial(p.name), known, name: p.name, note: known ? null : p.why, org: p.company, planFit: !known, role: p.role, wanted };
}

export function journeyOverview(variant: EventJourneyVariant, platform: "web" | "app" = "app"): EventOverviewResponse {
  // Web 画板（#17–#19）写「渋谷ストリーム 4F」，App 画板（#14–#16）写「渋谷ストリーム 4F ホール」：各端照自己的画板。
  const venue = platform === "web" ? "渋谷ストリーム 4F" : CFO_NIGHT_BASE.venue;
  const organizer = { editions: 18, emoji: "🥂", following: true, monthly: true, myAttendance: 2, name: "CFO Night 実行委員会", organizerId: "org-cfo-night", since: "2023-01-01", averageAttendance: 112, typeShare: { label: "CFO", percent: 41 } };
  const base = { ...CFO_NIGHT_BASE, venue, registrationClosesAt: "2026-10-03T23:59:00+09:00", agenda: JOURNEY_AGENDA.slice(0, 5).map((item) => ({ ...item })), capacity: 150, organizer, priceYen: 5000, registration: { href: `/events/${JOURNEY_EVENT_ID}/register`, status: "none" as const }, review: true, sample: true as const };
  if (variant === "empty") {
    return {
      ...base,
      assessment: { basis: "参加者が未公開のため「会える人」は登壇者のみで算出。公開されたら再計算して通知します。", display: { goalFit: 80, people: 0, timeCost: 66 }, score: 74, verdict: "recommend" },
      assessmentPeopleUnknown: true,
      attendeesPublicAt: "2026-09-25T00:00:00+09:00",
      attendeeCounts: { all: 0, known: 0, planFit: 0 },
      attendees: [],
      deadlineSoon: false,
      knownAttendees: [],
      remaining: 150,
      speakerCandidates: [
        { emoji: "🎤", label: "キーノート", name: "伊藤 直子", note: "ハルモニア CFO · あなたのつながり" },
        { emoji: "🏦", label: "パネル", name: "森 拓也", note: platform === "web" ? "IPO 準備の資本政策" : "ブルーム証券 · IPO 準備の資本政策" },
      ],
    };
  }
  if (variant === "few") {
    return {
      ...base,
      assessment: { basis: `根拠：プラン「${JOURNEY_GOAL}」· 登壇者 3名 · 参加者のうちプランに合う人 3名 · 平日夜 2.5時間 · ¥5,000`, display: { goalFit: 80, people: 70, timeCost: 66 }, score: 74, verdict: "recommend" },
      attendeeCounts: { all: 12, known: 1, planFit: 3 },
      // Web #18 的参加者格子有 4 人（含木村），App #15 的「会えそうな人」列 3 人。
      attendees: (platform === "web" ? ["jp-shimizu", "jp-mori", "jp-inoue", "jp-kimura"] : ["jp-shimizu", "jp-mori", "jp-inoue"]).map((id) => ({ ...attendee(id, false), ...(id === "jp-kimura" ? { planFit: false } : {}) })),
      deadlineSoon: false,
      knownAttendees: [{ initial: "伊", name: "伊藤", speaker: true }],
      knownNote: { detail: "9/24 にメールでやりとり", text: "伊藤さんがキーノートに登壇" },
      remaining: 138,
    };
  }
  return {
    ...base,
    assessment: { basis: `根拠：プラン「${JOURNEY_GOAL}」· 登壇者 3名 · 参加者のうちプランに合う人 18名 · 平日夜 2.5時間 · ¥5,000`, display: { goalFit: 80, people: 78, timeCost: 66 }, score: 74, verdict: "recommend" },
    attendeeCounts: { all: 128, known: 3, planFit: 18 },
    attendees: ATTENDEE_ORDER.map((id) => attendee(id, id === "jp-shimizu" || id === "jp-mori")),
    deadlineSoon: true,
    knownAttendees: [{ initial: "高", name: "高橋" }, { initial: "伊", name: "伊藤", speaker: true }, { initial: "加", name: "加藤" }],
    remaining: 22,
  };
}

// ---------- 会う準備 ----------

export function journeyPrep(): EventPrepResponse {
  const p = (id: string, relation: "working" | "met" | "none", opener: string, history: string) => {
    const x = person(id);
    return { attendeeId: id, contactId: relation === "none" ? null : `demo-contact-${id.slice(3)}`, history, initial: initial(x.name), name: x.name, opener, org: x.company, relation, role: x.role, why: x.id === "jp-inoue" ? "昨年シリーズAを 4億円で調達した CFO" : x.id === "jp-kimura" ? "ベンチャーデットの窓口" : x.why };
  };
  return {
    access: "渋谷駅 C2 出口から徒歩2分",
    agenda: JOURNEY_AGENDA.slice(0, 6).map((item) => ({ ...item })),
    cardsRecommended: 15,
    checklist: [
      { done: false, key: "cards" },
      { done: true, key: "intro" },
      { done: true, key: "materials", label: "事業計画書 v3 の共有リンク" },
      { done: false, key: "qr" },
      { done: false, key: "return" },
    ],
    endsAt: CFO_NIGHT_BASE.endsAt,
    eventId: JOURNEY_EVENT_ID,
    followupSuggestion: { endsAt: "2026-10-08T10:00:00+09:00", startsAt: "2026-10-08T09:30:00+09:00", title: "CFO Night のお礼とフォロー" },
    mapUrl: "https://maps.apple.com/?q=%E6%B8%8B%E8%B0%B7%E3%82%B9%E3%83%88%E3%83%AA%E3%83%BC%E3%83%A0",
    now: JOURNEY_NOW.prep,
    people: [
      p("jp-shimizu", "none", "「Sorae さんの SaaS 投資の記事を拝見しました。製造業向けはどう見ていますか？」", "なし · 高橋さんと同じ VC 勉強会"),
      p("jp-inoue", "none", "「調達のとき、最初に固めた資本政策のポイントは何でしたか？」", "なし · 同じテーブル B-4（R2）"),
      p("jp-ito", "working", "「キーノートのあと、5分だけ相談させてください」", "今日 打ち合わせ · 9/24 メール"),
      p("jp-kimura", "none", "「エクイティと併用する場合のタイミングを伺えますか」", "なし"),
    ],
    sample: true,
    seatHint: "席は R2 で B-4（井上さん・森さんと同席）。キーノート後に伊藤さんへ声をかけるのがおすすめです",
    selfIntro: { source: "registration_draft", text: "製造業向け IoT SaaS「ミナトリンク」の代表です。来春のシリーズAに向けて、資本政策と CFO 採用について、経験のある方のお話を伺いたいです。工場 DX の現場事情ならお話しできます。" },
    startsAt: CFO_NIGHT_BASE.startsAt,
    title: CFO_NIGHT_BASE.title,
    venue: CFO_NIGHT_BASE.venue,
  };
}

// ---------- 会場 ----------

const TABLES: Readonly<Record<string, string>> = { "jp-hayashi": "D-1", "jp-inoue": "B-4", "jp-kimura": "D-1", "jp-matsumoto": "A-1", "jp-mori": "B-4", "jp-okada": "B-4", "jp-nishimura": "B-4", "jp-shimizu": "C-2" };
const VENUE_DETAIL = "あなたの申込「会いたい人：VC・CVC」と、相手の申込「探している投資先：B2B SaaS」が一致。";

function venuePerson(id: string, exchange: EventVenuePerson["exchange"], extra: Partial<EventVenuePerson> = {}): EventVenuePerson {
  const p = person(id);
  const known = id === "jp-takahashi" || id === "jp-kato" || id === "jp-ito";
  const wanted = id === "jp-shimizu" || id === "jp-inoue" || id === "jp-kimura" || id === "jp-ito";
  return {
    attendeeId: id,
    exchange,
    initial: initial(p.name),
    isOrbitUser: id === "jp-shimizu",
    name: p.name,
    org: p.company,
    participantId: `participant-${id.slice(3)}`,
    relation: exchange === "exchanged" ? "exchanged" : known ? "known" : wanted ? "wanted" : "other",
    role: p.role,
    table: TABLES[id] ?? null,
    wanted,
    why: known ? null : p.why,
    whyDetail: known ? null : VENUE_DETAIL,
    ...(exchange === "incoming" ? { requestId: `request-${id.slice(3)}`, requestRevision: 1, requestedAt: "2026-10-07T20:20:00+09:00" } : {}),
    ...(exchange === "requested" ? { requestId: `request-out-${id.slice(3)}`, requestRevision: 1 } : {}),
    ...extra,
  };
}

export function journeyVenue(state: EventVenueResponse["state"] = "checked_in"): EventVenueResponse {
  const base = { endsAt: CFO_NIGHT_BASE.endsAt, eventId: JOURNEY_EVENT_ID, now: JOURNEY_NOW.venue, sample: true as const, startsAt: CFO_NIGHT_BASE.startsAt, title: CFO_NIGHT_BASE.title };
  const empty = { agenda: [], attendeeTotal: 0, attendees: [], nextOrder: [], openers: [], recommendations: [], stats: { exchanged: 0, incoming: 0, wantedMet: 0, wantedTotal: 0 } };
  if (state === "not_registered") return { ...base, ...empty, state };
  if (state === "before_check_in") {
    return { ...base, ...empty, checkIn: { available: true, displayName: JOURNEY_ME.name, qrPayload: "orbit-checkin:demo-event-cfo-night-18:A-042", receptionNumber: "A-042" }, now: "2026-10-07T18:55:00+09:00", state };
  }
  const shimizu = venuePerson("jp-shimizu", "incoming", { contactId: null });
  const attendees = [shimizu, venuePerson("jp-mori", "exchanged"), venuePerson("jp-inoue", "exchanged"), venuePerson("jp-kimura", "requested"), venuePerson("jp-hayashi", "none"), venuePerson("jp-matsumoto", "none"), venuePerson("jp-takahashi", "none"), venuePerson("jp-kato", "none")];
  const recommendations = [
    { ...shimizu, exchange: "none" as const, table: "C-2", why: person("jp-shimizu").why },
    venuePerson("jp-kimura", "none"),
    venuePerson("jp-hayashi", "none"),
  ];
  const order = [shimizu, venuePerson("jp-kimura", "requested"), venuePerson("jp-hayashi", "none"), venuePerson("jp-matsumoto", "none")];
  const mate = (id: string) => { const p = person(id); return { attendeeId: id, initial: initial(p.name), name: p.name, org: p.company, role: p.role }; };
  return {
    ...base,
    agenda: JOURNEY_AGENDA.map((item) => ({ ...item, ...(item.at === "20:10" ? { myTable: "B-4", now: true } : item.at === "20:40" ? { myTable: "D-1" } : {}) })),
    agendaTip: { detail: "伊藤さんはキーノート登壇者で、あなたの「協業中」のつながり。フリー交流の前半は登壇者の周りが空きやすい傾向です。", text: "21:10 フリー交流で伊藤さんに声をかける" },
    attendeeTotal: 128,
    attendees,
    checkIn: { available: false, displayName: JOURNEY_ME.name, receptionNumber: "A-042" },
    groups: {
      myTheme: "シリーズAの資本政策",
      others: [
        { count: 6, initials: ["木", "林", "松"], table: "A", theme: "IPO 準備の実務" },
        { count: 6, initials: ["木", "林", "松"], table: "C", theme: "SaaS の KPI 開示" },
        { count: 5, initials: ["木", "林", "松"], table: "D", theme: "CFO 採用と組織" },
        { count: 6, initials: ["木", "林", "松"], table: "E", theme: "デットファイナンス" },
      ],
      round: 2,
    },
    meetingSlots: ["2026-10-09T10:00:00+09:00", "2026-10-12T15:00:00+09:00", "2026-10-13T09:30:00+09:00"],
    mutualHint: { name: "清水", via: "高橋" },
    mySeat: {
      table: "B-4",
      tablemates: [mate("jp-inoue"), mate("jp-mori"), mate("jp-okada"), mate("jp-nishimura")],
      why: "同席の 2名があなたの話題と重なります",
      whyDetail: "井上さん（ノードワークス CFO）は昨年シリーズAで 4億円を調達。森さん（ブルーム証券）は資本政策の担当。どちらも申込時の「会いたい人：上場企業の CFO・金融」に一致。",
    },
    nextOrder: order,
    nextRound: { at: "20:40", names: "木村さん（東邦銀行）· 林さん（クオリス）", round: 3, table: "D-1" },
    openers: ["監査法人はいつ、どう選びましたか？", "最初の CFO 採用、正社員と業務委託どちらでした？", "製造業向け SaaS の KPI、投資家に何を見られました？"],
    recommendations,
    round: { endsAt: "2026-10-07T20:40:00+09:00", index: 2, remainingMinutes: 18, startsAt: "2026-10-07T20:10:00+09:00", theme: "シリーズAの資本政策", title: "テーブルトーク", total: 3 },
    seats: [{ round: 1, table: "A-2" }, { round: 2, table: "B-4" }, { round: 3, table: "D-1" }],
    state,
    stats: { exchanged: 3, incoming: 1, wantedMet: 2, wantedTotal: 4 },
  };
}

// ---------- 会後 ----------

const THANKS_SHIMIZU = {
  body: "清水様\n\n昨夜は CFO Night でお話しいただき、ありがとうございました。製造業向け SaaS への見方を伺えたことが大変参考になりました。\n\n11月のオフィス訪問の件、候補日を改めてお送りいたします。\n\n佐藤 健一",
  subject: "昨夜の CFO Night のお礼（ミナトリンク 佐藤）",
};

const thanks = (id: string) => {
  const p = person(id);
  return id === "jp-shimizu" ? THANKS_SHIMIZU : { body: `${family(p.name)}様\n\n昨夜は CFO Night でお話しいただき、ありがとうございました。\n\n佐藤 健一`, subject: "昨夜の CFO Night のお礼（ミナトリンク 佐藤）" };
};

function step(id: string, followupDate: string, planType: { key: string; label: string } | null, alreadyCounted = false) {
  const p = person(id);
  return { attendeeId: id, contactId: `demo-contact-${id.slice(3)}`, followupDate, initial: initial(p.name), name: p.name, org: p.company, planType, thanksDraft: thanks(id), ...(alreadyCounted ? { alreadyCounted: true } : {}) };
}

/** 计划类型的配点与已得（预览用 `nextAward`）：VC パートナー 2 / 3 人（+10 达成）；CFO 経験者 4 / 5 人（+3）；其余已计入。 */
const SCORE_SLOTS = [
  { allocation: 30, earnedCount: 2, earnedPoints: 20, key: "vc_partner", skipped: false, targetCount: 3 },
  { allocation: 15, earnedCount: 4, earnedPoints: 12, key: "cfo_experienced", skipped: false, targetCount: 5 },
  { allocation: 10, earnedCount: 2, earnedPoints: 10, key: "financial_institution", skipped: false, targetCount: 2 },
  { allocation: 10, earnedCount: 1, earnedPoints: 10, key: "debt_advisor", skipped: false, targetCount: 1 },
  { allocation: 10, earnedCount: 1, earnedPoints: 10, key: "audit_firm", skipped: false, targetCount: 1 },
];

const HIGHLIGHTS = [
  { emoji: "💼", evidence: "交換記録 21:04 · あなたのメモ「11月にオフィスへ」", detail: "清水さん（Sorae）は B2B SaaS に注力。11月にオフィス訪問の約束", title: "VC との接点が 3名増えました" },
  { emoji: "📊", evidence: "あなたの音声メモ 20:31（文字起こし）", detail: "井上さん：優先株の条件は 2社以上で比較を", title: "資本政策の具体的な助言をもらえました" },
  { emoji: "🕳️", evidence: "会いたい人リスト 4名中 交換 2名 · 共通の知り合い", detail: "林さん · 松本さん。vol.19 か、高橋さん経由の紹介が近道", title: "会いたい人のうち 2名には会えませんでした" },
];

export function journeyAfter(variant: EventJourneyVariant): EventAfterResponse {
  const base = { aiDraft: true, date: "2026-10-07", eventId: JOURNEY_EVENT_ID, sample: true as const, title: CFO_NIGHT_BASE.title };
  if (variant === "empty") {
    return { ...base, aiDraft: false, met: { count: 0, exchanged: 0, initials: [], meetings: 0, wantedMet: 0, wantedTotal: 4 }, nextSteps: [], score: { after: 56, before: 46, detail: "", goal: JOURNEY_GOAL } };
  }
  if (variant === "few") {
    return {
      ...base,
      highlights: HIGHLIGHTS.slice(0, 1),
      met: { count: 2, exchanged: 2, initials: ["森", "井"], meetings: 0, wantedMet: 1, wantedTotal: 4 },
      nextSteps: [step("jp-shimizu", "2026-10-09", { key: "vc_partner", label: "VC パートナー" }, true), step("jp-inoue", "2026-10-12", { key: "cfo_experienced", label: "CFO 経験者" })],
      score: { after: 49, before: 46, detail: "調達経験のある起業家 1人（+3）。", goal: JOURNEY_GOAL },
      scoreSlots: SCORE_SLOTS,
    };
  }
  return {
    ...base,
    highlights: HIGHLIGHTS,
    met: { count: 9, exchanged: 9, initials: ["清", "森", "井", "木", "伊"], meetings: 2, wantedMet: 3, wantedTotal: 4 },
    nextSteps: [
      step("jp-shimizu", "2026-10-09", { key: "vc_partner", label: "VC パートナー" }),
      step("jp-inoue", "2026-10-12", { key: "cfo_experienced", label: "CFO 経験者" }, true),
      step("jp-mori", "2026-10-14", { key: "financial_institution", label: "金融機関" }, true),
      step("jp-kimura", "2026-10-13", { key: "debt_advisor", label: "デットの相談先" }, true),
      step("jp-ito", "2026-10-08", null),
      step("jp-matsumoto", "2026-10-20", { key: "audit_firm", label: "監査法人" }, true),
    ],
    scoreSlots: SCORE_SLOTS,
    score: { after: 56, before: 46, detail: "VC パートナー 1人（+10 · 3 / 3人で達成）。同じ人は同じタイプで 1回だけ計上。確定した「次の一手」だけを反映します。", goal: JOURNEY_GOAL },
  };
}

/** 本场活动 + 探す出现的所有活动 id（契约 9 mock 只认这些与 DEMO_EVENTS）。 */
export function journeyEventIds(): string[] {
  const ids = new Set<string>([JOURNEY_EVENT_ID]);
  for (const variant of ["empty", "few", "many"] as const) {
    const d = journeyDiscover(variant);
    for (const item of [...d.community, ...d.planFit, ...d.all]) ids.add(item.eventId);
  }
  for (const hit of journeySearch("").events) ids.add(hit.eventId);
  return [...ids];
}

// ---------- 参加登録（b2 #20–#23） ----------

/** 示例 5 问（字段与现有 AI 访谈同一套；option 文字照画板）。 */
export const JOURNEY_JOIN_QUESTIONS = [
  { field: "desiredOutcome", options: ["資金調達の相談相手を見つけたい", "同じステージの起業家と話したい", "採用の相談をしたい", "業界の最新情報を知りたい"], prompt: "今回の参加目的にいちばん近いものは？" },
  { field: "experienceHighlight", options: ["シリーズAの資本政策", "CFO 採用", "SaaS の KPI 開示", "IPO 準備"], prompt: "当日話したいテーマを選んでください（2つまで）" },
  { field: "targetAttendees", options: ["VC・CVC", "上場企業の CFO", "監査法人・会計士", "金融機関（デット）", "同じステージの起業家"], prompt: "どんな方に会いたいですか？" },
  { field: "valueOffered", options: ["工場 DX の現場事情", "製造業向け SaaS の立ち上げ経験", "エンジニア採用のノウハウ"], prompt: "あなたが提供できることは？" },
  { field: "followUpPreference", options: ["メール", "Orbit のメッセージ", "後日あらためて面談"], prompt: "当日のあと、どう連絡を取りたいですか？" },
] as const;

export const JOURNEY_JOIN_SELF_INTRO = "製造業向け IoT SaaS「ミナトリンク」の代表です。来春のシリーズAに向けて、資本政策と CFO 採用について、経験のある方のお話を伺いたいです。工場 DX の現場事情ならお話しできます。";
export const JOURNEY_JOIN_SUBMITTED_AT = "2026-09-20T14:32:00+09:00";
export const JOURNEY_JOIN_REVIEW_UNTIL = "2026-10-03T23:59:00+09:00";
