/**
 * R37a 的设计稿示例 fixture：`plan-draft-v5-proposal.html`（v16）「计划主页 · 执行」页的三种目标（fund / sales / hire）。
 * 计划内容沿用 d.ts 的 v16 初稿（确定后的 v3 计划），人数按原型主页 `G[goal].types[i][5]`；「已在你的人脉里」= 原型 `t[8]` 的人
 * （关联到类型 + 计过分）；「先做的事」与准备卡 = 原型 `G[goal].now`（翻成日文），存 `plans.analysis.home`。只补数据，不改画面结构。
 *
 * 计划 id：`plan_v16_fund / _sales / _hire`。
 */
import type { PlanHomeAction, PlanMarkedText, PlanPrepCardView, PlanPrepDraft, PlanPrepRef, PlanPrepRow } from "../../../../shared/contract/plan-v2";
import { unitPoints } from "../../../../shared/compute/plan-allocation";
import type { StoredPlanHome, StoredPlanHomeAction } from "../../prep/types";
import type { MemoryPlanV2State } from "../repository";
import type { PlanAwardPayload, PlanV2ContactView, PlanV2LogEntry, PlanV2Row, PlanV2TypeItem } from "../types";
import { fromDemo, type PlanDesignFixture } from "./base";
import { contentOf, premiseOf, SPECS, type GoalSpec } from "./d";

export const E_PLAN_IDS = { fund: "plan_v16_fund", hire: "plan_v16_hire", sales: "plan_v16_sales" } as const;
type Goal = keyof typeof E_PLAN_IDS;

const AT = "2026-10-30T01:00:00.000Z";

/** 带下划线的开场白：片段拼接，`ref` 的片段画线。 */
function draft(segments: ReadonlyArray<string | [string, PlanPrepRef]>): PlanPrepDraft {
  let text = "";
  const refs: Array<{ start: number; end: number; ref: PlanPrepRef }> = [];
  for (const segment of segments) {
    if (typeof segment === "string") { text += segment; continue; }
    const start = text.length;
    text += segment[0];
    refs.push({ end: text.length, ref: segment[1], start });
  }
  return { refs, text };
}
const fact = (factId: string): PlanPrepRef => ({ factId, kind: "fact" });
const card = (field: string): PlanPrepRef => ({ field, kind: "card" });
const ans = (questionKey: string): PlanPrepRef => ({ kind: "answer", questionKey });

function reason(text: string, bold?: string): PlanMarkedText {
  const at = bold ? text.indexOf(bold) : -1;
  return { marks: bold && at >= 0 ? [{ end: at + bold.length, start: at }] : [], refs: [], text };
}

type Person = { id: string; name: string; note: string };
type Action = {
  key: string; kind: "contact" | "event"; contactId?: string; eventId?: string; typeKey: string | null; stepNumber: number; avatar: string; meta: string;
  title: string; reason: PlanMarkedText; rows: PlanPrepRow[]; facts: Array<{ id: string; text: string; date: string }>; hook: { label: string; reason: string }; draft: PlanPrepDraft;
  gaps: PlanPrepCardView["gaps"]; fallback?: boolean;
};

interface HomeSpec {
  /** 人数按原型主页（类型 key → 需要几位）。 */
  targetCounts: Record<string, number>;
  /** 已在人脉里（类型 key → 人）。 */
  found: Record<string, Person[]>;
  lead: string;
  actions: Action[];
}

