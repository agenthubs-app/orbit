/**
 * R17 主催的示例世界（mock 模式；DESIGN §4「设计稿示例 fixture」）。Owner: 甲 (R17).
 *
 * 六场活动 + 两份主办方资料，人名、公司、数字照 b6-host-polish #0–#24 / #44 / #45、web.html #20、
 * b7-account-misc #33–#39、b12 #396–#475（画板的「今天」= 2026-10-07（水））。每条都带 `sample: true`；
 * 本模块只是数据，不读时钟、不写库；变体由 `HostMockState` 选。
 * 本人（主办方）：佐藤 健一（株式会社ミナトリンク），与 R27 的「本人」同一人。
 */
import type {
  HostCenterEventRow,
  HostCenterResponse,
  HostEventStatus,
  HostEventView,
  HostRole,
} from "../../contract/host-events";
import type {
  HostKioskRecent,
  HostKioskResponse,
  HostKioskRow,
  HostMatchingMember,
  HostMatchingResponse,
  HostMatchingTable,
  HostNoticeTemplate,
  HostOverviewResponse,
  HostPeopleBucket,
  HostPeopleResponse,
  HostPeopleRow,
  HostReportResponse,
  HostSetupQuestion,
  HostSetupResponse,
} from "../../contract/host-console";
import type { HostCheckInEventsResponse, HostCohostInvitePreview, HostCohostsResponse } from "../../contract/host-cohosts";
import type { HostNoticePreview } from "../../contract/host-notices";
import type { OrganizerProfile, OrganizerProfileListResponse, OrganizerPublicResponse } from "../../contract/organizer-profile";

export type HostVariant = "empty" | "few" | "many";

/** mock 的变体（开发接口 `app/api/dev/event-design-fixture/route.dev.ts` 的 `host` 切换）。 */
export interface HostMockState {
  /** 運営センター：空 #0 / 少 #1 / 大 #2；`inactive` = 下書き · 中止 · アーカイブ（b12 #438）。 */
  center: HostVariant | "inactive";
  /** CFO18 概要：web.html #20 是开场前（受付 0），b6 #20 / #23 是开催中（受付 86）。 */
  overview: "pre_open" | "live";
  /** CFO18 申込設定：少 #14（草稿 2 问）/ 大 #15（公开中 5 问 + 未公開の変更 2）。 */
  setup: "few" | "many";
  /** kiosk：空 #10（18:46，0 / 128）/ 大 #11（19:46，86 / 128）。 */
  kiosk: "before" | "live";
  /** 公开主办方页：空 #33 / 少 #34 / 大 #35。 */
  organizer: HostVariant;
}

export const DEFAULT_HOST_MOCK_STATE: HostMockState = { center: "many", kiosk: "live", organizer: "many", overview: "live", setup: "many" };

export const HOST_ME = { actorId: "demo-actor-sato", company: "株式会社ミナトリンク", initial: "佐", name: "佐藤 健一" } as const;

export const HOST_EVENT_IDS = {
  cfo18: "demo-event-cfo-night-18",
  asakai3: "demo-host-mfg-asakai-3",
  roundtable: "demo-host-funding-roundtable",
  cfo17: "demo-host-cfo-night-17",
  founders11: "demo-host-founders-lunch-11",
  asakai2: "demo-host-mfg-asakai-2",
} as const;

export const HOST_PROFILE_IDS = { cfoNight: "demo-org-cfo-night", mfgDx: "demo-org-mfg-dx" } as const;

// ─── 人 ───────────────────────────────────────────────

export interface HostPerson {
  id: string;
  name: string;
  kana: string;
  company: string;
  role: string;
  /** 立場 chip。 */
  standing: string;
}

/** 本组画板里出现的人（一人一个名字、一个公司）。 */
export const HOST_PEOPLE: readonly HostPerson[] = [
  { company: "東邦テクノロジーズ", id: "hp-morita", kana: "もりた たくや", name: "森田 拓也", role: "事業開発部 部長", standing: "事業会社" },
  { company: "みずほ台ベンチャーズ", id: "hp-kimura", kana: "きむら ようへい", name: "木村 洋平", role: "パートナー", standing: "投資家" },
  { company: "Fintory株式会社", id: "hp-saito", kana: "さいとう りょう", name: "斎藤 亮", role: "取締役CFO", standing: "CFO" },
  { company: "後藤・水野法律事務所", id: "hp-goto", kana: "ごとう くみ", name: "後藤 久美", role: "弁護士", standing: "士業" },
  { company: "オリオン・グロース・パートナーズ", id: "hp-murakami", kana: "むらかみ ゆうすけ", name: "村上 祐介", role: "アソシエイト", standing: "投資家" },
  { company: "クラウドレジ株式会社", id: "hp-inoue", kana: "いのうえ さやか", name: "井上 さやか", role: "CFO", standing: "CFO" },
  { company: "山口会計事務所", id: "hp-yamaguchi", kana: "やまぐち めぐみ", name: "山口 恵", role: "公認会計士", standing: "士業" },
  { company: "中京電装株式会社", id: "hp-fujii", kana: "ふじい せいいち", name: "藤井 誠一", role: "経営企画室 室長", standing: "事業会社" },
  { company: "Kanata Health", id: "hp-kondo", kana: "こんどう だいち", name: "近藤 大地", role: "COO", standing: "経営者" },
  { company: "ミライ証券", id: "hp-harada", kana: "はらだ ひとみ", name: "原田 ひとみ", role: "IPO支援部", standing: "金融" },
  { company: "東海プレス工業", id: "hp-shimizu", kana: "しみず けん", name: "清水 健", role: "DX推進課 課長", standing: "事業会社" },
  { company: "ロジレス・テック", id: "hp-maeda", kana: "まえだ ゆう", name: "前田 悠", role: "代表取締役CEO", standing: "経営者" },
  { company: "あおば信用金庫", id: "hp-ishikawa", kana: "いしかわ ようこ", name: "石川 洋子", role: "法人営業部 次長", standing: "金融" },
  { company: "遠藤化成工業", id: "hp-endo", kana: "えんどう おさむ", name: "遠藤 修", role: "専務取締役", standing: "事業会社" },
  { company: "松本精機株式会社", id: "hp-matsumoto", kana: "まつもと たかし", name: "松本 隆", role: "代表取締役", standing: "経営者" },
  { company: "白金キャピタル", id: "hp-okada", kana: "おかだ まりこ", name: "岡田 真理子", role: "ベンチャーパートナー", standing: "投資家" },
  { company: "Seedline株式会社", id: "hp-hasegawa", kana: "はせがわ つばさ", name: "長谷川 翼", role: "CFO", standing: "CFO" },
  { company: "リーフラボ株式会社", id: "hp-sakamoto", kana: "さかもと あおい", name: "坂本 葵", role: "管理部長", standing: "CFO" },
  { company: "グロースリンク・キャピタル", id: "hp-aoki", kana: "あおき りな", name: "青木 里奈", role: "プリンシパル", standing: "投資家" },
  { company: "ナレッジフロー株式会社", id: "hp-hayashi", kana: "はやし みほ", name: "林 美穂", role: "経営企画部長", standing: "CFO" },
  { company: "アークス商会", id: "hp-mori", kana: "もり ゆか", name: "森 由香", role: "経営企画", standing: "事業会社" },
  { company: "ブルーオーシャン・パートナーズ", id: "hp-morikawa", kana: "もりかわ けいた", name: "森川 恵太", role: "アナリスト", standing: "投資家" },
];

