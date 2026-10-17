/**
 * R26 判定：事实 + 当前计划 → 分数、3 维、会えそうな人、気をつける点、部分参加、根拠（events DESIGN §2.1、§3.5、§9 #4）。Owner: 甲 (R26).
 *
 * 全部规则，不调 AI。分数只来自 `scoreEvent`，判定只用 `eventVerdict(total)`（经 `scoreEvent`），区间只显示。
 * 5 项的依据文字复用计划页的 `eventScoreView`（overview.ts），所以评估页与计划页「会える活動 · 内訳」同源（复核 M2）。
 * 读取时按当前计划重算（同一场活动在评估页、概要、类型详情三处分数一致）。
 */
import { eventDisplayFromItems, displayValueText } from "../../../shared/compute/event-assessment-display";
import { typeAttendees, type AttendeeTypingResult } from "../../../shared/compute/event-attendee-typing";
import { connectionCounts } from "../../../shared/compute/event-facts-derive";
import { partialAttendance } from "../../../shared/compute/event-partial-attendance";
import { DEFAULT_EVENT_SCORE_PREFERENCES, scoreEvent, scoreEventRange, type EventAttendeeSource, type EventScoreFacts, type EventScorePreferences, type EventScoreType } from "../../../shared/compute/event-score";
import { parsePriceYen, toEventScoreFacts, tokyoMinuteOfDay } from "../../../shared/compute/event-score-input";
import { estimateTravelMinutes } from "../../../shared/compute/event-travel-estimate";
import type { PlanCopyLanguage } from "../../../shared/compute/plan-template-copy";
import type {
  EventAssessmentCaution,
  EventAssessmentDisplay,
  EventAssessmentFacts,
  EventAssessmentMeetCandidate,
  EventAssessmentScoreItem,
  EventAssessmentVerdict,
} from "../../../shared/contract/event-assessment";
import { eventScoreView } from "../../plans/v2/overview";

export type JudgeType = EventScoreType & { shortLabel: string; emoji: string; roleSituation?: string | null };

export interface JudgeContext {
  planId: string | null;
  goalLabel: string | null;
  types: readonly JudgeType[];
  preferences: EventScorePreferences;
  homeArea: string | null;
  contacts: readonly { id: string; name: string }[];
  /** 目标模板关键词（部分参加、off-target 用）。 */
  goalKeywords: readonly string[];
  language: PlanCopyLanguage;
}

/** 库内活动的规则事实（`event-facts-derive` 等算好后传入）。 */
export interface OrbitEventExtras {
  expected: Readonly<Record<string, number>>;
  attendeeSource: EventAttendeeSource;
  firstDegree: number | null;
  secondDegree: number | null;
  known: { contactId: string; name: string }[];
  matchingEnabled?: boolean | null;
  nameTags?: boolean | null;
  feeYen?: number | null;
  registrantCount?: number | null;
}

export interface JudgeResult {
  scoreFacts: EventScoreFacts;
  scoreBreakdown: EventAssessmentScoreItem[];
  total: number;
  verdict: EventAssessmentVerdict;
  range: { min: number; max: number } | null;
  display: EventAssessmentDisplay;
  meetCandidates: EventAssessmentMeetCandidate[];
  knownAttendees: { contactId: string; name: string }[];
  cautions: EventAssessmentCaution[];
  partialAttendanceHint: { window: string; timeCostAfter: number } | null;
  basisLines: string[];
  fitLabel: string | null;
}

const tri = (language: PlanCopyLanguage, text: Record<PlanCopyLanguage, string>) => text[language];
const yen = (value: number) => `¥${value.toLocaleString("en-US")}`;

/** 判定必须的 3 项（日时 / 场所 / 参加費）中缺的。 */
export function missingRequiredFields(facts: EventAssessmentFacts, unknown: readonly string[] = []): ("startsAt" | "venue" | "price")[] {
  const missing: ("startsAt" | "venue" | "price")[] = [];
  if (!facts.startsAt && !unknown.includes("startsAt")) missing.push("startsAt");
  if (!facts.venue && !facts.area && !unknown.includes("venue")) missing.push("venue");
  if ((facts.price === undefined || facts.price === "") && !unknown.includes("price")) missing.push("price");
  return missing;
}

