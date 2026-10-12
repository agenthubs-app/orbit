/**
 * 子任务 A（概要 + 人物类型详情）的设计稿示例 fixture。只补数据，不改画面结构。
 *
 * 世界 = web.html / b4 / b8 / b12 的「シリーズA 資金調達」：6 个类型（CFO · 起業家 · エンジェル · VC · CVC · 弁護士）+ イベント枠，
 * 配点 / 目标人数 / 短名 /「役割 × 状況」/ Step / 完了の目安 / 結論 / 前提 / 候补 / 紹介ルート / 已聊记录逐条照画板示例。
 * 类型 key 与 itemId 沿用演示世界（`demo-plan-item-<key>`），这样门禁 URL 不变。
 * 改不了的（不在 MemoryPlanV2State 里）：会える活動 = 演示世界的 3 场活动事实（mock-event-facts）；推薦度 = 规则分。
 *
 * - "w17-overview-many"：web.html #17 / b8 #6 #7（s46：起業家 2 · VC 2 · 弁護士 スキップ · イベント 2 = 46）
 * - "w16-overview-few"：web.html #16（s0：今日つくったプラン，0 分）
 * - "b12-208-pending"：b12 W-R24-04a（s56c：CFO 1 · memo 提议 山本 彩 + 候补 佐々木 / 鈴木）
 * - "b12-206-premise"：b12 W-R24-03（s46，前提 6 件 · 9月14日に確定）
 * - "b4-11-type-vc"：b4 ① VC（候补 4 · 話した人 2 · 伊藤さん経由）；W-R24-12 / W-R24-09b 也用它
 * - "b4-13-type-cvc"：b4 ② CVC（人脈にいない · 人物像 · 開口一番 · 小林さん経由）
 * - "b12-222-law-skipped" / "b12-244-law"：b12 弁護士（スキップ中 / スキップ前）
 */
import type { PlanPremiseRow } from "../../../../shared/contract/plan-v2";
import { PLAN_EVENT_SEGMENT_KEY } from "../../../../shared/compute/plan-score";
import type { MemoryPlanV2State } from "../repository";
import type { PlanAwardPayload, PlanV2ContactView, PlanV2LogEntry, PlanV2MatchCandidate } from "../types";
import { fromDemo, type PlanDesignFixture } from "./base";
import type { PlanDesignEventFacts } from "./base";
import type { EventScoreFacts } from "../../../../shared/compute/event-score";
import { tokyoTimeslot, UNKNOWN_EVENT_FACTS } from "../event-facts";
import type { PlanEventFact } from "../overview";

type State = Partial<MemoryPlanV2State>;
type Key = "cfo" | "funded_founder" | "angel" | "vc_partner" | "cvc" | "lawyer";

const PLAN_ID = "demo-plan-series-a";
const item = (key: Key) => `demo-plan-item-${key}`;
const jst = (day: string, time = "10:00") => `${day}T${time}:00+09:00`;

/** web.html V2.PER（短名 · 「役割 × 状況」· 配点 · 目标人数 · emoji）。 */
const TYPES: Record<Key, { s: string; n: string; w: number; tgt: number; emo: string }> = {
  cfo: { emo: "📊", n: "シリーズA 前後の調達を、CFO として回した経験者", s: "CFO", tgt: 1, w: 10 },
  funded_founder: { emo: "🚀", n: "この 3年以内にシリーズA を調達した、B2B SaaS の起業家", s: "起業家", tgt: 5, w: 15 },
  angel: { emo: "🪽", n: "SaaS を創業した経験があり、シード〜A に個人で出資しているエンジェル", s: "エンジェル", tgt: 2, w: 10 },
  vc_partner: { emo: "💼", n: "シリーズA のリードを取れる VC のパートナー", s: "VC", tgt: 3, w: 30 },
  cvc: { emo: "🏢", n: "製造業 DX に出資している、事業会社 CVC の投資担当", s: "CVC", tgt: 3, w: 15 },
  lawyer: { emo: "⚖️", n: "シリーズA の投資契約・種類株式の交渉に立ち会える弁護士", s: "弁護士", tgt: 1, w: 10 },
};