const HOME: Record<Goal, HomeSpec> = {
  fund: {
    actions: [
      {
        avatar: "佐", contactId: "c_v16_sato", draft: draft(["佐藤さん、こんにちは。", ["去年 9 月の JETRO 起業交流会", card("met")], "で名刺を交換した X（", ["星橋テック", card("profile.organization")], "）です。そのとき", ["上海で 3 年働いていらした", fact("fx_sato_1")], "とうかがい、印象に残っています。いま資金調達の準備をしていて、", ["プロダクトは公開済みで、有料顧客はまだいません", ans("F3")], "。収益予測が甘くないかが一番の心配で、", ["元 CFO", card("who")], "の佐藤さんにご意見をいただけないでしょうか。30 分で十分です。"]),
        facts: [{ date: "2025-09-18", id: "fx_sato_1", text: "上海で 3 年働いていた話になった" }],
        gaps: ["interaction"], hook: { label: "前回の話から", reason: "メモに前回話した話題があります。最初にそれに触れると、相手も思い出しやすく、覚えていたことも伝わります。" },
        key: "c:c_v16_sato", kind: "contact", meta: "元 CFO · あなたの人脈",
        reason: reason("「公開済み、有料顧客はまだなし」と答えたので、投資家は収益予測の根拠を詳しく聞いてきます。名刺によると彼は CFO 経験者で、ここに一番詳しい人です。", "収益予測の根拠"),
        rows: [{ key: "who", source: "名刺", value: "元 CFO · ミライ会計（会計 / 財務）" }, { key: "met", source: "名刺の記録", value: "2025/09/18 に名刺を読み取り、関連イベント：JETRO 起業交流会" }, { key: "common", source: "あなたの資料 + メモ", value: "あなたは中国出身、相手は上海で働いていた" }],
        stepNumber: 1, title: "佐藤 健さんと財務モデルを話す", typeKey: "cfo",
      },
      {
        avatar: "山", contactId: "c_v16_yamamoto", draft: draft(["山本さん、こんにちは。", ["今年 5 月", card("met")], "に名刺を交換した X です。日本で中小企業向けの顧客管理 SaaS（", ["星橋テック", card("profile.organization")], "）をつくっています。", ["初めての資金調達", ans("F1")], "で一番不安なのが投資契約で、同じく", ["日本で SaaS を起業された", card("who")], "方に、弁護士の探し方や気をつける条項をうかがえればと思っています。オンラインで 20 分ほどいかがでしょうか。"]),
        facts: [], gaps: ["memo", "interaction"], hook: { label: "自己紹介と小さなお願い", reason: "情報が少ないときは距離を詰めすぎず、誰なのか、なぜ彼女なのか（役職が合う）を伝え、お願いを小さくします。" },
        key: "c:c_v16_yamamoto", kind: "contact", meta: "Co-founder · あなたの人脈",
        reason: reason("名刺によると彼女は HR SaaS の共同創業者で、あなたと同じく日本で SaaS を起業しています。契約の半分はまだ聞ける人がいません。", "HR SaaS の共同創業者"),
        rows: [{ key: "who", source: "名刺", value: "Co-founder · ワークリンク（HR SaaS）" }, { key: "met", source: "名刺の記録", value: "2026/05/14 に名刺を読み取り、関連イベントなし" }],
        stepNumber: 2, title: "山本 彩さんと初回調達の契約を話す", typeKey: "funded_founder",
      },
      {
        avatar: "🎟️", draft: draft(["X です。", ["星橋テック", card("profile.organization")], "で", ["越境 SaaS", card("profile.role")], "をやっていて、チームは 2 人です。今日は皆さんが最近どんな初期の案件に注目しているのかをうかがいたくて来ました。最近、これはと思った案件はありましたか。"]),
        eventId: "ev_v16_startup_night", facts: [], gaps: [], hook: { label: "先に聞いてから話す", reason: "まず相手が最近見ている案件を聞き、それから一言で自己紹介すると、いきなり製品の話をするより会話が続きます。" },
        key: "e:ev_v16_startup_night", kind: "event", meta: "渋谷 · 投資家と起業家の交流",
        reason: reason("イベント紹介に投資家と起業家の自由交流とあり、まず投資家が何を気にしているのかを聞くのに向いています。", "投資家と起業家の自由交流"),
        rows: [{ key: "when_where", source: "イベントページ", value: "11/12（水）19:00 · 渋谷" }, { key: "about", source: "イベントページ", value: "投資家と初期の起業家の自由交流会。ピッチの時間はなし" }, { key: "plan_fit", source: "—", value: "ステージ 1 で投資家の関心を知り、ステージ 2 で面談を申し込む" }],
        stepNumber: 1, title: "11/12 Startup Night に行ってみる", typeKey: null,
      },
    ],
    found: {
      cfo: [{ id: "c_v16_sato", name: "佐藤 健", note: "元 CFO · ある SaaS" }],
      funded_founder: [{ id: "c_v16_yamamoto", name: "山本 彩", note: "Co-founder · HR SaaS" }, { id: "c_v16_li", name: "李 明", note: "越境 SaaS 共同創業者" }],
      vc_partner: [{ id: "c_v16_tanaka", name: "田中 誠", note: "パートナー · ある VC" }],
    },
    lead: "この段階の目標は、投資家に聞かれても数字で答えられるようにすること。下の数件がいちばん始めやすく、助けになります。",
    targetCounts: { angel: 2, cfo: 1, cvc: 3, funded_founder: 3, lawyer: 1, vc_partner: 3 },
  },
  sales: {
    actions: [
      {
        avatar: "鈴", contactId: "c_v16_suzuki", draft: draft(["鈴木さん、こんにちは。", ["3 月の国際物流展", card("met")], "でお話しした X（", ["星橋テック", card("profile.organization")], "）です。そのとき", ["まだ Excel で顧客を管理している", fact("fx_suzuki_1")], "とうかがいました。私たちがつくっているのはまさにそのためのツールで、", ["すでに公開済み", ans("S1q")], "です。1 か月無料で試していただき、まず実際の状況をうかがえないでしょうか。来週 20 分ほどいかがですか。"]),
        facts: [{ date: "2026-03-05", id: "fx_suzuki_1", text: "まだ Excel で顧客を管理している" }],
        gaps: [], hook: { label: "相手が話した困りごと", reason: "相手が自分で困りごとを話しています。そこから入ると、覚えていたことも、本当に役に立てそうなことも伝わります。" },
        key: "c:c_v16_suzuki", kind: "contact", meta: "物流会社 代表 · あなたの人脈",
        reason: reason("メモに、まだ Excel で顧客を管理していると書いてあります。彼は代表なので、試用するかどうかをその場で決められます。", "まだ Excel で顧客を管理している"),
        rows: [{ key: "who", source: "名刺", value: "代表取締役 · 鈴木運輸（物流）" }, { key: "met", source: "名刺の記録", value: "2026/03/05 に名刺を読み取り、関連イベント：国際物流展" }, { key: "last_contact", source: "やりとりの記録", value: "2026/04/10 メールのやりとり" }],
        stepNumber: 1, title: "鈴木 隆さんと試用を話す", typeKey: "decision_maker",
      },
      {
        avatar: "高", contactId: "c_v16_takahashi", draft: draft(["高橋さん、こんにちは。", ["去年 11 月", card("met")], "に名刺を交換した X です。", ["営業チームの顧客管理を助けるツール", ans("S1q")], "をつくっていて、", ["営業部長", card("who")], "の高橋さんに、いま一番時間がかかっているのはどこかをうかがいたいです。売り込みではなく、実際の状況を聞くだけです。20 分で十分です。"]),
        facts: [], gaps: ["memo", "interaction"], hook: { label: "売り込まないと伝える", reason: "情報が少なく、売り込みを警戒されるかもしれません。来意をはっきりさせ「聞くだけ」と伝え、お願いを 20 分にします。" },
        key: "c:c_v16_takahashi", kind: "contact", meta: "製造業 営業部長 · あなたの人脈",
        reason: reason("製造業はあなたが答えた 2 つ目のターゲット業界で、彼女は営業部長として、チームがふだんどう顧客を管理しているかを一番よく知っています。", "営業部長"),
        rows: [{ key: "who", source: "名刺", value: "営業部長 · 高橋精機（製造業）" }, { key: "met", source: "名刺の記録", value: "2025/11/20 に名刺を読み取り、関連イベントなし" }],
        stepNumber: 1, title: "高橋 恵さんと顧客管理の方法を話す", typeKey: "decision_maker",
      },
      {
        avatar: "🎟️", draft: draft(["", ["星橋テック", card("profile.organization")], "です。", ["中小企業向けの顧客管理ツール", ans("S1q")], "をつくっていて、", ["すでに公開済み", ans("S1q")], "です。無料で試してくださる企業を 5 社探しています。まずうかがいたいのですが、御社はいまどうやって顧客を管理していますか。"]),
        eventId: "ev_v16_assoc", facts: [], gaps: [], hook: { label: "先に聞いてから話す", reason: "先に相手がいまどう顧客を管理し何に困っているかを聞き、それから自分の話をすると、資料を先に渡すより会話が続きます。" },
        key: "e:ev_v16_assoc", kind: "event", meta: "日本橋 · 会員企業の経営者",
        reason: reason("イベント紹介に会員企業の経営者と営業責任者が参加とあり、1 回で複数のターゲット企業に会えるので、ステージ 1 で一番手間がかかりません。", "会員企業の経営者と営業責任者"),
        rows: [{ key: "when_where", source: "イベントページ", value: "11/26（水）18:30 · 日本橋" }, { key: "about", source: "イベントページ", value: "協会会員企業の交流会。経営者と営業責任者が参加" }, { key: "plan_fit", source: "—", value: "ステージ 1 で試用客を探す。代理店はステージ 3 の Japan IT Week で" }],
        stepNumber: 1, title: "11/26 協会の交流会に行ってみる", typeKey: null,
      },
    ],
    found: {
      decision_maker: [{ id: "c_v16_suzuki", name: "鈴木 隆", note: "物流 · 代表" }, { id: "c_v16_takahashi", name: "高橋 恵", note: "製造業 · 営業部長" }],
      field_lead: [{ id: "c_v16_wang", name: "王 磊", note: "競合製品を 2 年使用" }],
      senior_seller: [{ id: "c_v16_nakamura", name: "中村 光", note: "業界メディア編集者" }],
    },
    lead: "この段階の目標は、試してくれる最初の顧客を見つけること。すでに知っている人から始めるのが一番速く、確実です。",
    targetCounts: { decision_maker: 5, field_lead: 3, industry_body: 1, introducer: 2, senior_seller: 2 },
  },
  hire: {
    actions: [
      {
        avatar: "小", contactId: "c_v16_kobayashi", draft: draft(["小林さん、こんにちは。", ["7 月の SaaS Meetup", card("met")], "でお会いした X（", ["星橋テック", card("profile.organization")], "）です。", ["スタートアップを試してみたい", fact("fx_kobayashi_1")], "とおっしゃっていたのを覚えています。いま日本で最初の事業責任者を探していて、", ["兼業から始めることもでき", ans("H1")], "、すぐに辞める必要はありません。ご意見をうかがいたく、20 分ほどいかがでしょうか。"]),
        facts: [{ date: "2026-07-09", id: "fx_kobayashi_1", text: "スタートアップを試してみたいと言っていた" }],
        gaps: ["interaction"], hook: { label: "前回の話から", reason: "スタートアップを試したいと本人が言っていて、あなたが出せるのはまさにそれ。相手が得られるものから話します。" },
        key: "c:c_v16_kobayashi", kind: "contact", meta: "事業開発 · あなたの人脈",
        reason: reason("メモに、スタートアップを試してみたいと言っていたとあり、名刺では事業開発を担当していて、探している人にぴったりです。", "スタートアップを試してみたい"),
        rows: [{ key: "who", source: "名刺", value: "事業開発 · 外資系 SaaS 企業" }, { key: "met", source: "名刺の記録", value: "2026/07/09 に名刺を読み取り、関連イベント：SaaS Meetup" }, { key: "common", source: "あなたの資料 + 名刺", value: "どちらも SaaS の業界" }],
        stepNumber: 1, title: "小林 翔さんと兼業参加を話す", typeKey: "candidate",
      },
      {
        avatar: "陈", contactId: "c_v16_chen", draft: draft(["陈静さん、こんにちは。", ["星橋テック", card("profile.organization")], "の X です。日本で SaaS をやっています。いま", ["リモートでエンジニアを 1〜2 人", ans("H1")], "採用しようとしていて、まずコミュニティのエンジニアが何を重視するのかをうかがいたいです。合いそうなら求人をコミュニティで共有させていただければ。オンラインで 20 分ほどいかがでしょうか。"]),
        facts: [], gaps: ["memo", "interaction"], hook: { label: "相手にも役立つと伝える", reason: "情報が少ないので、来意をはっきりさせ、求人がコミュニティの人にも機会になることを伝えます。" },
        key: "c:c_v16_chen", kind: "contact", meta: "コミュニティ運営 · あなたの人脈",
        reason: reason("名刺によると彼女は開発者コミュニティを運営していて、リモートのエンジニアが何を重視し、どこで採れるかを一番よく知っています。", "開発者コミュニティを運営"),
        rows: [{ key: "who", source: "名刺", value: "コミュニティ運営 · Viet Dev Community" }, { key: "met", source: "連絡先の記録", value: "2026/04/22 に追加、関連イベントなし" }, { key: "common", source: "あなたの資料 + 名刺", value: "どちらも中国語を話す" }],
        stepNumber: 2, title: "陈 静さんとリモート採用を話す", typeKey: "community_host",
      },
      {
        avatar: "🎟️", draft: draft(["", ["星橋テック", card("profile.organization")], "です。", ["日本に来たばかりの越境 SaaS チーム", card("profile.role")], "で、最初の事業責任者を探しています。うかがいたいのですが、この職種の年収相場はいまどのくらいでしょうか。"]),
        eventId: "ev_v16_hr", facts: [], gaps: [], hook: { label: "先に聞いてから話す", reason: "先に相場を聞いてから、自分が何を採用しているかを話すと、相手も本当の数字を教えてくれやすくなります。" },
        key: "e:ev_v16_hr", kind: "event", meta: "11/18 · 人事と人材紹介",
        reason: reason("「予算はまだ決めていない」と答えたので、人事と人材紹介の交流とあるこの会で、この職種の年収相場も聞けます。", "人事と人材紹介の交流"),
        rows: [{ key: "when_where", source: "イベントページ", value: "11/18（火）19:00 · 六本木" }, { key: "about", source: "イベントページ", value: "スタートアップの人事と人材紹介会社の交流会" }, { key: "plan_fit", source: "—", value: "ステージ 1 で予算を決める前に、市場の年収を知る" }],
        stepNumber: 1, title: "Startup HR Meetup に行ってみる", typeKey: null,
      },
    ],
    found: {
      candidate: [{ id: "c_v16_kobayashi", name: "小林 翔", note: "元外資 SaaS · 事業開発" }],
      community_host: [{ id: "c_v16_chen", name: "陈 静", note: "ベトナム開発者コミュニティ" }],
    },
    lead: "この段階の目標は、日本で最初の事業責任者を見つけること。兼業から始め、調達後に正社員に切り替えます。",
    targetCounts: { candidate: 3, community_host: 2, recruiter: 2, senior_peer: 1 },
  },
};