function typingFor(facts: EventAssessmentFacts, types: readonly JudgeType[]): AttendeeTypingResult {
  const text = [facts.title, facts.organizer, ...(facts.agenda ?? []).map((item) => item.title)].filter(Boolean).join(" ");
  return typeAttendees({ exhibitorCount: facts.exhibitorCount ?? null, speakers: facts.speakers ?? null, text, types: types.map((type) => ({ key: type.key, roleSituation: type.roleSituation ?? null, shortLabel: type.shortLabel })) });
}

export function judgeEvent(input: { facts: EventAssessmentFacts; orbit?: OrbitEventExtras | null; context: JudgeContext; eventId?: string | null }): JudgeResult {
  const { facts, context } = input;
  const language = context.language;
  const typing = input.orbit ? null : typingFor(facts, context.types);
  const connections = input.orbit
    ? { firstDegree: input.orbit.firstDegree, known: input.orbit.known, secondDegree: input.orbit.secondDegree }
    : connectionCounts({ myContacts: context.contacts, speakerNames: (facts.speakers ?? []).map((speaker) => speaker.name) });
  const travel = estimateTravelMinutes({ event: facts.area ?? facts.venue ?? null, home: context.homeArea });
  const scoreFacts = toEventScoreFacts(facts, {
    attendeeSource: input.orbit?.attendeeSource ?? typing!.attendeeSource,
    expected: input.orbit?.expected ?? typing!.expected,
    feeYen: input.orbit?.feeYen ?? null,
    firstDegree: connections.firstDegree,
    matchingEnabled: input.orbit?.matchingEnabled ?? null,
    nameTags: input.orbit?.nameTags ?? null,
    secondDegree: connections.secondDegree,
    travelMinutes: travel?.minutes ?? null,
  });
  const result = scoreEvent({ facts: scoreFacts, preferences: context.preferences, types: context.types });
  const range = scoreEventRange(result, scoreFacts);
  const view = eventScoreView(result, { eventId: input.eventId ?? "assessment", facts: scoreFacts, startsAt: facts.startsAt ?? "", title: facts.title ?? "", venue: facts.venue ?? null }, language, Object.fromEntries(context.types.map((type) => [type.key, type.shortLabel])));
  const display = eventDisplayFromItems(result.items, range);

  // 3 维的一句话说明（规则）。
  const remainingTypes = context.types.filter((type) => !type.skipped && type.targetCount > type.metCount);
  const hits = remainingTypes.filter((type) => (scoreFacts.expected[type.key] ?? 0) > 0);
  const goal = context.goalLabel ?? "";
  display.goalFit.reason = hits.length
    ? tri(language, { en: `${hits.map((type) => type.shortLabel).join(", ")} for “${goal}” are likely there`, ja: `「${goal}」に必要な ${hits.map((type) => type.shortLabel).join("・")} に会えそう`, zh: `可能见到「${goal}」需要的 ${hits.map((type) => type.shortLabel).join("、")}` })
    : tri(language, { en: "Few of the people this plan needs are listed", ja: "このプランで会いたい人は見当たりません", zh: "没有看到这个计划需要的人" });
  const peopleParts: string[] = [];
  if (connections.firstDegree) peopleParts.push(tri(language, { en: `${connections.firstDegree} people you know`, ja: `知り合い ${connections.firstDegree}名`, zh: `认识的人 ${connections.firstDegree} 位` }));
  if (scoreFacts.networkingMinutes) peopleParts.push(tri(language, { en: `networking ${scoreFacts.networkingMinutes} min`, ja: `交流タイム ${scoreFacts.networkingMinutes}分`, zh: `交流时间 ${scoreFacts.networkingMinutes} 分钟` }));
  display.people.reason = peopleParts.length ? peopleParts.join(" · ") : tri(language, { en: "No networking time or acquaintances listed", ja: "交流の時間や知り合いの情報はありません", zh: "没有交流时间或熟人的信息" });
  const fee = scoreFacts.fee;
  const timeParts: string[] = [];
  timeParts.push(fee === null ? tri(language, { en: "Fee unknown", ja: "参加費は不明", zh: "费用不明" }) : fee === 0 ? tri(language, { en: "Free", ja: "無料", zh: "免费" }) : tri(language, { en: `Fee ${yen(fee)}`, ja: `参加費 ${yen(fee)}`, zh: `费用 ${yen(fee)}` }));
  if (scoreFacts.travelMinutes !== null) timeParts.push(tri(language, { en: `about ${scoreFacts.travelMinutes} min away (estimate)`, ja: `移動 約${scoreFacts.travelMinutes}分（推定）`, zh: `路程约 ${scoreFacts.travelMinutes} 分钟（推测）` }));
  display.timeCost.reason = timeParts.join(" · ");

  // 会えそうな人（类型 emoji + 依据）。
  const meetCandidates: EventAssessmentMeetCandidate[] = hits.map((type) => {
    const count = scoreFacts.expected[type.key] ?? 0;
    const breakdown = typing?.breakdown[type.key];
    const orgs = breakdown?.sampleOrgs.length ? ` · ${breakdown.sampleOrgs[0]}${breakdown.sampleOrgs.length > 1 ? tri(language, { en: " and others", ja: " ほか", zh: " 等" }) : ""}` : "";
    const basis = breakdown
      ? breakdown.speakers > 0
        ? tri(language, { en: `${breakdown.speakers} speakers${orgs}`, ja: `登壇 ${breakdown.speakers}名${orgs}`, zh: `演讲 ${breakdown.speakers} 位${orgs}` })
        : breakdown.exhibitors > 0
          ? tri(language, { en: `${breakdown.exhibitors} exhibitors`, ja: `展示 ${breakdown.exhibitors}社`, zh: `展商 ${breakdown.exhibitors} 家` })
          : tri(language, { en: `${breakdown.registrants} registered`, ja: `申込 ${breakdown.registrants}名`, zh: `报名 ${breakdown.registrants} 位` })
      : tri(language, { en: `about ${count} expected`, ja: `約${count}名`, zh: `约 ${count} 位` });
    const source = breakdown ? (breakdown.speakers > 0 ? "speakers" : breakdown.exhibitors > 0 ? "exhibitors" : "registrants") : undefined;
    return { basis, count: breakdown ? (breakdown.speakers || breakdown.exhibitors || breakdown.registrants) : count, emoji: type.emoji, label: type.shortLabel, ...(source ? { source: source as "speakers" | "exhibitors" | "registrants" } : {}) };
  });
  if (connections.known.length) {
    const names = connections.known.slice(0, 2).map((person) => tri(language, { en: person.name, ja: `${person.name.split(/\s+/)[0]}さん`, zh: person.name })).join(tri(language, { en: ", ", ja: "・", zh: "、" }));
    meetCandidates.push({ basis: tri(language, { en: `${names} going`, ja: `${names} 参加予定`, zh: `${names} 会参加` }), count: connections.known.length, emoji: "👋", label: tri(language, { en: "People you know", ja: "既存のつながり", zh: "已有的人脉" }), names: connections.known.slice(0, 6).map((person) => person.name.split(/\s+/)[0] ?? person.name), source: "known" });
  }

  // 気をつける点（规则）。
  const cautions: EventAssessmentCaution[] = [];
  if (fee !== null && fee > context.preferences.maxFee) cautions.push({ detail: tri(language, { en: "Check whether it can be expensed", ja: "経費精算の対象か事前に確認を", zh: "事先确认能否报销" }), kind: "fee", text: tri(language, { en: `Fee ${yen(fee)}`, ja: `参加費 ${yen(fee)}`, zh: `费用 ${yen(fee)}` }) });
  if (fee === null) cautions.push({ kind: "fee", text: tri(language, { en: "The fee is not stated, so the score is shown as a range", ja: "参加費が不明のままだと、スコアは幅で表示します", zh: "费用不明时，分数以区间显示" }) });
  const keywords = [...context.goalKeywords, ...remainingTypes.map((type) => type.shortLabel)];
  const offTarget = (facts.agenda ?? []).filter((item) => /採用|リクルート|hiring|recruit|招聘/i.test(item.title) && !keywords.some((word) => word.length >= 2 && item.title.includes(word)));
  if (offTarget.length) cautions.push({ detail: tri(language, { en: "Time not related to your goal", ja: "目標との関係が薄い時間帯", zh: "与目标关系不大的时段" }), kind: "off_target_session", text: tri(language, { en: `Sessions for hiring: ${offTarget[0]!.title}`, ja: `採用向けセッションあり（${offTarget[0]!.title}）`, zh: `有招聘向的环节（${offTarget[0]!.title}）` }) });
  if (scoreFacts.travelMinutes !== null && scoreFacts.travelMinutes > context.preferences.maxTravelMinutes) cautions.push({ kind: "travel", text: tri(language, { en: `About ${scoreFacts.travelMinutes} min each way (estimate)`, ja: `片道 約${scoreFacts.travelMinutes}分（推定）`, zh: `单程约 ${scoreFacts.travelMinutes} 分钟（推测）` }) });

  const timeCostDisplay = display.timeCost.value;
  const partial = partialAttendance({ agenda: facts.agenda, endMinute: tokyoMinuteOfDay(facts.endsAt), keywords, timeCost: timeCostDisplay });

  const basisLines: string[] = [];
  if (context.goalLabel) basisLines.push(tri(language, { en: `Plan “${context.goalLabel}”`, ja: `プラン「${context.goalLabel}」`, zh: `计划「${context.goalLabel}」` }));
  const pageBits: string[] = [];
  if (facts.speakers?.length) pageBits.push(tri(language, { en: `${facts.speakers.length} speakers`, ja: `登壇者 ${facts.speakers.length}名`, zh: `演讲者 ${facts.speakers.length} 位` }));
  if (facts.exhibitorCount) pageBits.push(tri(language, { en: `${facts.exhibitorCount} exhibitors`, ja: `出展社 ${facts.exhibitorCount}社`, zh: `展商 ${facts.exhibitorCount} 家` }));
  if (input.orbit?.registrantCount) pageBits.push(tri(language, { en: `${input.orbit.registrantCount} registered`, ja: `申込 ${input.orbit.registrantCount}名`, zh: `报名 ${input.orbit.registrantCount} 位` }));
  if (pageBits.length) basisLines.push(pageBits.join(tri(language, { en: ", ", ja: "・", zh: "、" })));
  basisLines.push(tri(language, { en: `Checked against your ${context.contacts.length} contacts`, ja: `あなたの人脈 ${context.contacts.length}人との照合`, zh: `与你的 ${context.contacts.length} 位人脉比对` }));

  const fitLabel = hits.length
    ? hits.slice(0, 2).map((type) => tri(language, { en: `${type.shortLabel} ~${scoreFacts.expected[type.key]}`, ja: `${type.shortLabel} 約${scoreFacts.expected[type.key]}名`, zh: `${type.shortLabel} 约 ${scoreFacts.expected[type.key]} 位` })).join(" · ")
    : null;

  return {
    basisLines,
    cautions,
    display,
    fitLabel,
    knownAttendees: connections.known,
    meetCandidates,
    partialAttendanceHint: partial,
    range: range ? { max: range.max, min: range.min } : null,
    scoreBreakdown: view.scoreBreakdown.map((item) => ({ ...item, facts: [...item.facts] })),
    scoreFacts,
    total: result.total,
    verdict: result.verdict,
  };
}

/** 「55–70」：区间的展示文字。 */
export { displayValueText };

/** 没有计划时的缺省上下文（所有类型为空 → ① 适合 0；其余规则照常）。 */
export function emptyJudgeContext(language: PlanCopyLanguage, contacts: readonly { id: string; name: string }[] = [], homeArea: string | null = null): JudgeContext {
  return { contacts, goalKeywords: [], goalLabel: null, homeArea, language, planId: null, preferences: DEFAULT_EVENT_SCORE_PREFERENCES, types: [] };
}

export { parsePriceYen };