/** web.html V2.STEPS + MEY（完了の目安）。 */
const STEPS: { key: string; title: string; doneCriteria: string; why: string | null; personTypeKeys: (Key | typeof PLAN_EVENT_SEGMENT_KEY)[] }[] = [
  { doneCriteria: "ピッチ資料と 3年の事業計画ができ、CFO 経験者 1人に数字を見てもらう", key: "demo-step-1", personTypeKeys: ["cfo"], title: "ピッチと事業計画を固める", why: "同規模のシリーズA 事例 · あなたの目標「3億円」から逆算" },
  { doneCriteria: "同じ規模を調達した先輩から、VC の候補と紹介を 2件もらう", key: "demo-step-2", personTypeKeys: ["funded_founder", "angel", "event"], title: "調達経験のある先輩・エンジェルに相談", why: "紹介経由の面談は進みやすい傾向（一般的な調達の進め方）" },
  { doneCriteria: "リード候補 3社と 1回目の面談を終え、1社が DD に進む", key: "demo-step-3", personTypeKeys: ["vc_partner", "cvc", "event"], title: "VC と接点を持つ", why: "シリーズA の典型的な投資家構成 · あなたの業種（製造業向け SaaS）" },
  { doneCriteria: "投資契約の主要条項（優先清算・希薄化防止）を、署名前に弁護士と確認する", key: "demo-step-4", personTypeKeys: ["lawyer"], title: "DD・条件交渉", why: "投資契約で論点になりやすい条項（優先清算・希薄化防止）" },
  { doneCriteria: "着金と登記が終わる", key: "demo-step-5", personTypeKeys: [], title: "クロージング", why: null },
];

const KETSU = "先に CFO 経験者と数字を固め、同じ規模を調達した先輩の紹介で VC 3社に並行で当たる。CVC は条件の選択肢として後から足す。";

/** b12 PREM（確定した前提 6 件；チーム = 推測）。 */
const PREMISE: PlanPremiseRow[] = [
  { guessed: false, key: "purpose", label: "目的", source: "background", value: "シリーズA で 3億円を調達する" },
  { guessed: true, key: "team", label: "チーム", source: "background", value: "2名（佐藤 · 中川）· 空き：財務・CFO / 投資契約・法務" },
  { guessed: false, key: "F2", label: "直近の数字", source: "q1", value: "ARR 8,000万円 · 前年比 2.4倍" },
  { guessed: false, key: "F3", label: "既存株主", source: "q2", value: "エンジェル 2名 · リード候補なし" },
  { guessed: false, key: "F5", label: "締切と使い道", source: "q3", value: "2027年3月 · 営業 5名の採用" },
  { guessed: false, key: "F7", label: "使える時間", source: "q4", value: "週 15時間 · 本業と並行" },
];

/** web.html TDVC / b4 TD22（なぜ · 聞くこと · 見分け方 · 切り出し方）。 */
const VC_DETAIL = {
  hints: ["役職：パートナー / GP / 代表パートナー", "ファンド：直近 30億円以上 / A のリード実績", "領域：B2B SaaS / 製造業 DX", "イベント：「投資家」タグ / ピッチ審査員"],
  opener: "製造業向け SaaS のシリーズA で、リードを取る条件を 30分だけ聞きたい",
  questions: ["いまのファンドで、シリーズA のリードを取る条件（ARR・成長率）は？", "製造業向け SaaS で、最近検討した案件・見送った案件の理由は？", "リードを取るとき、一緒に入ることが多い投資家はどこですか？"],
  why: "シリーズA では、リード投資家が評価額と金額を決め、ほかの投資家はその条件に乗ります。3億円の 1/3〜1/2 を出せる VC のパートナーと並行で話すと、条件を比べられ、締切（2027年3月）にも間に合います。",
};
const CVC_DETAIL = {
  opener: "御社の工場で 3か月の PoC から始めるなら、出資の検討はどんな流れになりますか？",
  persona: "いまの立場：製造業・商社・通信の大手で、CVC の投資担当か新規事業室の室長\n関心ごと：本業とのシナジー · PoC から始められるか · 事業提携つきの出資\n判断の流れ：現場の PoC → 事業部の評価 → 投資委員会（3〜6か月）",
  why: "製造業向け SaaS は、工場を持つ事業会社と相性がよく、CVC は VC と違う条件（事業提携つき）を出せます。リード VC の条件と比べる選択肢になります。",
};
const LAW_DETAIL = {
  questions: ["優先清算・希薄化防止で、シリーズA の相場から外れた条項はどれですか？", "種類株式の設計で、次のラウンドに響くところは？", "タームシートの段階で、こちらから入れておくべき条項は？"],
  why: "優先清算・希薄化防止などの条項は、署名後に変えにくいためです。リードが出すタームシートを、署名前に一緒に読める人が 1人いれば足ります。",
};

