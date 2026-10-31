/**
 * R23 计划生成流程的 mock AI（DESIGN §5.1「mock 先行」）：输入相同 → 输出相同；不记账、不联网。
 * 授权前与开发、测试默认用它；输出与真实实现过同一组校验（`schemas.ts`），保证界面拿到的形状一致。
 */
import { PLAN_GOAL_KIND_COPY, PLAN_SHORT_NAME_COPY, planCopy, type PlanCopyLanguage } from "../../../../shared/compute/plan-template-copy";
import { guessGoalKindByKeywords, PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES } from "../../../../shared/compute/plan-templates";
import type { PlanGoalKind } from "../../../../shared/contract/plan-v2";
import { ruleQuestions, stableNumber } from "./rules";
import type { BackgroundOutput, DraftOutput, DraftOutputV3, DraftSummarySentence, FirstDraftInputV3, FixOutput, LadderOutput, PlanAiOutcome, PlanFlowAi } from "./types";

type Tri = Record<PlanCopyLanguage, string>;
const pick = (text: Tri, language: PlanCopyLanguage) => text[language];
const ok = <T>(value: T): PlanAiOutcome<T> => ({ ok: true, operationId: null, value });

function mockLadder(goalText: string, wants: string, kind: PlanGoalKind, language: PlanCopyLanguage): LadderOutput {
  const field = planCopy(PLAN_GOAL_KIND_COPY[kind], language);
  const rungs: Array<{ level: number; text: Tri }> = [
    { level: 4, text: { en: `Become a name people think of in ${field}`, ja: `${field}の分野で、名前を挙げてもらえる存在になる`, zh: `在${field}领域成为大家会想到的名字` } },
    { level: 3, text: { en: `Turn "${wants}" into something that lasts`, ja: `「${wants}」を、続けられる形にする`, zh: `把「${wants}」做成能持续的样子` } },
    { level: 1, text: { en: "Take the first concrete step within a few months", ja: "数か月で、最初の具体的な一歩を形にする", zh: "几个月内先迈出具体的第一步" } },
  ];
  return {
    reason: pick({ en: "Your team and what you want to do point one level above what you first wrote.", ja: "やりたいこととチームの状況から、最初の目標より 1 段上が近いかもしれません。", zh: "从想做的事和团队情况看，可能比最初写的目标高一级更接近。" }, language),
    rungs: [...rungs.map((rung) => ({ level: rung.level, text: pick(rung.text, language) })), { level: 2, text: goalText }].sort((a, b) => b.level - a.level),
    suggestedLevel: 3,
  };
}

function capabilitiesFor(seed: string, capabilities: readonly string[], count: number): string[] {
  const start = stableNumber(seed) % capabilities.length;
  return Array.from({ length: Math.min(count, capabilities.length) }, (_, index) => capabilities[(start + index * 3) % capabilities.length]!).filter((value, index, list) => list.indexOf(value) === index);
}

function questionWhy(id: string, language: PlanCopyLanguage): string {
  return pick({ en: `The background does not tell us this yet (${id}), and it changes how the plan splits.`, ja: `背景からはまだわからず、プランの分かれ目になるため（${id}）。`, zh: `背景里还看不出来，而且会影响方案怎么分（${id}）。` }, language);
}

