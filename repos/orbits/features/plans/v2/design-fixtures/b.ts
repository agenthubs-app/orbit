/**
 * 子任务 B 的设计稿示例 fixture（键 = fixture 名，建议用画板编号，如 "b4-11-type-candidates"）。只补数据，不改画面结构。
 *
 * "b10-flow"：b10-plan-example.html 的例子（佐藤 健一 ×「Orbit を落地して黒字化したい」→ 目的 3 段目）在生成流程各阶段各放一个
 * intake（id 固定，见 B_FLOW_IDS），供 W-R23-04/05/08（背景）· 10（5 問）· 11（前提）· 12（初版）· 13（修正 1 回）· 14（使い切り）·
 * 17 / 18（手動編集，以修正 3 回后的草稿为起点）的门禁使用。数字、条数、文字逐条照画板；业界现状只能引用真实库（上市・収益化 4 条）。
 */
import type { PlanDraftTurn, PlanIntakeQuestion, PlanPremiseRow, PlanV2Step } from "../../../../shared/contract/plan-v2";
import type { PlanDraftContent, PlanDraftPersonType, PlanDraftRow, PlanFlowStepRecord, PlanIntakeRow } from "../types";
import { fromDemo, type PlanDesignFixture } from "./base";
import type { PlanDesignEventFacts } from "./base";

export const B_FLOW_IDS = {
  background: "intake_b10_bg",
  questions: "intake_b10_q",
  premise: "intake_b10_premise",
  drafted: "intake_b10_draft",
  fixed1: "intake_b10_fix1",
  usedUp: "intake_b10_fix3",
  draftInitial: "draft_b10_initial",
  draftFix1: "draft_b10_fix1",
  draftUsedUp: "draft_b10_fix3",
  drafting: "intake_b10_drafting",
  fallback: "intake_b10_fallback",
  oneRung: "intake_b10_onerung",
  planned: "intake_b10_planned",
  draftPlanned: "draft_b10_planned",
} as const;

const AT = "2026-10-08T01:00:00.000Z";
const GOAL = "Orbit を落地して黒字化したい";
const PURPOSE = "Orbit をブランドとして確立し、事業にする";

const step = (state: PlanFlowStepRecord["state"] = "done"): PlanFlowStepRecord => ({ at: state === "none" ? null : AT, attempts: state === "none" ? 0 : 1, limit: null, operationId: null, retryOn: null, state });

function background(confirmed: boolean): PlanIntakeRow["background"] {
  const at = confirmed ? AT : null;
  return {
    me: { confirmedAt: at, value: { headline: "AI エンジニア · Orbit", name: "佐藤 健一", stance: "cofounder", wants: "Orbit を世に出す" } },
    purpose: {
      confirmedAt: at,
      value: {
        reason: "最初の目標は「2」でしたが、チームの状況から「3」に近いかもしれません。",
        rungs: [
          { level: 4, text: "人脈 AI の分野で、代表的なブランドになる" },
          { level: 3, text: PURPOSE },
          { level: 2, text: "Orbit を利益が出る事業にする" },
          { level: 1, text: "β 版を有料にする" },
        ],
        selectedLevel: 3,
        suggestedLevel: 3,
      },
    },
    reading: [
      { detail: "佐藤 健一 · AI エンジニア · Orbit", kind: "profile" },
      { detail: GOAL, kind: "goal" },
      { detail: "「共同創業者」の 1名（高木 悠）の名刺・面談メモ", kind: "network" },
      { detail: "目標タイプ「上市・収益化」の固定リスト 8項目", kind: "capabilities" },
    ],
    team: {
      confirmedAt: at,
      value: {
        members: [
          { basis: null, capabilities: ["product", "ai_data"], contactId: null, headline: "あなた · 共同創業者", isSelf: true, memberId: "self", name: "佐藤 健一", otherCapabilities: [], relation: null, source: "profile" },
          { basis: "名刺・面談メモから", capabilities: ["product", "ai_data", "ops_infra"], contactId: "demo-person-aoki", headline: "共同創業者 · 週末中心", isSelf: false, memberId: "contact:demo-person-aoki", name: "高木 悠", otherCapabilities: [], relation: "cofounder", source: "network" },
        ],
        mode: "team",
      },
    },
  } as PlanIntakeRow["background"];
}

