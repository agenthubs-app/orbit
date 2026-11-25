/**
 * 2026-11-20 本机示例「会場の記録」：一场已结束、两轮分组 + 推荐理由 + 活动图片的活动。
 * - 只被开发接口 `app/api/dev/event-design-fixture/route.dev.ts`（`name: "venue-record"`）与测试引用，不进生产包。
 * - 走真实的 `createJourneyService`（venue / overview.venueRecord / 参加者の詳細 / 会後 met.people 都是真逻辑），只把端口换成这里的示例数据。
 * - 时间：画板「今天」= 2026-10-07（DESIGN_FIXTURE_NOW）；本场 10/3（土）19:00–21:30 结束 4 天，仍在 30 天交换期内。
 */
import { createMemoryActorRecordStore } from "../actor-records/store";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "../journey/attendee-records";
import type { JourneyAttendeeProfileFacts, JourneyEvent, JourneyLivePorts } from "../journey/ports";
import { createJourneyService, type JourneyService } from "../journey/service";
import type { VenueParticipant, VenueTable, VenueWorkspace } from "../journey/venue-core";
import type { MyEventSourceRow } from "../mine/service";

export const VENUE_RECORD_EVENT_ID = "design-event-venue-record";
export const VENUE_RECORD_COVER = "/orbit-covers/events/chinese-business-community-salon.jpg";
const NOW = "2026-10-07T03:00:00.000Z";
const ORGANIZER_KEY = "org-venue-record";

const EVENT: JourneyEvent = {
  agenda: [
    { at: "19:00", title: "受付・乾杯" },
    { at: "19:30", title: "R1 · 自己紹介" },
    { at: "20:15", title: "R2 · テーマ別トーク" },
    { at: "21:00", title: "フリートーク" },
  ],
  badges: [],
  capacity: 40,
  coverUrl: VENUE_RECORD_COVER,
  description: "在日中華系ビジネスパーソンと日本企業の交流サロン。2 ラウンドのテーブルトークで、事前の申込内容から席を決めます。",
  emoji: "🥟",
  endsAt: "2026-10-03T21:30:00+09:00",
  eventId: VENUE_RECORD_EVENT_ID,
  hostContact: null,
  organizerKey: ORGANIZER_KEY,
  organizerName: "日中創新創業協会",
  priceYen: 3000,
  publicCode: "SALON-07",
  registrationClosesAt: null,
  registrationCount: 9,
  review: false,
  startsAt: "2026-10-03T19:00:00+09:00",
  title: "中華系ビジネスコミュニティ サロン vol.7",
  venue: "東京・日本橋",
};

const P = (participantId: string, displayName: string, company: string, role: string, experienceHighlight: string): VenueParticipant => ({ company, displayName, experienceHighlight, needs: [], offers: [experienceHighlight], participantId, role, topics: [] });

const ME = P("vr-me", "佐藤 健一", "ミナトリンク", "CEO", "製造業向け SaaS を運営");
const DIRECTORY: VenueParticipant[] = [
  ME,
  P("vr-wang", "王 磊", "華東キャピタル", "パートナー", "日中クロスボーダーのシード投資"),
  P("vr-li", "李 静", "東瀛貿易", "事業開発", "越境 EC の物流立ち上げを 3 社支援"),
  P("vr-tanaka", "田中 美穂", "丸の内ラボ", "プロデューサー", "大企業との PoC 設計"),
  P("vr-chen", "陳 浩", "深圳ハードウェア", "CTO", "IoT 量産の工場手配"),
  P("vr-suzuki", "鈴木 大輔", "あおば銀行", "法人営業", "スタートアップ向け融資"),
  P("vr-zhao", "趙 敏", "ZM デザイン", "代表", "中国向けブランディング"),
  P("vr-yamada", "山田 翔", "ネクストファクトリー", "COO", "工場 DX の導入支援"),
  P("vr-liu", "劉 洋", "個人", "エンジェル投資家", "B2B SaaS へのエンジェル投資 12 件"),
];

const table = (tableNumber: number, theme: string, rationale: string, members: string[], memberRationales: Record<string, string>): VenueTable => ({
  icebreakers: ["最近いちばん手応えのあった商談は？"],
  memberRationales,
  members: members.map((participantId, index) => ({ participantId, seat: String(index + 1) })),
  rationale,
  tableNumber,
  theme,
});

