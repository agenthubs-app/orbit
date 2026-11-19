/**
 * One period of a scheduled rule (agent-design AG15; 设计稿 §5.3, §3.5, §3.8; PLANNER 易错边界 2/5/8/10).
 *
 * Read-only, under the rule owner's authorization, with no client open:
 *   1. the notes the rule references are read again by id (their latest readable version) — one that cannot be read
 *      makes the period "needs attention"; no other note or memory stands in for the ranking basis;
 *   2. the candidates are read by the rule's scope (code): events in a window counted from the period, contacts by
 *      industry and days without a recorded interaction, to-dos past their planned day;
 *   3. records this rule told its owner about before are left out;
 *   4. the same rankCandidates() a conversation uses orders them (at most 30 candidates go to the judgment model);
 *   5. the result is written by code in the rule's language: the basis, the dates or the coverage, the list.
 * A rule that re-plans to-dos proposes a card instead (origin: the rule and the period); nothing is written until the
 * owner confirms it from the inbox. The main model is not called.
 */
import { createHash } from "node:crypto";

import type { CardOperationIntent } from "../runtime/card-operations";
import type { AgentActionOrigin } from "../runtime/contract";
import { memoriesFor, type TimePreference } from "../../agent-v1/functions/basis";
import { rankCandidates, type RankCandidate, type RankResult } from "../../agent-v1/functions/rank";
import type { AgentRecordAccess } from "../../agent-v1/graph/deps";
import { contactCandidates, contactLine, eventCandidate, eventLine, openTodos, visibleEvent } from "../../agent-v1/graph/nodes/functions";
import { askJudgment, newJudgmentBudget, type JudgmentAccess } from "../../agent-v1/judgment/ask";
import { rankJudgmentInput } from "../../agent-v1/judgment/funnel";
import { emitTrace, evalDeniedReads } from "../../agent-v1/observability/trace";
import {
  agentAutomationDayStart,
  agentAutomationLocalDay,
  agentAutomationScheduleTimeZone,
  type AgentAutomation,
  type AgentRuleSpec,
} from "./contract";
import type { RuleMemoryRecall } from "./recall-seam";
import type { AgentAutomationRunItem, AgentAutomationRunRecord } from "./runs";

type Language = "zh" | "en" | "ja";

export interface RuleCardAccess {
  /** Freezes the period's card in the owner's ledger (idempotent by id); null when nothing could be put on it. */
  freeze(input: { actionId: string; origin: AgentActionOrigin; locale: string; intents: readonly CardOperationIntent[]; createdAt: string }): Promise<{ actionId: string; preview: string; expiresAt?: string } | null>;
  /** The earlier period's card of the same rule, still waiting: the new card takes its place. */
  supersede(actionId: string): Promise<void>;
}

export interface RuleRunDeps {
  records: AgentRecordAccess;
  judgment?: JudgmentAccess | null;
  /** AG14's recallFor() behind a seam (recall-seam.ts); absent: nothing is recalled. */
  recall?: RuleMemoryRecall;
  cards?: RuleCardAccess | null;
  workspaceId: string;
  now(): string;
}

export interface RulePeriodResult {
  outcome: "computed" | "no_match" | "needs_attention" | "failed";
  text: string;
  items: AgentAutomationRunItem[];
  cardId?: string;
  cardExpiresAt?: string;
  attention?: AgentAutomationRunRecord["attention"];
  error?: string;
  coverage?: AgentAutomationRunRecord["coverage"];
}

const pad = (value: number) => String(value).padStart(2, "0");

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + days));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

const weekdayOf = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** The window of events a period looks at, as local days [fromDay, toDay) of the rule's time zone, and its instants. */
export function eventWindowOf(window: "weekend" | "week" | "month" | "upcoming", scheduledAt: string, timeZone: string): { fromDay: string; lastDay: string; from: string; to: string } {
  const runDay = agentAutomationLocalDay(scheduledAt, timeZone);
  let fromDay = runDay;
  let toDay: string;
  if (window === "weekend") {
    const weekday = weekdayOf(runDay);
    // Sunday: what is left of this weekend. Otherwise the Saturday and Sunday that come next (Saturday: today and tomorrow).
    fromDay = weekday === 0 ? runDay : addDays(runDay, 6 - weekday);
    toDay = weekday === 0 ? addDays(runDay, 1) : addDays(fromDay, 2);
  } else if (window === "week") toDay = addDays(runDay, 7);
  else if (window === "month") {
    const [year, month] = runDay.split("-").map(Number);
    toDay = month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  } else toDay = addDays(runDay, 30);
  const start = agentAutomationDayStart(fromDay, timeZone);
  // Events that already started before the period ran are not offered.
  const from = start < scheduledAt ? new Date(scheduledAt).toISOString() : start;
  return { from, fromDay, lastDay: addDays(toDay, -1), to: agentAutomationDayStart(toDay, timeZone) };
}