function draftFor(kind: PlanGoalKind, goalText: string, language: PlanCopyLanguage, citations: Array<{ id: string; version: number }>, aliases: readonly string[]): DraftOutput {
  const template = PLAN_GOAL_TEMPLATES[kind];
  const typeSlots = template.slots.filter((slot) => slot.slot !== PLAN_EVENT_SLOT);
  const event = template.slots.find((slot) => slot.slot === PLAN_EVENT_SLOT)!;
  const label = (slot: string) => planCopy(PLAN_SHORT_NAME_COPY[slot] ?? { en: slot, ja: slot, zh: slot }, language);
  const field = planCopy(PLAN_GOAL_KIND_COPY[kind], language);
  const [a, b, c, d] = typeSlots.map((slot) => slot.slot);
  const marker = citations.length >= 2 ? "①②" : citations.length === 1 ? "①" : "";
  const steps = [
    { keys: [a!, b ?? a!], text: { en: [`Hear from ${label(a!)}`, "You can say in one line who this is for"], ja: [`${label(a!)}に話を聞く`, "誰のための何かを、一言で言える"], zh: [`先听${label(a!)}怎么说`, "能用一句话说清为谁做什么"] } },
    { keys: [c ?? a!], text: { en: [`Work through the plan with ${label(c ?? a!)}`, "One person agrees to the next concrete step"], ja: [`${label(c ?? a!)}と進め方を詰める`, "次の具体的な一歩に、1 人が合意する"], zh: [`和${label(c ?? a!)}一起理清做法`, "有 1 个人同意下一步"] } },
    { keys: [d ?? b ?? a!], text: { en: [`Borrow strength from ${label(d ?? b ?? a!)}`, "A missing skill is covered by someone you can ask again"], ja: [`${label(d ?? b ?? a!)}の力を借りる`, "足りない力を、続けて頼める人が見つかる"], zh: [`借助${label(d ?? b ?? a!)}的力量`, "找到能持续求助的人补上缺的能力"] } },
    { keys: [PLAN_EVENT_SLOT], text: { en: ["Meet the next people at events", "You leave an event with a follow-up you can act on"], ja: ["イベントで次の相手に会う", "イベントのあと、動けるフォローが 1 件ある"], zh: ["在活动上认识下一批人", "活动后有 1 个能推进的跟进"] } },
  ];
  return {
    allocationReasons: [],
    citations,
    conclusion: pick({ en: `Start from the people closest to "${goalText}", then widen step by step.`, ja: `「${goalText}」にいちばん近い人から話し、少しずつ広げる。`, zh: `从离「${goalText}」最近的人开始聊，再逐步扩大。` }, language),
    diagnosis: pick({
      en: `You already know what you want to do; what is missing is the people who have done it in ${field}${marker ? ` ${marker}` : ""}. Talking to them first keeps the plan grounded.`,
      ja: `やりたいことは見えています。足りないのは、${field}を実際にやってきた人の話です${marker}。まずその人たちに話を聞くと、プランが地に足のついたものになります。`,
      zh: `想做的事已经清楚，缺的是真正做过${field}的人的经验${marker}。先去听他们说，方案会更踏实。`,
    }, language),
    event: { allocation: event.allocation, targetCount: event.targetCount },
    flow: [],
    personTypes: typeSlots.map((slot, index) => ({
      allocation: slot.allocation,
      countRule: pick({ en: "Counts once you have talked about the goal", ja: "目標について話せたら 1 人", zh: "聊到目标就算 1 人" }, language),
      introRoutes: index === 0 && aliases[0] ? [{ viaAlias: aliases[0], why: pick({ en: "Knows people in this role", ja: "この役割の人とつながりがある", zh: "认识这类角色的人" }, language) }] : [],
      opener: null,
      persona: null,
      primaryIndustryId: null,
      questions: [
        pick({ en: "What did you do first?", ja: "最初に何から始めましたか？", zh: "最开始是从哪一步做起的？" }, language),
        pick({ en: "Where did it get stuck?", ja: "どこでつまずきましたか？", zh: "在哪里卡住过？" }, language),
        pick({ en: "Who should I talk to next?", ja: "次に誰と話すとよいですか？", zh: "接下来该找谁聊？" }, language),
      ],
      recognizeHints: [label(slot.slot)],
      roleSituation: pick({ en: `${label(slot.slot)} with hands-on experience in ${field}`, ja: `${field}を実際に経験してきた${label(slot.slot)}`, zh: `亲身做过${field}的${label(slot.slot)}` }, language),
      shortLabelId: slot.slot,
      slot: slot.slot,
      targetCount: slot.targetCount,
      why: pick({ en: "Their experience is the fastest way to check the premise.", ja: "前提を確かめるいちばんの近道です。", zh: "这是验证前提最快的办法。" }, language),
    })),
    steps: steps.map((step) => ({ doneCriteria: pick({ en: step.text.en[1]!, ja: step.text.ja[1]!, zh: step.text.zh[1]! }, language), personTypeKeys: [...new Set(step.keys)], title: pick({ en: step.text.en[0]!, ja: step.text.ja[0]!, zh: step.text.zh[0]! }, language), why: null })),
  };
}


