/**
 * 「我的计划」（`/app/agent/plan`，RW-10，Sprint W0009）route view-model。
 *
 * 只读当前生效计划（W0007 `PlanService.getCurrent()` 的 `PlanSnapshot`），不再聚合跟进队列
 * 与操作账本；旧版「4 周推进节奏」占位整块拿掉。本文件不 import React，node 测试直接用。
 *
 * - 周次与本周行动：`features/plans/week.ts`（第 1 周 = `startsOn`，东京日历日；逾期滚进本周；
 *   已完成的不在本周）。界面上刚打勾的行动可以经 `stickyActionIds` 暂留一行（划线、可撤销），
 *   那是页面的本地状态，刷新后消失；它不占首页「最多 3 件」的名额。
 * - 「对应哪位要认识的人」只在阶段里恰好有一个人脉需求时才说（计划里没有活动 → 人脉需求的结构化
 *   关联）；一个阶段有多个人脉需求时只说阶段，不替用户挑一个。
 * - 目标分析：W0008 存在 `plans.analysis` 里的 `PlanAnalysisV1`（一句话回答、关键数字、最大风险、
 *   还缺的人、30 秒自我介绍、每阶段跟进方式）。不是第一份计划生成的计划没有这些块，相应位置隐藏。
 * - 联系人名字：计划只存 id。名字来自生成时的快照（`analysis.allies`）与调用方传入的
 *   `contactNames`；都没有时显示「联系人」并链接到联系人页，不编造。
 * - 同一份快照还给 iOrbit 首页「本周推进」（`buildPlanWeekSummary`）与活动推荐理由
 *   （`planEventReasons`，RW-07）用，三处口径一致。
 */
import type {
  PlanContactLink,
  PlanItem,
  PlanLogEntry,
  PlanSnapshot,
} from "../../../../../features/plans/contract";
import type { PlanAnalysisV1 } from "../../../../../features/plans/generator";
import {
  comparePlanWeekActions,
  planTokyoDate,
  planWeekActions,
  planWeeksOverdue,
  planWeekRange,
  planWeekState,
  type PlanWeekAction,
} from "../../../../../features/plans/week";
import {
  industryLabel,
  secondaryIndustryLabel,
} from "../../../../../shared/domain/industries";

type Lang = "en" | "zh";

export interface MyPlanContactName {
  name: string;
  subtitle: string | null;
}

export interface MyPlanAction {
  id: string;
  title: string;
  detail: string | null;
  done: boolean;
  /** 逾期周数（本周为 0）：「已延后 N 周」。 */
  weeksOverdue: number;
  weekLabel: string;
}

export interface MyPlanRulerPhase {
  n: number;
  title: string;
  startWeek: number;
  span: number;
  current: boolean;
}

export interface MyPlanPhase {
  key: string;
  n: number;
  title: string;
  weeksLabel: string;
  summary: string | null;
  current: boolean;
  actionsDone: number;
  actionsTotal: number;
  actions: Array<{ id: string; title: string; weekLabel: string | null; done: boolean }>;
  who: string[];
  infos: Array<{ id: string; title: string; answer: string | null }>;
  events: Array<{ id: string; title: string; dateLabel: string | null; status: PlanItem["status"] }>;
  followups: string[];
  /** 30 秒自我介绍只挂在当前阶段（它是整份计划的一段话）。 */
  pitch: { setting: string; text: string } | null;
}

export interface MyPlanNeed {
  id: string;
  title: string;
  industry: string | null;
  established: number;
  linked: number;
  /** 按关联时间倒序（新的在前）。 */
  people: Array<{
    contactId: string;
    initial: string;
    name: string;
    subtitle: string | null;
    known: boolean;
    state: PlanContactLink["state"];
  }>;
  /** W0010 的「待确认 N」角标；本 Sprint 恒为 0（不显示）。 */
  pendingMatches: number;
}

