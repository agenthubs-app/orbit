/**
 * R27 mock 模式（本机 `ORBIT_REDESIGN_MOCK` / 演示世界）：读 `shared/mock/demo-world/events-journey.ts` 的示例世界。Owner: 甲 (R27).
 * - 不写库、不调 AI：興味なし / 关注 / 清单进进程内存（同一语义，重启即清）；会後確定只返回结果、什么都不写。
 * - 变体（空 / 少 / 多、会場状态）挂在 globalThis 上，由开发接口 `app/api/dev/event-design-fixture/route.dev.ts` 切换（Next dev 各路由包各一份模块，所以不用模块变量）。
 */
import { canSeeRoster } from "./roster-policy";
import { DEMO_EVENTS } from "../../../shared/mock/demo-world";
import {
  JOURNEY_EVENT_ID,
  journeyAfter,
  journeyDiscover,
  journeyEventIds,
  journeyPublicDiscover,
  journeyOverview,
  journeyPrep,
  journeySearch,
  journeyVenue,
  type EventJourneyVariant,
} from "../../../shared/mock/demo-world/events-journey";
import type { EventVenueState } from "../../../shared/contract/event-venue";
import { previewAfterScore } from "./after-core";
import { createMemoryActorRecordStore } from "../actor-records/store";
import { createEventFeedbackService, createOrganizerFollowService, createPrepChecklistService, createVenueMemoService } from "./attendee-records";
import { withVenueMemos, type JourneyService } from "./service";

export interface JourneyMockState {
  discover: EventJourneyVariant;
  overview: EventJourneyVariant;
  after: EventJourneyVariant;
  venue: EventVenueState;
  /** 详情的报名状态（取消确认框 b12 #374 需要「已报名」）。 */
  registration: "none" | "registered" | "pending_review";
}

const DEFAULT_STATE: JourneyMockState = { after: "many", discover: "many", overview: "many", registration: "none", venue: "checked_in" };
const holder = globalThis as typeof globalThis & { __orbitR27JourneyMock?: { state: JourneyMockState; store: ReturnType<typeof createMemoryActorRecordStore> } };

function mockHolder() {
  holder.__orbitR27JourneyMock ??= { state: { ...DEFAULT_STATE }, store: createMemoryActorRecordStore() };
  return holder.__orbitR27JourneyMock;
}

/** 开发接口用：切换示例变体（`null` 恢复默认、清空内存记录）。 */
export function setJourneyMockState(patch: Partial<JourneyMockState> | null): JourneyMockState {
  const current = mockHolder();
  if (patch === null) {
    holder.__orbitR27JourneyMock = { state: { ...DEFAULT_STATE }, store: createMemoryActorRecordStore() };
    return holder.__orbitR27JourneyMock.state;
  }
  current.state = { ...current.state, ...patch };
  return current.state;
}

export function journeyMockState(): JourneyMockState {
  return mockHolder().state;
}

const knownEvent = (eventId: string) => journeyEventIds().includes(eventId) || DEMO_EVENTS.some((event) => event.id === eventId);
const ORGANIZERS = new Set(["org-cfo-night", "org-marunouchi-lab", "org-saas-summit", "org-cvc", "org-series-a", "org-mfg-dx", "org-fintech"]);

