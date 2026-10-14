/**
 * R26 イベント · 设计稿示例 fixture（只在本机 mock 模式；HOW-TO 第 8 节，同计划页 `features/plans/v2/design-fixtures`）。
 *
 * - 只补数据、不改画面结构：fixture 是契约 8 / events-mine 同一形状，经同一路由、同一 schema、同一组件渲染。
 * - 进不了生产：只被开发接口 `app/api/dev/event-design-fixture/route.dev.ts` 引用（生产构建不收录；测试守）。
 * - 日期：画板以 2026-10-07（水）为「今天」。fixture 生效时，开发时钟（`DESIGN_FIXTURE_NOW`）也设成那一天的东京 12:00，
 *   日期与「今夜」都和画板一致（只在本机 mock 下，经 `features/events/dev-clock.ts` 读；生产不收录）。
 * - 数据照 web.html #10–#12、app.html #13–#15 / #31、b8 #0–#5、b2 #0–#5、b12 W-R26-30。
 */
import type { EventAssessmentContract, EventAssessmentScoreItem } from "../../../shared/contract/event-assessment";
import type { MyEventSourceRow } from "../mine/service";

/** 画板的「今天」：2026-10-07（水）东京 12:00（fixture 生效时的开发时钟）。 */
export const DESIGN_FIXTURE_NOW = "2026-10-07T03:00:00.000Z";

/** 画板日期原样使用（开发时钟设成画板的今天）。`now` 参数保留给以后整周平移。 */
export function shifted(boardIso: string, _now = new Date()): string {
  return boardIso;
}

const items = (fit: number, confidence: number, timeCost: number, connections: number, format: number): EventAssessmentScoreItem[] => [
  { criterion: "fit", estimated: false, facts: [], max: 45, reason: "会える人の適合", score: fit },
  { criterion: "confidence", estimated: false, facts: [], max: 15, reason: "推定の確度", score: confidence },
  { criterion: "timeCost", estimated: false, facts: [], max: 20, reason: "時間とコスト", score: timeCost },
  { criterion: "connections", estimated: false, facts: [], max: 10, reason: "既存のつながり", score: connections },
  { criterion: "format", estimated: false, facts: [], max: 10, reason: "交流の形式", score: format },
];

function base(id: string, now: Date): Pick<EventAssessmentContract, "id" | "createdAt" | "rubricVersion" | "missingFields" | "status" | "sample"> {
  return { createdAt: shifted("2026-10-07T09:30:00+09:00", now), id, missingFields: [], rubricVersion: "event-score-v2", sample: true, status: "ready" };
}

export function summit(now = new Date()): EventAssessmentContract {
  return {
    ...base("design-assessment-saas-summit", now),
    assessedAt: shifted("2026-10-07T10:00:00+09:00", now),
    basisLines: ["プラン「シリーズA 資金調達」", "公式サイトの登壇者 24名・出展社 38社", "あなたの人脈 286人との照合", "10/16 の予定"],
    cautions: [
      { detail: "経費精算の対象か事前に確認を", kind: "fee", text: "参加費 ¥15,000" },
      { detail: "目標との関係が薄い時間帯", kind: "off_target_session", text: "午後は採用向けセッション中心" },
    ],
    display: {
      goalFit: { reason: "シリーズA調達に直結。登壇 VC 3社はシード〜シリーズA中心", value: 88 },
      people: { reason: "プランが求める VC パートナー 3名・製造業 DX 責任者 12社", value: 76 },
      timeCost: { reason: "終日・参加費 ¥15,000。午後は採用向けセッション中心", value: 64 },
    },
    facts: { price: "¥15,000", startsAt: shifted("2026-10-16T10:00:00+09:00", now), title: "Japan SaaS Summit 2026 秋", url: "https://saas-summit.jp/2026", venue: "東京国際フォーラム" },
    goalLabel: "シリーズA 資金調達",
    knownAttendees: [{ contactId: "design-takahashi", name: "高橋 美咲" }, { contactId: "design-kato", name: "加藤 健" }],
    meetCandidates: [
      { basis: "登壇 3名 · 青葉ベンチャーズ ほか", count: 3, emoji: "💼", label: "VC パートナー", source: "speakers" },
      { basis: "展示 12社", count: 12, emoji: "🏭", label: "製造業 DX 責任者", source: "exhibitors" },
      { basis: "高橋さん・加藤さん 参加予定", count: 2, emoji: "👋", label: "既存のつながり", names: ["高橋", "加藤"], source: "known" },
    ],
    partialAttendanceHint: { timeCostAfter: 78, window: "午前のキーノートと VC セッション（10:00–12:30）" },
    readSeconds: 12,
    recomputeOnAttendeeList: true,
    scoreBreakdown: items(39, 14, 13, 9, 7),
    sourceKind: "url",
    sourceLabel: "saas-summit.jp/2026",
    total: 82,
    verdict: "recommend",
  };
}

const simple = (id: string, title: string, startsAt: string, venue: string, price: string, total: number, verdict: EventAssessmentContract["verdict"], meet: number, now: Date, split: [number, number, number, number, number]): EventAssessmentContract => ({
  ...base(id, now),
  display: { goalFit: { value: Math.round(((split[0] + split[1]) / 60) * 100) }, people: { value: Math.round(((split[3] + split[4]) / 20) * 100) }, timeCost: { value: Math.round((split[2] / 20) * 100) } },
  facts: { price, startsAt: shifted(startsAt, now), title, venue },
  meetCandidates: [{ basis: `約${meet}名`, count: meet, emoji: "💼", label: "VC パートナー", source: "registrants" }],
  scoreBreakdown: items(...split),
  sourceKind: "url",
  total,
  verdict,
});

