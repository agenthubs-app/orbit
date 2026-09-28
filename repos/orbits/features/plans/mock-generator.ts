/**
 * mock 计划生成器（W0008；D3：不调用任何付费 AI）。
 *
 * 内容是**模板文案 + 用户的真实数据**：联系人只从生成器输入里取（已按 actor 裁剪的已确认联系人），
 * 活动只从真实活动目录里取（canonical id）；不编造任何 id。同样的输入永远得到同样的计划。
 *
 * 周期按目标期限切分（Q31A）：
 * - 一个月内：2–3 段，按周。现有人脉（裁剪后的联系人）≥ 3 位时 3 段（先借力现有人脉），否则 2 段；
 * - 3 个月内：3 段，按周，共 12 周（1–3 / 4–8 / 9–12）；
 * - 一年内：4 个季度段，只有第一段细到周（条目带建议周次），其余三段条目不带周次。
 *
 * 人脉需求带行业条件（`shared/domain/industries.ts` 的一二级 id）与职位关键词，
 * 来自 `goal-signals.ts` 的同一张规则表。
 */
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../shared/contract/industries";
import type { NewPlanItemInput, PlanHorizon } from "./contract";
import type {
  PlanAnalysisAlly,
  PlanAnalysisThisWeek,
  PlanGenerator,
  PlanGeneratorInput,
  PlanInputContact,
  PlanInputEvent,
  PlanLocale,
  PlanPhaseDetail,
  PlanSkeleton,
  PlanSkeletonPhase,
} from "./generator";
import { tokyoDate } from "./generator";
import {
  goalArchetype,
  goalTarget,
  isGoalRelatedContact,
  type GoalArchetype,
  type PlanCopy,
} from "./goal-signals";

export const MOCK_PLAN_GENERATOR_ID = "mock-template-v1";

/** 一个月内的计划：现有人脉达到这个数时先安排「借力现有人脉」一段（3 段），否则 2 段。 */
export const MONTH_LEVERAGE_CONTACTS = 3;

type PhaseRole = "leverage" | "explore" | "meet" | "push" | "scale";

interface PhaseFrame {
  key: string;
  role: PhaseRole;
  startWeek: number;
  endWeek: number;
  granularity: "week" | "quarter";
  detailed: boolean;
}

/** 按期限切分阶段（纯函数，测试直接断言）。 */
export function planPhaseFrames(horizon: PlanHorizon, existingContacts: number): PhaseFrame[] {
  const week = (key: string, role: PhaseRole, startWeek: number, endWeek: number): PhaseFrame => ({
    detailed: true,
    endWeek,
    granularity: "week",
    key,
    role,
    startWeek,
  });
  if (horizon === "month") {
    return existingContacts >= MONTH_LEVERAGE_CONTACTS
      ? [week("p1", "leverage", 1, 1), week("p2", "meet", 2, 2), week("p3", "push", 3, 4)]
      : [week("p1", "meet", 1, 2), week("p2", "push", 3, 4)];
  }
  if (horizon === "quarter") {
    return [week("p1", "explore", 1, 3), week("p2", "meet", 4, 8), week("p3", "push", 9, 12)];
  }
  const quarter = (key: string, role: PhaseRole, startWeek: number, detailed: boolean): PhaseFrame => ({
    detailed,
    endWeek: startWeek + 12,
    granularity: "quarter",
    key,
    role,
    startWeek,
  });
  return [quarter("q1", "explore", 1, true), quarter("q2", "meet", 14, false), quarter("q3", "push", 27, false), quarter("q4", "scale", 40, false)];
}

const ROLE_TITLES: Record<PhaseRole, PlanCopy> = {
  explore: { en: "Map the ground", zh: "摸清需求" },
  leverage: { en: "Lean on your network", zh: "借力现有人脉" },
  meet: { en: "Meet the right people", zh: "集中接触" },
  push: { en: "Close it out", zh: "推进落地" },
  scale: { en: "Review and scale", zh: "复盘放大" },
};

