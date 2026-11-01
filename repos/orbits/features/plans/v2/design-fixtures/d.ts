/**
 * R36a 的设计稿示例 fixture：`docs/designs/redesign-2026-10/plan-draft-v5-proposal.html`（计划初稿 v16）「初稿 · 确认」页的三种目标
 * （fund / sales / hire ↔ fundraising / sales / hiring），数据照原型 `G[goal]` 的数值与条数（来源数、阶段数、类型数、分量、人数、
 * 关键数字、风险条数）翻成日文；`sources` 含业界现状库（landscape）与网页（web）两种。只补数据，不改画面结构。
 *
 * intake：`intake_v16_fund / _sales / _hire`（status drafted）；draft：`draft_v16_*`（schemaVersion 3）。
 * 原型的来源编号是顺序号（对比条第 i 行 = 来源 i、关键数字接着编），这里按同样顺序给 sourceIds，门禁里数字就对得上。
 */
import type { PlanComparison, PlanGoalKind, PlanIntakeQuestion, PlanKeyNumber, PlanMarkedText, PlanPremiseRow, PlanRef, PlanRisk, PlanSource, PlanV2Step } from "../../../../shared/contract/plan-v2";
import type { PlanDraftContent, PlanDraftPersonType, PlanDraftRow, PlanFlowStepRecord, PlanIntakeRow } from "../types";
import { fromDemo, type PlanDesignEventFacts, type PlanDesignFixture } from "./base";

export const D_FLOW_IDS = {
  fund: { draft: "draft_v16_fund", intake: "intake_v16_fund" },
  hire: { draft: "draft_v16_hire", intake: "intake_v16_hire" },
  sales: { draft: "draft_v16_sales", intake: "intake_v16_sales" },
} as const;

const AT = "2026-10-28T01:00:00.000Z";
/** 网页来源的抓取时间：一条超过 180 天（「更新の可能性あり」的样例），其余近期。 */
const FETCHED = "2026-10-27T09:00:00.000Z";
const FETCHED_OLD = "2026-03-20T09:00:00.000Z";

const step = (state: PlanFlowStepRecord["state"] = "done"): PlanFlowStepRecord => ({ at: state === "none" ? null : AT, attempts: state === "none" ? 0 : 1, limit: null, operationId: null, retryOn: null, state });

/** 理由段：按片段拼成 `PlanMarkedText`（加粗 = 片段内子串，引用范围 = 该片段；没有引用的片段只接文字）。 */
function marked(segments: ReadonlyArray<{ text: string; bold?: string; ref?: PlanRef }>): PlanMarkedText {
  let text = "";
  const marks: Array<{ start: number; end: number }> = [];
  const refs: Array<{ start: number; end: number; ref: PlanRef }> = [];
  for (const segment of segments) {
    const start = text.length;
    text += segment.text;
    const end = text.length;
    if (segment.bold) {
      const at = segment.text.indexOf(segment.bold);
      if (at >= 0) marks.push({ end: start + at + segment.bold.length, start: start + at });
    }
    if (segment.ref) refs.push({ end, ref: segment.ref, start });
  }
  return { marks, refs, text };
}

const source = (id: string) => ({ kind: "source", sourceId: id } as const);
const answer = (questionKey: string) => ({ kind: "answer", questionKey } as const);
const web = (id: string, title: string, url: string, query: string, fetchedAt = FETCHED): PlanSource => ({ fetchedAt, id, kind: "web", query, snippet: `${title}（抜粋）`, title, url });
const landscape = (id: string, landscapeId: string): PlanSource => ({ id, kind: "landscape", landscapeId, version: 1 });

type TypeSpec = { slot: string; emoji: string; shortLabel: string; roleSituation: string; targetCount: number; allocation: number; stepKey: string; questions: [string, string, string] };