export interface MyPlanEvent {
  id: string;
  eventId: string | null;
  title: string;
  dateLabel: string | null;
  status: PlanItem["status"];
  phaseNo: number | null;
  need: string | null;
}

export interface MyPlanLogLine {
  id: string;
  kind: PlanLogEntry["kind"];
  timeLabel: string;
  text: string;
}

export interface MyPlanView {
  planId: string;
  version: number;
  goal: string;
  generatedLabel: string;
  supplement: string | null;
  analysis: {
    answer: string;
    figures: string[];
    risk: string;
    gaps: string[];
  } | null;
  week: {
    current: number;
    total: number;
    ended: boolean;
    rangeLabel: string;
    phaseNo: number | null;
    phaseTitle: string | null;
  };
  ruler: {
    phases: MyPlanRulerPhase[];
    weeks: Array<{ no: number; state: "past" | "now" | "future" }>;
    startLabel: string;
    endLabel: string;
  };
  thisWeek: MyPlanAction[];
  phases: MyPlanPhase[];
  needs: MyPlanNeed[];
  events: MyPlanEvent[];
  log: MyPlanLogLine[];
  counts: { actionsDone: number; actionsTotal: number; contactsEstablished: number };
}

export type MyPlanViewModel =
  | { state: "ready"; view: MyPlanView }
  | { state: "none"; startHref: string }
  | { state: "unavailable" };

function monthDay(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function eventDateLabel(startsAt: unknown): string | null {
  if (typeof startsAt !== "string") return null;
  const ms = Date.parse(startsAt);
  return Number.isFinite(ms) ? monthDay(planTokyoDate(new Date(ms))) : null;
}

function isBootstrapAnalysis(value: Record<string, unknown>): value is Record<string, unknown> & PlanAnalysisV1 {
  return value.kind === "plan_bootstrap" && value.version === 1 && Array.isArray(value.answer);
}

function weekLabel(lang: Lang, week: number): string {
  return lang === "zh" ? `第 ${week} 周` : `Week ${week}`;
}

function weeksLabel(lang: Lang, start: number, end: number): string {
  if (start === end) return weekLabel(lang, start);
  return lang === "zh" ? `第 ${start}–${end} 周` : `Weeks ${start}–${end}`;
}

const byPlanOrder = (a: PlanItem, b: PlanItem) =>
  (a.suggestedWeek ?? Number.MAX_SAFE_INTEGER) - (b.suggestedWeek ?? Number.MAX_SAFE_INTEGER) || a.sortKey - b.sortKey;

/** 阶段 key → 这一阶段唯一的人脉需求标题（阶段里没有或多于一个人脉需求时不在表里）。 */
function singleNeedByPhase(items: readonly PlanItem[]): Map<string, string> {
  const byPhase = new Map<string, string[]>();
  for (const item of items) {
    if (item.kind !== "network_need" || !item.phaseKey) continue;
    byPhase.set(item.phaseKey, [...(byPhase.get(item.phaseKey) ?? []), item.title]);
  }
  const single = new Map<string, string>();
  for (const [phaseKey, titles] of byPhase) if (titles.length === 1) single.set(phaseKey, titles[0]!);
  return single;
}

/** 本周未完成的行动 + 界面暂留的刚打勾行（去重，同一顺序规则）。 */
function mergeSticky(
  base: readonly PlanWeekAction[],
  items: readonly PlanItem[],
  stickyIds: readonly string[] | undefined,
  currentWeek: number,
): PlanWeekAction[] {
  if (!stickyIds?.length) return [...base];
  const present = new Set(base.map((entry) => entry.item.id));
  const wanted = new Set(stickyIds);
  const extra = items
    .filter(
      (item) =>
        wanted.has(item.id) &&
        !present.has(item.id) &&
        item.kind === "action" &&
        item.suggestedWeek !== null &&
        item.suggestedWeek <= currentWeek,
    )
    .map((item) => ({ item, weeksOverdue: planWeeksOverdue(item, currentWeek) }));
  return [...base, ...extra].sort(comparePlanWeekActions);
}

function toAction(entry: PlanWeekAction, lang: Lang, fallbackWeek: number): MyPlanAction {
  return {
    detail: entry.item.detail,
    done: entry.item.status === "done",
    id: entry.item.id,
    title: entry.item.title,
    weekLabel: weekLabel(lang, entry.item.suggestedWeek ?? fallbackWeek),
    weeksOverdue: entry.weeksOverdue,
  };
}

/** 生成时的联系人快照（`analysis.allies`）+ 调用方补充的名字。 */
function contactNameMap(
  analysis: PlanAnalysisV1 | null,
  extra: Readonly<Record<string, MyPlanContactName>> | undefined,
): Map<string, MyPlanContactName> {
  const names = new Map<string, MyPlanContactName>();
  for (const ally of analysis?.allies ?? []) {
    if (ally?.contactId && ally.name) names.set(ally.contactId, { name: ally.name, subtitle: ally.subtitle ?? null });
  }
  for (const [id, value] of Object.entries(extra ?? {})) names.set(id, value);
  return names;
}

/** 整份计划里已建立联系的联系人（去重）。 */
function establishedContacts(items: readonly PlanItem[]): number {
  const ids = new Set<string>();
  for (const item of items) {
    for (const link of item.contactLinks) if (link.state === "established") ids.add(link.contactId);
  }
  return ids.size;
}

function needIndustry(item: PlanItem, lang: Lang): string | null {
  const criteria = item.criteria;
  if (!criteria?.primaryIndustryId) return null;
  const primary = industryLabel(criteria.primaryIndustryId, lang);
  return criteria.secondaryIndustryId
    ? `${primary} › ${secondaryIndustryLabel(criteria.secondaryIndustryId, lang)}`
    : primary;
}

function logTimeLabel(createdAt: string, now: Date, lang: Lang): string {
  const at = new Date(createdAt);
  if (!Number.isFinite(at.getTime())) return "";
  const day = planTokyoDate(at);
  if (day === planTokyoDate(now)) {
    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hour12: false,
      minute: "2-digit",
      timeZone: "Asia/Tokyo",
    }).format(at);
    return lang === "zh" ? `今天 ${time}` : `Today ${time}`;
  }
  return monthDay(day);
}