const QUESTIONS: PlanIntakeQuestion[] = [
  { guess: { text: "β 48名 · 有料 0 · NPS は未計測", values: ["beta"] }, id: "R1", why: "プロフィールと背景から、いまの段階がわからないため" },
  { guess: { text: "主催者が払い、参加者は無料で使える形がいい", values: ["businesses"] }, id: "R2", why: "最初の払い手でステップが分かれるため" },
  { guess: { text: "イベントの後を変える AI", values: ["decided"] }, id: "R3", why: "目的が「ブランドとして確立」のため" },
  { guess: { text: "デザインは仲間に入れたい · 営業とマーケは未定", values: ["recruit", "learn"] }, id: "R7", why: "チームの空白が 5つあるため" },
  { guess: { text: "2人とも平日夜と週末", values: ["side_10to20"] }, id: "R6", why: "使える時間でステップの数が変わるため" },
];

const PREMISE: PlanPremiseRow[] = [
  { guessed: false, key: "purpose", label: "目的", source: "background", value: PURPOSE },
  { guessed: false, key: "team", label: "チーム", source: "background", value: "2名 · AI エンジニア × 2（空白：デザイン・ブランド・営業・マーケ・価格設計）" },
  { guessed: false, key: "R1", label: "現在地", source: "q1", value: "β 48名 · 有料 0 · NPS 未計測" },
  { guessed: false, key: "R2", label: "払い手", source: "q2", value: "イベント主催者（参加者は無料）" },
  { guessed: false, key: "R3", label: "一言", source: "q3", value: "イベントの後を変える AI" },
  { guessed: false, key: "R7", label: "足りない力", source: "q4", value: "デザインは仲間に · 営業とマーケは未定" },
  { guessed: false, key: "R6", label: "時間", source: "q5", value: "2人とも本業と並行 · 週 10〜20時間" },
];

const ANSWERS = QUESTIONS.map((question) => ({ guessed: false, questionId: question.id, text: question.guess!.text, values: [...question.guess!.values] }));

const type = (key: string, slot: string, emoji: string, shortLabel: string, roleSituation: string, allocation: number, targetCount: number): PlanDraftPersonType => ({
  allocation, countRule: "名刺交換か面談 1回で 1人", emoji, introRoutes: [], itemId: key, key, opener: null, persona: null,
  questions: ["いちばん困っていることは？", "誰に相談していますか？", "何があれば試しますか？"], recognizeHints: [], roleSituation,
  shortLabel, shortLabelId: slot, slot, targetCount, why: "テンプレートの枠から",
});

const TYPES: PlanDraftPersonType[] = [
  type("A", "first_payer", "🎪", "交流会の主催者", "月1回以上・50〜200名規模の交流会を主催するコミュニティ運営者", 25, 5),
  type("B", "brand_pr", "🎨", "ブランドづくりの経験者", "0→1 で SaaS や D2C のブランドを立ち上げたブランド・PR 責任者", 20, 2),
  type("C", "prior_product", "📇", "名刺 SaaS の経験者", "Eight・Sansan など名刺／CRM SaaS で法人営業か PdM をしていた人", 15, 2),
  type("D", "same_path_founder", "🛠️", "エンジニア出身の起業家", "エンジニア出身で、自分で事業を立ち上げた創業者", 15, 3),
  type("E", "missing_expert", "🖌️", "プロダクトデザイナー", "業務 SaaS の UX を改善してきたプロダクトデザイナー", 10, 2),
];