/* ------------------------------------------------------------------ */
/* R33：v3 初版的固定输出（plan-v3/DESIGN.md §3.4；三种目标按设计稿示例写死，其余目标按模板生成）          */
/* ------------------------------------------------------------------ */

interface V3Copy {
  outcome: Tri;
  summary: Array<{ text: Tri; bold: Tri | null }>;
  confidenceReason: Tri;
  orderReasons: Tri[];
  comparison: { title: Tri; funnel: Tri; rows: Array<{ label: Tri; score: number; verdict: "preferred" | "possible" | "not_recommended"; slot: string | null }> };
  keyNumbers: Array<{ value: string; label: Tri }>;
  risks: Array<{ kind: "risk" | "unverified"; text: Tri }>;
}

const V3_COPY: Partial<Record<PlanGoalKind, V3Copy>> = {
  fundraising: {
    outcome: { en: "A lead investor is decided", ja: "リード投資家が 1 社決まる", zh: "定下 1 家领投方" },
    summary: [
      { text: { en: "After seed, Series A rounds are led by VCs.", ja: "シード後のシリーズA は VC がリードするのが一般的です。", zh: "种子轮之后的 A 轮一般由 VC 领投。" }, bold: { en: "led by VCs", ja: "VC がリード", zh: "VC 领投" } },
      { text: { en: "You already have one lead candidate, so start from VC partners.", ja: "リード候補が 1 社あるので、VC パートナーから当たるのが近道です。", zh: "已有 1 家领投候选，先从 VC 合伙人入手最快。" }, bold: null },
      { text: { en: "CVCs can run in parallel once PoC terms are visible.", ja: "CVC は PoC の条件が見えてから並行で進められます。", zh: "CVC 等 PoC 条件明确后再并行推进。" }, bold: { en: "in parallel", ja: "並行で", zh: "并行推进" } },
    ],
    confidenceReason: { en: "One lead candidate is already in hand.", ja: "リード候補が 1 社ある", zh: "已有 1 家领投候选" },
    orderReasons: [
      { en: "Fix the numbers with a CFO before meeting investors.", ja: "投資家に会う前に CFO 経験者と数字を固める", zh: "见投资人之前先和 CFO 把数字定下来" },
      { en: "VC partners decide the round; CVCs follow.", ja: "ラウンドを決めるのは VC パートナー、CVC は後から", zh: "VC 合伙人决定轮次，CVC 随后" },
    ],
    comparison: {
      title: { en: "Which investors to meet first", ja: "先に会う投資家", zh: "先找哪类投资人" },
      funnel: { en: "7 types narrowed to 5 by stage and ticket size", ja: "7 類型をステージと投資規模で 5 類型に", zh: "7 类按阶段和单笔规模筛出 5 类" },
      rows: [
        { label: { en: "VC partner", ja: "VC パートナー", zh: "VC 合伙人" }, score: 82, verdict: "preferred", slot: "vc_partner" },
        { label: { en: "Funded founder", ja: "調達経験のある起業家", zh: "融过资的创业者" }, score: 64, verdict: "possible", slot: "funded_founder" },
        { label: { en: "CVC", ja: "CVC", zh: "CVC" }, score: 55, verdict: "possible", slot: "cvc" },
        { label: { en: "Angel", ja: "エンジェル", zh: "天使投资人" }, score: 48, verdict: "possible", slot: "angel" },
        { label: { en: "Bank loan", ja: "銀行融資", zh: "银行贷款" }, score: 20, verdict: "not_recommended", slot: null },
      ],
    },
    keyNumbers: [{ value: "3", label: { en: "VC partners to meet before a term sheet", ja: "タームシートまでに会う VC パートナーの目安", zh: "拿到条款书前要见的 VC 合伙人数" } }],
    risks: [{ kind: "risk", text: { en: "Terms shift if the market cools.", ja: "市況が冷えると条件が変わる", zh: "市场转冷条件会变" } }, { kind: "unverified", text: { en: "CVC PoC budgets this year", ja: "今年の CVC の PoC 予算", zh: "今年 CVC 的 PoC 预算" } }],
  },
  launch: {
    outcome: { en: "Five paying customers", ja: "有料顧客が 5 社つく", zh: "拿到 5 个付费客户" },
    summary: [
      { text: { en: "A first paying customer usually comes from direct conversations, not ads.", ja: "最初の有料顧客は広告ではなく直接の対話から生まれるのが普通です。", zh: "第一个付费客户通常来自直接对话而不是广告。" }, bold: { en: "direct conversations", ja: "直接の対話", zh: "直接对话" } },
      { text: { en: "You are at beta, so the fastest proof is a few customers who pay.", ja: "ベータ段階なので、少数でも払ってくれる顧客がいちばんの証拠になります。", zh: "处在测试阶段，几个愿意付费的客户就是最好的证明。" }, bold: null },
      { text: { en: "Founders who shipped before shorten the pricing decision.", ja: "先に出した起業家の話は、値付けの判断を短くします。", zh: "先发布过的创业者能缩短定价决策。" }, bold: { en: "pricing decision", ja: "値付けの判断", zh: "定价决策" } },
    ],
    confidenceReason: { en: "The product is already in beta.", ja: "すでにベータが動いている", zh: "产品已在测试" },
    orderReasons: [
      { en: "Paying customers first; brand later.", ja: "有料顧客が先、ブランドは後", zh: "先有付费客户，再做品牌" },
      { en: "Talk to a shipped founder before you set a price.", ja: "値段を決める前に、出した起業家に聞く", zh: "定价前先问已发布的创业者" },
    ],
    comparison: {
      title: { en: "Who to reach first", ja: "先に当たる相手", zh: "先接触谁" },
      funnel: { en: "6 types narrowed to 4 by stage", ja: "6 類型をステージで 4 類型に", zh: "6 类按阶段筛出 4 类" },
      rows: [
        { label: { en: "First payer", ja: "最初の有料顧客", zh: "首批付费客户" }, score: 85, verdict: "preferred", slot: "first_payer" },
        { label: { en: "Shipped founder", ja: "先に出した起業家", zh: "先发布过的创业者" }, score: 60, verdict: "possible", slot: "same_path_founder" },
        { label: { en: "Brand / PR", ja: "ブランド・PR", zh: "品牌 / PR" }, score: 50, verdict: "possible", slot: "brand_pr" },
        { label: { en: "Paid ads", ja: "広告出稿", zh: "投放广告" }, score: 15, verdict: "not_recommended", slot: null },
      ],
    },
    keyNumbers: [{ value: "5", label: { en: "paying customers that prove the model", ja: "モデルの証明になる有料顧客数", zh: "能证明模式的付费客户数" } }],
    risks: [{ kind: "risk", text: { en: "A beta that is free for too long is hard to price.", ja: "無料期間が長いほど値付けが難しくなる", zh: "免费期越长越难定价" } }],
  },
  sales: {
    outcome: { en: "Three signed customers", ja: "成約が 3 社つく", zh: "签下 3 家客户" },
    summary: [
      { text: { en: "Enterprise deals move when a decision maker is in the room.", ja: "法人営業は決裁者が同席して初めて動きます。", zh: "企业销售要有决策者在场才会推进。" }, bold: { en: "decision maker", ja: "決裁者", zh: "决策者" } },
      { text: { en: "Field leads tell you the real pain before the pitch.", ja: "現場リーダーは提案の前に本当の困りごとを教えてくれます。", zh: "一线负责人会在提案前告诉你真正的痛点。" }, bold: null },
      { text: { en: "Introducers cut the first meeting from months to weeks.", ja: "紹介者がいると初回面談までが数か月から数週間になります。", zh: "有引荐人能把首次会面从几个月缩短到几周。" }, bold: { en: "months to weeks", ja: "数週間", zh: "几周" } },
    ],
    confidenceReason: { en: "Two field leads are already in your network.", ja: "現場リーダーが人脈に 2 人いる", zh: "人脉里已有 2 位一线负责人" },
    orderReasons: [
      { en: "Hear the field first, then go to the decision maker.", ja: "現場に聞いてから決裁者へ", zh: "先听一线，再找决策者" },
      { en: "Introducers come in once you can name the account.", ja: "狙う会社が決まってから紹介者に頼む", zh: "定下目标客户后再找引荐人" },
    ],
    comparison: {
      title: { en: "Who to meet first", ja: "先に会う相手", zh: "先见谁" },
      funnel: { en: "6 types narrowed to 4 by deal stage", ja: "6 類型を商談段階で 4 類型に", zh: "6 类按商谈阶段筛出 4 类" },
      rows: [
        { label: { en: "Decision maker", ja: "決裁者", zh: "决策者" }, score: 80, verdict: "preferred", slot: "decision_maker" },
        { label: { en: "Field lead", ja: "現場リーダー", zh: "一线负责人" }, score: 70, verdict: "possible", slot: "field_lead" },
        { label: { en: "Introducer", ja: "紹介者", zh: "引荐人" }, score: 58, verdict: "possible", slot: "introducer" },
        { label: { en: "Cold outbound", ja: "飛び込み営業", zh: "陌生拜访" }, score: 18, verdict: "not_recommended", slot: null },
      ],
    },
    keyNumbers: [{ value: "3", label: { en: "accounts to run in parallel", ja: "並行して進める商談数の目安", zh: "并行推进的商谈数" } }],
    risks: [{ kind: "unverified", text: { en: "Budget timing of the target accounts", ja: "狙う会社の予算時期", zh: "目标客户的预算周期" } }],
  },
};