function prepOf(action: Action): PlanPrepCardView {
  return {
    draft: action.draft, fallback: action.fallback ?? false, gaps: action.gaps, generatedAt: AT, hook: action.hook, rows: action.rows, staleSince: null,
    usedAnswers: action.draft.refs.flatMap((span) => (span.ref.kind === "answer" ? [span.ref.questionKey] : [])),
    usedFacts: action.facts.map((item) => ({ date: item.date, id: item.id, memoId: `memo_${item.id}`, text: item.text })),
  };
}

function homeOf(spec: HomeSpec): StoredPlanHome {
  const actions: StoredPlanHomeAction[] = spec.actions.map((action): StoredPlanHomeAction => {
    const view: Omit<PlanHomeAction, "prep"> = {
      actionKey: action.key, avatar: action.avatar, contactId: action.contactId ?? null, done: false, eventId: action.eventId ?? null, kind: action.kind,
      meta: action.meta, reason: action.reason, stepNumber: action.stepNumber, title: action.title, typeKey: action.typeKey,
    };
    return { ...view, doneAt: null, prep: prepOf(action), regenerations: 0 };
  });
  return { actions, candidateSignature: "fixture", initialCalls: 4, lead: spec.lead, startedAt: AT, state: "ready", updatedAt: AT, version: 1 };
}

