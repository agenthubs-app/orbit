/**
 * R27 活动参加者整条路的服务层（live）：把端口读到的事实交给纯逻辑（discover / search / prep / venue / after core）。Owner: 甲 (R27).
 * - 分数一律来自 `ports.judge`（= R26 `judgeEvent` / 计划页 `scoreEvent` 同一口径），这里不另算。
 * - 外部评估（R26 私有）不在公共目录里，所以探す / 搜索天然读不到别人的。
 * - 会場：先查报名状态，未报名直接 `not_registered`，不读运营数据。
 */
import type { EventRecommendationDismissReason, EventRecommendationDismissResult } from "../../../shared/contract/event-recommendation-feedback";
import type { EventAfterConfirmInput, EventAfterConfirmResult, EventAfterResponse } from "../../../shared/contract/event-after";
import type { EventDiscoverResponse } from "../../../shared/contract/event-discover";
import type { EventOverviewResponse } from "../../../shared/contract/event-overview";
import type { EventPrepChecklistItem, EventPrepResponse } from "../../../shared/contract/event-prep";
import type { EventSearchResponse } from "../../../shared/contract/event-search";
import type { EventVenueMemoResult, EventVenueResponse } from "../../../shared/contract/event-venue";
import type { OrganizerFollowResult } from "../../../shared/contract/organizer-follow";
import type { EventDiscoverParsedQuery } from "../../../shared/api-schema/event-discover";
import { buildAfter } from "./after-core";
import type { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "./attendee-records";
import { buildDiscover, eventArea, eventThemes, type DiscoverCandidate } from "./discover-core";
import type { JourneyContact, JourneyEvent, JourneyLivePorts } from "./ports";
import { buildPrep, meetingSlotsAfter, type JourneyLanguage, type PrepAttendee } from "./prep-core";
import { searchEvents } from "./search-core";
import { buildVenue } from "./venue-core";

export interface JourneyRecords {
  feedback: ReturnType<typeof createEventFeedbackService>;
  follows: ReturnType<typeof createOrganizerFollowService>;
  checklist: ReturnType<typeof createPrepChecklistService>;
  memos: ReturnType<typeof createVenueMemoService>;
}

export interface JourneyService {
  discover(actorId: string | null, query: EventDiscoverParsedQuery, language: JourneyLanguage): Promise<EventDiscoverResponse>;
  search(actorId: string, query: string, limit: number): Promise<EventSearchResponse>;
  /** `platform`: which client asks (the sample world shows each board's own text; live ignores it). */
  /** `allAttendees`：「すべて見る」—— 公开资料的参加者全部返回（上限 200），否则前 8 人。 */
  overview(actorId: string | null, eventId: string, language: JourneyLanguage, platform?: "web" | "app", options?: { allAttendees?: boolean }): Promise<EventOverviewResponse | null>;
  prep(actorId: string, eventId: string, language: JourneyLanguage): Promise<EventPrepResponse | null>;
  patchChecklist(actorId: string, eventId: string, items: readonly EventPrepChecklistItem[]): Promise<EventPrepChecklistItem[]>;
  venue(actorId: string, eventId: string, platform?: "web" | "app"): Promise<EventVenueResponse | null>;
  saveVenueMemo(actorId: string, eventId: string, attendeeId: string, text: string): Promise<EventVenueMemoResult | null>;
  after(actorId: string, eventId: string, language: JourneyLanguage): Promise<EventAfterResponse | null>;
  confirmAfter(actorId: string, eventId: string, input: EventAfterConfirmInput): Promise<EventAfterConfirmResult | null>;
  dismiss(actorId: string, eventId: string, input: { reason: EventRecommendationDismissReason; idempotencyKey: string }): Promise<EventRecommendationDismissResult | null>;
  follow(actorId: string, organizerKey: string, following: boolean): Promise<OrganizerFollowResult | null>;
  eventIdByCode(code: string): Promise<string | null>;
}

const hrefFor = (eventId: string) => `/events/${eventId}`;
const DEADLINE_SOON_MS = 72 * 3_600_000;

function historyText(contact: JourneyContact | undefined, now: Date, language: JourneyLanguage): string | null {
  if (!contact || contact.history.length === 0) return null;
  const label = (kind: JourneyContact["history"][number]["kind"]) => ({
    email: { en: "email", ja: "メール", zh: "邮件" },
    meeting: { en: "meeting", ja: "打ち合わせ", zh: "会面" },
    message: { en: "message", ja: "メッセージ", zh: "消息" },
    note: { en: "note", ja: "メモ", zh: "笔记" },
    other: { en: "contact", ja: "やりとり", zh: "往来" },
  })[kind][language];
  const day = (iso: string) => {
    const date = new Date(Date.parse(iso) + 9 * 3_600_000);
    const today = new Date(now.getTime() + 9 * 3_600_000);
    if (date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10)) return language === "en" ? "Today" : language === "zh" ? "今天" : "今日";
    return `${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
  };
  return contact.history.slice(0, 2).map((item) => `${day(item.at)} ${label(item.kind)}`).join(" · ");
}

export function createJourneyService(deps: { ports: JourneyLivePorts; records: JourneyRecords; now?: () => Date }): JourneyService {
  const now = deps.now ?? (() => new Date());
  const { ports, records } = deps;

  const candidateOf = (event: JourneyEvent): DiscoverCandidate => ({
    badges: event.badges,
    capacity: event.capacity,
    description: event.description,
    emoji: event.emoji,
    endsAt: event.endsAt,
    eventId: event.eventId,
    organizerId: event.organizerKey,
    organizerName: event.organizerName,
    priceYen: event.priceYen,
    registrationCount: event.registrationCount,
    startsAt: event.startsAt,
    title: event.title,
    venue: event.venue,
  });

  return {
    async discover(actorId, query, language) {
      const at = now();
      const events = await ports.catalogue(at);
      const candidates = events.map(candidateOf);
      if (!actorId) {
        return buildDiscover({ attendedOrganizers: new Set(), candidates, feedback: [], followedOrganizers: new Set(), hasPlan: false, hrefFor, myEventIds: new Set(), now: at, query, signedIn: false });
      }
      const [mine, followed, feedback] = await Promise.all([ports.myEvents(actorId), records.follows.followed(actorId), records.feedback.entries(actorId)]);
      // 只给最近的 40 场判分（有界读取）；其余照样出现在すべて，只是没有分。
      const scoredIds = candidates.filter((item) => Date.parse(item.startsAt) >= at.getTime()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)).slice(0, 40).map((item) => item.eventId);
      const judged = await ports.judge(actorId, scoredIds, language);
      for (const candidate of candidates) {
        const result = judged.results[candidate.eventId];
        if (result) candidate.judge = { knownAttendees: result.knownAttendees, meetCandidates: result.meetCandidates, reason: result.reason, reasonDetail: result.reasonDetail, score: result.score, verdict: result.verdict };
      }
      const attended = new Set(mine.filter((item) => item.status === "attended" && item.organizerKey).map((item) => item.organizerKey!));
      const myIds = new Set(mine.filter((item) => item.status !== "cancelled" && item.status !== "rejected" && item.status !== "planned").map((item) => item.eventId));
      return buildDiscover({ attendedOrganizers: attended, candidates, feedback, followedOrganizers: followed, hasPlan: judged.hasPlan, hrefFor, myEventIds: myIds, now: at, planGoal: judged.goal, query, signedIn: true });
    },

    async search(actorId, query, limit) {
      const at = now();
      const [events, mine, followed, contacts] = await Promise.all([ports.catalogue(at), ports.myEvents(actorId), records.follows.followed(actorId), ports.contacts(actorId)]);
      const editions: Record<string, number> = {};
      for (const event of events) if (event.organizerKey) editions[event.organizerKey] = (editions[event.organizerKey] ?? 0) + 1;
      const myStatus = Object.fromEntries(mine.flatMap((item) => (item.status === "registered" || item.status === "pending_review" || item.status === "attended" || item.status === "planned" ? [[item.eventId, item.status]] : [])));
      // 人：只在 upcoming 活动的公开参加者里找我的联系人（有界：最近 20 场）。
      const upcoming = events.filter((event) => Date.parse(event.startsAt) >= at.getTime()).slice(0, 20);
      const people = new Map<string, string[]>();
      await Promise.all(upcoming.map(async (event) => {
        const roster = await ports.publicAttendees(event.eventId).catch(() => ({ attendees: [], total: 0 }));
        people.set(event.eventId, roster.attendees.map((item) => item.name));
      }));
      return searchEvents({
        events: events.map((event) => ({ badges: event.badges, description: event.description, emoji: event.emoji, eventId: event.eventId, organizerId: event.organizerKey, organizerName: event.organizerName, people: people.get(event.eventId) ?? [], priceYen: event.priceYen, startsAt: event.startsAt, title: event.title, venue: event.venue })),
        following: followed,
        hrefFor,
        limit,
        myContacts: contacts,
        myStatus,
        now: at,
        organizerEditions: editions,
        query,
      });
    },

    async overview(actorId, eventId, language, _platform, options) {
      const cap = options?.allAttendees ? 200 : 8;
      const event = await ports.event(eventId);
      if (!event) return null;
      const at = now();
      const [roster, stats] = await Promise.all([ports.publicAttendees(eventId), event.organizerKey ? ports.organizerStats(event.organizerKey) : Promise.resolve(null)]);
      const base: EventOverviewResponse = {
        agenda: event.agenda,
        attendeeCounts: { all: roster.total, known: 0, planFit: 0 },
        attendees: [],
        capacity: event.capacity,
        registrationClosesAt: event.registrationClosesAt ?? null,
        deadlineSoon: Boolean(event.registrationClosesAt && Date.parse(event.registrationClosesAt) - at.getTime() <= DEADLINE_SOON_MS && Date.parse(event.registrationClosesAt) > at.getTime()),
        description: event.description,
        emoji: event.emoji,
        endsAt: event.endsAt,
        eventId,
        knownAttendees: [],
        organizer: { averageAttendance: stats?.averageAttendance ?? null, editions: stats?.editions ?? null, monthly: stats?.monthly ?? false, name: event.organizerName ?? "", organizerId: actorId ? event.organizerKey : null, since: stats?.since ?? null },
        priceYen: event.priceYen,
        registration: { href: `/events/${eventId}/register`, status: "none" },
        remaining: event.capacity ? Math.max(0, event.capacity - event.registrationCount) : null,
        review: event.review,
        startsAt: event.startsAt,
        title: event.title,
        venue: event.venue,
      };
      // 未登录只给人数：报名资料的「参加者に表示」是给同场参加者看的，不给匿名访客（旧的公开预览也只有聚合桶）。
      if (!actorId) return { ...base, attendees: [], signedOut: true };
      const [mine, contacts, judged, types, followed] = await Promise.all([
        ports.myEvents(actorId),
        ports.contacts(actorId),
        ports.judge(actorId, [eventId], language),
        ports.planTypesFor(actorId, roster.attendees),
        event.organizerKey ? records.follows.followed(actorId) : Promise.resolve(new Set<string>()),
      ]);
      const contactNames = new Set(contacts.map((contact) => contact.name.replace(/\s+/g, "")));
      const attendees = roster.attendees.map((item) => {
        const known = contactNames.has(item.name.replace(/\s+/g, ""));
        const planFit = Boolean(types[item.attendeeId]);
        return { attendeeId: item.attendeeId, initial: item.name.trim().charAt(0), known, name: item.name, note: item.note, org: item.org, planFit, role: item.role, wanted: planFit && !known };
      });
      const order = (a: typeof attendees[number], b: typeof attendees[number]) => Number(b.planFit) - Number(a.planFit) || Number(b.known) - Number(a.known);
      const known = roster.attendees.filter((item) => contactNames.has(item.name.replace(/\s+/g, "")));
      const mineRow = mine.find((item) => item.eventId === eventId);
      const result = judged.results[eventId];
      return {
        ...base,
        assessment: result ? { assessmentId: result.assessmentId, basis: result.basis, display: result.display, score: result.score, verdict: result.verdict } : null,
        ...(result && roster.total === 0 ? { assessmentPeopleUnknown: true } : {}),
        attendeeCounts: { all: roster.total, known: known.length, planFit: attendees.filter((item) => item.planFit).length },
        attendees: [...attendees].sort(order).slice(0, cap),
        knownAttendees: known.slice(0, 5).map((item) => ({ initial: item.name.trim().charAt(0), name: item.name.split(" ")[0] ?? item.name, speaker: item.speaker })),
        organizer: { ...base.organizer, following: event.organizerKey ? followed.has(event.organizerKey) : false, myAttendance: event.organizerKey ? mine.filter((item) => item.organizerKey === event.organizerKey && item.status === "attended").length : null },
        registration: { href: `/events/${eventId}/register`, status: mineRow && mineRow.status !== "planned" ? mineRow.status : "none" },
      };
    },

    async prep(actorId, eventId, language) {
      const event = await ports.event(eventId);
      if (!event) return null;
      // 会う準備只给已报名的人（名单与话しかけ方都来自同场参加者的资料）。
      if (!(await ports.registered(actorId, eventId).catch(() => false))) return null;
      const at = now();
      const [roster, contacts, checklist, selfIntro, workspace] = await Promise.all([
        ports.publicAttendees(eventId),
        ports.contacts(actorId),
        records.checklist.read(actorId, eventId),
        ports.selfIntro(actorId, eventId),
        ports.registered(actorId, eventId).then((ok) => (ok ? ports.venueWorkspace(actorId, eventId) : null)).catch(() => null),
      ]);
      const types = await ports.planTypesFor(actorId, roster.attendees);
      const byName = new Map(contacts.map((contact) => [contact.name.replace(/\s+/g, ""), contact]));
      const myTable = workspace?.roundTwoTable ?? workspace?.roundOneTable ?? null;
      const tableIds = new Set(myTable?.members.map((member) => member.participantId) ?? []);
      const attendees: PrepAttendee[] = roster.attendees.map((item) => {
        const contact = byName.get(item.name.replace(/\s+/g, ""));
        const recent = contact?.history[0] ? at.getTime() - Date.parse(contact.history[0].at) <= 30 * 86_400_000 : false;
        return {
          attendeeId: item.attendeeId,
          contactId: contact?.id ?? null,
          history: historyText(contact, at, language),
          name: item.name,
          org: item.org,
          planTypeLabel: types[item.attendeeId]?.label ?? null,
          relation: contact ? (recent ? "working" : "met") : "none",
          role: item.role,
          sameTable: tableIds.has(item.attendeeId) && myTable ? String(myTable.tableNumber) : null,
          speaker: item.speaker,
          why: item.note,
        };
      });
      return buildPrep({ agenda: event.agenda, attendees, checklist, event, language, now: at, selfIntro });
    },

    patchChecklist(actorId, eventId, items) {
      return records.checklist.patch(actorId, eventId, items);
    },

    async venue(actorId, eventId) {
      const event = await ports.event(eventId);
      if (!event) return null;
      const registered = await ports.registered(actorId, eventId);
      if (!registered) return buildVenue({ agenda: [], event, myContacts: [], now: now(), registered: false, wantedParticipantIds: new Set(), workspace: null });
      const [workspace, contacts] = await Promise.all([ports.venueWorkspace(actorId, eventId), ports.contacts(actorId)]);
      const directory = workspace?.directory ?? [];
      const types = await ports.planTypesFor(actorId, directory.map((item) => ({ attendeeId: item.participantId, name: item.displayName, org: item.company, role: item.role })));
      const wanted = new Set(directory.filter((item) => types[item.participantId]).map((item) => item.participantId));
      const at = now();
      const slots = meetingSlotsAfter(event.startsAt);
      return withVenueMemos(buildVenue({ agenda: event.agenda, event, meetingSlots: slots, myContacts: contacts, now: at, registered: true, wantedParticipantIds: wanted, workspace }), await records.memos.read(actorId, eventId));
    },

    async saveVenueMemo(actorId, eventId, attendeeId, text) {
      if (!(await ports.event(eventId)) || !(await ports.registered(actorId, eventId))) return null;
      return { attendeeId, memo: await records.memos.put(actorId, eventId, attendeeId, text) };
    },

    async after(actorId, eventId, language) {
      const event = await ports.event(eventId);
      if (!event) return null;
      const inputs = await ports.afterInputs(actorId, eventId);
      return buildAfter({ ...inputs, event, language });
    },

    async confirmAfter(actorId, eventId, input) {
      const event = await ports.event(eventId);
      if (!event) return null;
      return ports.confirmAfter(actorId, eventId, input);
    },

    async dismiss(actorId, eventId, input) {
      const event = await ports.event(eventId);
      if (!event) return null;
      const text = [event.title, event.description, event.organizerName].filter(Boolean).join(" ");
      return records.feedback.dismiss(actorId, { eventId, facts: { area: eventArea(event.venue), organizerId: event.organizerKey, startsAt: event.startsAt, themes: eventThemes(text) }, idempotencyKey: input.idempotencyKey, reason: input.reason });
    },

    async follow(actorId, organizerKey, following) {
      const events = await ports.catalogue(now());
      if (!events.some((event) => event.organizerKey === organizerKey)) return null;
      return following ? records.follows.follow(actorId, organizerKey) : records.follows.unfollow(actorId, organizerKey);
    },

    eventIdByCode(code) {
      return ports.eventIdByCode(code);
    },
  };
}

/** 会場メモ（自分だけ）贴到每个人身上（推荐 / 次に話す順 / 参加者）。 */
export function withVenueMemos(venue: EventVenueResponse, memos: Record<string, string>): EventVenueResponse {
  if (!Object.keys(memos).length) return venue;
  const attach = <T extends { attendeeId: string }>(person: T) => (memos[person.attendeeId] ? { ...person, memo: memos[person.attendeeId] } : person);
  return { ...venue, attendees: venue.attendees.map(attach), nextOrder: venue.nextOrder.map(attach), recommendations: venue.recommendations.map(attach) };
}