/** 没有写死文案的目标：从模板生成一份合规的 v3（第一类 preferred、其余 possible；理由段引用第一条来源 / 第一个回答）。 */
function genericV3Copy(kind: PlanGoalKind, language: PlanCopyLanguage, slots: readonly string[]): V3Copy {
  const field = planCopy(PLAN_GOAL_KIND_COPY[kind], language);
  const label = (slot: string) => planCopy(PLAN_SHORT_NAME_COPY[slot] ?? { en: slot, ja: slot, zh: slot }, language);
  const tri = (value: string): Tri => ({ en: value, ja: value, zh: value });
  return {
    comparison: {
      funnel: tri(pick({ en: `${slots.length} types narrowed by how close they are to ${field}`, ja: `${slots.length} 類型を${field}への近さで絞る`, zh: `${slots.length} 类按与${field}的距离筛选` }, language)),
      rows: slots.map((slot, index) => ({ label: tri(label(slot)), score: 80 - index * 10, slot, verdict: index === 0 ? "preferred" : "possible" })),
      title: tri(pick({ en: "Who to meet first", ja: "先に会う相手", zh: "先见谁" }, language)),
    },
    confidenceReason: tri(pick({ en: "Based on the template for this goal.", ja: "この目標の型に沿っている", zh: "按这类目标的常规做法" }, language)),
    keyNumbers: [],
    orderReasons: [tri(pick({ en: `Start with ${label(slots[0]!)}; the rest follow.`, ja: `まず${label(slots[0]!)}、ほかはその後`, zh: `先找${label(slots[0]!)}，其余随后` }, language))],
    outcome: tri(pick({ en: `First result in ${field}`, ja: `${field}の最初の成果`, zh: `${field}的第一个结果` }, language)),
    risks: [],
    summary: [{ bold: null, text: tri(pick({ en: `In ${field}, people who have done it are the fastest check of your premise.`, ja: `${field}では、実際にやった人の話が前提のいちばん早い確かめ方です。`, zh: `在${field}上，做过的人是验证前提最快的途径。` }, language)) }],
  };
}