function planState(goal: Goal): Pick<MemoryPlanV2State, "plans" | "typeItems" | "log" | "contacts"> {
  const spec: GoalSpec = SPECS[goal];
  const home = HOME[goal];
  const planId = E_PLAN_IDS[goal];
  const content = contentOf(spec);
  const typeItems: PlanV2TypeItem[] = content.personTypes.map((type, index) => {
    const found = home.found[type.key] ?? [];
    return {
      allocation: type.allocation,
      contactLinks: found.map((person) => ({ contactId: person.id, establishedAt: null, linkedAt: AT, state: "linked" as const })),
      createdAt: AT,
      id: `${planId}_${type.key}`,
      personType: { countRule: type.countRule, emoji: type.emoji, introRoutes: [], key: type.key, opener: null, persona: null, questions: [...type.questions], recognizeHints: [...type.recognizeHints], shortLabelId: type.shortLabelId, stepKey: type.stepKey ?? null, why: type.why },
      planId,
      primaryIndustryId: null,
      roleSituation: type.roleSituation,
      secondaryIndustryId: null,
      shortLabel: type.shortLabel,
      skippedAt: null,
      slot: type.slot,
      sortKey: index + 1,
      targetCount: home.targetCounts[type.key] ?? type.targetCount,
      updatedAt: AT,
    };
  });
  // 已在人脉里的人都计过 base 分（分数 = Σ 分量 × min(已认识, 需要) / 需要，与原型头部一致）。
  const log: PlanV2LogEntry[] = typeItems.flatMap((type) => (home.found[type.personType.key] ?? []).slice(0, type.targetCount).map((person, index) => {
    const points = unitPoints(type.allocation, type.targetCount)[index] ?? 0;
    const payload: PlanAwardPayload = { anonymous: false, basis: "talked", contactId: person.id, eventId: null, part: "base", points, typeKey: type.personType.key };
    return { author: "user" as const, body: `${type.shortLabel}：+${points}`, createdAt: AT, event: "score_awarded" as const, id: `${planId}_award_${person.id}`, idempotencyKey: `fixture:${planId}:${person.id}`, itemId: type.id, linkedContactIds: [person.id], linkedEventId: null, payload: payload as unknown as Record<string, unknown>, planId };
  }));
  const contacts: PlanV2ContactView[] = [
    ...Object.values(home.found).flat().map((person) => ({ id: person.id, isOrbitUser: false, lastInteractionAt: null, name: person.name, organization: person.note.split(" · ")[1] ?? null, role: person.note.split(" · ")[0] ?? null })),
  ];
  const { personTypes: _types, event, steps: planSteps, ...analysis } = content;
  const plan: PlanV2Row = {
    achievedAt: null,
    analysis: { ...analysis, home, schemaVersion: 3 } as unknown as PlanV2Row["analysis"],
    archivedAt: null,
    createdAt: AT,
    creationKey: `fixture-${planId}`,
    eventAllocation: event.allocation,
    eventTargetCount: event.targetCount,
    goalId: `goal_${planId}`,
    goalKind: spec.goalKind,
    goalText: spec.goalText,
    id: planId,
    lastOpenedAt: null,
    manualEditAvailable: true,
    premise: premiseOf(spec),
    purposeLevel: 2,
    purposeText: spec.purpose,
    revision: 1,
    startsOn: "2026-10-30",
    status: "active",
    steps: planSteps.map(({ completedAt: _completed, ...item }) => item),
    updatedAt: AT,
    version: 10 + Object.keys(E_PLAN_IDS).indexOf(goal),
  };
  // home 存的是 StoredPlanHome（带内部字段）。
  (plan.analysis as unknown as { home: StoredPlanHome }).home = homeOf(home);
  return { contacts, log, plans: [plan], typeItems };
}

function withPlans(goals: readonly Goal[]): PlanDesignFixture {
  return fromDemo((state) => {
    for (const goal of goals) {
      const part = planState(goal);
      state.plans = [...(state.plans ?? []), ...part.plans];
      state.typeItems = [...(state.typeItems ?? []), ...part.typeItems];
      state.log = [...(state.log ?? []), ...part.log];
      state.contacts = [...(state.contacts ?? []), ...part.contacts];
    }
    state.maxVersion = 20;
  });
}

export const fixturesE: Record<string, PlanDesignFixture> = {
  /** 门禁用：三份一起（W-R37a-*）。 */
  "v16-home-all": withPlans(["fund", "sales", "hire"]),
  "v16-home-fund": withPlans(["fund"]),
  "v16-home-hire": withPlans(["hire"]),
  "v16-home-sales": withPlans(["sales"]),
};