function personType(spec: TypeSpec): PlanDraftPersonType {
  return {
    allocation: spec.allocation, countRule: "目標について話せたら 1 人", emoji: spec.emoji, introRoutes: [], itemId: spec.slot, key: spec.slot, opener: null, persona: null,
    questions: [...spec.questions], recognizeHints: [spec.shortLabel], roleSituation: spec.roleSituation, shortLabel: spec.shortLabel, shortLabelId: spec.slot, slot: spec.slot,
    stepKey: spec.stepKey, targetCount: spec.targetCount, why: "",
  };
}

type StepSpec = { key: string; title: string; why: string; doneCriteria: string; personTypeKeys: string[] };
const steps = (list: StepSpec[]): PlanV2Step[] => list.map((item) => ({ doneCriteria: item.doneCriteria, key: item.key, personTypeKeys: item.personTypeKeys, title: item.title, why: item.why }));

interface GoalSpec {
  goalKind: PlanGoalKind;
  goalText: string;
  purpose: string;
  me: { headline: string; name: string; wants: string };
  answers: Array<{ id: string; label: string; value: string }>;
  outcome: string;
  conclusion: string;
  summary: PlanMarkedText;
  verdict: "feasible" | "conditional" | "not_recommended";
  confidence: { level: "high" | "mid" | "low"; reason: string };
  steps: StepSpec[];
  types: TypeSpec[];
  event: { allocation: number; targetCount: number };
  orderReasons: Array<{ text: string; sourceIds: string[] }>;
  comparison: PlanComparison;
  keyNumbers: PlanKeyNumber[];
  risks: PlanRisk[];
  sources: PlanSource[];
}

function premiseOf(spec: GoalSpec): PlanPremiseRow[] {
  return [
    { guessed: false, key: "purpose", label: "目的", source: "background", value: spec.purpose },
    { guessed: false, key: "team", label: "チーム", source: "background", value: "2 名 · 本業と並行" },
    ...spec.answers.map((item, index) => ({ guessed: false, key: item.id, label: item.label, source: `q${index + 1}` as PlanPremiseRow["source"], value: item.value })),
  ];
}

function intakeOf(spec: GoalSpec, id: string, draftId: string): PlanIntakeRow {
  const questions: PlanIntakeQuestion[] = spec.answers.map((item) => ({ guess: { text: item.value, values: [] }, id: item.id, why: `${item.label}でプランの分かれ目が変わるため` }));
  return {
    aiSteps: { background: step(), draft: step(), draftId, ladder: step("none"), ladderCount: 0, members: step("none"), premiseVersion: 1, questions: step() },
    answers: spec.answers.map((item) => ({ guessed: false, questionId: item.id, text: item.value, values: [] })),
    background: {
      me: { confirmedAt: AT, value: { headline: spec.me.headline, name: spec.me.name, stance: "owner", wants: spec.me.wants } },
      purpose: { confirmedAt: AT, value: { reason: null, rungs: [{ level: 2, text: spec.purpose }, { level: 1, text: spec.goalText }], selectedLevel: 2, suggestedLevel: 2 } },
      reading: [{ detail: `${spec.me.name} · ${spec.me.headline}`, kind: "profile" }, { detail: spec.goalText, kind: "goal" }],
      team: { confirmedAt: AT, value: { members: [{ basis: null, capabilities: ["product"], contactId: null, headline: spec.me.headline, isSelf: true, memberId: "self", name: spec.me.name, otherCapabilities: [], relation: null, source: "profile" }], mode: "solo" } },
    } as PlanIntakeRow["background"],
    createdAt: AT, goalKind: spec.goalKind, goalText: spec.goalText, id, planId: null,
    premise: premiseOf(spec),
    questions: { cacheKey: `fixture:v16:${spec.goalKind}`, items: questions, skipped: [] },
    source: "task", status: "drafted", updatedAt: AT,
  };
}

