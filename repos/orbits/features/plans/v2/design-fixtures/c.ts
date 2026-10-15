/**
 * 子任务 C 的设计稿示例 fixture（键 = fixture 名，建议用画板编号，如 "b4-11-type-candidates"）。只补数据，不改画面结构。
 */
import type { PlanLegacyDetail, PlanNextGoalsResponse, PlanPremiseRow } from "../../../../shared/contract/plan-v2";
import { nextTokyoMidnight, tokyoUsageMonth } from "../../../ai-quota/constants";
import type { MemoryPlanV2State } from "../repository";
import type { PlanDesignEventFacts, PlanDesignFixture } from "./base";
import { fromDemo } from "./base";

/** b4「見直し · Web」/ b12 W-R25-05 / 06a 的「確定した前提」7 行（目的 … 進み具合）。 */
const REVIEW_PREMISE: PlanPremiseRow[] = [
  { guessed: false, key: "purpose", label: "目的", source: "background", value: "シリーズA で 3億円を調達する" },
  { guessed: false, key: "team", label: "チーム", source: "background", value: "2名（佐藤 · 中川）· 空き：財務・CFO / 投資契約・法務" },
  { guessed: false, key: "F1", label: "直近の数字", source: "q1", value: "ARR 8,000万円 · 前年比 2.4倍" },
  { guessed: false, key: "F2", label: "既存株主", source: "q2", value: "エンジェル 2名 · リード候補なし" },
  { guessed: false, key: "F3", label: "締切と使い道", source: "q3", value: "2027年3月 · 営業 5名の採用" },
  { guessed: false, key: "F4", label: "使える時間", source: "q4", value: "週 15時間 · 本業と並行" },
  { guessed: false, key: "progress", label: "進み具合", source: "record", value: "Step 2 紹介 2件 · Step 3 VC 2 / 3人と面談" },
];

/** b12 W-R25-13 以前のプラン 詳細（シリーズA 資金調達 · 開始 2026年6月2日 · Step 3 / 8 · 会いたい人 4）。 */
const LEGACY_SERIES_A: PlanLegacyDetail = {
  actionsDone: 3,
  actionsTotal: 8,
  analysisSummary: "調達額 3億円に対して ARR 8,000万円は水準内。足りないのはリード候補との接点と、資本政策を見てもらえる人。フェーズ 1 で数字と資料を固め、フェーズ 2 で VC を 3社に絞ります。",
  archivedAt: null,
  goal: "シリーズA 資金調達（3億円）",
  items: [
    { kind: "action", phase: "p1", phaseNumber: 1, status: "done", title: "事業計画を 3年分に作り直す" },
    { kind: "action", phase: "p1", phaseNumber: 1, status: "done", title: "ピッチ資料に導入事例を 2件入れる" },
    { kind: "action", phase: "p1", phaseNumber: 1, status: "in_progress", title: "資本政策表を CFO 経験者に見てもらう" },
    { kind: "action", phase: "p2", phaseNumber: 2, status: "not_started", title: "リード候補の VC を 3社に絞る" },
    { kind: "action", phase: "p2", phaseNumber: 2, status: "not_started", title: "投資契約のひな形を確認する" },
    { contactName: "伊藤 直子", detail: "資本政策の壁打ち", kind: "network_need", organization: "株式会社ハルモニア", phase: null, status: "established", title: "資本政策を見てもらえる人" },
    { contactName: "高橋 美咲", detail: "リード投資家の候補", kind: "network_need", organization: "青葉ベンチャーズ", phase: null, status: "linked", title: "リード投資家の候補" },
    { contactName: null, detail: null, kind: "network_need", organization: null, phase: null, status: "open", title: "事業会社の CVC 担当者" },
    { kind: "info", phase: null, status: "answered", title: "シリーズA の相場（ARR と評価額）" },
    { kind: "info", phase: null, status: "open", title: "製造業向け SaaS に強い VC" },
    { kind: "event", phase: null, status: "attended", title: "CFO Night Tokyo vol.18" },
    { kind: "event", phase: null, status: "registered", title: "SaaS Summit 2026" },
    { kind: "event", phase: null, status: "recommended", title: "製造業DXカンファレンス 大阪" },
  ],
  needs: 4,
  // b12 #286 会いたい人头像 伊 · 高 · 渡 · 鈴（后两位是 v1 里另两条会いたい人对上的人，详情页不列）。
  needNames: ["伊藤 直子", "高橋 美咲", "渡辺 健", "鈴木 一郎"],
  phase: { number: 1, title: "数字と資料を固める", total: 2 },
  planId: "design-legacy-series-a",
  startsOn: "2026-06-02",
  status: "active",
};

/** c-review / c-done 共用：前提 7 行、开始日、Step 3 的目安照画板示例。 */
function reviewPlan(state: Partial<MemoryPlanV2State>) {
  for (const plan of state.plans ?? []) {
    plan.premise = structuredClone(REVIEW_PREMISE);
    plan.startsOn = "2026-07-11";
    const step3 = plan.steps[2];
    if (step3) step3.doneCriteria = "リード候補 3社と 1回目の面談を終え、1社が DD に進む";
  }
}

