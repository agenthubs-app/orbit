/**
 * R27 live 端口的纯映射（`live.ts` 读数据，这里只做形状转换；测试直接覆盖这里）。Owner: 甲 (R27).
 * - 主办方 actor id 只在这里变成 `organizerKey`（单向摘要），之后不再外传。
 * - 公开参加者：只读 `event_attendees` / `public` 可见的回答（`profileResponsesForParticipantDetail`，与参加者详情同一边界）；
 *   一个可见回答都没有的报名者不出现（`matching_only` / 旧 `private` 只给匹配用）。
 * - 判定：`judgeEvent` 的结果原样折叠（分数、3 维、会えそうな人），只补「理由」一句与根拠文字。
 */
import { createHash } from "node:crypto";

import { eventEmoji } from "../../../shared/compute/event-emoji";
import { typeOfPerson, type AttendeeTypingType } from "../../../shared/compute/event-attendee-typing";
import type { EventAfterConfirmResult } from "../../../shared/contract/event-after";
import type { EventAssessmentMeetCandidate } from "../../../shared/contract/event-assessment";
import type { InboxNotificationUpsert } from "../../notifications/inbox-record-service";
import { payloadFacts } from "../assessment/orbit-event-facts";
import type { JudgeResult } from "../assessment/judge";
import { canonicalPublicOrganizerLabel } from "../core/public-organizer-identity";
import type { EventOperationsParticipant, EventOperationsPublishedResult, EventOperationsTable } from "../event-operations/contract";
import { eventOperationsParticipantFromRegistration } from "../event-operations/participant";
import { profileResponsesForParticipantDetail } from "../event-operations/profile-response-policy";
import type { EventOperationsAttendeeWorkspace } from "../event-operations/service";
import type { AttendeePostEventAiArtifactView } from "../post-event-artifact/contract";
import type { EventRegistration } from "../registration/contract";
import type { AfterAiDraft, AfterMetPerson, AfterPlan } from "./after-core";
import type { JourneyLanguage } from "./prep-core";
import type { JourneyContact, JourneyEvent, JourneyLivePorts, JourneyPublicAttendee } from "./ports";
import type { VenueParticipant, VenueTable, VenueWorkspace } from "./venue-core";

const sha = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex");
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const tri = (language: JourneyLanguage, ja: string, zh: string, en: string) => (language === "zh" ? zh : language === "en" ? en : ja);

export const PUBLIC_ATTENDEES_LIMIT = 500;
export const CONTACT_HISTORY_LIMIT = 3;

/** 主办方的公开键：actor id 的单向摘要（`org_` + 16 位 hex）。 */
export function organizerKeyFor(organizerActorId: string | null | undefined): string | null {
  const id = organizerActorId?.trim();
  return id ? `org_${sha("orbit-organizer", id).slice(0, 16)}` : null;
}

/**
 * R17-08（用户 2026-10-17「按主办方资料页」）：主办方资料页的公开键（`orgp_` + 16 位 hex）。关注、探す「あなたのコミュニティ」都按它。
 */
export function organizerKeyForProfile(profileId: string | null | undefined): string | null {
  const id = profileId?.trim();
  return id ? `orgp_${sha("orbit-organizer-profile", id).slice(0, 16)}` : null;
}

/** 活动的主办方键：有资料页按资料页，没有资料页的旧活动仍按 actor。 */
export function eventOrganizerKey(organizerActorId: string | null | undefined, organizerProfileId: string | null | undefined): string | null {
  return organizerKeyForProfile(organizerProfileId) ?? organizerKeyFor(organizerActorId);
}

export interface AdmissionFacts {
  capacity: number | null;
  admissionMode: string | null;
  registrationClosesAt: string | null;
}

export interface CanonicalEventLike {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  description: string | null;
  sourcePayload: Readonly<Record<string, unknown>>;
  organizerActorId: string;
  publicCode: string | null;
}

/** sourcePayload 里主办方自己写的显示名（没有就用不透明的公开标签）。 */
export function organizerNameFrom(payload: Readonly<Record<string, unknown>>, organizerActorId: string): string {
  return text(payload.organizerName) ?? text(payload.organizer) ?? text(payload.hostName) ?? text(payload.host) ?? canonicalPublicOrganizerLabel(organizerActorId);
}

