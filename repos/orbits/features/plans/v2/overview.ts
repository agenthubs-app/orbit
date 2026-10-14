/**
 * R24 プラン概要与人物タイプ詳細的读模型（DESIGN §2.5–2.6）。纯函数：输入是已读出来的计划、类型、记录、
 * 候补、联系人、活动事实，输出是契约形状。分数一律走 `shared/compute/plan-score.ts`，活动分走 `event-score.ts`。
 */
import { unitPoints } from "../../../shared/compute/plan-allocation";
import { planOverviewHref, planTypeHref, type PlanHrefPlatform } from "../../../shared/compute/plan-href";
import { nextAward, PLAN_EVENT_SEGMENT_KEY } from "../../../shared/compute/plan-score";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import { scoreEvent, scoreEventRange, type EventScoreFacts, type EventScoreResult, type EventScoreType } from "../../../shared/compute/event-score";
import { eventDisplayFromItems } from "../../../shared/compute/event-assessment-display";
import { typeAttendees, type AttendeePerson } from "../../../shared/compute/event-attendee-typing";
import { eventEmoji } from "../../../shared/compute/event-emoji";
import { tokyoParts } from "../../../shared/compute/event-score-input";
import type { EventAssessmentScoreItem } from "../../../shared/contract/event-assessment";
import type {
  PlanCandidateView,
  PlanEventOption,
  PlanPendingItem,
  PlanPersonTypeDetail,
  PlanRecentAward,
  PlanStepProgress,
  PlanStepProgressPart,
  PlanStepSuggestion,
  PlanTalkedView,
  PlanTodayChance,
  PlanTypeStats,
} from "../../../shared/contract/plan-v2";
import type { PlanAwardPayload, PlanV2ContactView, PlanV2LogEntry, PlanV2MatchCandidate, PlanV2Row, PlanV2TypeItem } from "./types";

/** 一场库内活动与它的事实（`event-facts.ts` 产出）。 */
export interface PlanEventFact {
  eventId: string;
  title: string;
  startsAt: string;
  venue: string | null;
  facts: EventScoreFacts;
  /** R26：活动 emoji（主办方设的或按关键词）。 */
  emoji?: string;
  /** R26：有评估记录时（外部活动 = 我的评估；库内活动 = 我评估过）→ 評価結果链接。 */
  assessmentId?: string | null;
  /**
   * R26：报名者 / 登壇者 / 展示社的原始事实。有它时 `facts.expected` / `attendeeSource` 由概要按当前计划的人物类型现算
   * （`resolveTypedEvents`，与评估页同一个 `typeAttendees`），所以三处分数一致。
   */
  typing?: { registrants?: readonly AttendeePerson[]; speakers?: readonly AttendeePerson[]; exhibitorCount?: number | null; text?: string | null };
}

/** R26：按这份计划的人物类型补上每类预计人数（有 `typing` 的活动）；没有 `typing` 的原样返回（mock / 旧事实）。 */
export function resolveTypedEvents(events: readonly PlanEventFact[], types: readonly PlanV2TypeItem[]): PlanEventFact[] {
  return events.map((event) => {
    if (!event.typing) return event;
    const typing = typeAttendees({
      exhibitorCount: event.typing.exhibitorCount ?? null,
      registrants: event.typing.registrants ?? null,
      speakers: event.typing.speakers ?? null,
      text: event.typing.text ?? event.title,
      types: types.map((type) => ({ key: type.personType.key, roleSituation: type.roleSituation, shortLabel: type.shortLabel })),
    });
    return { ...event, facts: { ...event.facts, attendeeSource: typing.attendeeSource, expected: typing.expected } };
  });
}

export type ActiveAward = PlanV2LogEntry & { award: PlanAwardPayload };

export interface OverviewInput {
  plan: PlanV2Row;
  types: readonly PlanV2TypeItem[];
  log: readonly PlanV2LogEntry[];
  awards: readonly ActiveAward[];
  candidates: readonly PlanV2MatchCandidate[];
  contacts: ReadonlyMap<string, PlanV2ContactView>;
  events: readonly PlanEventFact[];
  language: PlanCopyLanguage;
  platform: PlanHrefPlatform;
}

const tri = (language: PlanCopyLanguage, text: Record<PlanCopyLanguage, string>) => text[language];

