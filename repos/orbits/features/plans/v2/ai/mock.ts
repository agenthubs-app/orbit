/**
 * R23 计划生成流程的 mock AI（DESIGN §5.1「mock 先行」）：输入相同 → 输出相同；不记账、不联网。
 * 授权前与开发、测试默认用它；输出与真实实现过同一组校验（`schemas.ts`），保证界面拿到的形状一致。
 */
import { PLAN_GOAL_KIND_COPY, PLAN_SHORT_NAME_COPY, planCopy, type PlanCopyLanguage } from "../../../../shared/compute/plan-template-copy";
import { guessGoalKindByKeywords, PLAN_EVENT_SLOT, PLAN_GOAL_TEMPLATES } from "../../../../shared/compute/plan-templates";
import type { PlanGoalKind } from "../../../../shared/contract/plan-v2";
import { ruleQuestions, stableNumber } from "./rules";
import type { BackgroundOutput, DraftOutput, FixOutput, LadderOutput, PlanAiOutcome, PlanFlowAi } from "./types";

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

const NO_CHANGE = /変更しない|変えない|そのまま|no change|keep it|不改|不用改/i;

export function createMockPlanFlowAi(): PlanFlowAi {
  return {
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
  };
}