/** 共同运营者（b6 #20）。 */
export const HOST_COHOST_PEOPLE = [
  { actorId: "demo-actor-ito", company: "株式会社ハルモニア", initial: "伊", name: "伊藤 直子", role: "manager" as const },
  { actorId: "demo-actor-kobayashi", company: "丸の内イノベーションラボ", initial: "小", name: "小林 誠", role: "check_in" as const },
  { actorId: "demo-actor-nakamura", company: "光が丘法律事務所", initial: "中", name: "中村 由紀", role: "read_only_analyst" as const },
];

const person = (id: string): HostPerson => {
  const found = HOST_PEOPLE.find((item) => item.id === id);
  if (!found) throw new Error(`unknown host person ${id}`);
  return found;
};
const initial = (name: string) => name.trim().charAt(0);

// ─── 资料与活动 ─────────────────────────────────────────

export const HOST_PROFILES: readonly OrganizerProfile[] = [
  { bio: "上場を目指すスタートアップの CFO・経営陣と、投資家・金融機関が本音で話す夜を、毎月渋谷で開いています。キーノートのあと、テーブルトークを 3ラウンド。", displayName: "CFO Night 実行委員会", emoji: "🥂", eventCount: 18, profileId: HOST_PROFILE_IDS.cfoNight, sample: true, slug: "cfo-night", updatedAt: "2026-10-01T00:00:00.000Z", visibility: "public" },
  { bio: "製造業の DX 担当者とスタートアップが、現場の課題を持ち寄る朝会です。", displayName: "製造業DX 朝会", emoji: "🏭", eventCount: 3, profileId: HOST_PROFILE_IDS.mfgDx, sample: true, slug: "mfg-dx-asakai", updatedAt: "2026-09-20T00:00:00.000Z", visibility: "public" },
];

interface HostEventSeed {
  id: string;
  title: string;
  emoji: string;
  status: HostEventStatus;
  startsAt: string;
  endsAt: string;
  venueName: string;
  venueArea: string;
  /** 列表与页头里的短地点（「渋谷ストリーム」）。 */
  venueShort: string;
  capacity: number;
  applied: number;
  matched: number | null;
  checkedIn: number | null;
  pendingReview: number;
  approved: number;
  waitlisted: number;
  rejected: number;
  followupRate: number | null;
  profileId: string;
  slug: string;
  code: string;
  feeYen: number | null;
  admission: "first_come" | "review";
  closesAt: string;
  description: string;
}

const CFO18_DESCRIPTION = "上場を目指すスタートアップの CFO・経営陣と、投資家・金融機関が本音で話す夜。キーノートのあと、テーブルトークを 3ラウンド。";

export const HOST_EVENTS: readonly HostEventSeed[] = [
  { admission: "review", applied: 128, approved: 104, capacity: 150, checkedIn: 86, closesAt: "2026-10-06T14:59:00.000Z", code: "CFO18NGT", description: CFO18_DESCRIPTION, emoji: "🥂", endsAt: "2026-10-07T12:30:00.000Z", feeYen: 5000, followupRate: null, id: HOST_EVENT_IDS.cfo18, matched: 112, pendingReview: 12, profileId: HOST_PROFILE_IDS.cfoNight, rejected: 4, slug: "cfo-night-18", startsAt: "2026-10-07T10:00:00.000Z", status: "live", title: "CFO Night Tokyo vol.18", venueArea: "渋谷", venueName: "渋谷ストリーム 4F ホール", venueShort: "渋谷ストリーム", waitlisted: 8 },
  { admission: "review", applied: 42, approved: 42, capacity: 60, checkedIn: null, closesAt: "2026-10-20T14:59:00.000Z", code: "MFG3-ASKI", description: "製造業の DX 担当者とスタートアップが、現場の課題を持ち寄る朝会です。", emoji: "🏭", endsAt: "2026-10-21T00:30:00.000Z", feeYen: null, followupRate: null, id: HOST_EVENT_IDS.asakai3, matched: null, pendingReview: 0, profileId: HOST_PROFILE_IDS.mfgDx, rejected: 0, slug: "mfg-dx-asakai-3", startsAt: "2026-10-20T23:00:00.000Z", status: "upcoming", title: "製造業DX 朝会 #3", venueArea: "品川", venueName: "ミナトリンク 品川オフィス", venueShort: "ミナトリンク 品川オフィス", waitlisted: 0 },
  { admission: "review", applied: 18, approved: 15, capacity: 30, checkedIn: null, closesAt: "2026-11-04T14:59:00.000Z", code: "FUND-RT05", description: "資金調達の実務を、経験者と少人数で話すラウンドテーブルです。", emoji: "💰", endsAt: "2026-11-05T11:30:00.000Z", feeYen: 3000, followupRate: null, id: HOST_EVENT_IDS.roundtable, matched: null, pendingReview: 3, profileId: HOST_PROFILE_IDS.cfoNight, rejected: 0, slug: "funding-roundtable", startsAt: "2026-11-05T09:30:00.000Z", status: "upcoming", title: "資金調達 実践ラウンドテーブル", venueArea: "大手町", venueName: "大手町 Inspired.Lab", venueShort: "大手町 Inspired.Lab", waitlisted: 0 },
  { admission: "review", applied: 140, approved: 140, capacity: 150, checkedIn: 118, closesAt: "2026-09-08T14:59:00.000Z", code: "CFO17NGT", description: CFO18_DESCRIPTION, emoji: "🥂", endsAt: "2026-09-09T12:30:00.000Z", feeYen: 5000, followupRate: 61, id: HOST_EVENT_IDS.cfo17, matched: 131, pendingReview: 0, profileId: HOST_PROFILE_IDS.cfoNight, rejected: 0, slug: "cfo-night-17", startsAt: "2026-09-09T10:00:00.000Z", status: "ended", title: "CFO Night Tokyo vol.17", venueArea: "渋谷", venueName: "渋谷ストリーム 4F ホール", venueShort: "渋谷ストリーム", waitlisted: 0 },
  { admission: "first_come", applied: 24, approved: 24, capacity: 24, checkedIn: 22, closesAt: "2026-08-26T14:59:00.000Z", code: "FLUN-CH11", description: "創業者どうしで、ランチを食べながら近況を話す会です。", emoji: "🍱", endsAt: "2026-08-27T04:30:00.000Z", feeYen: 2000, followupRate: 73, id: HOST_EVENT_IDS.founders11, matched: 24, pendingReview: 0, profileId: HOST_PROFILE_IDS.cfoNight, rejected: 0, slug: "founders-lunch-11", startsAt: "2026-08-27T03:00:00.000Z", status: "ended", title: "Founders Lunch 渋谷 #11", venueArea: "渋谷", venueName: "渋谷サクラステージ", venueShort: "渋谷サクラステージ", waitlisted: 0 },
  { admission: "review", applied: 38, approved: 38, capacity: 60, checkedIn: 31, closesAt: "2026-07-14T14:59:00.000Z", code: "MFG2-ASKI", description: "製造業の DX 担当者とスタートアップが、現場の課題を持ち寄る朝会です。", emoji: "🏭", endsAt: "2026-07-15T00:30:00.000Z", feeYen: null, followupRate: 48, id: HOST_EVENT_IDS.asakai2, matched: 34, pendingReview: 0, profileId: HOST_PROFILE_IDS.mfgDx, rejected: 0, slug: "mfg-dx-asakai-2", startsAt: "2026-07-14T23:00:00.000Z", status: "ended", title: "製造業DX 朝会 #2", venueArea: "品川", venueName: "ミナトリンク 品川オフィス", venueShort: "ミナトリンク 品川オフィス", waitlisted: 0 },
];