const s = (key: string, title: string, doneCriteria: string, personTypeKeys: string[]): PlanV2Step => ({ doneCriteria, key, personTypeKeys, title, why: null });
const STEPS0: PlanV2Step[] = [
  s("s1", "誰のための何かを言い切る", "「イベント後を変える AI」の一言で、主催者 5人中 3人が「欲しい」と言う", ["A", "B", "event"]),
  s("s2", "最初の有料顧客", "主催者 1社と有料パイロットに合意", ["A", "C", "D"]),
  s("s3", "足りない力を仲間にする", "デザイン・ブランド・営業のどれか 1つで、継続的な協力者が決まる", ["B", "D", "E"]),
  s("s4", "収益の形を確かめる", "参加者 → Pro 転換の仮説（価格・無料枠）が立つ", ["C"]),
  s("s5", "ブランドとして広げる", "主催者の事例 2件と、発信の型ができる", ["A", "B", "event"]),
];
const DONE2 = "無料 1回のあと、主催者 1社と有料パイロットに合意";
const DONE3 = "デザインかブランドで、継続的な協力者が 1人決まる";
const DONE5 = "主催者の事例 3件と、発信の型ができる";

function content(steps: PlanV2Step[]): PlanDraftContent {
  return {
    allocationReasons: ["ブランド・PR 15→20（チームにブランドの力がなく、目的が「ブランドとして確立」）", "ヘビーユーザー 5→0（β 48名の声は Step で直接集められる）"],
    basis: [{ kind: "premise", label: "確定した前提 7件", ref: "premise@1" }, { kind: "template", label: "目標タイプ「上市・収益化」", ref: "launch" }],
    citations: [{ id: "L-103", version: 1 }, { id: "L-201", version: 1 }, { id: "L-202", version: 1 }, { id: "L-203", version: 1 }],
    conclusion: "「イベント後を変える AI」として主催者経由で広め、ブランドを先に立てる。個人 Pro は参加者からの 2本目。",
    diagnosis: "技術とつくる力は十分です。足りないのは「誰のための何か」という一言と、それを届ける販路、そしてデザイン・ブランドの力。人脈管理は個人向けだと Eight が無料で強く ①、機能で勝負すると埋もれます。一方、イベントの「後」は主催者も参加者も手が回っていない ②。ここを「イベントの後を変える AI」として主催者に選んでもらえば、売上とブランドを同時につくれます。",
    event: { allocation: 15, targetCount: 3 },
    flow: [
      { emoji: "🎪", label: "主催者", note: "お金を払う（1本目）" },
      { emoji: "🙋", label: "参加者", note: "無料で体験 事後フォロー" },
      { emoji: "⭐", label: "Pro", note: "個人課金（2本目）" },
    ],
    personTypes: TYPES.map((item) => ({ ...item })),
    steps,
  };
}
const withDone = (changes: Record<number, string>) => STEPS0.map((item, index) => (changes[index] ? { ...item, doneCriteria: changes[index]! } : { ...item }));

const UNCHANGED = ["見立てと結論", "人物タイプ 6 と配点", "個人 Pro は 2本目"];
const TURN1: PlanDraftTurn = {
  at: AT,
  changes: [
    { after: DONE2, before: STEPS0[1]!.doneCriteria, label: "Step 2 の目安", path: "steps.1.doneCriteria" },
    { after: DONE3, before: STEPS0[2]!.doneCriteria, label: "Step 3 の目安", path: "steps.2.doneCriteria" },
  ],
  input: "主催者向けで賛成です。営業は当面 2人でやるので、仲間はデザインとブランドを優先したい。あと、主催者には最初の 1回は無料で試してもらいたいです。",
  n: 1, noChangeReason: null, unchanged: UNCHANGED,
};
const TURN2: PlanDraftTurn = { at: AT, changes: [{ after: DONE5, before: STEPS0[4]!.doneCriteria, label: "Step 5 の目安", path: "steps.4.doneCriteria" }], input: "事例は 2件じゃなく 3件ほしい。次の主催者に見せる材料にしたいので。", n: 2, noChangeReason: null, unchanged: UNCHANGED };
const TURN3: PlanDraftTurn = {
  at: AT, changes: [], input: "やっぱり資金調達も Step に入れたほうがいいですか？", n: 3,
  noChangeReason: "資金調達は Step に入れません。前提が「2人とも本業と並行」で、Step 2 の数字が出るまでは調達の判断材料がないためです。必要になったら、別の目標「資金調達」として作れます。",
  unchanged: [],
};