/** v3 初版（mock）：v2 的方案 + 设计稿示例；理由段只引用输入里的来源 / 回答（没有可引用的就没有理由段，交给校验器判「没能起草」）。 */
export function mockDraftV3(input: FirstDraftInputV3, language: PlanCopyLanguage): DraftOutputV3 {
  const base = draftFor(input.goalKind, input.goalText, language, [], input.contacts.map((contact) => contact.alias));
  const slots = base.personTypes.map((type) => type.slot);
  const copy = V3_COPY[input.goalKind] ?? genericV3Copy(input.goalKind, language, slots);
  const sourceIds = input.sources.map((source) => source.id);
  const refFor = (index: number) => {
    const source = sourceIds[index % Math.max(1, sourceIds.length)];
    if (source && (index < sourceIds.length || input.answerKeys.length === 0)) return { kind: "source" as const, sourceId: source };
    const key = input.answerKeys[index % Math.max(1, input.answerKeys.length)];
    return key ? { kind: "answer" as const, questionKey: key } : null;
  };
  const summary: DraftSummarySentence[] = copy.summary.map((sentence, index) => {
    const ref = refFor(index);
    return { bold: sentence.bold ? pick(sentence.bold, language) : null, refs: ref ? [ref] : [], text: pick(sentence.text, language) };
  });
  const firstSource = sourceIds.slice(0, 1);
  // Step 2–4 个，每个人物类型都属于一个 Step（イベント枠放最后一个）。
  const groups = [slots.slice(0, 2), slots.slice(2, 4), [...slots.slice(4), PLAN_EVENT_SLOT]].filter((group) => group.length > 0);
  const stepCopy: Tri[][] = [
    [{ en: "Hear from the people closest to the goal", ja: "目標にいちばん近い人に話を聞く", zh: "先听离目标最近的人怎么说" }, { en: "You can say in one line who this is for", ja: "誰のための何かを、一言で言える", zh: "能用一句话说清为谁做什么" }],
    [{ en: "Work through the plan with the next group", ja: "次の相手と進め方を詰める", zh: "和下一批人理清做法" }, { en: "One person agrees to the next concrete step", ja: "次の具体的な一歩に、1 人が合意する", zh: "有 1 个人同意下一步" }],
    [{ en: "Widen the circle at events", ja: "イベントで輪を広げる", zh: "在活动上扩大圈子" }, { en: "You leave an event with a follow-up you can act on", ja: "イベントのあと、動けるフォローが 1 件ある", zh: "活动后有 1 个能推进的跟进" }],
  ];
  return {
    ...base,
    comparison: {
      funnel: pick(copy.comparison.funnel, language),
      rows: copy.comparison.rows.map((row) => ({ label: pick(row.label, language), score: row.score, sourceIds: firstSource, typeKey: row.slot, verdict: row.verdict })),
      title: pick(copy.comparison.title, language),
    },
    confidence: { level: "mid", reason: pick(copy.confidenceReason, language) },
    keyNumbers: copy.keyNumbers.map((number) => ({ label: pick(number.label, language), sourceIds: firstSource, value: number.value })),
    orderReasons: copy.orderReasons.map((line) => ({ sourceIds: firstSource, text: pick(line, language) })),
    outcome: pick(copy.outcome, language),
    risks: copy.risks.map((risk) => ({ kind: risk.kind, text: pick(risk.text, language) })),
    steps: groups.map((keys, index) => ({ doneCriteria: pick(stepCopy[index]![1]!, language), personTypeKeys: keys, title: pick(stepCopy[index]![0]!, language), why: null })),
    summary,
    verdict: "feasible",
  };
}