export function hostEventIds(): readonly string[] {
  return HOST_EVENTS.map((event) => event.id);
}

const seedOf = (eventId: string) => HOST_EVENTS.find((event) => event.id === eventId) ?? null;

/** b12 #438–#444：下書き / 中止 / アーカイブ 三种状态（朝会 #3 中止、ラウンドテーブル 下書き、朝会 #2 アーカイブ）。 */
function inactiveOverride(seed: HostEventSeed, inactive: boolean): HostEventSeed & { lifecycle: HostEventView["lifecycle"]; cancelledAt: string | null; archivedAt: string | null } {
  if (inactive && seed.id === HOST_EVENT_IDS.roundtable) return { ...seed, applied: 0, approved: 0, archivedAt: null, cancelledAt: null, lifecycle: "draft", pendingReview: 0, status: "draft" };
  if (inactive && seed.id === HOST_EVENT_IDS.asakai3) return { ...seed, archivedAt: null, cancelledAt: "2026-10-14T01:00:00.000Z", lifecycle: "cancelled", status: "cancelled" };
  if (inactive && seed.id === HOST_EVENT_IDS.asakai2) return { ...seed, archivedAt: "2026-08-14T00:00:00.000Z", cancelledAt: null, lifecycle: "archived", status: "archived" };
  return { ...seed, archivedAt: null, cancelledAt: null, lifecycle: "published" };
}

const OWNER_CAPABILITIES = [
  "event.center.read", "roles.manage", "owner.transfer", "operations.read_sensitive", "operations.read_summary", "operations.configure",
  "experience.configure", "experience.publish", "attendees.read_full", "attendees.export", "check_in.roster.read_limited",
  "check_in.roster.write", "check_in.walk_in", "admission.read", "admission.decide", "generation.run", "generation.publish",
  "analytics.read_aggregate", "event.edit", "event.cancel",
] as const;

export function hostEventView(eventId: string, state: HostMockState = DEFAULT_HOST_MOCK_STATE, role: HostRole = "owner"): HostEventView | null {
  const base = seedOf(eventId);
  if (!base) return null;
  const seed = inactiveOverride(base, state.center === "inactive");
  const profile = HOST_PROFILES.find((item) => item.profileId === seed.profileId) ?? null;
  const published = seed.lifecycle !== "draft";
  return {
    admissionMode: seed.admission,
    appliedCount: seed.applied,
    approvedCount: seed.approved,
    archivedAt: seed.archivedAt,
    cancelledAt: seed.cancelledAt,
    capabilities: role === "owner" ? [...OWNER_CAPABILITIES] : ["event.center.read", "check_in.roster.read_limited", "check_in.roster.write", "check_in.walk_in", "analytics.read_aggregate"],
    capacity: seed.capacity,
    cohostCount: HOST_COHOST_PEOPLE.length,
    cohosts: HOST_COHOST_PEOPLE.map((item) => ({ actorId: item.actorId, initial: item.initial, name: item.name })),
    description: seed.description,
    emoji: seed.emoji,
    endsAt: seed.endsAt,
    eventId: seed.id,
    feeAmountYen: seed.feeYen,
    feeKind: seed.feeYen === null ? "free" : "amount",
    feeUrl: null,
    followerCount: seed.profileId === HOST_PROFILE_IDS.cfoNight ? 140 : 36,
    lifecycle: seed.lifecycle,
    myRole: role,
    online: false,
    organizerEmoji: profile?.emoji ?? null,
    organizerName: profile?.displayName ?? null,
    organizerProfileId: seed.profileId,
    organizerSlug: profile?.slug ?? null,
    participationCode: published ? seed.code : null,
    publicSlug: published ? seed.slug : null,
    registrationClosesAt: seed.closesAt,
    sample: true,
    startsAt: seed.startsAt,
    status: seed.status,
    timezone: "Asia/Tokyo",
    title: seed.title,
    venueArea: seed.venueArea,
    venueName: seed.venueName,
    version: 3,
    waitlistedCount: seed.waitlisted,
  };
}

// ─── 運営センター ───────────────────────────────────────

function centerRow(seed: ReturnType<typeof inactiveOverride>): HostCenterEventRow {
  const note: HostCenterEventRow["note"] =
    seed.status === "draft" ? { kind: "draft" }
    : seed.status === "cancelled" ? { at: seed.cancelledAt, count: seed.applied, kind: "cancelled" }
    : seed.status === "archived" ? { kind: "archived" }
    : seed.status === "live" ? { count: seed.applied - (seed.checkedIn ?? 0), kind: "check_in_open" }
    : seed.status === "ended" ? { kind: "followup", rate: seed.followupRate }
    : seed.pendingReview > 0 ? { count: seed.pendingReview, kind: "review_pending" }
    : seed.matched === null ? { kind: "matching_missing" }
    : { kind: "none" };
  return {
    action: seed.status === "live" ? "open_check_in" : "open_console",
    applied: seed.applied,
    capacity: seed.capacity,
    checkedIn: seed.status === "upcoming" || seed.status === "draft" || seed.status === "cancelled" ? null : seed.checkedIn,
    emoji: seed.emoji,
    endsAt: seed.endsAt,
    eventId: seed.id,
    matched: seed.status === "draft" || seed.status === "cancelled" ? null : seed.matched,
    note,
    role: "owner",
    startsAt: seed.startsAt,
    status: seed.status,
    title: seed.title,
    venue: seed.venueShort,
  };
}

const ORDER = [HOST_EVENT_IDS.cfo18, HOST_EVENT_IDS.asakai3, HOST_EVENT_IDS.roundtable, HOST_EVENT_IDS.cfo17, HOST_EVENT_IDS.founders11, HOST_EVENT_IDS.asakai2];