function contentOf(spec: GoalSpec): PlanDraftContent {
  const landscapeIds = spec.sources.flatMap((item) => (item.kind === "landscape" ? [{ id: item.landscapeId, version: item.version }] : []));
  return {
    allocationReasons: [],
    basis: [{ kind: "premise", label: `確定した前提 ${premiseOf(spec).length}件`, ref: "premise@1" }],
    citations: landscapeIds,
    comparison: spec.comparison,
    conclusion: spec.conclusion,
    confidence: spec.confidence,
    diagnosis: spec.summary.text,
    event: { ...spec.event },
    flow: [],
    keyNumbers: spec.keyNumbers,
    orderReasons: spec.orderReasons,
    outcome: spec.outcome,
    personTypes: spec.types.map(personType),
    risks: spec.risks,
    schemaVersion: 3,
    sources: spec.sources,
    steps: steps(spec.steps),
    summary: spec.summary,
    verdict: spec.verdict,
  };
}

function draftOf(spec: GoalSpec, id: string, intakeId: string): PlanDraftRow {
  const content = contentOf(spec);
  return {
    aiFixUsed: 0, baseRevision: null, confirmedAt: null, content, createdAt: AT, fix: step("none"), id, intakeId, kind: "initial", manualEditUsed: false,
    originContent: contentOf(spec), planId: null, premise: premiseOf(spec), premiseVersion: 1, status: "open", turns: [], updatedAt: AT,
  };
}