const ACTION_STATUS_TEXT: Record<string, { en: string; zh: string }> = {
  done: { en: "Completed", zh: "完成" },
  in_progress: { en: "Started", zh: "开始" },
  not_started: { en: "Reopened", zh: "撤销完成" },
};
const EVENT_STATUS_TEXT: Record<string, { en: string; zh: string }> = {
  attended: { en: "Attended", zh: "参加" },
  recommended: { en: "Cancelled registration for", zh: "取消报名" },
  registered: { en: "Registered for", zh: "报名" },
};

/**
 * 进展记录的一行文字：按 `event` 与结构化引用拼，条目标题取自快照；拼不出时用服务端的
 * 兜底文字 `body`（中文）。手动记录一律原样显示。
 */
export function planLogText(
  entry: PlanLogEntry,
  itemsById: ReadonlyMap<string, PlanItem>,
  names: ReadonlyMap<string, MyPlanContactName>,
  lang: Lang,
): string {
  if (entry.kind === "manual") return entry.body;
  const item = entry.itemId ? itemsById.get(entry.itemId) : undefined;
  const quote = (title: string) => (lang === "zh" ? `「${title}」` : `“${title}”`);
  const contact = entry.linkedContactIds[0]
    ? names.get(entry.linkedContactIds[0])?.name ?? (lang === "zh" ? "联系人" : "A contact")
    : null;
  switch (entry.event) {
    case "item_status_changed": {
      if (!item || !entry.toStatus) break;
      const table = item.kind === "event" ? EVENT_STATUS_TEXT : ACTION_STATUS_TEXT;
      const verb = table[entry.toStatus];
      if (!verb) break;
      return lang === "zh" ? `${verb.zh}${quote(item.title)}` : `${verb.en} ${quote(item.title)}`;
    }
    case "contact_linked":
      if (!item || !contact) break;
      return lang === "zh" ? `${contact} 关联到${quote(item.title)}` : `${contact} linked to ${quote(item.title)}`;
    case "contact_established":
      if (!item || !contact) break;
      return lang === "zh" ? `与 ${contact} 建立联系（${quote(item.title)}）` : `Connected with ${contact} (${quote(item.title)})`;
    case "contact_unlinked":
      if (!item || !contact) break;
      return lang === "zh" ? `${contact} 取消关联${quote(item.title)}` : `${contact} unlinked from ${quote(item.title)}`;
    case "answer_updated":
      if (!item) break;
      return lang === "zh" ? `记录答案：${quote(item.title)}` : `Answer noted: ${quote(item.title)}`;
    case "plan_created":
      if (lang === "en") return "Plan created";
      break;
    default:
      break;
  }
  return entry.body;
}