export function hostCenter(state: HostMockState = DEFAULT_HOST_MOCK_STATE, filter: string = "all", query = ""): HostCenterResponse {
  const empty: HostCenterResponse = { events: [], filterCounts: { all: 0, ended: 0, inactive: 0, live: 0, upcoming: 0 }, kpi: null, next: null, page: 1, pageCount: 1, sample: true, spotlight: null, summary: { activeCount: 0, appliedThisMonth: 0, eventCount: 0 }, todo: [] };
  if (state.center === "empty") return empty;
  if (state.center === "few") {
    const row = centerRow(inactiveOverride(seedOf(HOST_EVENT_IDS.roundtable)!, false));
    const visible = filter === "all" || filter === "upcoming" ? [row] : [];
    return {
      ...empty,
      events: query && !row.title.includes(query) ? [] : visible,
      filterCounts: { all: 1, ended: 0, inactive: 0, live: 0, upcoming: 1 },
      next: { eventId: row.eventId, eventTitle: row.title, steps: [
        { done: true, doneAt: "2026-10-01T00:00:00.000Z", kind: "publish_form" },
        { count: 3, done: false, kind: "review_pending" },
        { count: 18, done: false, kind: "generate_matching", threshold: 20 },
      ] },
      spotlight: { applied: 18, capacity: 30, cohosts: 1, eventId: row.eventId, pendingReview: 3, startsAt: row.startsAt },
      summary: { activeCount: 1, appliedThisMonth: 18, eventCount: 1 },
    };
  }
  if (state.center === "inactive") {
    const rows = [HOST_EVENT_IDS.roundtable, HOST_EVENT_IDS.asakai3, HOST_EVENT_IDS.asakai2].map((id) => centerRow(inactiveOverride(seedOf(id)!, true)));
    return { ...empty, events: rows, filterCounts: { all: 9, ended: 3, inactive: 3, live: 1, upcoming: 2 }, summary: { activeCount: 3, appliedThisMonth: 188, eventCount: 9 } };
  }
  const rows = ORDER.map((id) => centerRow(inactiveOverride(seedOf(id)!, false)));
  const byFilter = rows.filter((row) => filter === "all" || row.status === filter);
  return {
    ...empty,
    events: query ? byFilter.filter((row) => row.title.includes(query) || (row.venue ?? "").includes(query)) : byFilter,
    filterCounts: { all: 6, ended: 3, inactive: 0, live: 1, upcoming: 2 },
    kpi: { appliedDeltaVsLastMonth: 42, appliedThisMonth: 188, averageCheckInRate: 84, followupEndedCount: 3, followupRate: 61, upcoming: 3, upcomingThisMonth: 2 },
    summary: { activeCount: 3, appliedThisMonth: 188, eventCount: 6 },
    todo: [
      { count: 12, eventId: HOST_EVENT_IDS.cfo18, eventTitle: "CFO Night vol.18", kind: "review_pending" },
      { daysLeft: 14, eventId: HOST_EVENT_IDS.asakai3, eventTitle: "製造業DX 朝会 #3", kind: "matching_missing" },
      { count: 16, eventId: HOST_EVENT_IDS.cfo18, eventTitle: "CFO Night vol.18", kind: "profile_incomplete" },
    ],
  };
}

// ─── 概要 ──────────────────────────────────────────────

// 照 web.html #20 的柱高（24…96px ÷ 6）。
const TREND_14 = [4, 6, 5, 9, 7, 12, 8, 6, 10, 14, 9, 11, 16, 11] as const;

export function hostOverview(eventId: string, state: HostMockState = DEFAULT_HOST_MOCK_STATE): HostOverviewResponse | null {
  const event = hostEventView(eventId, state);
  const seed = seedOf(eventId);
  if (!event || !seed) return null;
  const preOpen = eventId === HOST_EVENT_IDS.cfo18 && state.overview === "pre_open";
  const inactive = event.status === "draft" || event.status === "cancelled";
  const checkedIn = inactive || preOpen ? 0 : seed.checkedIn ?? 0;
  return {
    applied: event.appliedCount,
    arrivalRate: seed.applied > 0 && checkedIn > 0 ? Math.round((checkedIn / seed.applied) * 100) : null,
    capacity: seed.capacity,
    checkedIn,
    completedSteps: preOpen ? ["registration", "generation", "review_groups"] : eventId === HOST_EVENT_IDS.cfo18 ? ["registration", "generation", "review_groups", "publish"] : ["registration"],
    currentStep: preOpen ? "publish" : eventId === HOST_EVENT_IDS.cfo18 ? "check_in" : "generation",
    doorsOpenAt: seed.startsAt,
    event,
    matchable: inactive ? 0 : seed.matched ?? 0,
    matching: { roundCount: 2, state: eventId === HOST_EVENT_IDS.cfo18 ? "draft" : "none", tableCount: eventId === HOST_EVENT_IDS.cfo18 ? 22 : 0, unplaced: eventId === HOST_EVENT_IDS.cfo18 ? 3 : 0 },
    pendingReview: inactive ? 0 : seed.pendingReview,
    recommendationRate: eventId === HOST_EVENT_IDS.cfo18 ? 96 : null,
    recommendationsPerPerson: 5,
    reportSummary: eventId === HOST_EVENT_IDS.cfo18 ? { asOf: "2026-10-07T12:40:00.000Z", checkInRate: 67, checkedIn: 86, exchangeRate: 58, exchanges: 312, followupRate: 41, total: 128 } : null,
    sample: true,
    todos: inactive ? [] : eventId === HOST_EVENT_IDS.cfo18 ? [{ count: 12, kind: "review_pending", walkInSlots: 8 }, { count: 16, kind: "profile_incomplete" }] : [],
    trend: [...TREND_14],
  };
}

// ─── マッチング ─────────────────────────────────────────

const member = (id: string): HostMatchingMember => {
  const p = person(id);
  return { initial: initial(p.name), name: p.name, org: p.company, participantId: `participant:${p.id}`, placedByHost: false, role: p.role, standing: p.standing };
};
const why = (topic: string) => `申込回答で 5名中 4名が「${topic}」を選択。投資家 1名・CFO 2名・事業会社 1名で立場が偏らない構成です。第1ラウンドで同席した組み合わせはありません。`;
const table = (letter: string, theme: string, ids: readonly string[], topic = theme, absent = 0): HostMatchingTable => ({ absent, members: ids.map(member), round: 1, table: letter, theme, why: why(topic) });

const TABLE_A = ["hp-morita", "hp-kimura", "hp-saito", "hp-goto", "hp-murakami"];
const TABLE_B = ["hp-inoue", "hp-yamaguchi", "hp-fujii", "hp-kondo", "hp-harada"];
const TABLE_C4 = ["hp-shimizu", "hp-maeda", "hp-ishikawa", "hp-endo"];
const TABLE_D4 = ["hp-okada", "hp-hasegawa", "hp-sakamoto", "hp-aoki"];