/** 画板里出现的人（演示世界没有的补上；同名的沿用演示世界的 id）。 */
const PEOPLE: PlanV2ContactView[] = [
  { id: "fx-a-yamaguchi", isOrbitUser: true, lastInteractionAt: jst("2026-10-07", "19:00"), name: "山口 大樹", organization: "Kibo Ventures", role: "パートナー" },
  { id: "fx-a-mori", isOrbitUser: false, lastInteractionAt: null, name: "森 恭平", organization: "東雲キャピタル", role: "プリンシパル" },
  { id: "fx-a-inoue", isOrbitUser: false, lastInteractionAt: null, name: "井上 拓海", organization: "シードキャピタル東京", role: "アソシエイト" },
  { id: "fx-a-hasegawa", isOrbitUser: false, lastInteractionAt: null, name: "長谷川 亮", organization: "湾岸グロース・パートナーズ", role: "パートナー" },
  { id: "fx-a-nakamura", isOrbitUser: false, lastInteractionAt: null, name: "中村 由紀", organization: "光が丘法律事務所", role: "弁護士" },
  { id: "fx-a-ishida", isOrbitUser: false, lastInteractionAt: null, name: "石田 恵", organization: "Kanade AI", role: "代表取締役" },
  { id: "fx-a-fujii", isOrbitUser: false, lastInteractionAt: null, name: "藤井 学", organization: "ネクストエンジェルズ", role: "エンジェル投資家" },
];

type Candidate = { contactId: string; key: Key; reason: string; tier: PlanV2MatchCandidate["tier"]; strength: PlanV2MatchCandidate["strength"] };
type Award = { key: Key | typeof PLAN_EVENT_SEGMENT_KEY; at: string; points: number; contactId?: string | null; basis?: PlanAwardPayload["basis"]; eventId?: string | null };

/** b4 VCC（VC 候补 4 人，理由 = 画板文字）。 */
const VC_CANDIDATES: Candidate[] = [
  { contactId: "fx-a-yamaguchi", key: "vc_partner", reason: "シリーズA のリード実績 4件 · SaaS に年6社出資", strength: "strong", tier: "rule" },
  { contactId: "fx-a-mori", key: "vc_partner", reason: "製造業 DX に絞った新ファンドの担当。パートナーにつなぐ役", strength: "strong", tier: "ai" },
  { contactId: "fx-a-inoue", key: "vc_partner", reason: "パートナーではないが、社内で案件を上げられる", strength: "candidate", tier: "ai" },
  { contactId: "demo-person-okada", key: "vc_partner", reason: "グロース寄り。次のラウンドで有力", strength: "candidate", tier: "ai" },
];
/** web.html 类型卡的「人脈の候補」：CFO 1 · 起業家 2 · エンジェル 1 · VC 4 · CVC 0 · 弁護士 1。 */
const OTHER_CANDIDATES: Candidate[] = [
  { contactId: "demo-person-ito", key: "cfo", reason: "名刺で「CFO」· 面談メモ 2件（関係が近い）", strength: "strong", tier: "ai" },
  { contactId: "fx-a-ishida", key: "funded_founder", reason: "2025年にシリーズA を調達した SaaS の創業者", strength: "strong", tier: "ai" },
  { contactId: "demo-person-matsui", key: "funded_founder", reason: "前職でシリーズA の調達を担当", strength: "candidate", tier: "ai" },
  { contactId: "fx-a-fujii", key: "angel", reason: "SaaS を創業し、シード〜A に個人で出資", strength: "candidate", tier: "ai" },
  { contactId: "fx-a-nakamura", key: "lawyer", reason: "投資契約・種類株式に強い。シリーズA のタームシート 20件以上", strength: "strong", tier: "ai" },
];