const WEEKDAY: Record<Language, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "11月20日（周五）", "Fri, Nov 20", "11月20日（金）". */
export function dayWithWeekday(day: string, language: Language): string {
  const [, month, date] = day.split("-").map(Number);
  const weekday = WEEKDAY[language][weekdayOf(day)];
  if (language === "en") return `${weekday}, ${MONTH[month - 1]} ${date}`;
  return `${month}月${date}日（${weekday}）`;
}

function daysWords(fromDay: string, lastDay: string, language: Language): string {
  if (fromDay === lastDay) return dayWithWeekday(fromDay, language);
  if (language === "en") return `${dayWithWeekday(fromDay, language)} to ${dayWithWeekday(lastDay, language)}`;
  if (language === "ja") return `${dayWithWeekday(fromDay, language)}から${dayWithWeekday(lastDay, language)}まで`;
  return `${dayWithWeekday(fromDay, language)}到${dayWithWeekday(lastDay, language)}`;
}

const UNIT = { contact: { en: "contacts", ja: "人", zh: "位" }, event: { en: "events", ja: "件", zh: "场" }, todo: { en: "to-dos", ja: "件", zh: "条" } } as const;
const NOUN = { contact: { en: "contacts", ja: "連絡先", zh: "联系人" }, event: { en: "events", ja: "イベント", zh: "活动" }, todo: { en: "to-dos", ja: "タスク", zh: "待办" } } as const;

/** The card id of a rule's period: one card per rule version and period. */
export function ruleCardId(input: { ownerId: string; automationId: string; version: number; scheduledAt: string }): string {
  return `action:rule:${createHash("sha256").update(JSON.stringify([input.ownerId, input.automationId, input.version, new Date(input.scheduledAt).toISOString()])).digest("hex").slice(0, 32)}`;
}

type Candidate = RankCandidate & { view: { ref: string; version: string } };