function intake(id: string, status: PlanIntakeRow["status"], draftId: string | null): PlanIntakeRow {
  const asked = status !== "background";
  const answered = status === "premise" || status === "drafted";
  return {
    aiSteps: { background: step(), draft: step(draftId ? "done" : "none"), draftId, ladder: step("none"), ladderCount: 0, members: step("none"), premiseVersion: answered ? 1 : 0, questions: step(asked ? "done" : "none") },
    answers: answered ? ANSWERS.map((answer) => ({ ...answer, values: [...answer.values] })) : null,
    background: background(asked),
    createdAt: AT, goalKind: "launch", goalText: GOAL, id, planId: null,
    premise: answered ? PREMISE.map((row) => ({ ...row })) : null,
    questions: asked ? { cacheKey: "fixture:b10", items: QUESTIONS.map((question) => ({ ...question })), skipped: [{ id: "R4", reason: "価格は Step で確かめる" }, { id: "R5", reason: "競合は業界の現状で補う" }] } : null,
    source: "task", status, updatedAt: AT,
  };
}

function draft(id: string, intakeId: string, steps: PlanV2Step[], turns: PlanDraftTurn[]): PlanDraftRow {
  return {
    aiFixUsed: turns.length, baseRevision: null, confirmedAt: null, content: content(steps), createdAt: AT, fix: step(turns.length ? "done" : "none"), id, intakeId,
    kind: "initial", manualEditUsed: false, originContent: content(STEPS0), planId: null, premise: PREMISE.map((row) => ({ ...row })), premiseVersion: 1,
    status: "open", turns, updatedAt: AT,
  };
}

/** b12 W-R23-09: the rule draft after the AI failed — no role, the goal as 「やりたいこと」, solo, one rung. */
function fallbackIntake(): PlanIntakeRow {
  const row = intake(B_FLOW_IDS.fallback, "background", null);
  const base = background(false);
  row.aiSteps.background = { ...step("fallback") };
  row.background = {
    ...base,
    me: { confirmedAt: null, value: { headline: "AI エンジニア · Orbit", name: "佐藤 健一", stance: null, wants: GOAL } },
    purpose: { confirmedAt: null, value: { reason: null, rungs: [{ level: 1, text: GOAL }], selectedLevel: 1, suggestedLevel: null } },
    team: { confirmedAt: null, value: { members: [base.team!.value.members[0]!], mode: "solo" } },
  };
  return row;
}

/** b12 N17b: the stair has only the written goal (the ladder gave one rung). */
function oneRungIntake(): PlanIntakeRow {
  const row = intake(B_FLOW_IDS.oneRung, "background", null);
  row.background = { ...row.background, purpose: { confirmedAt: null, value: { reason: null, rungs: [{ level: 1, text: GOAL }], selectedLevel: 1, suggestedLevel: null } } };
  return row;
}

/** b12 W-R23-02a/b/c: the goal input's side states (an unfinished flow · no new goals this month · 2 active goals). */
function goalStates(): Record<string, PlanDesignFixture> {
  return {
    "b12-goal-resume": fromDemo((state) => {
      state.intakes = [...(state.intakes ?? []), { ...intake("intake_b12_resume", "questions", null), updatedAt: "2026-10-10T03:00:00.000Z" }];
    }),
    "b12-goal-month": fromDemo((state) => {
      // 10 flows started this month and already finished or dropped: the monthly allowance is used up, nothing to resume.
      state.intakes = [...(state.intakes ?? []), ...Array.from({ length: 10 }, (_, index) => ({ ...intake(`intake_b12_month_${index}`, "abandoned", null), createdAt: "2026-10-02T00:00:00.000Z" }))];
    }),
    "b12-goal-two": fromDemo((state) => {
      const first = state.plans?.[0];
      if (!first) return;
      state.plans = [...(state.plans ?? []), { ...structuredClone(first), creationKey: null, goalId: "goal_b12_orbit", goalKind: "launch", goalText: "Orbit をブランドとして事業化", id: "plan_b12_orbit", lastOpenedAt: null, purposeText: null }];
    }),
  };
}