/** web.html 类型卡的「紹介ルート」：CFO 1 · 起業家 1 · エンジェル 2 · VC 1 · CVC 1 · 弁護士 1。 */
const ROUTES: Record<Key, { viaContactId: string; why: string }[]> = {
  angel: [{ viaContactId: "demo-person-kobayashi", why: "起業家コミュニティの主宰 · エンジェルと面識" }, { viaContactId: "demo-person-watanabe", why: "同時期にシリーズA を調達 · 共通の投資家 2社" }],
  cfo: [{ viaContactId: "demo-person-takahashi", why: "ポートフォリオ企業の CFO を紹介できる" }],
  cvc: [{ viaContactId: "demo-person-kobayashi", why: "丸の内イノベーションラボ · 新規事業担当 300名のコミュニティ" }],
  funded_founder: [{ viaContactId: "demo-person-watanabe", why: "同時期にシリーズA を調達した起業家の集まりを主催" }],
  lawyer: [{ viaContactId: "demo-person-ito", why: "投資契約で付き合いのある事務所を紹介できる" }],
  vc_partner: [{ viaContactId: "demo-person-ito", why: "面識のある VC 4社のうち、A のリード実績がある 3社" }],
};

/** web.html V2.ST.s46：起業家 2 · VC 2 · 弁護士 スキップ · イベント 2（話して 36 · スキップ 10）。b8 最近の加点の日付。 */
const S46: Award[] = [
  { at: jst("2026-10-06"), contactId: "demo-person-takahashi", key: "vc_partner", points: 10 },
  { at: jst("2026-10-03", "18:00"), eventId: "demo-event-saas-summit", key: PLAN_EVENT_SEGMENT_KEY, points: 5 },
  { at: jst("2026-09-29"), contactId: "demo-person-watanabe", key: "funded_founder", points: 3 },
  { at: jst("2026-09-20"), basis: "skip", key: "lawyer", points: 10 },
  { at: jst("2026-09-18"), basis: "self_report", contactId: "fx-a-hasegawa", key: "vc_partner", points: 10 },
  { at: jst("2026-09-16", "19:00"), eventId: "demo-event-cfo-night", key: PLAN_EVENT_SEGMENT_KEY, points: 5 },
  { at: jst("2026-09-15"), contactId: "demo-person-aoki", key: "funded_founder", points: 3 },
];

type Options = { awards: Award[]; candidates: Candidate[]; startsOn?: string; manualEditAvailable?: boolean; extraLog?: PlanV2LogEntry[] };