const NEW_PEOPLE_BY_HORIZON: Record<PlanHorizon, number> = { month: 5, quarter: 10, year: 20 };

const DAY_MS = 86_400_000;

function pick(locale: PlanLocale, copy: PlanCopy): string {
  return copy[locale];
}

function monthDay(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** 活动在计划里的周次（以 startsOn 为第 1 周）；在计划开始前返回 null。 */
function eventWeek(startsOn: string, event: PlanInputEvent): number | null {
  const days = Math.floor((Date.parse(`${tokyoDate(event.startsAt)}T00:00:00.000Z`) - Date.parse(`${startsOn}T00:00:00.000Z`)) / DAY_MS);
  return days < 0 ? null : Math.floor(days / 7) + 1;
}

function lastActivity(contact: PlanInputContact): string {
  return contact.lastInteractionAt && contact.lastInteractionAt > contact.createdAt ? contact.lastInteractionAt : contact.createdAt;
}

function contactSubtitle(contact: PlanInputContact, _locale: PlanLocale): string | null {
  const parts = [contact.organization, contact.role].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}

/** 联系人里最常见的一级行业（并列按 id 排序），用来给「目标客户」这类需求补行业。 */
function majorityIndustry(contacts: readonly PlanInputContact[]): IndustryIdCode | null {
  const counts = new Map<IndustryIdCode, number>();
  for (const contact of contacts) {
    if (contact.primaryIndustryId && contact.primaryIndustryId !== "other") {
      counts.set(contact.primaryIndustryId, (counts.get(contact.primaryIndustryId) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

interface NeedSpec {
  title: string;
  description: string;
  primaryIndustryId: IndustryIdCode | null;
  secondaryIndustryId: SecondaryIndustryIdCode | null;
  titleKeywords: string[];
}

interface Plan {
  archetype: GoalArchetype;
  frames: PhaseFrame[];
  allies: PlanInputContact[];
  events: Array<{ event: PlanInputEvent; week: number }>;
  needs: { connector: NeedSpec; target: NeedSpec; scale: NeedSpec };
  newPeople: number;
  totalWeeks: number;
}

/** 从输入推导出整份计划的骨架事实。skeleton 与 phaseDetail 都从这里取，保证两步一致。 */
function derive(input: PlanGeneratorInput): Plan {
  const { locale } = input;
  const archetype = goalArchetype(`${input.goal.text} ${input.supplement ?? ""}`);
  const own = input.contacts.filter((contact) => contact.ownerId === input.actorId);
  const frames = planPhaseFrames(input.goal.horizon, own.length);
  const totalWeeks = frames[frames.length - 1]!.endWeek;

  const allies = [...own]
    .sort((a, b) => {
      const related = Number(isGoalRelatedContact(b, archetype)) - Number(isGoalRelatedContact(a, archetype));
      return related || lastActivity(b).localeCompare(lastActivity(a)) || a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id);
    })
    .slice(0, 3);

  const events = [...input.events]
    .map((event) => ({ event, week: eventWeek(input.startsOn, event) }))
    .filter((entry): entry is { event: PlanInputEvent; week: number } => entry.week !== null && entry.week <= totalWeeks)
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt) || a.event.id.localeCompare(b.event.id))
    .slice(0, 4);

  const targetPrimary = archetype.primaryIndustryId ?? majorityIndustry(own);
  const needs = {
    connector: {
      description: pick(locale, {
        en: "People who run communities or associations and can introduce you around.",
        zh: "运营社群、协会的人，能把你介绍给更多人。",
      }),
      primaryIndustryId: "community_nonprofit" as const,
      secondaryIndustryId: "community_nonprofit.industry_associations" as const,
      title: pick(locale, { en: "Well-connected people who can introduce you", zh: "能帮你引荐的行业前辈" }),
      titleKeywords: ["理事", "会长", "顾问", "Organizer", "Community"],
    },
    scale: {
      description: pick(locale, {
        en: "Partners who can take what works and help it reach more people.",
        zh: "把已经跑通的做法推给更多人的合作方。",
      }),
      primaryIndustryId: "professional_services" as const,
      secondaryIndustryId: "professional_services.startup_services" as const,
      title: pick(locale, { en: "Partners who can help you scale", zh: "能帮你扩大规模的合作方" }),
      titleKeywords: ["BD", "Partner", "Alliance", "事業開発"],
    },
    target: {
      description: pick(locale, {
        en: `The people your goal depends on: ${input.goal.text}`,
        zh: `目标能不能达成，取决于能不能认识他们：${input.goal.text}`,
      }),
      primaryIndustryId: targetPrimary,
      secondaryIndustryId: archetype.primaryIndustryId ? archetype.secondaryIndustryId : null,
      title: pick(locale, archetype.target),
      titleKeywords: [...archetype.titleKeywords],
    },
  };

  return { allies, archetype, events, frames, needs, newPeople: NEW_PEOPLE_BY_HORIZON[input.goal.horizon], totalWeeks };
}

function eventLabel(entry: { event: PlanInputEvent }, locale: PlanLocale): string {
  const date = monthDay(tokyoDate(entry.event.startsAt));
  return locale === "zh" ? `${date} ${entry.event.title}` : `${entry.event.title} (${date})`;
}

function thisWeekActions(input: PlanGeneratorInput, plan: Plan): PlanAnalysisThisWeek[] {
  const { locale } = input;
  const short = pick(locale, plan.archetype.short);
  const [first, second] = plan.allies;
  const event = plan.events[0];
  const items: PlanAnalysisThisWeek[] = [];
  if (first) {
    items.push({
      contactIds: [first.id],
      eventIds: [],
      title: pick(locale, { en: `Have a 20-minute chat with ${first.displayName}`, zh: `约 ${first.displayName} 聊 20 分钟` }),
      why: pick(locale, {
        en: `${contactSubtitle(first, locale) ?? "Already in your network"} — the closest way in to ${short}.`,
        zh: `${contactSubtitle(first, locale) ?? "你已经认识 TA"}，是你离${short}最近的一步。`,
      }),
    });
  }
  if (second) {
    items.push({
      contactIds: [second.id],
      eventIds: [],
      title: pick(locale, { en: `Ask ${second.displayName} to introduce one of the ${short}`, zh: `请 ${second.displayName} 介绍一位${short}` }),
      why: pick(locale, {
        en: "A warm introduction gets a reply far more often than a cold message.",
        zh: "熟人引荐比陌生消息更容易得到回复。",
      }),
    });
  }
  if (event) {
    items.push({
      contactIds: [],
      eventIds: [event.event.id],
      title: pick(locale, { en: `Sign up for ${eventLabel(event, locale)}`, zh: `报名 ${eventLabel(event, locale)}` }),
      why: pick(locale, {
        en: `Aim to meet two ${short} there, using the 30-second intro below.`,
        zh: `目标是在那里认识 2 位${short}，用下面那段 30 秒自我介绍。`,
      }),
    });
  }
  const fillers: PlanCopy[][] = [
    [
      { en: `List ten ${short} you would most like to meet`, zh: `列出 10 位你最想认识的${short}` },
      { en: "A named list turns 'meet people' into something you can act on.", zh: "有名字的名单，才能把「认识人」变成能做的事。" },
    ],
    [
      { en: "Send your 30-second intro to three old friends", zh: "把 30 秒自我介绍发给 3 位老朋友" },
      { en: "Ask each of them who they know that fits.", zh: "问问他们身边有没有合适的人。" },
    ],
    [
      { en: "Scan the business cards you already have", zh: "把手上的名片都扫进 Orbit" },
      { en: "The plan gets more specific with every confirmed contact.", zh: "每多一位已确认联系人，计划就更具体一点。" },
    ],
  ];
  for (const [title, why] of fillers) {
    if (items.length >= 3) break;
    items.push({ contactIds: [], eventIds: [], title: pick(locale, title!), why: pick(locale, why!) });
  }
  return items.slice(0, 3);
}

function allyHelp(contact: PlanInputContact, plan: Plan, locale: PlanLocale, index: number): string {
  const short = pick(locale, plan.archetype.short);
  if (isGoalRelatedContact(contact, plan.archetype)) {
    return pick(locale, {
      en: `Close to the ${short} you need — a good first conversation and possibly your first yes.`,
      zh: `和你要找的${short}最接近，适合做第一位访谈对象，也可能直接成为第一个机会。`,
    });
  }
  return index === 0
    ? pick(locale, { en: `Can introduce you to the ${short} in their circle.`, zh: `可以请 TA 介绍身边的${short}。` })
    : pick(locale, { en: "Knows how things work locally; useful in the later phases.", zh: "了解当地的做法，后面的阶段用得上。" });
}

export function createMockPlanGenerator(): PlanGenerator {
  return {
    id: MOCK_PLAN_GENERATOR_ID,

    async skeleton(input): Promise<PlanSkeleton> {
      const plan = derive(input);
      const { locale } = input;
      const short = pick(locale, plan.archetype.short);
      const target = goalTarget(input.goal.text);
      const deadlineDate = addDays(input.startsOn, plan.totalWeeks * 7 - 1);
      // 跨年的截止日带上年份（一年期）。
      const deadline = deadlineDate.slice(0, 4) === input.startsOn.slice(0, 4) ? monthDay(deadlineDate) : `${deadlineDate.slice(0, 4)}/${monthDay(deadlineDate)}`;
      const [ally] = plan.allies;
      const event = plan.events[0];
      const relatedCount = input.contacts.filter((contact) => isGoalRelatedContact(contact, plan.archetype)).length;
      const phaseTitles = plan.frames.map((frame) => pick(locale, ROLE_TITLES[frame.role]));
      const weeksLabel =
        input.goal.horizon === "year"
          ? pick(locale, { en: "A year", zh: "一年" })
          : pick(locale, { en: `${plan.totalWeeks} weeks`, zh: `${plan.totalWeeks} 周` });

      const answer =
        locale === "zh"
          ? [
              { text: `${weeksLabel}分 ${plan.frames.length} 步：先` },
              ...(ally ? [{ text: "从" }, { emphasis: true, text: ally.displayName }, { text: `切入${phaseTitles[0]}` }] : [{ text: `把${short}名单理出来` }]),
              { text: "，再通过 " },
              { emphasis: true, text: event ? event.event.title : "熟人引荐" },
              { text: " 认识 " },
              { emphasis: true, text: `${plan.newPeople} 位${short}` },
              { text: "，最后" },
              ...(target
                ? [{ text: "拿下 " }, { emphasis: true, text: `${target.value} ${target.unit.zh}`.trim() }, { text: "。" }]
                : [{ text: `完成「${input.goal.text}」。` }]),
            ]
          : [
              { text: `${weeksLabel} in ${plan.frames.length} steps: start ` },
              ...(ally ? [{ text: "with " }, { emphasis: true, text: ally.displayName }] : [{ text: `by listing the ${short} you need` }]),
              { text: ", meet " },
              { emphasis: true, text: `${plan.newPeople} ${short}` },
              { text: " through " },
              { emphasis: true, text: event ? event.event.title : "warm introductions" },
              { text: ", then " },
              ...(target
                ? [{ text: "land " }, { emphasis: true, text: `${target.value} ${target.unit.en}`.trim() }, { text: "." }]
                : [{ text: `reach your goal: “${input.goal.text}”.` }]),
            ];

      const figures = [
        target
          ? { label: pick(locale, { en: `to reach by ${deadline}`, zh: `${deadline} 前要达成` }), unit: pick(locale, target.unit), value: String(target.value) }
          : { label: pick(locale, { en: "plan length", zh: "计划周期" }), unit: pick(locale, { en: "weeks", zh: "周" }), value: String(plan.totalWeeks) },
        { label: pick(locale, { en: `new ${short} to meet`, zh: `要新认识的${short}` }), unit: pick(locale, { en: "people", zh: "位" }), value: String(plan.newPeople) },
        plan.events.length > 0
          ? { label: pick(locale, { en: "events worth going to", zh: "推荐你去的活动" }), unit: pick(locale, { en: "events", zh: "场" }), value: String(plan.events.length) }
          : { label: pick(locale, { en: "contacts who can help now", zh: "现有联系人能帮上忙" }), unit: pick(locale, { en: "people", zh: "位" }), value: String(plan.allies.length) },
      ];

      const firstEnd = plan.frames[0]!.endWeek;
      const halfPeople = Math.max(2, Math.ceil(plan.newPeople / 2));
      const risk =
        relatedCount <= 1
          ? pick(locale, {
              en: `Only ${relatedCount} of your contacts is directly related to this goal. If you haven't met ${halfPeople} ${short} by week ${firstEnd + 1}, the later phases will slip.`,
              zh: `你的人脉里只有 ${relatedCount} 位和目标直接相关。第 ${firstEnd + 1} 周前如果认识不到 ${halfPeople} 位${short}，后面的进度就会落空。`,
            })
          : pick(locale, {
              en: `The first ${firstEnd} week(s) are where plans like this stall: ${short} are busy, so lean on warm introductions${ally ? ` from people like ${ally.displayName}` : ""}.`,
              zh: `前 ${firstEnd} 周最容易卡在约不到人：${short}都很忙，要先靠${ally ? ` ${ally.displayName} 这样的` : ""}熟人引荐。`,
            });

      const pitch = {
        setting: pick(locale, { en: "How to introduce yourself at events · 30 sec", zh: "在交流会上这样介绍自己 · 30 秒" }),
        text:
          locale === "zh"
            ? `我正在推进一件事：${input.goal.text}。${input.supplement ? `${input.supplement}，` : ""}所以现在最想认识${pick(locale, plan.archetype.target)}。您身边有这样的人吗？`
            : `I'm working on one thing right now: ${input.goal.text}. ${input.supplement ? `${input.supplement}. ` : ""}That's why I'm looking to meet ${pick(locale, plan.archetype.target).toLowerCase()}. Do you know anyone like that?`,
      };

      const allies: PlanAnalysisAlly[] = plan.allies.map((contact, index) => ({
        contactId: contact.id,
        help: allyHelp(contact, plan, locale, index),
        name: contact.displayName,
        subtitle: contactSubtitle(contact, locale),
      }));

      const phases: PlanSkeletonPhase[] = plan.frames.map((frame, index) => ({
        detailed: frame.detailed,
        endWeek: frame.endWeek,
        granularity: frame.granularity,
        key: frame.key,
        startWeek: frame.startWeek,
        summary: phaseSummary(frame, plan, locale, index),
        title: phaseTitles[index]!,
      }));

      return {
        analysis: {
          allies,
          answer,
          figures,
          gaps: [plan.needs.target.title, plan.needs.connector.title, plan.needs.scale.title],
          generator: MOCK_PLAN_GENERATOR_ID,
          kind: "plan_bootstrap",
          locale,
          pitch,
          read: { contacts: input.contacts.length, contactsTotal: input.contactsTotal, events: input.events.length },
          risk,
          thisWeek: thisWeekActions(input, plan),
          version: 1,
        },
        horizon: input.goal.horizon,
        phases,
      };
    },

    async phaseDetail(input, phase): Promise<PlanPhaseDetail> {
      const plan = derive(input);
      const index = plan.frames.findIndex((frame) => frame.key === phase.key);
      const base = plan.frames[index];
      if (!base) throw new Error(`Unknown phase ${phase.key}.`);
      // W0012：一年期进入后面的季度段时，以 `detailed: true` 重新请求这一段，补出周级行动
      // （`phase-refinement.ts`）。第一次生成时 phase.detailed 与模板一致，结果不变。
      const frame = { ...base, detailed: phase.detailed };
      return phaseDetail(input, plan, frame, index);
    },
  };
}

function phaseSummary(frame: PhaseFrame, plan: Plan, locale: PlanLocale, index: number): string {
  const short = pick(locale, plan.archetype.short);
  const ally = plan.allies[0];
  switch (frame.role) {
    case "leverage":
      return pick(locale, {
        en: `Start with the ${plan.allies.length} people you already know and get your first introductions.`,
        zh: `从已经认识的 ${plan.allies.length} 位联系人开始，拿到第一批引荐。`,
      });
    case "explore":
      return ally
        ? pick(locale, {
            en: `Start from ${ally.displayName} and your network; learn how ${short} work today.`,
            zh: `从 ${ally.displayName} 和现有人脉切入，弄清${short}现在怎么做事。`,
          })
        : pick(locale, { en: `Learn how ${short} work today and who decides.`, zh: `弄清${short}现在怎么做事、谁说了算。` });
    case "meet":
      return pick(locale, {
        en: `Meet ${plan.newPeople} ${short} through events and introductions${index === 0 ? ", starting this week" : ""}.`,
        zh: `通过活动和引荐认识 ${plan.newPeople} 位${short}${index === 0 ? "，这周就开始" : ""}。`,
      });
    case "push":
      return pick(locale, { en: "Turn conversations into commitments and follow up until they land.", zh: "把聊过的人推进到明确的结果，逐个跟进到落地。" });
    case "scale":
      return pick(locale, { en: "Review what worked and repeat it with more people.", zh: "复盘有效的做法，放大到更多人。" });
  }
}

function needItem(spec: NeedSpec, phaseKey: string): NewPlanItemInput {
  return {
    criteria: {
      description: spec.description,
      primaryIndustryId: spec.primaryIndustryId,
      secondaryIndustryId: spec.secondaryIndustryId,
      titleKeywords: spec.titleKeywords,
    },
    kind: "network_need",
    phaseKey,
    title: spec.title,
  };
}

function phaseDetail(input: PlanGeneratorInput, plan: Plan, frame: PhaseFrame, index: number): PlanPhaseDetail {
  const { locale } = input;
  const short = pick(locale, plan.archetype.short);
  const isLast = index === plan.frames.length - 1;
  // 一年期只有第一段细到周；其余段的条目不带建议周次。
  const at = (week: number) => (frame.detailed ? Math.min(Math.max(week, frame.startWeek), frame.endWeek) : null);
  const items: NewPlanItemInput[] = [];
  const needs: NeedSpec[] = [];
  const mid = Math.ceil((frame.startWeek + frame.endWeek) / 2);

  if (index === 0) {
    for (const action of thisWeekActions(input, plan)) {
      items.push({
        contactIds: action.contactIds,
        detail: action.why,
        kind: "action",
        linkedEventId: action.eventIds[0] ?? null,
        phaseKey: frame.key,
        suggestedWeek: at(frame.startWeek),
        title: action.title,
      });
    }
    items.push({
      kind: "action",
      phaseKey: frame.key,
      suggestedWeek: at(frame.startWeek + 1),
      title: pick(locale, { en: `Write down what you learn about how ${short} decide`, zh: `把了解到的${short}的决策方式记下来` }),
    });
    for (const question of plan.archetype.questions) {
      items.push({ kind: "info", phaseKey: frame.key, title: pick(locale, question) });
    }
    needs.push(plan.needs.connector);
  }

  // W0012：一年期后面的季度段在进入时补细（detailed），先安排一条承上启下的行动。
  if (index > 0 && frame.detailed && frame.granularity === "quarter") {
    items.push({
      kind: "action",
      phaseKey: frame.key,
      suggestedWeek: at(frame.startWeek),
      title: pick(locale, {
        en: "Review last quarter and pick the three people to meet first",
        zh: "回顾上一季度，定下这一季度最先要见的 3 个人",
      }),
    });
  }

  if (frame.role === "meet") {
    items.push(
      {
        kind: "action",
        phaseKey: frame.key,
        suggestedWeek: at(frame.startWeek),
        title: pick(locale, { en: `Get contact details for ${plan.newPeople} ${short}`, zh: `拿到 ${plan.newPeople} 位${short}的联系方式` }),
      },
      {
        kind: "action",
        phaseKey: frame.key,
        suggestedWeek: at(mid),
        title: pick(locale, {
          en: `Hold ${Math.max(3, Math.ceil(plan.newPeople * 0.8))} 20-minute conversations`,
          zh: `完成 ${Math.max(3, Math.ceil(plan.newPeople * 0.8))} 次 20 分钟的交流`,
        }),
      },
    );
    needs.push(plan.needs.target);
  }

  if (frame.role === "push") {
    const target = goalTarget(input.goal.text);
    items.push(
      {
        kind: "action",
        phaseKey: frame.key,
        suggestedWeek: at(frame.startWeek),
        title: pick(locale, {
          en: `Make a concrete ask to the ${short} you've met`,
          zh: `向聊过的${short}提出明确的请求`,
        }),
      },
      {
        kind: "action",
        phaseKey: frame.key,
        suggestedWeek: at(frame.endWeek),
        title: target
          ? pick(locale, { en: `Land ${target.value} ${target.unit.en} and collect feedback`.replace(/\s+/g, " "), zh: `达成 ${target.value} ${target.unit.zh}，收集反馈` })
          : pick(locale, { en: "Reach the goal and write down what worked", zh: "达成目标，记下有效的做法" }),
      },
    );
  }

  if (frame.role === "scale") {
    items.push({
      kind: "action",
      phaseKey: frame.key,
      suggestedWeek: at(frame.endWeek),
      title: pick(locale, { en: "Review the year and pick what to repeat", zh: "复盘这一年，选出值得重复的做法" }),
    });
  }

  if (isLast) needs.push(plan.needs.scale);
  // 只有两段的一个月计划：第一段就是「集中接触」，目标人脉在上面已经加过。
  for (const need of needs) items.push(needItem(need, frame.key));

  const phaseEvents = plan.events.filter((entry) => entry.week >= frame.startWeek && entry.week <= frame.endWeek).slice(0, 2);
  for (const entry of phaseEvents) {
    items.push({
      kind: "event",
      linkedEventId: entry.event.id,
      meta: { startsAt: entry.event.startsAt, venue: entry.event.venue },
      phaseKey: frame.key,
      suggestedWeek: at(entry.week),
      title: entry.event.title,
    });
  }

  const followups =
    index === 0
      ? [
          pick(locale, { en: "Same day: send a short thank-you with your one-line intro", zh: "当天：发一句感谢，附上你的一句话介绍" }),
          pick(locale, { en: "Within 3 days: book a 20-minute call to learn how they work", zh: "3 天内：约 20 分钟线上聊，问问 TA 现在怎么做" }),
        ]
      : isLast
        ? [pick(locale, { en: "After each yes: agree the next step and a date in writing", zh: "每拿到一个肯定答复：当场约好下一步和时间" })]
        : [pick(locale, { en: "Within a week of meeting: share one useful thing, then ask for a call", zh: "认识后一周内：先分享一条有用的信息，再约时间聊" })];

  return {
    followups,
    items,
    phaseKey: frame.key,
    who: needs.map((need) => need.title),
  };
}