/** sourcePayload 的登壇者名字（字符串或 `{ name }`）。 */
export function payloadSpeakerNames(payload: Readonly<Record<string, unknown>>): string[] {
  const raw = Array.isArray(payload.speakers) ? payload.speakers : [];
  return raw.flatMap((item) => {
    const name = typeof item === "string" ? text(item) : item && typeof item === "object" ? text((item as Record<string, unknown>).name) : null;
    return name ? [name] : [];
  }).slice(0, 50);
}

export function journeyEventFromCanonical(event: CanonicalEventLike, extra: { registrationCount: number; policy: AdmissionFacts | null; organizerProfileId?: string | null }): JourneyEvent {
  const payload = event.sourcePayload ?? {};
  const facts = payloadFacts(payload);
  const payloadCapacity = typeof payload.capacity === "number" && Number.isSafeInteger(payload.capacity) && payload.capacity > 0 ? payload.capacity : null;
  return {
    agenda: facts.agenda.map((item) => ({ at: item.at, title: item.title })),
    badges: [],
    capacity: extra.policy?.capacity ?? payloadCapacity,
    description: event.description?.trim() || null,
    emoji: eventEmoji({ emoji: facts.emoji, title: event.title }),
    endsAt: event.endsAt,
    eventId: event.eventId,
    organizerKey: eventOrganizerKey(event.organizerActorId, extra.organizerProfileId),
    organizerName: organizerNameFrom(payload, event.organizerActorId),
    priceYen: facts.feeYen,
    publicCode: event.publicCode?.trim() || null,
    registrationClosesAt: extra.policy?.registrationClosesAt ?? null,
    registrationCount: Math.max(0, extra.registrationCount),
    review: extra.policy?.admissionMode === "approval_required",
    startsAt: event.startsAt,
    title: event.title,
    venue: event.venue?.trim() || null,
  };
}

const normalizeName = (value: string) => value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();

/** 报名 → 公开参加者（只用对参加者可见的回答；一个都没有的人不出现）。`total` = 有效报名人数。 */
export function publicAttendeesFromRegistrations(registrations: readonly EventRegistration[], speakerNames: readonly string[] = []): { total: number; attendees: JourneyPublicAttendee[] } {
  const active = registrations.filter((registration) => registration.status === "rsvped");
  const speakers = new Set(speakerNames.map(normalizeName));
  const attendees = active.flatMap((registration): JourneyPublicAttendee[] => {
    const visible = profileResponsesForParticipantDetail(registration.participantProfile.interviewResponses ?? [], { viewerOwnsTarget: false });
    if (!visible.length) return [];
    const participant = eventOperationsParticipantFromRegistration(
      { ...registration, participantProfile: { ...registration.participantProfile, interviewResponses: visible } },
      { lateRegistration: false, profileEditDeadlineAt: null },
    );
    return [{
      attendeeId: participant.participantId,
      name: participant.displayName,
      note: participant.experienceHighlight,
      org: participant.company,
      role: participant.role,
      speaker: speakers.has(normalizeName(participant.displayName)),
    }];
  });
  attendees.sort((a, b) => Number(b.speaker) - Number(a.speaker) || a.name.localeCompare(b.name, "ja"));
  return { attendees: attendees.slice(0, PUBLIC_ATTENDEES_LIMIT), total: active.length };
}

type JudgeOut = Awaited<ReturnType<JourneyLivePorts["judge"]>>["results"][string];

/** 「VC パートナー 3名が登壇」：第一位会えそうな人的一句话。 */
export function reasonFromCandidate(candidate: EventAssessmentMeetCandidate | undefined, language: JourneyLanguage): string | null {
  if (!candidate) return null;
  if (candidate.source === "known") return `${candidate.label} · ${candidate.basis}`;
  if (candidate.source === "speakers") return tri(language, `${candidate.label} ${candidate.count}名が登壇`, `${candidate.count} 位${candidate.label}登台`, `${candidate.count} ${candidate.label} speaking`);
  if (candidate.source === "exhibitors") return tri(language, `${candidate.label} ${candidate.count}社が出展`, `${candidate.count} 家${candidate.label}参展`, `${candidate.count} ${candidate.label} exhibiting`);
  return tri(language, `${candidate.label} ${candidate.count}名が参加予定`, `${candidate.count} 位${candidate.label}报名`, `${candidate.count} ${candidate.label} registered`);
}

export function reasonDetailFor(goal: string | null, basisLines: readonly string[], language: JourneyLanguage): string | null {
  if (!goal) return null;
  const basis = basisLines.join(" · ");
  return tri(language, `プラン「${goal}」で会うべき人と重なるため。根拠：${basis}。`, `与计划「${goal}」需要见的人重合。依据：${basis}。`, `It overlaps with the people your plan “${goal}” needs. Basis: ${basis}.`);
}