export const cfoNight = (now = new Date()) => simple("design-assessment-cfo-night", "CFO Night Tokyo vol.18", "2026-10-07T19:00:00+09:00", "渋谷ストリーム", "¥5,000", 74, "recommend", 6, now, [33, 12, 14, 8, 7]);
export const dxOsaka = (now = new Date()) => simple("design-assessment-dx-osaka", "製造業DXカンファレンス 大阪", "2026-10-23T13:00:00+09:00", "グランフロント大阪", "無料", 68, "conditional", 9, now, [30, 11, 14, 6, 7]);
export const asakai = (now = new Date()) => simple("design-assessment-asakai", "丸の内スタートアップ朝会 #42", "2026-10-21T08:00:00+09:00", "丸の内", "¥1,000", 41, "skip", 2, now, [15, 8, 10, 3, 5]);
export const extraA = (now = new Date()) => simple("design-assessment-extra-a", "CVC × スタートアップ ミートアップ", "2026-10-29T18:30:00+09:00", "虎ノ門ヒルズ", "¥3,000", 77, "recommend", 8, now, [34, 12, 15, 8, 8]);
export const extraB = (now = new Date()) => simple("design-assessment-extra-b", "関西ものづくりピッチ 2026", "2026-11-05T13:00:00+09:00", "うめきたホール", "無料", 58, "conditional", 4, now, [24, 10, 13, 5, 6]);

const going = (eventId: string, title: string, startsAt: string, venue: string, meet: number, status: MyEventSourceRow["status"], now: Date): MyEventSourceRow & { meet: { count: number; initials: string[] } } => ({
  endsAt: null, eventId, meet: { count: meet, initials: ["高", "鈴", "伊", "渡"] }, startsAt: shifted(startsAt, now), status, title, venue,
});

export interface EventDesignFixture {
  assessments: EventAssessmentContract[];
  mine: (MyEventSourceRow & { meet?: { count: number; initials: string[] } })[];
}

/** b12 #310 右栏：画板把 #12 右栏的「評価の詳細」内容（来源 chip、3 维、会えそうな人、注意）套在 CFO Night 上；只换标题 / 日时 / 参加費 / 分数（5 项之和须等于总分）。 */
const cfoNightRail = (now: Date): EventAssessmentContract => {
  const base = summit(now);
  const cfo = cfoNight(now);
  return { ...base, facts: { ...base.facts, price: cfo.facts.price, startsAt: cfo.facts.startsAt, title: cfo.facts.title }, id: cfo.id, scoreBreakdown: cfo.scoreBreakdown, total: cfo.total, verdict: cfo.verdict };
};

const GOING_ASSESSMENT: Record<string, string> = { "design-event-cfo": "design-assessment-cfo-night", "design-event-dx": "design-assessment-dx-osaka", "design-event-saas": "design-assessment-saas-summit" };

export const EVENT_DESIGN_FIXTURES: Readonly<Record<string, (now?: Date) => EventDesignFixture>> = {
  /** web.html #10 / app.html #13 / b8 #3：新用户空态。 */
  "assess-empty": () => ({ assessments: [], mine: [] }),
  /** web.html #11 / app.html #14：参加予定 1 · 評価 2。 */
  "assess-few": (now = new Date()) => ({ assessments: [summit(now), cfoNight(now)], mine: [going("design-event-cfo", "CFO Night Tokyo vol.18", "2026-10-07T19:00:00+09:00", "渋谷ストリーム", 6, "registered", now)] }),
  /** web.html #12 / #23 / app.html #15：参加予定 3 · 評価 4。 */
  "assess-many": (now = new Date()) => ({
    assessments: [summit(now), cfoNight(now), dxOsaka(now), asakai(now)],
    mine: [
      going("design-event-cfo", "CFO Night Tokyo vol.18", "2026-10-07T19:00:00+09:00", "渋谷ストリーム", 6, "registered", now),
      going("design-event-saas", "Japan SaaS Summit 2026 秋", "2026-10-16T10:00:00+09:00", "東京国際フォーラム", 14, "registered", now),
      going("design-event-dx", "製造業DXカンファレンス 大阪", "2026-10-23T13:00:00+09:00", "グランフロント大阪", 9, "planned", now),
    ],
  }),
  /** b8 #0 / #2：1024 大量（評価済み 6件）。 */
  "assess-many-6": (now = new Date()) => ({ ...EVENT_DESIGN_FIXTURES["assess-many"]!(now), assessments: [summit(now), extraA(now), cfoNight(now), dxOsaka(now), extraB(now), asakai(now)] }),
  /** b12 W-R26-30：参加予定 3 + 過去 2。 */
  going: (now = new Date()) => ({
    assessments: [summit(now), cfoNightRail(now), dxOsaka(now), asakai(now)],
    mine: [
      // 右栏「評価の詳細」= 下一场参加予定的评估（b12 #310）：参加予定行带上评估 id（只加数据）。
      ...EVENT_DESIGN_FIXTURES["assess-many"]!(now).mine.map((row) => ({ ...row, assessmentId: GOING_ASSESSMENT[row.eventId] ?? null })),
      going("design-event-past-1", "SaaS Summit 2026", "2026-09-12T10:00:00+09:00", "東京国際フォーラム", 0, "attended", now),
      going("design-event-past-2", "製造業DX カンファレンス 大阪", "2026-09-26T10:00:00+09:00", "グランフロント大阪", 0, "registered", now),
    ],
  }),
  /** b12 W-R26-30e：参加予定 空。 */
  "going-empty": (now = new Date()) => ({ assessments: [summit(now)], mine: [] }),
};