/** 空态的「生成されるとこう見えます」样例（同 b6 #3）。 */
export const HOST_MATCHING_SAMPLE: readonly HostMatchingTable[] = [
  table("A", "資本政策 × 投資家", TABLE_A, "資本政策"),
  table("B", "製造業DX × 資金調達", TABLE_B, "製造業DX"),
  table("C", "財務チームづくり", [...TABLE_C4, "hp-matsumoto"]),
];

export function hostMatching(eventId: string, state: HostMockState = DEFAULT_HOST_MOCK_STATE): HostMatchingResponse | null {
  const event = hostEventView(eventId, state);
  const seed = seedOf(eventId);
  if (!event || !seed) return null;
  const rounds = [{ endsAt: "2026-10-07T10:50:00.000Z", index: 1, startsAt: "2026-10-07T10:20:00.000Z" }, { endsAt: "2026-10-07T11:30:00.000Z", index: 2, startsAt: "2026-10-07T11:00:00.000Z" }];
  const conditions = { avoidPreviousTablemates: true, investorPerTable: true, roundCount: 2, separateCompanies: true, tableSize: 5 };
  const base: HostMatchingResponse = { applied: seed.applied, conditions, event, generationId: null, generationsLimit: 3, generationsUsed: 0, minimumApplied: 20, overridesVersion: 0, participantCount: 0, profileComplete: 30, round: 1, rounds, sample: true, state: "none", tableCount: 0, tableSizeMax: 5, tableSizeMin: 5, tables: [], unplaced: [], unsatisfiedTables: 0 };
  if (eventId === HOST_EVENT_IDS.roundtable) {
    return { ...base, generationId: "demo-generation-roundtable-1", generationsUsed: 1, participantCount: 18, profileComplete: 18, state: "draft", tableCount: 4, tableSizeMax: 5, tableSizeMin: 4, tables: [table("A", "資本政策 × 投資家", TABLE_A, "資本政策"), table("B", "製造業DX × 資金調達", TABLE_B, "製造業DX"), table("C", "財務チームづくり", TABLE_C4), table("D", "上場準備の実務", TABLE_D4)] };
  }
  if (eventId === HOST_EVENT_IDS.cfo18) {
    return {
      ...base, generationId: "demo-generation-cfo18-1", generationsUsed: 1, participantCount: 112, profileComplete: 112, state: "draft", tableCount: 22,
      tables: [
        table("A", "資本政策 × 投資家", TABLE_A, "資本政策"),
        table("B", "製造業DX × 資金調達", TABLE_B, "製造業DX", 1),
        table("C", "財務チームづくり", [...TABLE_C4, "hp-matsumoto"]),
        table("D", "上場準備の実務", [...TABLE_D4, "hp-hayashi"]),
        table("E", "CVC との協業", ["hp-goto", "hp-murakami", "hp-morita", "hp-kimura", "hp-saito"]),
        table("F", "地域金融 × スタートアップ", ["hp-kondo", "hp-harada", "hp-inoue", "hp-yamaguchi", "hp-fujii"], "地域金融"),
      ],
      unplaced: ["hp-mori", "hp-morikawa", "hp-hasegawa"].map(member),
    };
  }
  // 未生成（b6 #3）：条件卡上「各テーブルに投資家 1名以上」是关的。
  return { ...base, conditions: { ...conditions, investorPerTable: false }, profileComplete: eventId === HOST_EVENT_IDS.asakai3 ? 30 : seed.matched ?? 0 };
}

// ─── 参加者 ────────────────────────────────────────────

interface Applicant { id: string; answer: string; score: number; attend: number }
const CFO18_PENDING: readonly Applicant[] = [
  { answer: "シリーズA前後の資本政策を、投資家側の視点も含めて議論したい", attend: 0, id: "hp-morita", score: 92 },
  { answer: "製造業向け SaaS への投資を検討中。現場の DX 事例を聞きたい", attend: 2, id: "hp-aoki", score: 100 },
  { answer: "財務チームの立ち上げ。最初の 2人目をどう採用したか知りたい", attend: 0, id: "hp-matsumoto", score: 45 },
  { answer: "来期の上場準備に向けて、監査法人選びの経験談を伺いたい", attend: 5, id: "hp-inoue", score: 80 },
  { answer: "CVC として協業先を探しています", attend: 1, id: "hp-kimura", score: 100 },
  { answer: "地域の金融機関としてスタートアップ支援の接点を増やしたい", attend: 0, id: "hp-hayashi", score: 64 },
  { answer: "初参加です。CFO の方と幅広くつながりたい", attend: 0, id: "hp-shimizu", score: 30 },
  { answer: "前回のテーブルが有意義だったので再参加します", attend: 3, id: "hp-yamaguchi", score: 88 },
  { answer: "IPO 準備の実務を、経験者に聞きたい", attend: 1, id: "hp-saito", score: 76 },
  { answer: "事業会社との協業の進め方を知りたい", attend: 0, id: "hp-kondo", score: 70 },
  { answer: "資金調達の選択肢を広げたい", attend: 2, id: "hp-harada", score: 84 },
  { answer: "財務と法務の連携について話したい", attend: 0, id: "hp-goto", score: 66 },
];
const ROUNDTABLE_PENDING: readonly Applicant[] = [
  { answer: "シリーズA前後の資本政策を、投資家側の視点も含めて議論したい", attend: 0, id: "hp-kimura", score: 92 },
  { answer: "製造業向け SaaS への投資を検討中。現場の DX 事例を聞きたい", attend: 2, id: "hp-hayashi", score: 100 },
  { answer: "財務チームの立ち上げ。最初の 2人目をどう採用したか知りたい", attend: 0, id: "hp-shimizu", score: 45 },
];

function peopleRow(applicant: Applicant, status: HostPeopleBucket, version = 1): HostPeopleRow {
  const p = person(applicant.id);
  return { actorId: `actor:${p.id}`, answer: applicant.answer, applicationVersion: version, attendCount: applicant.attend, initial: initial(p.name), name: p.name, org: p.company, profileIncomplete: applicant.score < 50, profileScore: applicant.score, role: p.role, status };
}

/** 页面每页显示的条数（さらに表示）。 */
export const HOST_PEOPLE_PAGE = 8;