/** `judgeEvent` 的结果 → 端口形状（分数与 3 维原样，不改数字）。 */
export function judgeEntryFrom(result: Pick<JudgeResult, "total" | "verdict" | "display" | "meetCandidates" | "knownAttendees" | "basisLines">, input: { goal: string | null; language: JourneyLanguage; assessmentId: string | null; planFitNames: readonly string[] }): JudgeOut {
  const reason = reasonFromCandidate(result.meetCandidates[0], input.language);
  return {
    assessmentId: input.assessmentId,
    basis: result.basisLines.join(" · "),
    display: { goalFit: result.display.goalFit.value, people: result.display.people.value, timeCost: result.display.timeCost.value },
    knownAttendees: result.knownAttendees.map((person) => person.name),
    meetCandidates: result.meetCandidates.map((candidate) => ({ emoji: candidate.emoji, label: candidate.label })),
    planFitNames: [...input.planFitNames],
    reason,
    reasonDetail: reason ? reasonDetailFor(input.goal, result.basisLines, input.language) : null,
    score: result.total,
    verdict: result.verdict,
  };
}

const DAY = 86_400_000;
const tokyoMonth = (iso: string) => {
  const date = new Date(Date.parse(iso) + 9 * 3_600_000);
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
};

/** 主办方履历：回数（全部发布）、第一次、平均参加（已开始的场次；R17 A11 起调用方传受付人数，与公开主办方页同口径）、是否每月（最近 3 个开催月连续）。 */
export function organizerHistory(items: readonly { startsAt: string; registrationCount: number }[], now: Date): { editions: number; since: string | null; averageAttendance: number | null; monthly: boolean } | null {
  const valid = items.filter((item) => Number.isFinite(Date.parse(item.startsAt)));
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const held = sorted.filter((item) => Date.parse(item.startsAt) <= now.getTime());
  const months = [...new Set(sorted.map((item) => tokyoMonth(item.startsAt)))].sort((a, b) => a - b);
  const lastThree = months.slice(-3);
  const monthly = lastThree.length === 3 && lastThree[2]! - lastThree[0]! === 2;
  return {
    averageAttendance: held.length ? Math.round(held.reduce((sum, item) => sum + item.registrationCount, 0) / held.length) : null,
    editions: sorted.length,
    monthly,
    since: new Date(Date.parse(sorted[0]!.startsAt)).toISOString(),
  };
}

const HISTORY_KIND: Readonly<Record<string, JourneyContact["history"][number]["kind"]>> = {
  calendar_signal: "meeting",
  email_signal: "email",
  event_note: "meeting",
  manual_note: "note",
  message: "message",
  referral: "other",
};

/** 联系人最近互动（现有存储只记「上次互动」一条；≤3）。 */
export function contactHistoryFrom(lastInteraction: unknown): JourneyContact["history"] {
  if (!lastInteraction || typeof lastInteraction !== "object") return [];
  const record = lastInteraction as Record<string, unknown>;
  const at = text(record.occurredAt);
  if (!at || !Number.isFinite(Date.parse(at))) return [];
  return [{ at, kind: HISTORY_KIND[text(record.channel) ?? ""] ?? "other" }].slice(0, CONTACT_HISTORY_LIMIT);
}

function venueParticipant(participant: EventOperationsParticipant): VenueParticipant {
  return {
    company: participant.company,
    displayName: participant.displayName,
    experienceHighlight: participant.experienceHighlight,
    needs: [...participant.needs],
    offers: [...participant.offers],
    participantId: participant.participantId,
    role: participant.role,
    topics: [...participant.topics],
  };
}

function venueTable(table: EventOperationsTable | null): VenueTable | null {
  if (!table) return null;
  return {
    icebreakers: [...table.icebreakers],
    memberRationales: { ...table.memberRationales },
    members: table.members.map((member) => ({ participantId: member.participantId, seat: member.seat })),
    rationale: table.rationale,
    tableNumber: table.tableNumber,
    theme: table.theme,
  };
}