function seriesA(options: Options): (state: State) => void {
  return (state) => {
    const plan = state.plans![0]!;
    Object.assign(plan, {
      analysis: { ...plan.analysis, allocationReasons: ["前提が「資金調達」テンプレートの既定と合っていたので、配点は調整していません"], conclusion: KETSU },
      goalText: "シリーズA 資金調達",
      manualEditAvailable: options.manualEditAvailable ?? false,
      premise: PREMISE,
      startsOn: options.startsOn ?? "2026-09-14",
      steps: STEPS.map((step) => ({ ...step, personTypeKeys: [...step.personTypeKeys] })),
      eventAllocation: 10,
      eventTargetCount: 2,
    });
    for (const type of state.typeItems!) {
      const key = type.personType.key as Key;
      const design = TYPES[key];
      if (!design) continue;
      Object.assign(type, { allocation: design.w, contactLinks: [], roleSituation: design.n, shortLabel: design.s, skippedAt: null, targetCount: design.tgt });
      type.personType = { ...type.personType, emoji: design.emo, introRoutes: ROUTES[key].map((route) => ({ ...route })) };
    }
    const typeOf = (key: Key) => state.typeItems!.find((type) => type.personType.key === key)!;
    typeOf("vc_partner").personType = { ...typeOf("vc_partner").personType, opener: VC_DETAIL.opener, questions: VC_DETAIL.questions, recognizeHints: VC_DETAIL.hints, why: VC_DETAIL.why };
    typeOf("cvc").personType = { ...typeOf("cvc").personType, opener: CVC_DETAIL.opener, persona: CVC_DETAIL.persona, why: CVC_DETAIL.why };
    typeOf("lawyer").personType = { ...typeOf("lawyer").personType, opener: "リードのタームシートを、署名前に 1時間だけ一緒に読んでほしい", questions: LAW_DETAIL.questions, why: LAW_DETAIL.why };
    // 弁護士はスキップ（満額）：スキップの記録があれば習熟済み。
    const skip = options.awards.find((award) => award.key === "lawyer" && award.basis === "skip");
    if (skip) typeOf("lawyer").skippedAt = skip.at;

    const known = new Set(state.contacts!.map((contact) => contact.id));
    state.contacts = [...state.contacts!, ...PEOPLE.filter((person) => !known.has(person.id))];
    state.candidates = options.candidates.map((candidate, index) => ({ contactId: candidate.contactId, createdAt: jst("2026-10-05", "09:00"), id: `fx-a-candidate-${index + 1}`, needItemId: item(candidate.key), reason: candidate.reason, status: "pending" as const, strength: candidate.strength, tier: candidate.tier }));
    state.eventItems = [];
    state.log = [
      ...options.awards.map((award, index): PlanV2LogEntry => {
        const payload: PlanAwardPayload = { anonymous: !award.contactId && award.basis === "self_report", basis: award.basis ?? (award.key === PLAN_EVENT_SEGMENT_KEY ? "event" : "talked"), contactId: award.contactId ?? null, eventId: award.eventId ?? null, part: "base", points: award.points, typeKey: award.key };
        return { author: "user", body: `${award.key}：+${award.points}`, createdAt: award.at, event: "score_awarded", id: `fx-a-award-${index + 1}`, idempotencyKey: `fx-a:award:${index + 1}`, itemId: award.key === PLAN_EVENT_SEGMENT_KEY ? null : item(award.key), linkedContactIds: award.contactId ? [award.contactId] : [], linkedEventId: award.eventId ?? null, payload: payload as unknown as Record<string, unknown>, planId: PLAN_ID };
      }),
      ...(options.extraLog ?? []),
    ];
  };
}

const today = () => {
  const now = new Date(Date.now() + 9 * 3_600_000);
  return now.toISOString().slice(0, 10);
};

/** Step 1 的「完了しましたか？」已被「まだ」（b12 04a 的 確認待ち只有 memo + 候补）。 */
const dismissStep1: PlanV2LogEntry = { author: "user", body: "step suggestion dismissed", createdAt: jst("2026-10-09", "12:00"), event: "pending_dismissed", id: "fx-a-dismiss-step-1", idempotencyKey: "fx-a:dismiss:step-1", itemId: null, linkedContactIds: [], linkedEventId: null, payload: { kind: "step_suggestion", pendingId: `step:${PLAN_ID}:demo-step-1`, stepKey: "demo-step-1" }, planId: PLAN_ID };
/** Step 4（弁護士 = 習熟済み）の「完了しましたか？」は出さない（web.html #17 の Step 4 は「習熟済み」chip だけ）。 */
const dismissStep4: PlanV2LogEntry = { ...dismissStep1, id: "fx-a-dismiss-step-4", idempotencyKey: "fx-a:dismiss:step-4", payload: { kind: "step_suggestion", pendingId: `step:${PLAN_ID}:demo-step-4`, stepKey: "demo-step-4" } };
/** b12 memoCard：山本 彩さんとの面談で 3 問中 2 問（問 1・3）· VC · 面談メモ 10/9。 */
const memoYamamoto: PlanV2LogEntry = { author: "system", body: "memo coverage", createdAt: jst("2026-10-09", "18:00"), event: "memo_coverage_proposed", id: "fx-a-memo-yamamoto", idempotencyKey: "fx-a:memo:yamamoto", itemId: item("vc_partner"), linkedContactIds: ["demo-person-yamamoto"], linkedEventId: null, payload: { answered: [0, 2], contactId: "demo-person-yamamoto" }, planId: PLAN_ID };