export function buildMyPlanViewModel(input: {
  language: Lang;
  /** null = 没有生效计划；"unavailable" = 计划服务读不到。 */
  snapshot: PlanSnapshot | null | "unavailable";
  now: Date;
  /** 引导开关打开时无计划引导去 `/app/start`（第 3 步），否则回 iOrbit。 */
  guideEnabled: boolean;
  contactNames?: Readonly<Record<string, MyPlanContactName>>;
  /** 界面上刚打勾（或取消）过的行动：已完成也暂留在本周列表里，直到刷新。 */
  stickyActionIds?: readonly string[];
}): MyPlanViewModel {
  if (input.snapshot === "unavailable") return { state: "unavailable" };
  if (input.snapshot === null) {
    return { startHref: input.guideEnabled ? "/app/start" : "/app/agent", state: "none" };
  }
  const lang = input.language;
  const { plan, items, log } = input.snapshot;
  const analysis = isBootstrapAnalysis(plan.analysis) ? plan.analysis : null;
  const names = contactNameMap(analysis, input.contactNames);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const week = planWeekState(plan, input.now);
  const range = planWeekRange(plan.startsOn, week.displayWeek);
  const analysisPhases = new Map((analysis?.phases ?? []).map((phase) => [phase.key, phase]));
  const phaseNoByKey = new Map(plan.phases.map((phase, index) => [phase.key, index + 1]));
  const needTitleByPhase = singleNeedByPhase(items);

  const actions = items.filter((item) => item.kind === "action");
  const actionsDone = actions.filter((item) => item.status === "done").length;
  const currentPhase = week.phaseIndex >= 0 ? plan.phases[week.phaseIndex] : undefined;

  const thisWeek: MyPlanAction[] = mergeSticky(
    planWeekActions(items, week.currentWeek),
    items,
    input.stickyActionIds,
    week.currentWeek,
  ).map((entry) => toAction(entry, lang, week.displayWeek));

  const phases: MyPlanPhase[] = plan.phases.map((phase, index) => {
    const own = items.filter((item) => item.phaseKey === phase.key).sort(byPlanOrder);
    const ownActions = own.filter((item) => item.kind === "action");
    const current = index === week.phaseIndex;
    return {
      actions: ownActions.map((item) => ({
        done: item.status === "done",
        id: item.id,
        title: item.title,
        weekLabel: item.suggestedWeek === null ? null : weekLabel(lang, item.suggestedWeek),
      })),
      actionsDone: ownActions.filter((item) => item.status === "done").length,
      actionsTotal: ownActions.length,
      current,
      events: own
        .filter((item) => item.kind === "event")
        .map((item) => ({ dateLabel: eventDateLabel(item.meta.startsAt), id: item.id, status: item.status, title: item.title })),
      followups: analysisPhases.get(phase.key)?.followups ?? [],
      infos: own
        .filter((item) => item.kind === "info")
        .map((item) => ({ answer: item.answer?.trim() ? item.answer : null, id: item.id, title: item.title })),
      key: phase.key,
      n: index + 1,
      pitch: current && analysis?.pitch?.text ? analysis.pitch : null,
      summary: phase.summary,
      title: phase.title,
      weeksLabel: weeksLabel(lang, phase.startWeek, phase.endWeek),
      who: own.filter((item) => item.kind === "network_need").map((item) => item.title),
    };
  });

  const needs: MyPlanNeed[] = items
    .filter((item) => item.kind === "network_need")
    .sort((a, b) => a.sortKey - b.sortKey)
    .map((item) => ({
      established: item.contactLinks.filter((link) => link.state === "established").length,
      id: item.id,
      industry: needIndustry(item, lang),
      linked: item.contactLinks.length,
      pendingMatches: 0,
      people: [...item.contactLinks]
        .sort((a, b) => b.linkedAt.localeCompare(a.linkedAt) || a.contactId.localeCompare(b.contactId))
        .map((link) => {
          const known = names.get(link.contactId);
          const name = known?.name ?? (lang === "zh" ? "联系人" : "Contact");
          return {
            contactId: link.contactId,
            initial: Array.from(name.trim())[0] ?? "·",
            known: Boolean(known),
            name,
            state: link.state,
            subtitle: known?.subtitle ?? null,
          };
        }),
      title: item.title,
    }));

  const events: MyPlanEvent[] = items
    .filter((item) => item.kind === "event")
    .sort((a, b) => String(a.meta.startsAt ?? "").localeCompare(String(b.meta.startsAt ?? "")) || a.sortKey - b.sortKey)
    .map((item) => ({
      dateLabel: eventDateLabel(item.meta.startsAt),
      eventId: item.linkedEventId,
      id: item.id,
      need: item.phaseKey ? needTitleByPhase.get(item.phaseKey) ?? null : null,
      phaseNo: item.phaseKey ? phaseNoByKey.get(item.phaseKey) ?? null : null,
      status: item.status,
      title: item.title,
    }));

  const totalWeeks = week.totalWeeks;
  return {
    state: "ready",
    view: {
      analysis: analysis
        ? {
            answer: analysis.answer.map((segment) => segment.text).join(""),
            figures: (analysis.figures ?? []).slice(0, 3).map((figure) => `${figure.value} ${figure.unit} · ${figure.label}`),
            gaps: analysis.gaps ?? [],
            risk: analysis.risk ?? "",
          }
        : null,
      counts: { actionsDone, actionsTotal: actions.length, contactsEstablished: establishedContacts(items) },
      events,
      generatedLabel: monthDay(planTokyoDate(new Date(plan.createdAt))),
      goal: plan.goalSnapshot,
      log: log.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        text: planLogText(entry, itemsById, names, lang),
        timeLabel: logTimeLabel(entry.createdAt, input.now, lang),
      })),
      needs,
      phases,
      planId: plan.id,
      ruler: {
        endLabel: lang === "zh" ? `${monthDay(week.endsOn)} 结束` : `Ends ${monthDay(week.endsOn)}`,
        phases: plan.phases.map((phase, index) => ({
          current: index === week.phaseIndex,
          n: index + 1,
          span: Math.max(1, phase.endWeek - phase.startWeek + 1),
          startWeek: Math.max(1, phase.startWeek),
          title: phase.title,
        })),
        startLabel: lang === "zh" ? `${monthDay(plan.startsOn)} 开始` : `Starts ${monthDay(plan.startsOn)}`,
        weeks: Array.from({ length: totalWeeks }, (_, index) => {
          const no = index + 1;
          return { no, state: no < week.displayWeek ? "past" : no === week.displayWeek ? "now" : "future" } as const;
        }),
      },
      supplement: analysis?.request?.supplement?.trim() || null,
      thisWeek,
      version: plan.version,
      week: {
        current: week.displayWeek,
        ended: week.ended,
        phaseNo: currentPhase ? week.phaseIndex + 1 : null,
        phaseTitle: currentPhase?.title ?? null,
        rangeLabel: `${monthDay(range.start)} – ${monthDay(range.end)}`,
        total: totalWeeks,
      },
    },
  };
}