export function hostPeople(eventId: string, bucket: HostPeopleBucket, options: { q?: string; incomplete?: boolean; decided?: ReadonlyMap<string, HostPeopleBucket> } = {}, state: HostMockState = DEFAULT_HOST_MOCK_STATE): HostPeopleResponse | null {
  const event = hostEventView(eventId, state);
  const seed = seedOf(eventId);
  if (!event || !seed) return null;
  const list = eventId === HOST_EVENT_IDS.cfo18 ? CFO18_PENDING : eventId === HOST_EVENT_IDS.roundtable ? ROUNDTABLE_PENDING : [];
  const decided = options.decided ?? new Map<string, HostPeopleBucket>();
  const pendingRows = list.map((item) => peopleRow(item, decided.get(`actor:${item.id}`) ?? "pending", decided.has(`actor:${item.id}`) ? 2 : 1));
  const moved = (target: HostPeopleBucket) => pendingRows.filter((row) => row.status === target).length;
  const counts = {
    approved: (eventId === HOST_EVENT_IDS.asakai3 ? 0 : seed.approved) + moved("approved"),
    pending: pendingRows.filter((row) => row.status === "pending").length,
    rejected: seed.rejected + moved("rejected"),
    waitlisted: seed.waitlisted + moved("waitlisted"),
  };
  const q = options.q?.trim() ?? "";
  const rows = pendingRows
    .filter((row) => row.status === bucket)
    .filter((row) => !options.incomplete || row.profileIncomplete)
    .filter((row) => !q || [row.name, row.org ?? "", row.answer ?? ""].some((text) => text.includes(q)));
  const shown = rows.slice(0, HOST_PEOPLE_PAGE);
  return {
    answerLabel: "いちばん話したいこと",
    applyPath: event.publicSlug ? `/e/${event.publicSlug}` : null,
    bucket,
    capacity: seed.capacity,
    counts,
    event,
    more: rows.length - shown.length,
    nextCursor: rows.length > shown.length ? String(HOST_PEOPLE_PAGE) : null,
    questionCount: 3,
    remaining: seed.capacity - counts.approved,
    rows: shown,
    sample: true,
  };
}

// ─── 受付 ──────────────────────────────────────────────

const kioskRow = (id: string, status: HostKioskRow["status"], checkedInAt: string | null, tableName: string | null, receptionNumber: string | null): HostKioskRow => {
  const p = person(id);
  return { actorId: `actor:${p.id}`, checkedInAt, initial: initial(p.name), kana: p.kana, name: p.name, org: p.company, participantId: `participant:${p.id}`, receptionNumber, role: p.role, status, table: tableName, undoable: status === "checked_in" };
};
const recent = (id: string, at: string, tableName: string, no: string): HostKioskRecent => {
  const p = person(id);
  return { at, initial: initial(p.name), name: p.name, org: p.company, participantId: `participant:${p.id}`, receptionNumber: no, table: tableName };
};

/** kiosk 名单（搜索「もり」命中前三行）。 */
export const HOST_KIOSK_ROSTER: readonly HostKioskRow[] = [
  kioskRow("hp-morita", "not_arrived", null, null, null),
  kioskRow("hp-mori", "checked_in", "2026-10-07T10:12:00.000Z", "C", "A-031"),
  kioskRow("hp-morikawa", "waitlisted", null, null, null),
  kioskRow("hp-kimura", "checked_in", "2026-10-07T10:46:00.000Z", "B", "A-086"),
  kioskRow("hp-fujii", "checked_in", "2026-10-07T10:45:00.000Z", "F", "A-085"),
  kioskRow("hp-matsumoto", "checked_in", "2026-10-07T10:45:00.000Z", "C", "A-084"),
  kioskRow("hp-kondo", "checked_in", "2026-10-07T10:44:00.000Z", "A", "A-083"),
  kioskRow("hp-saito", "checked_in", "2026-10-07T10:43:00.000Z", "D", "A-082"),
  kioskRow("hp-harada", "checked_in", "2026-10-07T10:42:00.000Z", "E", "A-081"),
  kioskRow("hp-shimizu", "checked_in", "2026-10-07T10:41:00.000Z", "B", "A-080"),
  kioskRow("hp-hasegawa", "checked_in", "2026-10-07T10:40:00.000Z", "C", "A-079"),
];

export function hostKiosk(eventId: string, query: string, state: HostMockState = DEFAULT_HOST_MOCK_STATE, overrides: ReadonlyMap<string, Partial<HostKioskRow>> = new Map()): HostKioskResponse | null {
  if (eventId !== HOST_EVENT_IDS.cfo18) return null;
  const before = state.kiosk === "before";
  const roster = HOST_KIOSK_ROSTER.map((row) => ({ ...row, ...(overrides.get(row.participantId) ?? {}) }));
  const q = query.trim();
  const rows = q ? roster.filter((row) => [row.name, row.kana ?? "", row.org ?? ""].some((text) => text.includes(q))) : [];
  const extra = roster.filter((row) => row.status === "checked_in" && !HOST_KIOSK_ROSTER.find((base) => base.participantId === row.participantId && base.status === "checked_in")).length;
  return {
    cacheUntil: "2026-10-08T00:30:00.000Z",
    canWalkIn: true,
    checkedIn: before ? 0 : 86 + extra,
    devices: before ? 1 : 3,
    doorsOpenAt: "2026-10-07T10:00:00.000Z",
    eventId,
    now: before ? "2026-10-07T09:46:00.000Z" : "2026-10-07T10:46:00.000Z",
    overCapacity: false,
    rate: before ? 0 : Math.round(((86 + extra) / 128) * 100),
    recent: before ? [] : [
      recent("hp-kimura", "2026-10-07T10:46:00.000Z", "B", "A-086"),
      recent("hp-fujii", "2026-10-07T10:45:00.000Z", "F", "A-085"),
      recent("hp-matsumoto", "2026-10-07T10:45:00.000Z", "C", "A-084"),
      recent("hp-kondo", "2026-10-07T10:44:00.000Z", "A", "A-083"),
      recent("hp-saito", "2026-10-07T10:43:00.000Z", "D", "A-082"),
      recent("hp-harada", "2026-10-07T10:42:00.000Z", "E", "A-081"),
      recent("hp-shimizu", "2026-10-07T10:41:00.000Z", "B", "A-080"),
      recent("hp-hasegawa", "2026-10-07T10:40:00.000Z", "C", "A-079"),
    ],
    rows: before ? [] : rows,
    sample: true,
    staffName: "伊藤 直子",
    staffRole: "受付",
    title: "CFO Night Tokyo vol.18",
    total: 128,
    venue: "渋谷ストリーム 4F",
  };
}

// ─── 申込設定 ──────────────────────────────────────────

const Q1: HostSetupQuestion = { id: "q1", kind: "single", options: ["スタートアップの経営者・CFO", "投資家（VC・CVC・エンジェル）", "事業会社", "士業・支援機関"], prompt: "あなたの立場に近いものを選んでください", required: true };
const Q2_FEW: HostSetupQuestion = { id: "q2", kind: "multiple", options: ["資本政策", "投資家との関係づくり", "財務チームの採用"], prompt: "今回いちばん話したいテーマ（2つまで）", required: true };
const Q2_MANY: HostSetupQuestion = { ...Q2_FEW, options: ["資本政策", "投資家との関係づくり", "財務チームの採用", "上場準備"] };
const Q3: HostSetupQuestion = { id: "q3", kind: "free", options: [], prompt: "会いたい人の条件があれば教えてください", required: false };
const Q4: HostSetupQuestion = { id: "q4", kind: "single", options: ["初めて", "2回目", "3回目以上"], prompt: "CFO Night への参加は何回目ですか？", required: true };
const Q5: HostSetupQuestion = { id: "q5", kind: "free", options: [], prompt: "食事の配慮が必要な場合はご記入ください", required: false };