const R1_MINE = table(1, "日中の資金調達", "シード〜シリーズA の調達経験と、日中両方の投資家が揃うテーブル。", ["vr-me", "vr-wang", "vr-liu", "vr-suzuki"], { "vr-me": "申込の「会いたい人：VC・エンジェル」に合わせ、投資側 3 名と同席にしました。" });
const R1_OTHER = table(2, "越境 EC と物流", "越境 EC の立ち上げ経験者のテーブル。", ["vr-li", "vr-zhao", "vr-tanaka"], {});
const R2_MINE = table(3, "製造業 DX", "工場の現場課題と量産経験が重なるテーブル。", ["vr-chen", "vr-me", "vr-yamada", "vr-liu"], { "vr-me": "「提供できること：製造業向け SaaS」が、量産・工場 DX の 2 名の課題と一致。" });
const R2_OTHER = table(4, "ブランドと販路", "中国市場向けの販路とブランドづくり。", ["vr-zhao", "vr-li", "vr-wang"], {});

export function venueRecordWorkspace(): VenueWorkspace {
  return {
    checkIn: { checkedInAt: "2026-10-03T19:04:00+09:00", participantId: ME.participantId },
    checkInAvailable: false,
    configuration: { eventEndsAt: "2026-10-03T12:30:00.000Z", eventStartsAt: "2026-10-03T10:00:00.000Z", roundOneStartsAt: "2026-10-03T10:30:00.000Z", roundTwoStartsAt: "2026-10-03T11:15:00.000Z" },
    contactRequests: [
      { contactId: "design-contact-wang", createdAt: "2026-10-03T19:52:00+09:00", requestId: "vr-req-wang", requesterParticipantId: "vr-me", revision: 2, status: "accepted", targetParticipantId: "vr-wang", withdrawnAt: null },
      { contactId: "design-contact-chen", createdAt: "2026-10-03T20:41:00+09:00", requestId: "vr-req-chen", requesterParticipantId: "vr-chen", revision: 2, status: "accepted", targetParticipantId: "vr-me", withdrawnAt: null },
      { contactId: null, createdAt: "2026-10-03T21:10:00+09:00", requestId: "vr-req-liu", requesterParticipantId: "vr-liu", revision: 1, status: "awaiting_target_consent", targetParticipantId: "vr-me", withdrawnAt: null },
      { contactId: null, createdAt: "2026-10-03T21:12:00+09:00", requestId: "vr-req-yamada", requesterParticipantId: "vr-me", revision: 1, status: "awaiting_target_consent", targetParticipantId: "vr-yamada", withdrawnAt: null },
    ],
    directory: DIRECTORY,
    me: ME,
    recommendations: {
      recommendations: [
        { icebreakers: [], reasons: ["日中クロスボーダーのシード投資。", "申込の「探している投資先：B2B SaaS」と、あなたの「会いたい人：VC」が一致。"], score: 0, targetParticipantId: "vr-wang" },
        { icebreakers: [], reasons: ["IoT 量産の工場手配に強い。", "あなたの「製造業向け SaaS」の導入先候補を紹介できる立場。"], score: 0, targetParticipantId: "vr-chen" },
        { icebreakers: [], reasons: ["B2B SaaS へのエンジェル投資 12 件。"], score: 0, targetParticipantId: "vr-liu" },
      ],
    },
    roundOneTable: R1_MINE,
    roundTwoTable: R2_MINE,
    rounds: { one: [R1_MINE, R1_OTHER], two: [R2_MINE, R2_OTHER] },
  };
}

/** 参加用プロフィール：趙さんだけ「参加者に表示」しない（詳細は 404 になる例）。 */
const PRIVATE_IDS = new Set(["vr-zhao"]);
const ANSWERS: Record<string, { q: string; a: string }[]> = {
  "vr-chen": [{ a: "量産立ち上げの相談相手", q: "会いたい人" }, { a: "深圳の工場ネットワーク", q: "提供できること" }],
  "vr-liu": [{ a: "シード期の B2B SaaS", q: "会いたい人" }, { a: "初回の事業計画レビュー", q: "提供できること" }, { a: "年内に 3 社へ出資", q: "参加の目的" }],
  "vr-wang": [{ a: "日本の製造業 DX スタートアップ", q: "会いたい人" }, { a: "中国側の LP・事業会社の紹介", q: "提供できること" }],
};

/**
 * 报名时确认的自己紹介（第一人称，显示给同场参会者）。田中さん・鈴木さん没写（旧报名）：介绍位缺位，只显示问答。
 * 2026-11-26 与 live 映射一致：intro = 自己紹介；話せるトピック（experienceHighlight）是问答里的一行。
 */
const INTROS: Record<string, string> = {
  "vr-chen": "深圳でハードウェアの会社の CTO をしています。日本のスタートアップの量産立ち上げを手伝える相手を探しています。",
  "vr-li": "東瀛貿易で事業開発を担当しています。日中の越境 EC の物流について、困っていることがあれば気軽に声をかけてください。",
  "vr-liu": "個人でエンジェル投資をしています。シード期の B2B SaaS の方とお話しできればうれしいです。",
  "vr-wang": "華東キャピタルで日中のシード投資を担当しています。日本の製造業 DX のスタートアップと知り合いたくて参加しました。",
  "vr-yamada": "ネクストファクトリーの COO です。工場 DX を進めている方と、現場の話をしたいです。",
};