export function createJourneyMockService(): JourneyService {
  const { store } = mockHolder();
  const feedback = createEventFeedbackService({ store });
  const follows = createOrganizerFollowService({ store });
  const checklist = createPrepChecklistService({ store });
  const memos = createVenueMemoService({ store });
  const state = () => mockHolder().state;
  return {
    async discover(actorId) {
      const data = journeyDiscover(state().discover);
      if (!actorId) return journeyPublicDiscover();
      const dismissed = new Set((await feedback.entries(actorId)).map((entry) => entry.eventId));
      const followed = await follows.followed(actorId);
      const community = data.community.filter((row) => !dismissed.has(row.eventId)).map((row) => (row.organizerId && followed.has(row.organizerId) ? { ...row, communityReason: "following" as const } : row));
      const planFit = data.planFit.filter((row) => !dismissed.has(row.eventId));
      return { ...data, community, planFit, planFitTotal: Math.max(0, data.planFitTotal - (data.planFit.length - planFit.length)) };
    },
    async dailyCandidates(actorId) {
      const dismissed = new Set((await feedback.entries(actorId)).map((entry) => entry.eventId));
      return journeyDiscover(state().discover).planFit.filter(row => !dismissed.has(row.eventId));
    },
    async search(_actorId, query) {
      return journeySearch(query);
    },
    async overview(actorId, eventId, _language, platform) {
      if (eventId !== JOURNEY_EVENT_ID && !knownEvent(eventId)) return null;
      const base = journeyOverview(state().overview, platform ?? "web");
      const data = { ...base, eventId: JOURNEY_EVENT_ID, registration: { ...base.registration, status: actorId ? state().registration : "none" as const } };
      if (!actorId) {
        const { assessment: _assessment, ...rest } = data;
        return { ...rest, attendees: [], knownAttendees: [], rosterLocked: true, organizer: { ...data.organizer, following: false, myAttendance: null, organizerId: null }, signedOut: true };
      }
      // 同 roster-policy：没报名确定只给人数与知り合い人数（示例世界的 registration 变体决定）。
      if (!canSeeRoster({ registrationStatus: data.registration.status, signedIn: true })) {
        return { ...data, attendees: [], knownAttendees: [], knownNote: null, rosterLocked: true };
      }
      return data;
    },
    async prep(_actorId, eventId) {
      if (eventId !== JOURNEY_EVENT_ID && !knownEvent(eventId)) return null;
      const data = journeyPrep();
      return { ...data, checklist: (await checklist.read(_actorId, JOURNEY_EVENT_ID)).some((item) => item.done) ? await checklist.read(_actorId, JOURNEY_EVENT_ID) : data.checklist };
    },
    patchChecklist(actorId, _eventId, items) {
      return checklist.patch(actorId, JOURNEY_EVENT_ID, items);
    },
    async venue(_actorId, eventId, platform) {
      if (eventId !== JOURNEY_EVENT_ID && !knownEvent(eventId)) return null;
      return withVenueMemos(journeyVenue(state().venue, platform ?? "web"), await memos.read(_actorId, JOURNEY_EVENT_ID));
    },
    async saveVenueMemo(actorId, eventId, attendeeId, text) {
      if (eventId !== JOURNEY_EVENT_ID && !knownEvent(eventId)) return null;
      return { attendeeId, memo: await memos.put(actorId, JOURNEY_EVENT_ID, attendeeId, text) };
    },
    async after(_actorId, eventId) {
      if (eventId !== JOURNEY_EVENT_ID && !knownEvent(eventId)) return null;
      return journeyAfter(state().after);
    },
    async confirmAfter(_actorId, eventId, input) {
      if (eventId !== JOURNEY_EVENT_ID && !knownEvent(eventId)) return null;
      // 示例模式：只算结果，不建 To-do、不改联系人、不记分。
      const data = journeyAfter(state().after);
      const checked = data.nextSteps.filter((step) => input.items.some((item) => item.attendeeId === step.attendeeId));
      const preview = previewAfterScore(checked, data.scoreSlots ?? []);
      return { confirmed: checked.length, confirmedAt: new Date().toISOString(), contactsLinked: checked.length, eventId: JOURNEY_EVENT_ID, scoreAfter: data.score ? Math.min(100, data.score.before + preview.total) : null, tasksCreated: checked.length };
    },
    async dismiss(actorId, eventId, input) {
      if (!knownEvent(eventId)) return null;
      return feedback.dismiss(actorId, { eventId, facts: {}, idempotencyKey: input.idempotencyKey, reason: input.reason });
    },
    async follow(actorId, organizerKey, following) {
      if (!ORGANIZERS.has(organizerKey)) return null;
      return following ? follows.follow(actorId, organizerKey) : follows.unfollow(actorId, organizerKey);
    },
    async eventIdByCode(code) {
      return ["CFO18NGT", "7QKM-H4TR"].includes(code.trim().toUpperCase()) ? JOURNEY_EVENT_ID : null;
    },
  };
}