const DESCRIPTION_MANY = "CFO Night Tokyo は、スタートアップの CFO・財務責任者と投資家が、肩書きを越えて語り合う交流会です。第18回のテーマは「シリーズA前後の資本政策」。前半はパネルディスカッション、後半は申込回答をもとに組んだテーブルで 2ラウンドの少人数交流を行います。回答はテーブル編成にのみ使用し、ほかの参加者には公開しません。";
const DESCRIPTION_FEW = "CFO Night Tokyo は、スタートアップの CFO・財務責任者と投資家が、肩書きを越えて語り合う交流会です。第18回の";

/** 6 种定型お知らせ（b12 #406；只显示、不可改）。 */
export const HOST_NOTICE_TEMPLATES: readonly HostNoticeTemplate[] = [
  { kind: "admission_approved", text: "{title} への参加が承認されました。当日は受付で QR を表示してください。" },
  { kind: "admission_rejected", text: "今回は定員の都合により、ご参加をお見送りさせていただきます。" },
  { kind: "admission_waitlisted", text: "キャンセル待ちとして受け付けました。空きが出たらお知らせします。" },
  { kind: "admission_promoted", text: "キャンセルが出たため、参加が確定しました。" },
  { kind: "matching_published", text: "テーブル編成を公開しました。アプリで同席者を確認できます。" },
  { kind: "profile_incomplete", text: "マッチングのためにプロフィールを完成させてください（所要 2分）。" },
];

export const HOST_NOTE_SAMPLE = "当日は 18:45 から受付を開始します。名刺を 20枚ほどお持ちください。";

export function hostSetup(eventId: string, state: HostMockState = DEFAULT_HOST_MOCK_STATE): HostSetupResponse | null {
  const event = hostEventView(eventId, state);
  const seed = seedOf(eventId);
  if (!event || !seed) return null;
  const notices = HOST_NOTICE_TEMPLATES.map((item) => ({ ...item, text: item.text.replace("{title}", seed.title) }));
  const base: HostSetupResponse = {
    admissionMode: seed.admission,
    applyPath: event.publicSlug ? `/e/${event.publicSlug}` : null,
    capacity: seed.capacity,
    description: "",
    event,
    formPublished: false,
    hostNote: HOST_NOTE_SAMPLE,
    notices,
    questions: [],
    registrationClosesAt: seed.closesAt,
    revision: 4,
    sample: true,
    savedAt: null,
    suggestion: null,
    unpublishedChanges: 0,
  };
  if (eventId === HOST_EVENT_IDS.asakai3) {
    return { ...base, suggestion: { basisCount: 2, basisTitle: "製造業DX 朝会", count: 3, questions: [Q1, { ...Q2_FEW, options: ["生産管理", "品質管理", "資金調達"] }, Q3] } };
  }
  if (eventId === HOST_EVENT_IDS.cfo18 && state.setup === "few") {
    return { ...base, description: DESCRIPTION_FEW, questions: [Q1, Q2_FEW], savedAt: "2026-10-07T02:58:00.000Z" };
  }
  return { ...base, description: eventId === HOST_EVENT_IDS.cfo18 ? DESCRIPTION_MANY : seed.description, formPublished: true, questions: [Q1, Q2_MANY, Q3, Q4, Q5], savedAt: "2026-10-07T02:58:00.000Z", unpublishedChanges: eventId === HOST_EVENT_IDS.cfo18 ? 2 : 0 };
}

// ─── レポート ──────────────────────────────────────────

export function hostReport(eventId: string, view: "all" | "mine", state: HostMockState = DEFAULT_HOST_MOCK_STATE): HostReportResponse | null {
  const event = hostEventView(eventId, state);
  const seed = seedOf(eventId);
  if (!event || !seed) return null;
  const standing = [
    { label: "スタートアップの経営者・CFO", percent: 46 },
    { label: "投資家", percent: 28 },
    { label: "事業会社", percent: 17 },
    { label: "士業・支援機関", percent: 9 },
  ];
  const labels = ["8月20日", "8月27日", "9月3日", "9月9日"];
  const trend = [2, 3, 5, 4, 6, 8, 9, 7, 10, 12, 11, 13, 15, 14, 16, 18, 17, 20, 22, 24, 26];
  const nothing = { checkInRate: null, checkedIn: null, daysPublishToEvent: null, exchangeRate: null, exchanges: null, exchangesPerPerson: null, followupRate: null, followups: null, funnel: { drafted: null, exchanged: null, followed: null, meetings: null }, standing: [], standingQuestion: null, tableNote: null, tables: [] };
  if (view === "mine") {
    const p = (id: string, tableName: string) => { const x = person(id); return { contactId: null, initial: initial(x.name), name: x.name, org: x.company, role: x.role, standing: x.standing, table: tableName }; };
    return {
      all: null, event, sample: true, view,
      mine: {
        contributionDelta: 2, contributionDetail: "木村さん（みずほ台ベンチャーズ）・岡田さん（白金キャピタル）と名刺交換し、プランの「VC パートナー」に紐づけ済み（あなたが確認済み）。",
        contributionGoal: "シリーズA 資金調達", contributionHave: 2, contributionLabel: "VC パートナー", contributionScore: 20, contributionTarget: 3,
        daysSinceExchange: 28, exchanged: 9, followTotal: 9, followed: 4,
        logSuggestion: "CFO Night vol.17 で VC パートナー 2名と名刺交換", met: 11,
        unfollowed: [p("hp-kimura", "A"), p("hp-okada", "C"), p("hp-inoue", "B"), p("hp-fujii", "D"), p("hp-murakami", "A")],
      },
    };
  }
  if (eventId === HOST_EVENT_IDS.asakai3 || event.status === "upcoming" || event.status === "draft") {
    return { all: { ...nothing, applied: seed.applied, capacity: seed.capacity, daysSincePublish: 9, daysToStart: 14, followupWindowDays: 7, state: "before", suppressedBelow: 5, trend: trend.slice(0, 9), trendLabels: [] }, event, mine: null, sample: true, view };
  }
  if (eventId === HOST_EVENT_IDS.founders11) {
    return { all: { applied: 24, capacity: 24, checkInRate: 92, checkedIn: 22, daysPublishToEvent: 21, daysSincePublish: null, daysToStart: null, exchangeRate: 95, exchanges: 48, exchangesPerPerson: 2.2, followupRate: 73, followupWindowDays: 7, followups: 16, funnel: { drafted: 18, exchanged: 21, followed: 16, meetings: 6 }, standing, standingQuestion: "申込回答 Q1", state: "after", suppressedBelow: 5, tableNote: null, tables: [["A", 14], ["B", 12], ["C", 11], ["D", 11]].map(([t, n]) => ({ exchanges: n as number, round: 1, table: t as string })), trend, trendLabels: labels }, event, mine: null, sample: true, view };
  }
  return { all: { applied: seed.applied, capacity: seed.applied, checkInRate: 84, checkedIn: 118, daysPublishToEvent: 21, daysSincePublish: null, daysToStart: null, exchangeRate: 91, exchanges: 312, exchangesPerPerson: 2.6, followupRate: 61, followupWindowDays: 7, followups: 52, funnel: { drafted: 74, exchanged: 107, followed: 52, meetings: 19 }, standing, standingQuestion: "申込回答 Q1", state: "after", suppressedBelow: 5, tableNote: "テーブル E は欠席 2名で 3名卓に。次回は当日の再配置を検討", tables: [["A", 19], ["B", 17], ["C", 16], ["D", 15], ["E", 9], ["F", 14]].map(([t, n]) => ({ exchanges: n as number, round: 1, table: t as string })), trend, trendLabels: labels }, event, mine: null, sample: true, view };
}