function profileOf(participantId: string): JourneyAttendeeProfileFacts | null {
  const person = DIRECTORY.find((item) => item.participantId === participantId);
  if (!person || PRIVATE_IDS.has(participantId)) return null;
  const topic = person.experienceHighlight ? [{ a: person.experienceHighlight, q: "話せるトピック" }] : [];
  return { answers: [...topic, ...(ANSWERS[participantId] ?? [])], attendeeId: person.participantId, intro: INTROS[participantId] ?? null, name: person.displayName, org: person.company, role: person.role };
}

export function venueRecordPorts(): JourneyLivePorts {
  const workspace = venueRecordWorkspace();
  const publicPeople = DIRECTORY.filter((person) => !PRIVATE_IDS.has(person.participantId));
  return {
    afterInputs: async () => ({
      ai: null,
      confirmedAt: null,
      legacy: { messageDraft: null, summary: "2 ラウンドで 6 名と同席し、王さん・陳さんと名刺を交換しました。" },
      meetings: 0,
      met: [
        { attendeeId: "vr-wang", contactId: "design-contact-wang", linkedTypeKey: null, name: "王 磊", org: "華東キャピタル", wanted: true },
        { attendeeId: "vr-chen", contactId: "design-contact-chen", linkedTypeKey: null, name: "陳 浩", org: "深圳ハードウェア", wanted: false },
      ],
      plan: null,
      wantedTotal: 2,
    }),
    attendeeProfile: async (eventId, attendeeId) => (eventId === VENUE_RECORD_EVENT_ID ? profileOf(attendeeId) : null),
    catalogue: async () => [],
    confirmAfter: async (_actorId, eventId, input) => ({ confirmed: input.items.length, confirmedAt: NOW, contactsLinked: 0, eventId, scoreAfter: null, tasksCreated: input.items.length }),
    contacts: async () => [{ history: [], id: "design-contact-suzuki", linkedTypeKey: null, name: "鈴木 大輔", org: "あおば銀行", role: "法人営業" }],
    event: async (eventId) => (eventId === VENUE_RECORD_EVENT_ID ? EVENT : null),
    eventIdByCode: async (code) => (code.trim().toUpperCase() === "SALON-07" ? VENUE_RECORD_EVENT_ID : null),
    hosting: async () => false,
    judge: async () => ({ goal: null, hasPlan: false, results: {} }),
    myEvents: async () => [{ eventId: VENUE_RECORD_EVENT_ID, organizerKey: ORGANIZER_KEY, status: "attended" }],
    organizerStats: async () => ({ averageAttendance: 32, editions: 7, monthly: true, since: "2026-04-11T10:00:00.000Z" }),
    planTypesFor: async (_actorId, attendees) => Object.fromEntries(attendees.map((item) => [item.attendeeId, item.attendeeId === "vr-wang" || item.attendeeId === "vr-liu" ? { key: "vc", label: "VC・エンジェル" } : null])),
    publicAttendees: async () => ({ attendees: publicPeople.filter((person) => person.participantId !== ME.participantId).map((person) => ({ attendeeId: person.participantId, name: person.displayName, note: person.experienceHighlight, org: person.company, role: person.role, speaker: false })), total: DIRECTORY.length }),
    registered: async (_actorId, eventId) => eventId === VENUE_RECORD_EVENT_ID,
    selfIntro: async () => null,
    upsertInbox: async () => false,
    venueWorkspace: async (_actorId, eventId) => (eventId === VENUE_RECORD_EVENT_ID ? workspace : null),
  };
}

/** 真实 service + 示例端口（时钟固定在画板的今天）。 */
export function venueRecordService(now: () => Date = () => new Date(NOW)): JourneyService {
  const store = createMemoryActorRecordStore();
  return createJourneyService({
    now,
    ports: venueRecordPorts(),
    records: { checklist: createPrepChecklistService({ store }), feedback: createEventFeedbackService({ store }), follows: createOrganizerFollowService({ store }), memos: createVenueMemoService({ store }) },
  });
}

/** 参加予定（過去）一行：同一场活动带图片。 */
export function venueRecordMineRow(): MyEventSourceRow {
  return { coverUrl: VENUE_RECORD_COVER, emoji: EVENT.emoji, endsAt: EVENT.endsAt, eventId: VENUE_RECORD_EVENT_ID, startsAt: EVENT.startsAt, status: "attended", title: EVENT.title, venue: EVENT.venue };
}