const NO_CHANGE = /変更しない|変えない|そのまま|no change|keep it|不改|不用改/i;

export function createMockPlanFlowAi(): PlanFlowAi {
  const ai: PlanFlowAi = {
    id: "mock",
    async background(input, context) {
      const self = { alias: "self", capabilities: capabilitiesFor(`${input.profile.name}:self`, input.capabilities, 3), relation: null };
      const others = input.contacts.map((contact) => ({ alias: contact.alias, capabilities: capabilitiesFor(contact.name, input.capabilities, 2), relation: "cofounder" as const }));
      const wants = input.goalText.length > 60 ? `${input.goalText.slice(0, 59)}…` : input.goalText;
      const output: BackgroundOutput = {
        ladder: mockLadder(input.goalText, wants, input.goalKind, context.language),
        members: [self, ...others],
        stance: others.length > 0 ? "cofounder" : "owner",
        wants,
      };
      return ok(output);
    },
    async firstDraft(input, context) {
      return ok(draftFor(input.goalKind, input.goalText, context.language, input.landscape.slice(0, 2).map((entry) => ({ id: entry.id, version: entry.version })), input.contacts.map((contact) => contact.alias)));
    },
    async firstDraftV3(input, context) {
      return ok(mockDraftV3(input, context.language));
    },
    async fix(input, context) {
      if (NO_CHANGE.test(input.request)) {
        const output: FixOutput = {
          noChangeReason: pick({ en: "The current plan already covers this, so nothing changes this time.", ja: "いまの方案で足りているため、今回は変更しません。", zh: "现在的方案已经覆盖了，这次不改。" }, context.language),
          reasons: [],
          revised: input.current,
          unchanged: [pick({ en: "Diagnosis and conclusion", ja: "見立てと結論", zh: "判断与结论" }, context.language)],
        };
        return ok(output);
      }
      // 计划页像素返工（主会话 2026-10-12 同意，只在 mock）：设计稿 b4「見直し · Web」的示例对话（提到青葉ベンチャーズ、
      // CVC 並行）→ 照示例给两条差分（Step 3 / Step 4 的目安），其余输入行为不变。
      if (/青葉ベンチャーズ/u.test(input.request) && input.current.steps.length >= 4) {
        const design: Tri[] = [
          { en: "Meet three VCs including Aoba Ventures and one CVC in parallel; one moves to DD", ja: "青葉ベンチャーズを含む VC 3社と CVC 1社に並行で会い、1社が DD に進む", zh: "同时接触包括青叶创投在内的 3 家 VC 和 1 家 CVC，其中 1 家进入尽调" },
          { en: "Ask one corporate CVC for its PoC terms and compare them with Aoba Ventures' terms", ja: "事業会社の CVC 1社に PoC の条件を聞き、青葉ベンチャーズの条件と並べて比べる", zh: "向 1 家企业 CVC 了解 PoC 条件，并与青叶创投的条件对比" },
        ];
        const steps = input.current.steps.map((step, index) => (index === 2 || index === 3 ? { ...step, doneCriteria: pick(design[index - 2]!, context.language) } : step));
        const reason = pick({ en: "Reflects the premises you corrected and running VCs and CVCs in parallel.", ja: "直した前提（ARR 1億円見込み · リード候補 1社）と、CVC も並行という修正を反映しました。", zh: "按你改正的前提和「CVC 也同时推进」做了调整。" }, context.language);
        return ok({
          noChangeReason: null,
          reasons: [{ path: "steps.2.doneCriteria", reason }, { path: "steps.3.doneCriteria", reason }],
          revised: { ...input.current, steps },
          unchanged: [
            pick({ en: "Conclusion", ja: "進め方の結論", zh: "推进的结论" }, context.language),
            pick({ en: "Step order", ja: "Step の順番", zh: "Step 的顺序" }, context.language),
          ],
        });
      }
      const note = input.request.replace(/\s+/g, " ").slice(0, 40);
      const steps = input.current.steps.map((step, index) => (index === 0 ? { ...step, doneCriteria: `${step.doneCriteria}（${note}）` } : step));
      return ok({
        noChangeReason: null,
        reasons: [{ path: "steps.0.doneCriteria", reason: pick({ en: "Reflects what you wrote.", ja: "書いてくれた内容を反映しました。", zh: "按你写的内容做了调整。" }, context.language) }],
        revised: { ...input.current, steps },
        unchanged: [
          pick({ en: "Diagnosis and conclusion", ja: "見立てと結論", zh: "判断与结论" }, context.language),
          pick({ en: "Person types and points", ja: "人物タイプと配点", zh: "人物类型与配分" }, context.language),
        ],
      });
    },
    async goalKind(input) {
      return ok({ goalKind: guessGoalKindByKeywords(input.text) });
    },
    async ladder(input, context) {
      const kind = guessGoalKindByKeywords(input.goalText);
      return ok(mockLadder(input.goalText, input.wants, kind, context.language));
    },
    async members(input) {
      return ok({ members: input.contacts.map((contact) => ({ alias: contact.alias, basis: contact.role ?? contact.organization ?? "", capabilities: capabilitiesFor(contact.name, input.capabilities, 2) })) });
    },
    async questions(input, context) {
      const chosen = ruleQuestions(input, (id) => questionWhy(id, context.language));
      return ok(chosen);
    },
    async reviewMarks(input, context) {
      // 有记录就预标第一条回答行（演示用；真实由 C8 判断）。
      const row = input.premise.find((item) => item.source !== "background");
      const record = input.records[0];
      if (!row || !record) return ok({ marks: [] });
      return ok({ marks: [{ evidenceIds: [record.id], key: row.key, reason: pick({ en: "A recent record may change this.", ja: "最近の記録で変わったかもしれません。", zh: "最近的记录可能改变了这一点。" }, context.language), suggested: null }] });
    },
    async reviewFix(input, context) {
      return ai.fix(input, context);
    },
    async nextGoals(input, context) {
      const order: PlanGoalKind[] = ["sales", "hiring", "partnership", "fundraising", "launch", "career"];
      const kinds = order.filter((kind) => kind !== input.goalKind).slice(0, 2);
      const field = (kind: PlanGoalKind) => planCopy(PLAN_GOAL_KIND_COPY[kind], context.language);
      // v7：示例副标题（一句、依据记录：有记录时说「記録から」，没有时说「この目標の流れから」）。
      const subtitle = input.records.length > 0
        ? pick({ en: "Builds on the people you met for this goal.", ja: "この目標で会った人とのつながりを活かせます。", zh: "可以接着用这个目标里认识的人。" }, context.language)
        : pick({ en: "A natural next step after this goal.", ja: "この目標の次に進みやすい目標です。", zh: "这个目标之后顺势可做的下一步。" }, context.language);
      return ok({ candidates: kinds.map((kind) => ({ evidenceIds: input.records.slice(0, 1).map((record) => record.id), goalKind: kind, goalText: pick({ en: `Next: ${field(kind)}`, ja: `次は${field(kind)}に取り組む`, zh: `接下来做${field(kind)}` }, context.language), subtitle })) });
    },
  };
  return ai;
}