/** iOrbit 首页「本周推进」要的那一小块（SC-W0009-04）。 */
export interface PlanWeekSummary {
  planId: string;
  phaseNo: number | null;
  phaseTitle: string | null;
  week: number;
  totalWeeks: number;
  /** 本周最多 3 件行动。 */
  actions: MyPlanAction[];
  actionsDone: number;
  actionsTotal: number;
  contactsEstablished: number;
}

export const PLAN_HOME_ACTION_LIMIT = 3;

/**
 * 首页的 3 个名额只给本周未完成的行动；首页上刚打勾的行（`stickyActionIds`）另外暂留，不占名额。
 */
export function buildPlanWeekSummary(
  snapshot: PlanSnapshot,
  now: Date,
  language: Lang,
  stickyActionIds: readonly string[] = [],
): PlanWeekSummary {
  const model = buildMyPlanViewModel({ guideEnabled: false, language, now, snapshot });
  if (model.state !== "ready") throw new Error("A plan snapshot always builds a ready view.");
  const { view } = model;
  const week = planWeekState(snapshot.plan, now);
  const slots = planWeekActions(snapshot.items, week.currentWeek).slice(0, PLAN_HOME_ACTION_LIMIT);
  const actions = mergeSticky(slots, snapshot.items, stickyActionIds, week.currentWeek).map((entry) =>
    toAction(entry, language, week.displayWeek),
  );
  return {
    actions,
    actionsDone: view.counts.actionsDone,
    actionsTotal: view.counts.actionsTotal,
    contactsEstablished: view.counts.contactsEstablished,
    phaseNo: view.week.phaseNo,
    phaseTitle: view.week.phaseTitle,
    planId: view.planId,
    totalWeeks: view.week.total,
    week: view.week.current,
  };
}