export const fixturesB: Record<string, PlanDesignFixture> = {
  ...goalStates(),
  "b10-flow": fromDemo((state) => {
    state.intakes = [
      ...(state.intakes ?? []),
      intake(B_FLOW_IDS.background, "background", null),
      intake(B_FLOW_IDS.questions, "questions", null),
      intake(B_FLOW_IDS.premise, "premise", null),
      intake(B_FLOW_IDS.drafted, "drafted", B_FLOW_IDS.draftInitial),
      intake(B_FLOW_IDS.fixed1, "drafted", B_FLOW_IDS.draftFix1),
      intake(B_FLOW_IDS.usedUp, "drafted", B_FLOW_IDS.draftUsedUp),
      { ...intake(B_FLOW_IDS.drafting, "drafting", null), aiSteps: { ...intake(B_FLOW_IDS.drafting, "background", null).aiSteps, background: step("none") }, background: { me: null, purpose: null, reading: background(false).reading, team: null }, questions: null },
      fallbackIntake(),
      oneRungIntake(),
      // W-R23-19「この会話の記録」：AI 修正 3回 · 手動編集 1回 → 确定时用的草稿（修正 3 回、手动编辑过）。
      { ...intake(B_FLOW_IDS.planned, "planned", B_FLOW_IDS.draftPlanned), planId: "demo-plan-series-a" },
    ];
    state.drafts = [
      ...(state.drafts ?? []),
      draft(B_FLOW_IDS.draftInitial, B_FLOW_IDS.drafted, STEPS0.map((item) => ({ ...item })), []),
      draft(B_FLOW_IDS.draftFix1, B_FLOW_IDS.fixed1, withDone({ 1: DONE2, 2: DONE3 }), [TURN1]),
      draft(B_FLOW_IDS.draftUsedUp, B_FLOW_IDS.usedUp, withDone({ 1: DONE2, 2: DONE3, 4: DONE5 }), [TURN1, TURN2, TURN3]),
      { ...draft(B_FLOW_IDS.draftPlanned, B_FLOW_IDS.planned, withDone({ 1: DONE2, 2: DONE3, 4: DONE5 }), [TURN1, TURN2, TURN3]), confirmedAt: AT, manualEditUsed: true, planId: "demo-plan-series-a", status: "confirmed" },
    ];
  }),
  /**
   * W-R23-06（b12 #140 メンバー追加 · 人脈から選ぶ）：b10-flow + 画板的候补联系人。高木 悠（演示世界 aoki，已在团队里）保留，
   * 再放 森 美咲（空き：デザイン）、小林 翔（空き：営業）两位；别的演示联系人去掉，候补只剩这两人（mock 生成流程读本人联系人，
   * 复核 REWORK-REVIEW-web 问题 7）。森的职位写「UI デザイン」：「空き」匹配按能力名子串（デザイン），画板写的是「デザイナー」。
   */
  "b12-140-add-member": () => {
    const state = fixturesB["b10-flow"]!();
    const aoki = (state.contacts ?? []).find((contact) => contact.id === "demo-person-aoki");
    state.contacts = [
      ...(aoki ? [{ ...aoki, name: "高木 悠" }] : []),
      { id: "design-person-mori", isOrbitUser: false, lastInteractionAt: null, name: "森 美咲", organization: null, role: "UI デザイン · 副業可" },
      { id: "design-person-kobayashi", isOrbitUser: false, lastInteractionAt: null, name: "小林 翔", organization: null, role: "元 SaaS 営業 · アドバイザー" },
    ];
    return state;
  },
};

/** 同名 fixture 的会える活動事实（可选；键与上面的 fixture 名一致）。 */
export const eventFactsB: Record<string, PlanDesignEventFacts> = {};