/** 参加者侧运营投影（与 `toAttendeeOperationsResponse` 同一组字段）→ 会場モード输入；已发布分组给出全部桌。 */
export function venueWorkspaceFrom(workspace: EventOperationsAttendeeWorkspace, published: Pick<EventOperationsPublishedResult, "grouping"> | null): VenueWorkspace {
  return {
    checkIn: workspace.checkIn ? { checkedInAt: workspace.checkIn.checkedInAt, participantId: workspace.checkIn.participantId } : null,
    checkInAvailable: workspace.checkInAvailable,
    configuration: {
      eventEndsAt: workspace.configuration.eventEndsAt,
      eventStartsAt: workspace.configuration.eventStartsAt,
      roundOneStartsAt: workspace.configuration.roundOneStartsAt ?? null,
      roundTwoStartsAt: workspace.configuration.roundTwoStartsAt ?? null,
    },
    contactRequests: workspace.contactRequests.map((request) => ({
      contactId: request.contactId,
      createdAt: request.createdAt,
      requestId: request.requestId,
      requesterParticipantId: request.requesterParticipantId,
      revision: request.revision,
      status: request.status,
      targetParticipantId: request.targetParticipantId,
      withdrawnAt: request.withdrawnAt,
    })),
    directory: workspace.directory.map(venueParticipant),
    me: venueParticipant(workspace.me),
    recommendations: workspace.recommendations
      ? { recommendations: workspace.recommendations.recommendations.map((item) => ({ icebreakers: [...item.icebreakers], reasons: [...item.reasons], score: item.score, targetParticipantId: item.targetParticipantId })) }
      : null,
    roundOneTable: venueTable(workspace.roundOneTable),
    roundTwoTable: venueTable(workspace.roundTwoTable),
    rounds: published
      ? { one: published.grouping.roundOne.map((table) => venueTable(table)!), two: published.grouping.roundTwo.map((table) => venueTable(table)!) }
      : null,
  };
}

export interface PlanTypeLite extends AttendeeTypingType {
  itemId: string;
  allocation: number;
  targetCount: number;
  skipped: boolean;
}

/** 会後の「出会った人」= 已互换的名片（accepted、未撤回）；想见的人 = 目录里能归到我计划类型的人。 */
export function afterMetFrom(workspace: Pick<EventOperationsAttendeeWorkspace, "me" | "directory" | "contactRequests">, input: { types: readonly AttendeeTypingType[]; linkedTypeByContact: ReadonlyMap<string, string> }): { met: AfterMetPerson[]; wantedTotal: number; wantedParticipantIds: Set<string> } {
  const meId = workspace.me.participantId;
  const others = workspace.directory.filter((participant) => participant.participantId !== meId);
  const wantedParticipantIds = new Set(input.types.length ? others.filter((participant) => typeOfPerson({ org: participant.company, role: participant.role }, input.types)).map((participant) => participant.participantId) : []);
  const seen = new Set<string>();
  const met: AfterMetPerson[] = [];
  for (const request of workspace.contactRequests) {
    if (request.status !== "accepted" || request.withdrawnAt) continue;
    const otherId = request.requesterParticipantId === meId ? request.targetParticipantId : request.requesterParticipantId;
    if (otherId === meId || seen.has(otherId)) continue;
    const person = others.find((participant) => participant.participantId === otherId);
    if (!person) continue;
    seen.add(otherId);
    met.push({
      attendeeId: otherId,
      contactId: request.contactId,
      linkedTypeKey: request.contactId ? input.linkedTypeByContact.get(request.contactId) ?? null : null,
      name: person.displayName,
      org: person.company,
      wanted: wantedParticipantIds.has(otherId),
    });
  }
  return { met, wantedParticipantIds, wantedTotal: wantedParticipantIds.size };
}

/** 计划槽位（会後的分数预览）：已得人数 = 目标 − 剩余；已得分 = 分数段的 base 分；counted = 已确立的联系人关联。 */
export function afterPlanFrom(input: {
  goal: string;
  before: number;
  types: readonly PlanTypeLite[];
  remaining: readonly { key: string; remaining: number; targetCount: number }[];
  segments: readonly { key: string; earned: number }[];
  links: readonly { itemId: string; contactLinks: readonly { contactId: string; state: string }[] }[];
}): AfterPlan {
  const keyByItem = new Map(input.types.map((type) => [type.itemId, type.key]));
  const counted = new Set<string>();
  for (const need of input.links) {
    const key = keyByItem.get(need.itemId);
    if (!key) continue;
    for (const link of need.contactLinks) if (link.state === "established") counted.add(`${key}:${link.contactId}`);
  }
  return {
    before: input.before,
    counted,
    goal: input.goal,
    slots: input.types.map((type) => {
      const left = input.remaining.find((item) => item.key === type.key);
      return {
        allocation: type.allocation,
        earnedCount: left && !type.skipped ? Math.max(0, left.targetCount - left.remaining) : 0,
        earnedPoints: input.segments.find((segment) => segment.key === type.key)?.earned ?? 0,
        key: type.key,
        label: type.shortLabel,
        skipped: type.skipped,
        targetCount: type.targetCount,
      };
    }),
  };
}