/* ---------- fund（融资）：6 類型 · 3 段階 · 来源 10 · 关键数字 3 · 风险 2 ---------- */
const FUND: GoalSpec = {
  answers: [
    { id: "F1", label: "資金調達の段階", value: "初めての調達、金額は未定" },
    { id: "F2", label: "チーム", value: "2 人" },
    { id: "F3", label: "プロダクト", value: "公開済み、有料顧客はまだなし" },
  ],
  comparison: {
    funnel: "日本の初期投資家 7 類型を「初回ラウンドに出資」と「海外チームを見る」で 5 類型に絞る",
    rows: [
      { label: "エンジェル投資家", score: 92, sourceIds: ["S1"], typeKey: "angel", verdict: "preferred" },
      { label: "VC シードファンド", score: 85, sourceIds: ["S2"], typeKey: "vc_partner", verdict: "preferred" },
      { label: "事業会社の投資", score: 60, sourceIds: ["S3"], typeKey: "cvc", verdict: "possible" },
      { label: "政策金融（融資）", score: 55, sourceIds: ["S4"], typeKey: null, verdict: "possible" },
      { label: "大型グロースファンド", score: 18, sourceIds: ["S5"], typeKey: null, verdict: "not_recommended" },
    ],
    title: "先に会う投資家",
  },
  conclusion: "まず財務と契約を整えてから、投資家に会うことを勧めます",
  confidence: { level: "mid", reason: "日本の初期資金調達の公開データは十分。ただし売上データがなく、投資家はチームと初期ユーザーを重視するため「中」。" },
  event: { allocation: 10, targetCount: 2 },
  goalKind: "fundraising",
  goalText: "初めての資金調達をしたい",
  keyNumbers: [
    { label: "2024 年の国内スタートアップ資金調達総額（円）", sourceIds: ["S6"], value: "7,793億" },
    { label: "新設 VC ファンドに占める事業会社系の割合", sourceIds: ["S7"], value: "36%" },
    { label: "開業資金のうち金融機関からの借入の割合", sourceIds: ["S8"], value: "67.9%" },
  ],
  me: { headline: "越境 SaaS 創業者 · 星橋テック", name: "王 星", wants: "最初の資金調達を決める" },
  orderReasons: [
    { sourceIds: ["S9"], text: "売上データがない段階では、投資家はまず収益予測と資金使途を聞く。ここが固まっていないと面談は 1 回目で止まる" },
    { sourceIds: ["S10"], text: "初めて調達するチームは優先清算や買戻しの条項で不利になりやすい。契約はタームシートに署名する前に確認する" },
    { sourceIds: ["S1"], text: "エンジェルとシードファンドはデータよりチームと初期ユーザーを見る。数字と契約を整えてから、この 2 類型に集中する" },
  ],
  outcome: "最初の資金調達を獲得する",
  purpose: "最初の資金調達を獲得する",
  risks: [
    { kind: "unverified", text: "日本のエンジェルの一般的な投資額はブログでしか確認できず、公的統計はない。" },
    { kind: "risk", text: "売上データがないため VC 面談が 1 回目で止まる可能性がある。ステージ 3 の利用データが鍵。" },
  ],
  sources: [
    landscape("S1", "L-101"),
    web("S2", "JVCA 年次統計", "https://example.org/jvca/stats", "JVCA 年次統計 シード"),
    web("S3", "METI 創業支援レポート", "https://example.org/meti/startup-support", "経産省 創業支援 レポート"),
    landscape("S4", "L-103"),
    web("S5", "JVCA 年次統計（ファンド規模別）", "https://example.org/jvca/stats-by-size", "JVCA ファンド規模"),
    web("S6", "INITIAL 2024 年報", "https://example.org/initial/2024", "スタートアップ 資金調達 総額 2024"),
    landscape("S7", "L-102"),
    web("S8", "日本政策金融公庫 新規開業実態調査", "https://example.org/jfc/survey", "新規開業 実態調査 資金"),
    web("S9", "初期投資家との面談でよく聞かれること（投資家ブログ）", "https://example.org/blog/first-meeting", "エンジェル 面談 質問"),
    web("S10", "種類株式・条項の解説（法律事務所コラム）", "https://example.org/law/preferred-shares", "優先株 条項 解説", FETCHED_OLD),
  ],
  steps: [
    { doneCriteria: "18 か月の資金使途表ができ、投資契約のひな形を弁護士に見てもらった", key: "s1", personTypeKeys: ["cfo", "lawyer"], title: "財務と法務を固める", why: "数字が追及に耐えるように" },
    { doneCriteria: "エンジェルかシードファンド 2 人と 2 回目の面談まで進む", key: "s2", personTypeKeys: ["funded_founder", "angel", "vc_partner"], title: "投資家と的を絞って対話", why: "広く浅くではなく、少なく深く" },
    { doneCriteria: "3 社が利用中で、利用データを示せる", key: "s3", personTypeKeys: ["cvc", "event"], title: "イベントで利用者を連れてくる", why: "ストーリーに証拠を足す" },
  ],
  summary: marked([
    { bold: "公開済みですが、有料顧客はまだいません", ref: answer("F3"), text: "あなたのプロダクトは公開済みですが、有料顧客はまだいません" },
    { bold: "収益予測と資金使途", ref: source("S9"), text: "。売上データがない段階で投資家が初回面談で最も聞くのは収益予測と資金使途" },
    { bold: "優先清算・買戻しなどの条項", ref: source("S10"), text: "。また初めて調達するチームは、投資契約の優先清算・買戻しなどの条項" },
    { text: "で不利になりがちです。どちらも準備に時間がかかるので、先に固めてから投資家に会うほうが自信を持って話せ、遠回りも減ります。" },
  ]),
  types: [
    { allocation: 10, emoji: "📊", questions: ["初回の投資家が最も聞く 3 つの数字は？", "日本の投資契約で不利になりやすい条項は？", "18 か月の資金使途はどう分ける？"], roleSituation: "厳しい資金調達で数字と資金計画を管理してきた人", shortLabel: "元 CFO", slot: "cfo", stepKey: "s1", targetCount: 1 },
    { allocation: 10, emoji: "⚖️", questions: ["シードでよく使う契約のひな形は？", "株式とオプションで先に準備することは？", "費用はどのくらい？"], roleSituation: "投資契約と会社設立の手続きを扱う弁護士", shortLabel: "投資契約の弁護士", slot: "lawyer", stepKey: "s1", targetCount: 1 },
    { allocation: 15, emoji: "🧗", questions: ["最初の投資意向書はどう取った？", "先に会うべき投資家は誰？", "ピッチ資料で一番大事なページは？"], roleSituation: "日本でゼロからシードラウンドを終えた起業家", shortLabel: "調達経験のある起業家", slot: "funded_founder", stepKey: "s2", targetCount: 2 },
    { allocation: 20, emoji: "👼", questions: ["初期案件で最も重視することは？", "一般的な投資額と条件は？", "ほかに興味を持ちそうな人は？"], roleSituation: "少額の資金と紹介で新しいチームを支える個人", shortLabel: "エンジェル投資家", slot: "angel", stepKey: "s2", targetCount: 2 },
    { allocation: 20, emoji: "🏦", questions: ["今年のシードの投資ペースは？", "日本展開で最も見たい証拠は？", "次の面談までに準備することは？"], roleSituation: "シードで日本展開力を評価するファンドのパートナー", shortLabel: "VC パートナー", slot: "vc_partner", stepKey: "s2", targetCount: 2 },
    { allocation: 15, emoji: "🏢", questions: ["いま探している事業連携は？", "試験導入の決裁にかかる期間は？", "投資と連携はどちらを先に話す？"], roleSituation: "新しい事業の場を探している企業投資部門の責任者", shortLabel: "事業会社の投資担当", slot: "cvc", stepKey: "s3", targetCount: 3 },
  ],
  verdict: "feasible",
};