// ─── 共同運営者 ─────────────────────────────────────────

export function hostCohosts(eventId: string, state: HostMockState = DEFAULT_HOST_MOCK_STATE): HostCohostsResponse | null {
  const event = hostEventView(eventId, state);
  if (!event) return null;
  return {
    canManage: true,
    eventId,
    eventTitle: event.title,
    history: [
      { action: "changed", at: "2026-10-05T01:00:00.000Z", byName: "佐藤", reason: "申込審査を分担するため", role: "manager", subjectName: "伊藤 直子" },
      { action: "invited", at: "2026-10-01T01:00:00.000Z", byName: "佐藤", reason: "次回共催の検討", role: "read_only_analyst", subjectName: "渡辺 翔" },
    ],
    invites: [],
    members: [
      { actorId: HOST_ME.actorId, initial: HOST_ME.initial, isMe: true, name: HOST_ME.name, org: HOST_ME.company, revision: 0, role: "owner" },
      ...HOST_COHOST_PEOPLE.map((item) => ({ actorId: item.actorId, initial: item.initial, isMe: false, name: item.name, org: item.company, revision: 1, role: item.role })),
    ],
    sample: true,
  };
}

export const HOST_INVITE_SAMPLE_CODE = "H-7KQM-2TR4";

export function hostCohostInvitePreview(code: string): HostCohostInvitePreview {
  const valid = code.replace(/^H-?/iu, "").replace(/-/gu, "").length === 8 || code.length >= 22;
  return valid
    ? { eventId: HOST_EVENT_IDS.cfo18, eventTitle: "CFO Night Tokyo vol.18", expiresAt: "2026-10-14T14:59:00.000Z", inviterName: HOST_ME.name, organizerName: "CFO Night 実行委員会", role: "check_in", sample: true, valid: true }
    : { eventId: null, eventTitle: null, expiresAt: null, inviterName: null, organizerName: null, role: null, sample: true, valid: false };
}

export function hostCheckInEvents(): HostCheckInEventsResponse {
  return { events: [{ emoji: "🥂", eventId: HOST_EVENT_IDS.cfo18, startsAt: "2026-10-07T10:00:00.000Z", title: "CFO Night Tokyo vol.18", venue: "渋谷ストリーム" }], sample: true };
}

// ─── 通知预览 ──────────────────────────────────────────

export function hostNoticePreview(eventId: string, kind: HostNoticePreview["kind"], state: HostMockState = DEFAULT_HOST_MOCK_STATE): HostNoticePreview | null {
  const event = hostEventView(eventId, state);
  if (!event) return null;
  if (kind === "profile_incomplete") return { body: "マッチングのためにプロフィールを完成させてください（所要 2分）。", channels: ["inbox", "email"], hostNote: null, kind, recipients: 16, remainingSends: 2, sample: true, title: "プロフィールを完成させてください" };
  if (kind === "event_cancelled") return { body: `${event.title} は中止になりました。`, channels: ["inbox", "email"], hostNote: null, kind, recipients: event.appliedCount + event.waitlistedCount, remainingSends: 1, sample: true, title: `${event.title} は中止になりました` };
  return { body: `${event.title} の日時・会場が変わりました。`, channels: ["inbox", "email"], hostNote: null, kind, recipients: event.approvedCount + event.waitlistedCount, remainingSends: 1, sample: true, title: `${event.title} の日時・会場が変わりました` };
}

// ─── 主办方资料与公开页 ────────────────────────────────

export function organizerProfiles(): OrganizerProfileListResponse {
  return { profiles: HOST_PROFILES.map((item) => ({ ...item, bio: item.profileId === HOST_PROFILE_IDS.cfoNight ? "スタートアップの CFO と投資家が、毎月渋谷で本音を話す会です。" : item.bio })), sample: true };
}

const PAST_MANY: ReadonlyArray<[string, string, number]> = [
  ["CFO Night Tokyo vol.18", "2026-10-07T10:00:00.000Z", 128],
  ["CFO Night Tokyo vol.17", "2026-09-09T10:00:00.000Z", 140],
  ["CFO Night Tokyo vol.16", "2026-08-05T10:00:00.000Z", 136],
  ["CFO Night Tokyo vol.15", "2026-07-08T10:00:00.000Z", 121],
  ["CFO Night Tokyo vol.14", "2026-06-10T10:00:00.000Z", 118],
  ["CFO Night Tokyo vol.13", "2026-05-13T10:00:00.000Z", 109],
];

export function organizerPublic(slug: string, state: HostMockState = DEFAULT_HOST_MOCK_STATE, following: boolean | null = false): OrganizerPublicResponse | null {
  const profile = HOST_PROFILES.find((item) => item.slug === slug);
  if (!profile) return null;
  const vol19 = { emoji: "🥂", eventId: "demo-host-cfo-night-19", feeAmountYen: 5000, feeKind: "amount" as const, href: "/e/cfo-night-19", registrationOpen: true, remainingSeats: 32, startsAt: "2026-11-11T10:00:00.000Z", title: "CFO Night Tokyo vol.19", venue: "渋谷ストリーム 4F" };
  const special = { emoji: "📈", eventId: "demo-host-cfo-night-special", feeAmountYen: 6000, feeKind: "amount" as const, href: "/e/cfo-night-special-ipo", registrationOpen: false, remainingSeats: null, startsAt: "2026-12-09T10:00:00.000Z", title: "CFO Night 特別編：IPO 準備の実務", venue: "大手町 Inspired.Lab" };
  const past = (rows: ReadonlyArray<[string, string, number]>) => rows.map(([title, startsAt, attended], index) => ({ attended, emoji: "🥂", eventId: `demo-host-cfo-night-past-${index}`, startsAt, title }));
  const organizerKey = "org-cfo-night";
  if (state.organizer === "empty") return { following, organizerKey, past: [], pastTotal: 0, profile, sample: true, stats: { attendeesTotal: 0, eventsHeld: 0, followers: 12 }, upcoming: [] };
  if (state.organizer === "few") return { following, organizerKey, past: past(PAST_MANY.slice(0, 1)), pastTotal: 1, profile, sample: true, stats: { attendeesTotal: 128, eventsHeld: 1, followers: 140 }, upcoming: [vol19] };
  return { following, organizerKey, past: past(PAST_MANY), pastTotal: 18, profile, sample: true, stats: { attendeesTotal: 2140, eventsHeld: 18, followers: 860 }, upcoming: [vol19, special] };
}