/** 联系人 → 已关联的类型 key（当前计划；任何状态）。 */
export function linkedTypeByContactFrom(types: readonly PlanTypeLite[], links: readonly { itemId: string; contactLinks: readonly { contactId: string }[] }[]): Map<string, string> {
  const keyByItem = new Map(types.map((type) => [type.itemId, type.key]));
  const out = new Map<string, string>();
  for (const need of links) {
    const key = keyByItem.get(need.itemId);
    if (!key) continue;
    for (const link of need.contactLinks) if (!out.has(link.contactId)) out.set(link.contactId, key);
  }
  return out;
}

/** E3 产物：有 highlights + nextSteps → AI 下書き；否则旧的一段 summary / messageDraft。 */
export function afterDraftFrom(view: Pick<AttendeePostEventAiArtifactView, "status" | "artifact"> | null): { ai: AfterAiDraft | null; legacy: { summary: string | null; messageDraft: string | null } | null } {
  const artifact = view?.status === "ready" ? view.artifact : null;
  if (!artifact) return { ai: null, legacy: null };
  if (artifact.highlights?.length && artifact.nextSteps) {
    return {
      ai: {
        highlights: artifact.highlights.map((item) => ({ detail: item.detail, emoji: item.emoji, evidence: item.evidence, title: item.title })),
        nextSteps: artifact.nextSteps.map((step) => ({ attendeeId: step.attendeeId, followupDate: step.followupDate, planTypeSuggestion: step.planTypeSuggestion ?? null, thanksDraft: { body: step.thanksDraft.body, subject: step.thanksDraft.subject } })),
      },
      legacy: null,
    };
  }
  return { ai: null, legacy: { messageDraft: artifact.messageDraft ?? null, summary: text(artifact.summary) } };
}

export const FOLLOWUP_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** フォロー日 9:00（东京）。 */
export function followupDueAt(date: string): string | null {
  if (!FOLLOWUP_DATE.test(date)) return null;
  const time = Date.parse(`${date}T09:00:00+09:00`);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function followupTaskTitle(name: string): string {
  return `${name.split(/\s+/)[0] || name}さんへフォロー`;
}

/** 会後確定的记录 id：幂等回执（人 × 活动 × 键）、逐行（人 × 活动 × 参加者）、活动级（人 × 活动）。 */
export const afterConfirmationIds = {
  event: (actorId: string, eventId: string) => `eac-event:${sha(actorId, eventId).slice(0, 32)}`,
  key: (actorId: string, eventId: string, idempotencyKey: string) => `eac-key:${sha(actorId, eventId, idempotencyKey).slice(0, 32)}`,
  row: (actorId: string, eventId: string, attendeeId: string) => `eac-row:${sha(actorId, eventId, attendeeId).slice(0, 32)}`,
  taskKey: (eventId: string, attendeeId: string) => `r27-after:${eventId}:${attendeeId}`,
  awardKey: (eventId: string, typeKey: string, contactId: string) => `r27-after:${eventId}:${typeKey}:${contactId}`,
};

export interface AfterConfirmationKeyRecord extends Record<string, unknown> { result: EventAfterConfirmResult }
export interface AfterConfirmationRowRecord extends Record<string, unknown> { attendeeId: string; contactId: string | null; taskId: string | null; followupDate: string; confirmedAt: string }
export interface AfterConfirmationEventRecord extends Record<string, unknown> { eventId: string; confirmedAt: string }

/** 秘书通知（SC-R27-13）→ 收件箱写入形状：两类都是 reminder，dueAt 是真实截止/开场时刻。 */
export function inboxUpsertFor(actorId: string, input: Parameters<JourneyLivePorts["upsertInbox"]>[1], nowIso: string): InboxNotificationUpsert {
  return {
    actions: ["read", "dismiss", "handle"],
    actorId,
    kind: "reminder",
    occurredAt: nowIso,
    origin: "automation",
    reason: input.body,
    semanticKey: input.semanticKey,
    sources: [{ objectId: input.eventId, occurredAt: nowIso, readAt: nowIso, sourceId: input.eventId, sourceKind: input.sourceKind, sourceRevision: input.at }],
    target: { href: input.href, id: input.eventId, kind: "event", status: "available" },
    title: input.title,
    dueAt: input.at,
  };
}