/* ---------- sales（开拓客户）：5 類型 · 3 段階 · 来源 7 · 关键数字 3 · 风险 2 ---------- */
const SALES: GoalSpec = {
  answers: [
    { id: "S1q", label: "プロダクト", value: "中小企業向け顧客管理ツール、公開済み" },
    { id: "S2q", label: "ターゲット", value: "物流・製造業の中小企業" },
    { id: "S3q", label: "営業の人手", value: "自分 1 人だけ" },
  ],
  comparison: {
    funnel: "使えるチャネル 6 種を「3 か月以内に決裁者に会える」で 4 種に絞る",
    rows: [
      { label: "業界展示会", score: 90, sourceIds: ["S1"], typeKey: null, verdict: "preferred" },
      { label: "知人の紹介", score: 86, sourceIds: ["S2"], typeKey: "decision_maker", verdict: "preferred" },
      { label: "代理店", score: 58, sourceIds: ["S3"], typeKey: "introducer", verdict: "possible" },
      { label: "オンライン広告", score: 20, sourceIds: ["S4"], typeKey: null, verdict: "not_recommended" },
    ],
    title: "先に攻めるチャネル",
  },
  conclusion: "まず 5 社の試用を取り、代理店で広げることを勧めます",
  confidence: { level: "mid", reason: "展示会と代理店の情報は十分。ただし日本での事例がまだなく、転換率は同種 SaaS の参考値しかないため「中」。" },
  event: { allocation: 10, targetCount: 2 },
  goalKind: "sales",
  goalText: "日本で最初の顧客を開拓したい",
  keyNumbers: [
    { label: "日本の企業数に占める中小企業の割合", sourceIds: ["S5"], value: "99.7%" },
    { label: "中小企業が新しいツールを採用するまでの決裁期間", sourceIds: ["S6"], value: "約 3 か月" },
    { label: "Japan IT Week 秋 前回の来場者数", sourceIds: ["S7"], value: "2.1万" },
  ],
  me: { headline: "越境 SaaS 創業者 · 星橋テック", name: "王 星", wants: "5 社の試用と公開事例を 1 件つくる" },
  orderReasons: [
    { sourceIds: ["S6"], text: "中小企業の新ツール採用は平均約 3 か月。営業が 1 人なら、5 社に集中するほうが広く当たるより早く結果が出る" },
    { sourceIds: ["S3"], text: "代理店は事例がないと新製品を扱わない。だから事例はチャネルより先" },
    { sourceIds: ["S1"], text: "業界展示会と知人の紹介は 3 か月以内に決裁者に会える。最初に置く" },
  ],
  outcome: "5 社が試用し、公開できる事例が 1 件できる",
  purpose: "5 社が試用し、公開できる事例が 1 件できる",
  risks: [
    { kind: "unverified", text: "代理店の分配率 20〜30% は同種 SaaS へのヒアリングによるもので、業界差が大きい。" },
    { kind: "risk", text: "最初の 5 社で公開できる事例が作れないと、ステージ 3 で止まる。" },
  ],
  sources: [
    web("S1", "日本展示会協会 来場者統計", "https://example.org/jea/visitors", "展示会 来場者 統計"),
    web("S2", "同種 SaaS へのヒアリング（3 社）", "https://example.org/notes/saas-interviews", "SaaS 中小企業 紹介 営業"),
    web("S3", "同種 SaaS へのヒアリング（代理店）", "https://example.org/notes/saas-interviews-reseller", "SaaS 代理店 分配率"),
    web("S4", "Web 広告効果レポート（広告プラットフォーム）", "https://example.org/ads/report", "中小企業 Web 広告 効果"),
    landscape("S5", "L-203"),
    web("S6", "中小企業庁 IT 導入実態調査", "https://example.org/chusho/it-survey", "中小企業 IT 導入 決裁 期間"),
    web("S7", "Japan IT Week 公式 前回開催データ", "https://example.org/japan-it-week/data", "Japan IT Week 来場者数"),
  ],
  steps: [
    { doneCriteria: "5 社が試用を始める", key: "s1", personTypeKeys: ["decision_maker", "industry_body"], title: "試用客を見つける", why: "展示会 + 紹介" },
    { doneCriteria: "少なくとも 1 社が導入効果の公開に同意する", key: "s2", personTypeKeys: ["field_lead", "senior_seller"], title: "事例をつくる", why: "人に見せられる形に" },
    { doneCriteria: "代理店 1 社と契約するか、協会で 1 回登壇する", key: "s3", personTypeKeys: ["introducer", "event"], title: "チャネルで広げる", why: "代理店と協会" },
  ],
  summary: marked([
    { bold: "営業はあなた 1 人", ref: answer("S3q"), text: "あなたのプロダクトは公開済みで、ターゲットは物流・製造業の中小企業ですが、営業はあなた 1 人" },
    { bold: "約 3 か月", ref: source("S6"), text: "です。中小企業が新しいツールを採用するまで平均約 3 か月" },
    { text: "かかり、1 人で多くの顧客を同時に追うのは難しい。だからまず 5 社の試用に集中し、人に見せられる事例をつくってから、代理店の人手で広げることを勧めます。" },
  ]),
  types: [
    { allocation: 25, emoji: "🧭", questions: ["いま顧客管理に使っているツールは？", "前回ツールを替えたとき誰が決めた？", "1 か月の試用で一番見たいことは？"], roleSituation: "従業員 30〜300 人で、効率化ツールを探している経営者や事業責任者", shortLabel: "中小企業の経営者", slot: "decision_maker", stepKey: "s1", targetCount: 5 },
    { allocation: 20, emoji: "🏛️", questions: ["会員企業が最近いちばん困っていることは？", "協会にツールを紹介する仕組みは？", "交流会で 5 分話せる？"], roleSituation: "会員企業を紹介できる協会の事務局や理事", shortLabel: "業界団体の責任者", slot: "industry_body", stepKey: "s1", targetCount: 1 },
    { allocation: 15, emoji: "🧑‍💼", questions: ["競合製品でいちばん使いにくかった点は？", "当時それを選んだ理由は？", "乗り換えの壁は何？"], roleSituation: "競合製品を使い、どこが使いにくいか知っている現場責任者", shortLabel: "同種ツールの利用者", slot: "field_lead", stepKey: "s2", targetCount: 3 },
    { allocation: 15, emoji: "📣", questions: ["レビュー対象の製品はどう選ぶ？", "読者が好む事例は？", "合うセミナーはある？"], roleSituation: "レビューを書いたりセミナーを開く編集者や KOL", shortLabel: "業界メディア", slot: "senior_seller", stepKey: "s2", targetCount: 2 },
    { allocation: 15, emoji: "🤝", questions: ["新製品を扱うとき見る 3 点は？", "分配はふつうどう決める？", "最初にどの顧客で試す？"], roleSituation: "大企業にソフトウェアを販売する代理店の責任者", shortLabel: "代理店", slot: "introducer", stepKey: "s3", targetCount: 2 },
  ],
  verdict: "feasible",
};