const ALL_CANDIDATES = [...OTHER_CANDIDATES, ...VC_CANDIDATES];
/** 概要画板（e1500b529 补画）的確認待ち：候补正好 1 人 = 佐々木 遼さん（VC）。 */
const OVERVIEW_CANDIDATES: Candidate[] = [{ contactId: "demo-person-sasaki", key: "vc_partner", reason: "シード中心で、A はフォローで入る方針", strength: "candidate", tier: "ai" }];

export const fixturesA: Record<string, PlanDesignFixture> = {
  "w17-overview-many": fromDemo(seriesA({ awards: S46, candidates: OVERVIEW_CANDIDATES, extraLog: [dismissStep4], manualEditAvailable: true })),
  // b8 #6 / #7（plan1024 / plan390）は Step の完了確認を描いていない：s46 のまま（VC 2 / 3人）。
  "b8-overview-many": fromDemo(seriesA({ awards: S46, candidates: OVERVIEW_CANDIDATES, extraLog: [dismissStep4], manualEditAvailable: true })),
  "w16-overview-few": fromDemo((state) => seriesA({ awards: [], candidates: OVERVIEW_CANDIDATES, manualEditAvailable: true, startsOn: today() })(state)),
  "b12-208-pending": fromDemo(seriesA({
    manualEditAvailable: true,
    awards: [{ at: jst("2026-10-09"), contactId: "demo-person-ito", key: "cfo", points: 10 }, ...S46],
    candidates: [
      { contactId: "demo-person-sasaki", key: "vc_partner", reason: "シード中心で、A はフォローで入る方針", strength: "candidate", tier: "ai" },
      { contactId: "demo-person-suzuki", key: "cvc", reason: "北辰製作所の DX推進室 室長", strength: "candidate", tier: "ai" },
    ],
    extraLog: [dismissStep1, dismissStep4, memoYamamoto],
  })),
  "b12-206-premise": fromDemo(seriesA({ awards: S46, candidates: OVERVIEW_CANDIDATES, extraLog: [dismissStep4], manualEditAvailable: true })),
  "b4-11-type-vc": fromDemo(seriesA({ awards: S46, candidates: ALL_CANDIDATES, extraLog: [dismissStep4] })),
  "b4-13-type-cvc": fromDemo(seriesA({ awards: S46, candidates: ALL_CANDIDATES, extraLog: [dismissStep4] })),
  "b12-222-law-skipped": fromDemo(seriesA({ awards: S46.map((award) => (award.key === "lawyer" ? { ...award, at: jst("2026-10-07") } : award)), candidates: ALL_CANDIDATES, extraLog: [dismissStep4] })),
  "b12-244-law": fromDemo(seriesA({ awards: S46.filter((award) => award.key !== "lawyer"), candidates: ALL_CANDIDATES })),
};

/** 一场活动的事实（未写的项 = 不明，评分时标「推定」）。 */
function fact(eventId: string, title: string, startsAt: string, venue: string, facts: Partial<EventScoreFacts> & Pick<EventScoreFacts, "expected">): PlanEventFact {
  return { eventId, facts: { ...UNKNOWN_EVENT_FACTS, attendeeSource: "registrants", timeslot: tokyoTimeslot(startsAt), ...facts }, startsAt, title, venue };
}

/**
 * web.html EVREC（Japan SaaS Summit 2026 秋 · CFO Night Tokyo vol.18 · 製造業DXカンファレンス 大阪）+ 起業家 / エンジェルが来る 1 场，
 * 让类型卡的「会える活動」= CFO 1 · 起業家 2 · エンジェル 1 · VC 2 · CVC 1 · 弁護士 0（同 web.html PER.evn）。
 */