/** b4「Web 達成 → 次の目標」的两个候选（🤝 / 🧑‍💼；副标题与依据照画板）。 */
const NEXT_GOALS: PlanNextGoalsResponse["candidates"] = [
  { basis: [{ kind: "record", label: "話した CVC 担当者 3人のうち 2社が PoC に関心（面談メモ 9/24・10/2）", ref: "design-memo-cvc" }], goalKind: "sales", goalText: "大手製造業との事業提携", subtitle: "CVC 担当者経由で 2社と PoC を始める" },
  { basis: [{ kind: "record", label: "話した起業家 7人中 4人が「調達後はまず営業責任者」と回答（面談メモ）", ref: "design-memo-founders" }], goalKind: "hiring", goalText: "営業責任者の採用", subtitle: "シリーズA 後の体制づくり" },
];

export const fixturesC: Record<string, PlanDesignFixture> = {
  /** 目標を編集（b4 #31）：背景（任意）/ ひとこと（重点）照画板（存在 plans.analysis）。 */
  "c-edit": fromDemo((state) => {
    for (const plan of state.plans ?? []) {
      Object.assign(plan.analysis, { goalBackground: "製造業向け SaaS · ARR 1.2億円", goalNote: "リードは SaaS に強い VC。CVC も 1社入れたい" });
    }
  }),
  /** 見直し（b4 #18 · b12 #254 #256）：前提 7 行照画板；先送 2 回 / 用完由门禁前的接口调用造出。 */
  "c-review": fromDemo((state) => {
    reviewPlan(state);
    // b12 #258 W-R25-06a 等：AI 预标「直近の数字」「既存株主」两行（C8 每计划每东京日缓存一次的回执，键同 flow-service startReview；
    // 切换 fixture 的当天有效）。依据是面談メモ摘要（不在 plan_log 里）。
    const plan = state.plans?.[0];
    if (!plan) return;
    const now = new Date();
    const day = new Date(Date.parse(nextTokyoMidnight(now)) - 86_400_000).toISOString().slice(0, 10);
    const memos = [
      { at: "2026-10-05T10:00:00+09:00", id: "design-memo-arr", text: "面談メモ「ARR 1億円の見込み」" },
      { at: "2026-10-09T10:00:00+09:00", id: "design-memo-vc", text: "VC 2人と面談済み · 高橋さんがリード候補に" },
    ];
    const marks = [
      { evidenceIds: ["design-memo-arr"], key: "F1", reason: "最近の面談メモで変わったかもしれません。", suggested: null },
      { evidenceIds: ["design-memo-vc"], key: "F2", reason: "最近の面談メモで変わったかもしれません。", suggested: null },
    ];
    state.receipts = [...(state.receipts ?? []), { createdAt: now.toISOString(), draftId: null, fingerprint: "design-fixture", idempotencyKey: `review-mark:${plan.id}:${tokyoUsageMonth(now)}:${day}`, intakeId: null, kind: "review_marks", outcome: "applied", planId: plan.id, response: { marks, memos } as unknown as Record<string, unknown> }];
  }),
  /** 完了 → 次の目標（b4 #27）：达成于 10月7日；C10 的候选按画板示例放进每计划一次的缓存回执（不调 AI）。 */
  "c-done": fromDemo((state) => {
    reviewPlan(state);
    const plan = state.plans?.[0];
    if (!plan) return;
    plan.achievedAt = "2026-10-07T03:00:00.000Z";
    const response: PlanNextGoalsResponse = { candidates: NEXT_GOALS, source: "ai" };
    state.receipts = [...(state.receipts ?? []), { createdAt: "2026-10-07T03:00:00.000Z", draftId: null, fingerprint: "design-fixture", idempotencyKey: `next-goal:${plan.id}`, intakeId: null, kind: "next_goals", outcome: "applied", planId: plan.id, response: response as unknown as Record<string, unknown> }];
  }),
  /** 以前のプラン（b12 #280 卡 · #282 詳細）：没有 v2 目标，只有一个 v1 计划。 */
  "c-legacy": fromDemo((state) => {
    state.plans = [];
    state.typeItems = [];
    state.eventItems = [];
    state.log = [];
    state.candidates = [];
    state.legacy = [structuredClone(LEGACY_SERIES_A)];
  }),
  /** 目標切替（b12 #274）：生效 2 个（シリーズA / 製造業の新規顧客開拓）、完了 1 个（シード調達）、以前のプラン 1 个。 */
  "c-goals": fromDemo((state) => {
    const base = state.plans?.[0];
    if (!base) return;
    base.goalText = "シリーズA 資金調達";
    const sales = { ...structuredClone(base), creationKey: "design-plan-sales", goalId: "design-goal-sales", goalKind: "sales" as const, goalText: "製造業の新規顧客開拓", id: "design-plan-sales", lastOpenedAt: "2026-10-01T08:30:00+09:00" };
    const seed = { ...structuredClone(base), achievedAt: "2026-06-30T03:00:00.000Z", creationKey: "design-plan-seed", goalId: "design-goal-seed", goalText: "シード調達（8,000万円）", id: "design-plan-seed", lastOpenedAt: "2026-06-30T08:30:00+09:00" };
    state.plans = [base, sales, seed];
    state.legacy = [{ ...structuredClone(LEGACY_SERIES_A), goal: "展示会で代理店を見つける", planId: "design-legacy-fair", status: "archived", archivedAt: "2026-06-01T00:00:00.000Z" }];
  }),
};

/** 同名 fixture 的会える活動事实（可选；键与上面的 fixture 名一致）。 */
export const eventFactsC: Record<string, PlanDesignEventFacts> = {};
