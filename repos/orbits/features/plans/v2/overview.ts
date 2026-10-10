/**
 * R24 プラン概要与人物タイプ詳細的读模型（DESIGN §2.5–2.6）。纯函数：输入是已读出来的计划、类型、记录、
 * 候补、联系人、活动事实，输出是契约形状。分数一律走 `shared/compute/plan-score.ts`，活动分走 `event-score.ts`。
 */
import { unitPoints } from "../../../shared/compute/plan-allocation";
import { planTypeHref, type PlanHrefPlatform } from "../../../shared/compute/plan-href";
import { nextAward, PLAN_EVENT_SEGMENT_KEY } from "../../../shared/compute/plan-score";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import { scoreEvent, type EventScoreFacts, type EventScoreResult, type EventScoreType } from "../../../shared/compute/event-score";
import type { EventAssessmentScoreItem } from "../../../shared/contract/event-assessment";
import type {
  PlanCandidateView,
  PlanEventOption,
  PlanPendingItem,
  PlanPersonTypeDetail,
  PlanRecentAward,
  PlanStepProgress,
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

/** 会える活動：这一类人预计会来的活动（分数按规则，高到低）。 */
export function eventsFor(input: OverviewInput, type: PlanV2TypeItem | null): PlanEventOption[] {
  const types = scoreTypes(input);
  return input.events
    .filter((event) => !type || (event.facts.expected[type.personType.key] ?? 0) > 0)
    .map((event) => {
      const result = scoreEvent({ facts: event.facts, types });
      return { eventId: event.eventId, expectedCount: type ? event.facts.expected[type.personType.key] ?? null : null, score: eventScoreView(result, event, input.language), startsAt: event.startsAt, title: event.title, venue: event.venue };
    })
    .sort((a, b) => b.score.total - a.score.total || a.startsAt.localeCompare(b.startsAt));
}

export function typeStats(input: OverviewInput, now: string): PlanTypeStats[] {
  return input.types.map((type) => ({
    candidates: candidatesFor(input, type, now).length,
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
    let done = 0;
    let total = 0;
    for (const key of step.personTypeKeys) {
      if (key === PLAN_EVENT_SEGMENT_KEY) {
        total += input.plan.eventTargetCount;
        done += Math.min(input.plan.eventTargetCount, attendedEvents(input));
        continue;
      }
      const type = input.types.find((item) => item.personType.key === key);
      if (!type) continue;
      total += type.targetCount;
      done += type.skippedAt ? type.targetCount : Math.min(type.targetCount, metCount(input.awards, key));
    }
    return { done, label: `${done} / ${total}`, stepKey: step.key, total };
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

/** 今日のチャンス：推薦度最高、类型还有剩余的候补；没有就挑分数最高的会える活動。 */
export function todayChance(input: OverviewInput, now: string): PlanTodayChance | null {
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
    return { href: planTypeHref(input.platform, input.plan.id, best.type.id), label: tri(input.language, { en: `Talk to ${best.candidate.name} (${best.type.shortLabel})`, ja: `${best.candidate.name}さんと話す（${best.type.shortLabel}）`, zh: `和${best.candidate.name}聊聊（${best.type.shortLabel}）` }), points: best.points };
  }
  const event = eventsFor(input, null)[0];
  if (event && event.score.total >= 50) {
    const type = input.types.find((item) => (input.events.find((fact) => fact.eventId === event.eventId)?.facts.expected[item.personType.key] ?? 0) > 0);
    return { href: type ? planTypeHref(input.platform, input.plan.id, type.id) : planTypeHref(input.platform, input.plan.id, input.types[0]?.id ?? ""), label: event.title, points: 0 };
  }
  return null;
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
        id: entry.id,
        itemId: entry.itemId,
        kind: "memo_coverage" as const,
        manual: entry.payload.manual === true,
        planId: input.plan.id,
        title: type?.shortLabel ?? "",
      };
    });
  const steps: PlanPendingItem[] = stepSuggestions(input).map((suggestion) => ({
    createdAt: now,
    detail: null,
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
    id: `candidate:${candidate.candidateId}`,
    itemId: type.id,
    kind: "candidate" as const,
    planId: input.plan.id,
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
    stepKeys: input.plan.steps.filter((step) => step.personTypeKeys.includes(type.personType.key)).map((step) => step.key),
    talked: talkedFor(input, type),
    targetCount: type.targetCount,
    tasks: [],
    unitPoints: unitPoints(type.allocation, type.targetCount),
    why: type.personType.why,
    ...(sample ? { sample: true as const } : {}),
  };
}