/** 活动推荐理由（RW-07）：活动 id → 它在计划里对应的阶段与要认识的人。 */
export interface PlanEventReason {
  phaseNo: number;
  /** 阶段里恰好一个人脉需求时是它的标题；没有或有多个时是阶段名（不替用户挑一个）。 */
  target: string;
  /** true = target 是人脉需求（「认识 ___」）；false = 阶段名。 */
  isNeed: boolean;
}

/**
 * 计划里的活动条目（以及挂了活动的行动）→ 所在阶段。同一场活动出现多次时取最早的阶段。
 * 计划里活动与人脉需求之间没有结构化关联，所以只有阶段里恰好一个人脉需求时才写「认识 ___」。
 * 没有阶段归属的条目不产生理由（推荐页保持原来的目标词理由）。
 */
export function planEventReasons(snapshot: PlanSnapshot): Record<string, PlanEventReason> {
  const { plan, items } = snapshot;
  const phaseNoByKey = new Map(plan.phases.map((phase, index) => [phase.key, index + 1]));
  const phaseTitleByKey = new Map(plan.phases.map((phase) => [phase.key, phase.title]));
  const needByPhase = singleNeedByPhase(items);
  const reasons: Record<string, PlanEventReason> = {};
  const linked = items
    .filter((item) => (item.kind === "event" || item.kind === "action") && item.linkedEventId && item.phaseKey)
    .sort((a, b) => Number(b.kind === "event") - Number(a.kind === "event"));
  for (const item of linked) {
    const phaseNo = phaseNoByKey.get(item.phaseKey!);
    if (!phaseNo) continue;
    const eventId = item.linkedEventId!;
    const existing = reasons[eventId];
    if (existing && existing.phaseNo <= phaseNo) continue;
    const need = needByPhase.get(item.phaseKey!);
    reasons[eventId] = need
      ? { isNeed: true, phaseNo, target: need }
      : { isNeed: false, phaseNo, target: phaseTitleByKey.get(item.phaseKey!) ?? "" };
  }
  return reasons;
}