export async function runRulePeriod(deps: RuleRunDeps, input: { automation: AgentAutomation; ownerId: string; scheduledAt: string; told: ReadonlySet<string>; previousCardId?: string | null }): Promise<RulePeriodResult> {
  const { automation, ownerId, scheduledAt } = input;
  const rule = automation.rule;
  if (!rule || automation.trigger.kind !== "schedule") return { error: "The rule has no parameters to run with.", items: [], outcome: "failed", text: "" };
  const language = rule.locale;
  const timeZone = agentAutomationScheduleTimeZone(automation.trigger.schedule);
  const scope = deps.records.scope(ownerId);
  const periodDay = agentAutomationLocalDay(scheduledAt, timeZone);
  const head = ({
    en: `Scheduled task "${automation.title}" — run of ${dayWithWeekday(periodDay, language)}`,
    ja: `定期タスク「${automation.title}」${dayWithWeekday(periodDay, language)}の回`,
    zh: `定时任务「${automation.title}」${dayWithWeekday(periodDay, language)}这一期`,
  } as const)[language];

  // 1. The referenced notes, read again by id under the owner's authorization.
  let topic: string | null = rule.ranking.topic?.trim() || null;
  let basisNote: string | null = null;
  for (const reference of rule.references) {
    let body = "";
    let title = reference.title ?? "";
    try {
      const view = (await deps.records.reader.read("memo", scope, { id: reference.id })).items[0];
      body = view ? String(view.fields.body ?? "") : "";
      if (view?.fields.title) title = String(view.fields.title);
    } catch (error) {
      emitTrace({ automationId: automation.automationId, error: error instanceof Error ? error.message : String(error), type: "read.error", where: "rule.reference" });
    }
    if (!body.trim()) {
      const name = title || reference.id;
      const message = ({
        en: `The note "${name}" this task picks by can no longer be read, so this run picked nothing. Choose another note for the task, or pause it.`,
        ja: `このタスクが基準にしているメモ「${name}」が読めなくなったため、今回は何も選んでいません。別のメモを選び直すか、タスクを停止してください。`,
        zh: `这条任务用来挑选的笔记「${name}」读不到了，所以这一期没有挑。请给任务换一篇笔记，或者先暂停它。`,
      } as const)[language];
      emitTrace({ automationId: automation.automationId, reference: reference.id, scheduledAt, type: "rule.reference_unreadable" });
      return { attention: { message, reason: "reference_unreadable", reference: { id: reference.id, type: reference.type, ...(title ? { title } : {}) } }, items: [], outcome: "needs_attention", text: `${head}\n${message}` };
    }
    topic = body;
    basisNote = title || null;
  }

  // 2. A rule that re-plans to-dos proposes a card.
  if (rule.action === "replan") return replanPeriod(deps, { automation, head, language, ownerId, periodDay, previousCardId: input.previousCardId ?? null, rule, scheduledAt });

  // 3. Saved memory that applies with nobody present (constraints are hard conditions; preferences only rank).
  const domain = rule.scope.domain as "event" | "contact";
  const memories = deps.recall ? await deps.recall({ actorId: ownerId, domain, now: deps.now(), timeZone, workspaceId: deps.workspaceId }).catch(() => []) : [];
  const recalled = memoriesFor(domain, memories);
  if (recalled.length) emitTrace({ automationId: automation.automationId, memories: recalled.map((item) => item.memory.id), type: "memory.recall", where: "rule" });
  const time: TimePreference[] = domain === "event" ? recalled.flatMap((item) => (item.time ? [item.time] : [])) : [];

  // 4. Candidates and hard conditions (code).
  let candidates: Candidate[] = [];
  let hard: (candidate: Candidate) => boolean = () => true;
  let timeOf: ((candidate: Candidate) => string | null) | undefined;
  let scopeLine: string;
  const lineOf = (candidate: Candidate) => (domain === "event" ? eventLine(candidate as never, language, null, timeZone) : contactLine(candidate as never, language, null));
  if (rule.scope.domain === "event") {
    const window = eventWindowOf(rule.scope.window, scheduledAt, timeZone);
    const topics = (rule.scope.topics ?? []).map((word) => word.toLowerCase());
    const denied = evalDeniedReads();
    const all = deps.records.listEvents ? await deps.records.listEvents() : [];
    candidates = all.filter((event) => visibleEvent(event, ownerId) && !denied.has(event.eventId)).map(eventCandidate) as unknown as Candidate[];
    timeOf = (candidate) => (candidate as unknown as { startsAt: string | null }).startsAt;
    hard = (candidate) => {
      const at = timeOf!(candidate);
      // An event with no announced start is never taken for one inside the window.
      if (!at || at < window.from || at >= window.to) return false;
      return topics.length === 0 || topics.some((word) => candidate.words.toLowerCase().includes(word));
    };
    const days = daysWords(window.fromDay, window.lastDay, language);
    const about = rule.scope.topics?.length ? rule.scope.topics.join(language === "en" ? ", " : "、") : null;
    scopeLine = ({
      en: `events starting ${window.fromDay === window.lastDay ? "on" : "from"} ${days}${about ? ` about ${about}` : ""}`,
      ja: `${days}に始まる${about ? `「${about}」の` : ""}イベント`,
      zh: `${days}开始的${about ? `「${about}」主题的` : ""}活动`,
    } as const)[language];
  } else {
    const contactScope = rule.scope as Extract<AgentRuleSpec["scope"], { domain: "contact" }>;
    const list = await contactCandidates(deps.records, ownerId, true);
    candidates = list as unknown as Candidate[];
    const industries = new Set(contactScope.industries ?? []);
    const places = new Set(contactScope.places ?? []);
    const cutoff = contactScope.quietDays ? agentAutomationLocalDay(new Date(Date.parse(scheduledAt) - contactScope.quietDays * 86_400_000).toISOString(), timeZone) : null;
    hard = (candidate) => {
      const contact = candidate as unknown as { industry: string | null; place: string | null; lastInteraction: string | null };
      if (industries.size && !(contact.industry && industries.has(contact.industry))) return false;
      if (places.size && !(contact.place && places.has(contact.place))) return false;
      // "The last real interaction was more than N days ago": a recorded one, on a day before the cut-off.
      if (cutoff && !(contact.lastInteraction && contact.lastInteraction.slice(0, 10) < cutoff)) return false;
      return true;
    };
    scopeLine = rule.scopeText;
  }
  const inScope = candidates.filter(hard);
  const fresh = inScope.filter((candidate) => !input.told.has(candidate.view.ref));
  emitTrace({ automationId: automation.automationId, domain, inScope: inScope.length, scheduledAt, told: inScope.length - fresh.length, type: "rule.candidates" });

  // 5. The same ranking a conversation uses.
  const field = rule.ranking.field ?? null;
  const natural = domain === "event" ? { direction: "asc" as const, value: (candidate: Candidate) => (candidate as unknown as { startsAt: string | null }).startsAt } : { direction: "desc" as const, value: (candidate: Candidate) => (candidate as unknown as { lastInteraction: string | null }).lastInteraction };
  const valueOf = (name: string) => (candidate: Candidate) => ((candidate as unknown as Record<string, string | null>)[name] ?? null);
  const budget = newJudgmentBudget();
  let result: RankResult<Candidate>;
  try {
    result = await rankCandidates<Candidate>({
      candidates: fresh,
      count: topic ? fresh.length : rule.maxItems,
      field: field ? { direction: field.direction, value: valueOf(field.name) } : null,
      judge: topic ? async (kept) => askJudgment(deps.judgment ?? null, budget, {
        coverage: { afterHardConditions: fresh.length, judged: kept.length, total: candidates.length, truncated: Math.max(0, fresh.length - kept.length) },
        input: rankJudgmentInput(language, topic!, kept.map(({ candidate, key }) => ({ key, text: lineOf(candidate) }))),
        items: kept.map(({ key }) => ({ key, question: "match.level" as const, subject: key })),
        language,
        purpose: "rank",
      }) : undefined,
      mode: "scheduled",
      natural,
      ...(timeOf ? { timeOf } : {}),
      time,
      timeZone,
      topic,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), items: [], outcome: "failed", text: "" };
  }
  // With a topic, only records that fit it are picks: the judgment's match or partial match, or — when it did not
  // answer — the record's own words sharing the topic's. Nothing else is listed to fill the count.
  const picks = (topic ? result.ordered.filter((item) => (result.matched ? item.level === "match" || item.level === "partial" || item.ruleScore > 0 : item.ruleScore > 0)) : result.ordered).slice(0, rule.maxItems);
  const coverage = { afterHardConditions: fresh.length, judged: result.coverage.judged, total: candidates.length, truncated: result.coverage.truncated };
  emitTrace({ automationId: automation.automationId, basis: { field: field?.name ?? null, memory: recalled.map((item) => item.memory.id), topic: Boolean(topic) }, coverage, domain, listed: picks.map((item) => item.candidate.view.ref), matched: result.matched, scheduledAt, semantic: result.semantic, type: "rule.ranked", unmatchedReason: result.unmatchedReason });
  if (!picks.length) return { coverage, items: [], outcome: "no_match", text: "" };

  // 6. The result, written by code.
  const unit = UNIT[domain];
  const noun = NOUN[domain][language];
  const lines: string[] = [({ en: `${head}:`, ja: `${head}：`, zh: `${head}的结果：` } as const)[language]];
  const basis = rule.rankingBasis;
  lines.push(({
    en: `Picked by: ${basis}. From: ${scopeLine} (${inScope.length} in all).`,
    ja: `選び方：${basis}。対象：${scopeLine}（全部で${inScope.length}${unit.ja}）。`,
    zh: `依据：${basis}。范围：${scopeLine}（共${inScope.length}${unit.zh}）。`,
  } as const)[language]);
  const toldBefore = inScope.length - fresh.length;
  if (toldBefore > 0) {
    lines.push(({
      en: `${toldBefore} of them ${toldBefore === 1 ? "was" : "were"} already sent to you by this task and ${toldBefore === 1 ? "is" : "are"} not listed again.`,
      ja: `そのうち${toldBefore}${unit.ja}は、このタスクからすでにお知らせ済みのため、今回は挙げていません。`,
      zh: `其中${toldBefore}${unit.zh}这条任务之前已经告诉过你，这次不再列。`,
    } as const)[language]);
  }
  for (const item of recalled) lines.push(({ en: `Also applied, from what you asked me to remember: ${item.memory.content}.`, ja: `覚えておくよう言われたことも反映しています：${item.memory.content}。`, zh: `同时按你让我记住的这条来办：${item.memory.content}。` } as const)[language]);
  if (topic && result.matched) {
    lines.push(coverage.truncated > 0
      ? ({
        en: `This run looked closely at ${coverage.judged} of them; ${coverage.truncated} more in the scope were not looked at closely, so these are the best fits among the ones looked at, not necessarily among all of those ${noun}.`,
        ja: `今回詳しく見たのは${coverage.judged}${unit.ja}で、対象のうち残りの${coverage.truncated}${unit.ja}は詳しく見ていません。詳しく見た範囲での結果で、対象すべての中で最適という意味ではありません。`,
        zh: `这一期细看了${coverage.judged}${unit.zh}，范围里还有${coverage.truncated}${unit.zh}没有细看；所以这是细看过的范围里的结果，不代表范围里全部${noun}中最合适的。`,
      } as const)[language]
      : ({
        en: `All ${coverage.judged} of them were looked at closely.`,
        ja: `対象の${coverage.judged}${unit.ja}はすべて詳しく見ました。`,
        zh: `范围里的${coverage.judged}${unit.zh}都细看过了。`,
      } as const)[language]);
  } else if (topic) {
    lines.push(({
      en: "This run could not check each one against the topic, so only the ones whose own words share the topic's are listed; others may fit too.",
      ja: "今回はテーマとの照合ができなかったため、記録の言葉がテーマと重なるものだけを挙げています。ほかにも合うものがあるかもしれません。",
      zh: "这一期没能逐个核对是否符合主题，下面只列了记录里的字词和主题对得上的，别的也可能合适。",
    } as const)[language]);
  }
  const items: AgentAutomationRunItem[] = picks.map((item, index) => {
    const line = lineOf(item.candidate);
    lines.push(`${index + 1}. ${line}`);
    const name = (item.candidate as unknown as { title?: string; name?: string });
    return { id: item.candidate.id, kind: domain, line, ref: item.candidate.view.ref, title: name.title ?? name.name ?? "" };
  });
  if (basisNote && !basis.includes(basisNote)) lines.splice(2, 0, ({ en: `Note used: "${basisNote}".`, ja: `使ったメモ：「${basisNote}」。`, zh: `用到的笔记：「${basisNote}」。` } as const)[language]);
  return { coverage, items, outcome: "computed", text: lines.join("\n") };
}