const SERIES_A_EVENTS = (): PlanEventFact[] => [
  // 顺序照 web.html EVREC（SaaS Summit 82 > CFO Night 74 > 大阪 68）：分数由规则算，只把事实调到这个顺序。
  fact("fx-a-ev-saas-summit", "Japan SaaS Summit 2026 秋", jst("2026-10-16"), "東京国際フォーラム", { exchangeCorner: true, expected: { cvc: 4, funded_founder: 12, vc_partner: 5 }, fee: 15000, firstDegree: 2, matching: true, nameTags: true, networkingMinutes: 45, travelMinutes: 30 }),
  fact("fx-a-ev-cfo-night", "CFO Night Tokyo vol.18", `${today()}T19:00:00+09:00`, "渋谷ストリーム", { expected: { cfo: 10, vc_partner: 2 }, fee: 3000, firstDegree: 1, nameTags: true, networkingMinutes: 60, travelMinutes: 25 }),
  fact("fx-a-ev-dx-osaka", "製造業DXカンファレンス 大阪", jst("2026-10-23"), "グランフロント大阪", { attendeeSource: "organizer", expected: { cvc: 3 }, fee: 0, networkingMinutes: 30, travelMinutes: 150 }),
  fact("fx-a-ev-founders", "SaaS 創業者ミートアップ", jst("2026-10-20", "19:00"), "渋谷", { attendeeSource: "past", expected: { angel: 2, funded_founder: 6 }, fee: 0, firstDegree: 1, networkingMinutes: 60, travelMinutes: 20 }),
];

/** b4 CVC_EV / b12 CVC_E5（CVC Meetup Tokyo #12 · 製造業DXカンファレンス 大阪 · Japan SaaS Summit 2026 秋）。 */
const CVC_EVENTS = (): PlanEventFact[] => [
  fact("fx-a-ev-cvc-meetup", "CVC Meetup Tokyo #12", jst("2026-10-22", "19:00"), "大手町", { attendeeSource: "organizer", expected: { cvc: 14 }, fee: 3000, firstDegree: 1, nameTags: true, networkingMinutes: 60, travelMinutes: 20 }),
  fact("fx-a-ev-dx-osaka", "製造業DXカンファレンス 大阪", jst("2026-10-23"), "グランフロント大阪", { attendeeSource: "organizer", expected: { cvc: 9 }, fee: 0, networkingMinutes: 30, travelMinutes: 150 }),
  fact("fx-a-ev-saas-summit", "Japan SaaS Summit 2026 秋", jst("2026-10-16"), "東京国際フォーラム", { attendeeSource: "speakers", exchangeCorner: true, expected: { cvc: 4, funded_founder: 12, vc_partner: 5 }, fee: 15000, firstDegree: 2, networkingMinutes: 45, travelMinutes: 30 }),
];

/** 同名 fixture 的会える活動事实（键与上面的 fixture 名一致）。 */
export const eventFactsA: Record<string, PlanDesignEventFacts> = {
  "b12-206-premise": SERIES_A_EVENTS,
  "b12-208-pending": SERIES_A_EVENTS,
  "b12-222-law-skipped": SERIES_A_EVENTS,
  "b12-244-law": SERIES_A_EVENTS,
  "b4-11-type-vc": SERIES_A_EVENTS,
  "b4-13-type-cvc": CVC_EVENTS,
  "w16-overview-few": SERIES_A_EVENTS,
  "b8-overview-many": SERIES_A_EVENTS,
  "w17-overview-many": SERIES_A_EVENTS,
};

/**
 * 同名 fixture 在概要上要出「完了しましたか？」的 Step（web.html #17 / b12 W-R24-04c：Step 3，示例分数仍是 46，
 * 规则上 VC 2 / 3 还没达标——只在 mock 由 service-factory 补上，见 `withMockStepSuggestions`）。
 */
export const stepSuggestionsA: Record<string, readonly string[]> = {
  "w17-overview-many": ["demo-step-3"],
};