/* ---------- hire（招聘）：4 類型 · 3 段階 · 来源 5 · 关键数字 2 · 风险 2 ---------- */
const HIRE: GoalSpec = {
  answers: [
    { id: "H1", label: "採用したい人", value: "日本の事業責任者 1 名 + エンジニア" },
    { id: "H2", label: "予算", value: "まだ決めていない" },
    { id: "H3", label: "ビザ", value: "まだわからない" },
  ],
  comparison: {
    funnel: "採用方法 5 種を「3 か月以内に入社」と「予算」で 3 種に絞る",
    rows: [
      { label: "兼業・顧問", score: 88, sourceIds: ["S1"], typeKey: "candidate", verdict: "preferred" },
      { label: "知人紹介で正社員", score: 60, sourceIds: ["S2"], typeKey: "community_host", verdict: "possible" },
      { label: "人材紹介で正社員", score: 22, sourceIds: ["S3"], typeKey: "recruiter", verdict: "not_recommended" },
    ],
    title: "最初の 1 人をどう採るか",
  },
  conclusion: "まず兼業で日本の事業責任者を迎え、エンジニアはリモートで採ることを勧めます",
  confidence: { level: "low", reason: "採用市場のデータは十分。ただし予算もビザも未定で、計画が進むかはこの 2 つ次第なので「条件付きで可能」、信心は「低」。" },
  event: { allocation: 10, targetCount: 2 },
  goalKind: "hiring",
  goalText: "日本の事業責任者とエンジニアを採用したい",
  keyNumbers: [
    { label: "日本の有効求人倍率（2025 年）", sourceIds: ["S4"], value: "1.28倍" },
    { label: "B2B 事業開発の一般的な年収（円）", sourceIds: ["S5"], value: "800〜1200万" },
  ],
  me: { headline: "越境 SaaS 創業者 · 星橋テック", name: "王 星", wants: "日本の事業責任者とエンジニアを迎える" },
  orderReasons: [
    { sourceIds: ["S5"], text: "予算もビザも未定で、正社員の年収 800〜1200 万円の約束はいま出せない。兼業で始めれば双方の敷居が低い" },
    { sourceIds: ["S4"], text: "有効求人倍率 1.28 倍で良い事業人材は取り合い。先に入ってもらい、あとで正社員に切り替えるほうが調達後に探すより早い" },
    { sourceIds: ["S2"], text: "エンジニアのリモート採用はビザの制約を受けず費用も低い。事業責任者探しと並行できる" },
  ],
  outcome: "日本の事業責任者とリモートのエンジニアを採用する",
  purpose: "日本の事業責任者とリモートのエンジニアを採用する",
  risks: [
    { kind: "unverified", text: "年収レンジは求人サイト 2 社のサンプルによるもので、母数は多くない。" },
    { kind: "risk", text: "兼業の責任者の稼働が足りないとステージ 1 が遅れる。週の最低時間を決めておく。" },
  ],
  sources: [
    web("S1", "スタートアップの採用ヒアリング（4 社）", "https://example.org/notes/hiring-interviews", "スタートアップ 採用 兼業"),
    web("S2", "スタートアップの採用ヒアリング（リモート）", "https://example.org/notes/hiring-interviews-remote", "エンジニア リモート採用"),
    web("S3", "人材紹介の手数料率（公開資料 2 社）", "https://example.org/agents/fees", "人材紹介 手数料 相場"),
    landscape("S4", "L-401"),
    web("S5", "求人サイトの年収サンプル（2 社）", "https://example.org/jobs/salary-sample", "事業開発 年収 相場"),
  ],
  steps: [
    { doneCriteria: "兼業の事業責任者 1 人が毎週決まった時間で動き始める", key: "s1", personTypeKeys: ["candidate", "recruiter"], title: "事業責任者を見つける", why: "兼業から始める" },
    { doneCriteria: "リモートのエンジニア 1〜2 人が着任する", key: "s2", personTypeKeys: ["community_host", "event"], title: "リモートでエンジニアを補う", why: "コストを抑える" },
    { doneCriteria: "資金が入ったら、事業責任者が正社員に切り替わる", key: "s3", personTypeKeys: ["senior_peer"], title: "日本の正社員チーム", why: "調達後に採る" },
  ],
  summary: marked([
    { bold: "予算とビザはまだ決まっていません", ref: answer("H2"), text: "あなたは日本の事業責任者とエンジニアを採りたいが、予算とビザはまだ決まっていません" },
    { bold: "1.28 倍", ref: source("S4"), text: "。日本の有効求人倍率は 1.28 倍" },
    { bold: "800〜1200 万円", ref: source("S5"), text: "で、良い事業人材は取り合いになっており、正社員の年収は 800〜1200 万円" },
    { text: "が相場です。だからまず兼業で双方の敷居を下げ、エンジニアはリモートで採ってコストを抑え、資金調達後に正社員へ切り替えることを勧めます。" },
  ]),
  types: [
    { allocation: 40, emoji: "🧭", questions: ["初期チームで一番やりたいことは？", "兼業からの開始は受け入れられる？", "ほかに合いそうな人はいる？"], roleSituation: "日本で B2B の事業開拓をしてきて、初期チームに入りたい人", shortLabel: "事業責任者の候補", slot: "candidate", stepKey: "s1", targetCount: 3 },
    { allocation: 10, emoji: "🔎", questions: ["この職種の今の年収相場は？", "スタートアップが候補者を動かすには？", "費用はどう決まる？"], roleSituation: "外資とスタートアップ専門の採用コンサルタント", shortLabel: "人材エージェント", slot: "recruiter", stepKey: "s1", targetCount: 2 },
    { allocation: 20, emoji: "💻", questions: ["リモートのエンジニアが最も気にすることは？", "リモート採用でよくある失敗は？", "コミュニティで求人を出せる？"], roleSituation: "海外エンジニアのコミュニティを運営する主宰者", shortLabel: "リモート開発者コミュニティ", slot: "community_host", stepKey: "s2", targetCount: 2 },
    { allocation: 20, emoji: "⚖️", questions: ["兼業から正社員への切り替えで注意することは？", "外国籍社員のビザはどのくらいかかる？", "社会保険はいつから？"], roleSituation: "雇用契約・社会保険・ビザを扱う社会保険労務士", shortLabel: "社会保険労務士", slot: "senior_peer", stepKey: "s3", targetCount: 1 },
  ],
  verdict: "conditional",
};