async function replanPeriod(deps: RuleRunDeps, input: { automation: AgentAutomation; rule: AgentRuleSpec; ownerId: string; scheduledAt: string; periodDay: string; language: Language; head: string; previousCardId: string | null }): Promise<RulePeriodResult> {
  const { automation, language, ownerId, periodDay, rule, scheduledAt } = input;
  const scope = deps.records.scope(ownerId);
  const todos = await openTodos(deps.records, { accountId: scope.accountId, workspaceId: scope.workspaceId });
  // Open to-dos whose planned day has passed, oldest planned day first.
  const overdue = todos.filter((todo) => todo.plannedDate && todo.plannedDate < periodDay).sort((left, right) => left.plannedDate!.localeCompare(right.plannedDate!) || left.id.localeCompare(right.id)).slice(0, rule.maxItems);
  emitTrace({ automationId: automation.automationId, domain: "todo", inScope: overdue.length, scheduledAt, type: "rule.candidates" });
  // The earlier period's card, still waiting, gives way: to this period's card, or to "nothing to change any more".
  if (input.previousCardId) await deps.cards?.supersede(input.previousCardId).catch(() => undefined);
  if (!overdue.length) return { items: [], outcome: "no_match", text: "" };
  if (!deps.cards) return { error: "Cards cannot be made here.", items: [], outcome: "failed", text: "" };
  const actionId = ruleCardId({ automationId: automation.automationId, ownerId, scheduledAt, version: automation.version });
  const intents = overdue.map((todo) => ({ capability: "todo.update" as const, set: { plannedDate: periodDay }, targetId: todo.id })) as unknown as CardOperationIntent[];
  const card = await deps.cards.freeze({ actionId, createdAt: deps.now(), intents, locale: language, origin: { firedAt: new Date(scheduledAt).toISOString(), kind: "automation", ruleId: automation.automationId } });
  if (!card) return { items: [], outcome: "no_match", text: "" };
  const text = ({
    en: `${input.head} proposes a change:\n${card.preview}\nNothing is changed until you confirm it here.`,
    ja: `${input.head}からの変更案です：\n${card.preview}\nここで確認するまで、何も変更されません。`,
    zh: `${input.head}提议做一项修改：\n${card.preview}\n在这里确认之后才会修改。`,
  } as const)[language];
  return {
    cardExpiresAt: card.expiresAt,
    cardId: card.actionId,
    items: overdue.map((todo) => ({ id: todo.id, kind: "todo" as const, line: todo.title, ref: todo.ref, title: todo.title })),
    outcome: "computed",
    text,
  };
}