export function typeLetter(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

/** 已计入 base 的人数（含无名字自报；跳过记录不算人）。 */
function metCount(awards: readonly ActiveAward[], key: string): number {
  return awards.filter((entry) => entry.award.typeKey === key && entry.award.part === "base" && entry.award.basis !== "skip").length;
}

function scoreTypes(input: Pick<OverviewInput, "types" | "awards">): EventScoreType[] {
  return input.types.map((type) => ({ allocation: type.allocation, key: type.personType.key, metCount: metCount(input.awards, type.personType.key), skipped: Boolean(type.skippedAt), targetCount: type.targetCount }));
}

/** 已关联或已聊过的联系人（不再当候补）。 */
function knownContacts(type: PlanV2TypeItem, awards: readonly ActiveAward[]): Set<string> {
  const ids = new Set(type.contactLinks.map((link) => link.contactId));
  for (const entry of awards) if (entry.award.typeKey === type.personType.key && entry.award.contactId) ids.add(entry.award.contactId);
  return ids;
}

export function recommendScore(candidate: Pick<PlanV2MatchCandidate, "tier" | "strength">, contact: PlanV2ContactView | undefined, now: string): number {
  const base = candidate.tier === "rule" ? (candidate.strength === "strong" ? 90 : 75) : candidate.strength === "strong" ? 80 : 65;
  const recent = contact?.lastInteractionAt && Date.parse(now) - Date.parse(contact.lastInteractionAt) < 90 * 86_400_000 ? 5 : 0;
  return Math.min(100, base + recent);
}

export function candidatesFor(input: OverviewInput, type: PlanV2TypeItem, now: string): PlanCandidateView[] {
  const known = knownContacts(type, input.awards);
  return input.candidates
    .filter((candidate) => candidate.needItemId === type.id && candidate.status === "pending" && !known.has(candidate.contactId))
    .flatMap((candidate) => {
      const contact = input.contacts.get(candidate.contactId);
      if (!contact) return [];
      return [{
        basis: [{ kind: "record" as const, label: candidate.tier === "rule" ? tri(input.language, { en: "Industry match", ja: "業界が一致", zh: "行业一致" }) : candidate.reason ?? "", ref: candidate.id }],
        candidateId: candidate.id,
        company: contact.organization,
        contactId: contact.id,
        isOrbitUser: contact.isOrbitUser,
        lastContactAt: contact.lastInteractionAt,
        name: contact.name || "—",
        opener: type.personType.opener,
        reason: candidate.reason,
        recommendScore: recommendScore(candidate, contact, now),
        role: contact.role,
      }];
    })
    .sort((a, b) => b.recommendScore - a.recommendScore || a.name.localeCompare(b.name));
}

const CRITERION_REASON: Record<EventAssessmentScoreItem["criterion"], Record<PlanCopyLanguage, string>> = {
  confidence: { en: "How sure the estimate is", ja: "推定の確度", zh: "估计的可靠程度" },
  connections: { en: "People you know who are going", ja: "既存のつながり", zh: "已有的人脉" },
  fit: { en: "People this plan needs", ja: "会える人の適合", zh: "能见到的人是否合适" },
  format: { en: "Format for meeting people", ja: "交流の形式", zh: "交流形式" },
  timeCost: { en: "Time and cost", ja: "時間とコスト", zh: "时间与成本" },
};

function factLines(criterion: EventAssessmentScoreItem["criterion"], fact: PlanEventFact, language: PlanCopyLanguage): string[] {
  const facts = fact.facts;
  const estimated = tri(language, { en: "estimated", ja: "推定", zh: "推测" });
  if (criterion === "timeCost") {
    return [
      facts.fee === null ? `${tri(language, { en: "Fee", ja: "参加費", zh: "费用" })}：${estimated}` : `¥${facts.fee.toLocaleString("ja-JP")}`,
      facts.travelMinutes === null ? `${tri(language, { en: "Travel", ja: "移動", zh: "路程" })}：${estimated}` : tri(language, { en: `${facts.travelMinutes} min away`, ja: `移動 ${facts.travelMinutes}分`, zh: `路程 ${facts.travelMinutes} 分钟` }),
    ];
  }
  if (criterion === "connections") {
    if (facts.firstDegree === null && facts.secondDegree === null) return [estimated];
    return [tri(language, { en: `${facts.firstDegree ?? 0} people you know are going`, ja: `人脈から ${facts.firstDegree ?? 0}名が参加予定`, zh: `人脉中 ${facts.firstDegree ?? 0} 人会去` })];
  }
  if (criterion === "format") {
    if (facts.networkingMinutes === null && facts.nameTags === null) return [estimated];
    return [tri(language, { en: `Networking ${facts.networkingMinutes ?? 0} min`, ja: `交流タイム ${facts.networkingMinutes ?? 0}分`, zh: `交流时间 ${facts.networkingMinutes ?? 0} 分钟` })];
  }
  if (criterion === "confidence") {
    const source: Record<EventScoreFacts["attendeeSource"], Record<PlanCopyLanguage, string>> = {
      none: { en: "No attendee information", ja: "参加者情報なし", zh: "没有参会者信息" },
      organizer: { en: "Organizer's description only", ja: "主催者の説明のみ", zh: "只有主办方说明" },
      past: { en: "Past editions only", ja: "過去回の参加者のみ", zh: "只有往届参会者" },
      registrants: { en: "Registrant tags are public", ja: "申込者タグ公開", zh: "报名者标签公开" },
      speakers: { en: "Speakers public, attendees not", ja: "登壇者のみ公開", zh: "只公开了演讲者" },
    };
    return [tri(language, source[facts.attendeeSource])];
  }
  const counts = Object.entries(facts.expected).filter(([, count]) => count > 0);
  return counts.length ? counts.map(([key, count]) => `${key} · ${count}`) : [estimated];
}

export function eventScoreView(result: EventScoreResult, fact: PlanEventFact, language: PlanCopyLanguage): PlanEventOption["score"] {
  return {
    rubricVersion: result.rubricVersion,
    scoreBreakdown: result.items.map((item) => ({ criterion: item.criterion, estimated: item.estimated, facts: factLines(item.criterion, fact, language), max: item.max, reason: tri(language, CRITERION_REASON[item.criterion]), score: item.score })),
    total: result.total,
    verdict: result.verdict,
  };
}

/** R26：适配 chip（「VC 約5名 · 起業家 約12名」）：还没满的人物类型里配点最高的两类；报名者标签公开时不写「約」。 */
export function fitLabel(input: Pick<OverviewInput, "types" | "awards" | "language">, event: PlanEventFact): string | null {
  const exact = event.facts.attendeeSource === "registrants";
  const parts = input.types
    .filter((type) => !type.skippedAt && metCount(input.awards, type.personType.key) < type.targetCount && (event.facts.expected[type.personType.key] ?? 0) > 0)
    .map((type) => ({ allocation: type.allocation, count: event.facts.expected[type.personType.key]!, label: type.shortLabel }))
    // 画板 web.html #17：配点高的类型在前（「VC 約5名 · 起業家 約12名」「VC 2名 · CFO 約10名」）。
    .sort((a, b) => b.allocation - a.allocation || b.count - a.count)
    .slice(0, 2)
    .map((item) => tri(input.language, exact
      ? { en: `${item.label} ${item.count}`, ja: `${item.label} ${item.count}名`, zh: `${item.label} ${item.count} 位` }
      : { en: `${item.label} ~${item.count}`, ja: `${item.label} 約${item.count}名`, zh: `${item.label} 约 ${item.count} 位` }));
  return parts.length ? parts.join(" · ") : null;
}

/** 会える活動：这一类人预计会来的活动（分数按规则，高到低）。 */
export function eventsFor(input: OverviewInput, type: PlanV2TypeItem | null): PlanEventOption[] {
  const types = scoreTypes(input);
  return input.events
    .filter((event) => !type || (event.facts.expected[type.personType.key] ?? 0) > 0)
    .map((event) => {
      const result = scoreEvent({ facts: event.facts, types });
      return {
        assessmentHref: event.assessmentId ? (input.platform === "app" ? `/events/assessments/${event.assessmentId}` : `/app/events/assessments/${event.assessmentId}`) : null,
        display: eventDisplayFromItems(result.items, scoreEventRange(result, event.facts)),
        emoji: event.emoji ?? eventEmoji({ title: event.title }),
        eventId: event.eventId,
        expectedCount: type ? event.facts.expected[type.personType.key] ?? null : null,
        fee: event.facts.fee ?? null,
        fitLabel: fitLabel(input, event),
        score: eventScoreView(result, event, input.language),
        startsAt: event.startsAt,
        title: event.title,
        venue: event.venue,
      };
    })
    .sort((a, b) => b.score.total - a.score.total || a.startsAt.localeCompare(b.startsAt));
}

/**
 * 「人脈の候補」的人数：人脈里符合这一类的人，已确认（接受后挂在类型上的 contactLinks）+ 未确认（待定候补，聊没聊过都算），
 * 按人去重；驳回的不算（用户 2026-10-13 定）。確認待ち的列表仍只放未确认、没聊过的候补（candidatesFor）。
 */
function networkMatches(input: OverviewInput, type: PlanV2TypeItem): number {
  const ids = new Set(type.contactLinks.map((link) => link.contactId));
  for (const candidate of input.candidates) {
    if (candidate.needItemId === type.id && candidate.status === "pending" && input.contacts.has(candidate.contactId)) ids.add(candidate.contactId);
  }
  return ids.size;
}

export function typeStats(input: OverviewInput, _now: string): PlanTypeStats[] {
  return input.types.map((type) => ({
    candidates: networkMatches(input, type),
    events: input.events.filter((event) => (event.facts.expected[type.personType.key] ?? 0) > 0).length,
    introRoutes: type.personType.introRoutes.filter((route) => input.contacts.has(route.viaContactId)).length,
    itemId: type.id,
  }));
}

function attendedEvents(input: Pick<OverviewInput, "awards">): number {
  return input.awards.filter((entry) => entry.award.typeKey === PLAN_EVENT_SEGMENT_KEY && entry.award.part === "base").length;
}

export function stepProgress(input: OverviewInput): PlanStepProgress[] {
  return input.plan.steps.map((step) => {
    const parts: PlanStepProgressPart[] = [];
    for (const key of step.personTypeKeys) {
      if (key === PLAN_EVENT_SEGMENT_KEY) {
        parts.push({ done: Math.min(input.plan.eventTargetCount, attendedEvents(input)), emoji: "🎟️", key, shortLabel: tri(input.language, { en: "Events", ja: "イベント", zh: "活动" }), skipped: false, total: input.plan.eventTargetCount, unit: "events" });
        continue;
      }
      const type = input.types.find((item) => item.personType.key === key);
      if (!type) continue;
      const skipped = Boolean(type.skippedAt);
      parts.push({ done: skipped ? type.targetCount : Math.min(type.targetCount, metCount(input.awards, key)), emoji: type.personType.emoji, key, shortLabel: type.shortLabel, skipped, total: type.targetCount, unit: "people" });
    }
    const done = parts.reduce((sum, part) => sum + part.done, 0);
    const total = parts.reduce((sum, part) => sum + part.total, 0);
    return { done, label: `${done} / ${total}`, parts, stepKey: step.key, total };
  });
}

/** Step「可能已完成」：关联类型都到了目标人数（或已跳过），且用户没完成也没驳回过（DESIGN §2.5，必须确认）。 */
export function stepSuggestions(input: OverviewInput): PlanStepSuggestion[] {
  const state = new Map<string, string>();
  const dismissed = new Set<string>();
  for (const entry of input.log) {
    if (entry.event === "step_completed" || entry.event === "step_reopened") state.set(String(entry.payload.stepKey), entry.event);
    if (entry.event === "pending_dismissed" && entry.payload.kind === "step_suggestion") dismissed.add(String(entry.payload.stepKey));
  }
  const progress = new Map(stepProgress(input).map((item) => [item.stepKey, item]));
  return input.plan.steps.flatMap((step) => {
    const item = progress.get(step.key);
    if (!item || item.total === 0 || item.done < item.total) return [];
    if (state.get(step.key) === "step_completed" || dismissed.has(step.key)) return [];
    const keys = new Set(step.personTypeKeys);
    const evidenceIds = input.awards.filter((entry) => keys.has(entry.award.typeKey)).map((entry) => entry.id);
    return [{ evidenceIds, question: step.title, stepKey: step.key }];
  });
}

export function recentAwards(input: OverviewInput): PlanRecentAward[] {
  return [...input.awards]
    .filter((entry) => entry.award.basis !== "skip")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
    .map((entry) => {
      const type = input.types.find((item) => item.personType.key === entry.award.typeKey);
      return {
        at: entry.createdAt,
        awardLogId: entry.id,
        basis: entry.award.basis,
        contactName: entry.award.contactId ? input.contacts.get(entry.award.contactId)?.name ?? null : null,
        emoji: type?.personType.emoji ?? "🎟️",
        itemId: type?.id ?? null,
        part: entry.award.part,
        points: entry.award.points,
        shortLabel: type?.shortLabel ?? tri(input.language, { en: "Events", ja: "イベント", zh: "活动" }),
        typeKey: entry.award.typeKey,
      };
    });
}

/** R26：今日のチャンス的活动候选窗口（未来 14 天，DESIGN §6.2-3）。 */
export const TODAY_CHANCE_EVENT_DAYS = 14;
const WEEKDAYS: Record<PlanCopyLanguage, readonly string[]> = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"], zh: ["日", "一", "二", "三", "四", "五", "六"] };

/** 「今夜 / 今日 / 明日 / 10月16日（金）」（东京时间）。 */
export function chanceWhen(startsAt: string, now: string, language: PlanCopyLanguage): string {
  const start = tokyoParts(Date.parse(startsAt));
  const today = tokyoParts(Date.parse(now));
  if (start.dayIndex === today.dayIndex) return start.minute >= 18 * 60 ? tri(language, { en: "tonight", ja: "今夜", zh: "今晚" }) : tri(language, { en: "today", ja: "今日", zh: "今天" });
  if (start.dayIndex === today.dayIndex + 1) return tri(language, { en: "tomorrow", ja: "明日", zh: "明天" });
  const date = new Date(start.dayIndex * 86_400_000);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const weekday = WEEKDAYS[language][start.day]!;
  return tri(language, { en: `${weekday} ${month}/${day}`, ja: `${month}月${day}日（${weekday}）`, zh: `${month}月${day}日（周${weekday}）` });
}

/**
 * R26 活动候选：未来 14 天内、最早的一场能见到「还没满的类型」的活动（画板 web.html #17：今夜の CFO Night）；
 * 同一场里挑这次能加分最多的类型（分值 → 配点 → 还差人数）。依据文本与按钮文案由服务端给（DESIGN §6.2-3）。
 */
export function eventChance(input: OverviewInput, now: string): PlanTodayChance | null {
  const nowMs = Date.parse(now);
  let best: { event: PlanEventFact; type: PlanV2TypeItem; remaining: number; met: number; points: number; expected: number } | null = null;
  const upcoming = input.events
    .filter((event) => {
      const start = Date.parse(event.startsAt);
      return Number.isFinite(start) && start >= nowMs - 3 * 3_600_000 && start <= nowMs + TODAY_CHANCE_EVENT_DAYS * 86_400_000;
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  for (const event of upcoming) {
    for (const type of input.types) {
      if (type.skippedAt) continue;
      const expected = event.facts.expected[type.personType.key] ?? 0;
      if (expected <= 0) continue;
      const met = metCount(input.awards, type.personType.key);
      const remaining = type.targetCount - met;
      if (remaining <= 0) continue;
      const mine = input.awards.filter((entry) => entry.award.typeKey === type.personType.key).map((entry) => entry.award);
      const next = nextAward({ allocation: type.allocation, anonymous: false, awards: mine, skipped: false, targetCount: type.targetCount });
      if (next.part !== "base") continue;
      const better = !best || next.points > best.points || (next.points === best.points && (type.allocation > best.type.allocation || (type.allocation === best.type.allocation && remaining > best.remaining)));
      if (better) best = { event, expected, met, points: next.points, remaining, type };
    }
    if (best) break;
  }
  if (!best) return null;
  const { event, type, expected, met, points } = best;
  const when = chanceWhen(event.startsAt, now, input.language);
  const source = event.facts.attendeeSource === "registrants"
    ? tri(input.language, { en: `the attendee tag “${type.shortLabel}”: ${expected}`, ja: `参加者タグ「${type.shortLabel}」${expected}名`, zh: `参会者标签「${type.shortLabel}」${expected} 位` })
    : tri(input.language, { en: `about ${expected} estimated from speakers and exhibitors`, ja: `登壇者・出展から推定 約${expected}名`, zh: `由演讲者与展商推测约 ${expected} 位` });
  const unit = Math.round(type.allocation / Math.max(1, type.targetCount));
  return {
    actionLabel: tri(input.language, { en: "Get ready to meet", ja: "会う準備をする", zh: "准备见面" }),
    basis: tri(input.language, {
      en: `${event.title}: ${source} · ${type.shortLabel} is at ${met} / ${type.targetCount} (${unit} points each)`,
      ja: `${event.title} の${source} · ${type.shortLabel} は ${met} / ${type.targetCount}人で未達（1人 ${unit}点）`,
      zh: `${event.title} 的${source} · ${type.shortLabel} 还差人（${met} / ${type.targetCount}，每人 ${unit} 分）`,
    }),
    eventId: event.eventId,
    href: planTypeHref(input.platform, input.plan.id, type.id),
    kind: "event",
    label: tri(input.language, {
      en: `${expected} ${type.shortLabel} are coming to ${event.title} ${when}. Talk to one for +${points}.`,
      ja: `${when}の ${event.title} に ${type.shortLabel} が ${expected}人来ます。1人と話せば +${points}。`,
      zh: `${when}的 ${event.title} 会来 ${expected} 位 ${type.shortLabel}。聊一位就 +${points}。`,
    }),
    points,
    progressLabel: tri(input.language, { en: `${type.shortLabel} · ${met} / ${type.targetCount}`, ja: `${type.shortLabel} · ${met} / ${type.targetCount}人`, zh: `${type.shortLabel} · ${met} / ${type.targetCount} 人` }),
  };
}

/**
 * 今日のチャンス（R26 改）：先看未来 14 天内能见到还差人的类型的活动（`eventChance`）；没有就推推薦度最高、类型还有剩余的候补；
 * 再没有就挑分数最高的会える活動。
 */
export function todayChance(input: OverviewInput, now: string): PlanTodayChance | null {
  const fromEvent = eventChance(input, now);
  if (fromEvent) return fromEvent;
  let best: { candidate: PlanCandidateView; type: PlanV2TypeItem; points: number } | null = null;
  for (const type of input.types) {
    if (type.skippedAt) continue;
    const mine = input.awards.filter((entry) => entry.award.typeKey === type.personType.key).map((entry) => entry.award);
    const next = nextAward({ allocation: type.allocation, anonymous: false, awards: mine, skipped: false, targetCount: type.targetCount });
    if (next.part !== "base") continue;
    const top = candidatesFor(input, type, now)[0];
    if (top && (!best || top.recommendScore > best.candidate.recommendScore)) best = { candidate: top, points: next.points, type };
  }
  if (best) {
    return { href: planTypeHref(input.platform, input.plan.id, best.type.id), kind: "candidate", label: tri(input.language, { en: `Talk to ${best.candidate.name} (${best.type.shortLabel})`, ja: `${best.candidate.name}さんと話す（${best.type.shortLabel}）`, zh: `和${best.candidate.name}聊聊（${best.type.shortLabel}）` }), points: best.points };
  }
  const event = eventsFor(input, null)[0];
  if (event && event.score.total >= 50) {
    const type = input.types.find((item) => (input.events.find((fact) => fact.eventId === event.eventId)?.facts.expected[item.personType.key] ?? 0) > 0);
    return { eventId: event.eventId, href: type ? planTypeHref(input.platform, input.plan.id, type.id) : planTypeHref(input.platform, input.plan.id, input.types[0]?.id ?? ""), kind: "event", label: event.title, points: 0 };
  }
  return null;
}

/**
 * memo 卡确认后会得的分（复核 m9：由服务端用 `nextAward` 算，与确认时的实得一致）：
 * 这个人在这个类型下已计过 → 0；类型已跳过 → 0；否则是下一份的分（base 或超额的半分）。
 */
export function memoAwardPoints(input: Pick<OverviewInput, "awards">, type: PlanV2TypeItem | undefined, contactId: string | null): number {
  if (!type || !contactId || type.skippedAt) return 0;
  const mine = input.awards.filter((entry) => entry.award.typeKey === type.personType.key);
  if (mine.some((entry) => entry.award.contactId === contactId)) return 0;
  return nextAward({ allocation: type.allocation, anonymous: false, awards: mine.map((entry) => entry.award), skipped: false, targetCount: type.targetCount }).points;
}

export function pendingItems(input: OverviewInput, now: string): PlanPendingItem[] {
  const decided = new Set(input.log.filter((entry) => entry.event === "pending_accepted" || entry.event === "pending_dismissed").map((entry) => String(entry.payload.pendingId)));
  const memo: PlanPendingItem[] = input.log
    .filter((entry) => entry.event === "memo_coverage_proposed" && !decided.has(entry.id))
    .map((entry) => {
      const type = input.types.find((item) => item.id === entry.itemId);
      const contactId = typeof entry.payload.contactId === "string" ? entry.payload.contactId : null;
      return {
        answered: Array.isArray(entry.payload.answered) ? (entry.payload.answered as number[]) : [],
        contactId,
        createdAt: entry.createdAt,
        detail: contactId ? input.contacts.get(contactId)?.name ?? null : null,
        ...(type && entry.itemId ? { href: planTypeHref(input.platform, input.plan.id, entry.itemId) } : {}),
        id: entry.id,
        itemId: entry.itemId,
        kind: "memo_coverage" as const,
        manual: entry.payload.manual === true,
        planId: input.plan.id,
        points: memoAwardPoints(input, type, contactId),
        title: type?.shortLabel ?? "",
      };
    });
  const steps: PlanPendingItem[] = stepSuggestions(input).map((suggestion) => ({
    createdAt: now,
    detail: null,
    href: planOverviewHref(input.platform, input.plan.id),
    id: `step:${input.plan.id}:${suggestion.stepKey}`,
    itemId: null,
    kind: "step_suggestion" as const,
    planId: input.plan.id,
    title: suggestion.question,
  }));
  const candidates: PlanPendingItem[] = input.types.flatMap((type) => candidatesFor(input, type, now).slice(0, 3).map((candidate) => ({
    contactId: candidate.contactId,
    createdAt: now,
    detail: candidate.name,
    href: planTypeHref(input.platform, input.plan.id, type.id),
    id: `candidate:${candidate.candidateId}`,
    itemId: type.id,
    kind: "candidate" as const,
    organization: candidate.company ?? null,
    planId: input.plan.id,
    role: candidate.role ?? null,
    title: type.shortLabel,
  })));
  return [...memo, ...steps, ...candidates];
}

export function talkedFor(input: OverviewInput, type: PlanV2TypeItem): PlanTalkedView[] {
  return input.awards
    .filter((entry) => entry.award.typeKey === type.personType.key && entry.award.basis !== "skip")
    .map((entry) => ({
      anonymous: entry.award.anonymous,
      at: entry.createdAt,
      awardLogId: entry.id,
      basis: entry.award.basis,
      contactId: entry.award.contactId,
      name: entry.award.contactId ? input.contacts.get(entry.award.contactId)?.name ?? null : null,
      part: entry.award.part,
      points: entry.award.points,
    }));
}

export function typeDetail(input: OverviewInput, type: PlanV2TypeItem, now: string, sample: boolean): PlanPersonTypeDetail {
  const index = input.types.findIndex((item) => item.id === type.id);
  const mine = input.awards.filter((entry) => entry.award.typeKey === type.personType.key);
  const next = nextAward({ allocation: type.allocation, anonymous: false, awards: mine.map((entry) => entry.award), skipped: Boolean(type.skippedAt), targetCount: type.targetCount });
  return {
    allocation: type.allocation,
    candidates: candidatesFor(input, type, now),
    countRule: type.personType.countRule,
    earned: mine.filter((entry) => entry.award.part === "base").reduce((sum, entry) => sum + entry.award.points, 0),
    emoji: type.personType.emoji,
    events: eventsFor(input, type),
    introRoutes: type.personType.introRoutes.flatMap((route) => {
      const via = input.contacts.get(route.viaContactId);
      return via ? [{ viaContactId: via.id, viaName: via.name, why: route.why }] : [];
    }),
    itemId: type.id,
    key: type.personType.key,
    letter: typeLetter(index < 0 ? 0 : index),
    metCount: metCount(input.awards, type.personType.key),
    next: { part: next.part, points: next.points },
    opener: type.personType.opener,
    overflow: mine.filter((entry) => entry.award.part === "overflow").reduce((sum, entry) => sum + entry.award.points, 0),
    persona: type.personType.persona,
    planId: input.plan.id,
    questions: type.personType.questions,
    recognizeHints: type.personType.recognizeHints,
    roleSituation: type.roleSituation,
    shortLabel: type.shortLabel,
    skipped: Boolean(type.skippedAt),
    skippedAt: type.skippedAt ?? null,
    stepKeys: input.plan.steps.filter((step) => step.personTypeKeys.includes(type.personType.key)).map((step) => step.key),
    talked: talkedFor(input, type),
    targetCount: type.targetCount,
    tasks: [],
    unitPoints: unitPoints(type.allocation, type.targetCount),
    why: type.personType.why,
    ...(sample ? { sample: true as const } : {}),
  };
}