const SPECS: Record<keyof typeof D_FLOW_IDS, GoalSpec> = { fund: FUND, hire: HIRE, sales: SALES };

function fixtureFor(name: keyof typeof D_FLOW_IDS): PlanDesignFixture {
  const spec = SPECS[name];
  const ids = D_FLOW_IDS[name];
  return fromDemo((state) => {
    state.intakes = [...(state.intakes ?? []), intakeOf(spec, ids.intake, ids.draft)];
    state.drafts = [...(state.drafts ?? []), draftOf(spec, ids.draft, ids.intake)];
  });
}

export const fixturesD: Record<string, PlanDesignFixture> = {
  /** 门禁用：三份一起（六张画面并行跑，不用来回切 fixture）。 */
  "v16-all": fromDemo((state) => {
    for (const name of ["fund", "sales", "hire"] as const) {
      state.intakes = [...(state.intakes ?? []), intakeOf(SPECS[name], D_FLOW_IDS[name].intake, D_FLOW_IDS[name].draft)];
      state.drafts = [...(state.drafts ?? []), draftOf(SPECS[name], D_FLOW_IDS[name].draft, D_FLOW_IDS[name].intake)];
    }
  }),
  /** v16「初稿 · 确认」融资（W-R36a-fund）。 */
  "v16-fund": fixtureFor("fund"),
  /** v16「初稿 · 确认」招聘（W-R36a-hire）。 */
  "v16-hire": fixtureFor("hire"),
  /** v16「初稿 · 确认」开拓客户（W-R36a-sales）。 */
  "v16-sales": fixtureFor("sales"),
};

export const eventFactsD: Record<string, PlanDesignEventFacts> = {};
