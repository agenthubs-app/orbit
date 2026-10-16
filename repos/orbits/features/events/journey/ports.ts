/**
 * R27 活动参加者整条路的 live 端口（服务层只依赖这些接口；`live.ts` 用现有服务实现，测试用替身）。Owner: 甲 (R27).
 * 约束：只读别人的**公开**资料；关系只用我自己的联系人；外部评估（R26 私有）不进公共列表；主办方 actor id 不出公开边界
 * （对外一律用 `organizerKey`，由 actor id 做单向摘要得到）。
 */
import type { EventAfterConfirmResult } from "../../../shared/contract/event-after";
import type { EventOverviewRegistrationStatus } from "../../../shared/contract/event-overview";
import type { EventPrepChecklistItem } from "../../../shared/contract/event-prep";
import type { AfterAiDraft, AfterMetPerson, AfterPlan } from "./after-core";
import type { DiscoverCandidate } from "./discover-core";
import type { PrepAttendee } from "./prep-core";
import type { VenueWorkspace } from "./venue-core";

export type MyEventStatus = Exclude<EventOverviewRegistrationStatus, "none"> | "planned";

/** A published Orbit event with the facts the journey screens show. */
export interface JourneyEvent {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string | null;
  description: string | null;
  emoji: string;
  priceYen: number | null;
  capacity: number | null;
  review: boolean;
  registrationClosesAt: string | null;
  agenda: readonly { at: string; title: string; detail?: string | null }[];
  /** One-way digest of the organizer actor id (never the actor id itself). */
  organizerKey: string | null;
  organizerName: string | null;
  registrationCount: number;
  badges: readonly ("members_only" | "early_access")[];
  publicCode: string | null;
}

/** A registrant who made their registration profile visible to attendees (`event_attendees`). */
export interface JourneyPublicAttendee {
  attendeeId: string;
  name: string;
  org: string | null;
  role: string | null;
  note: string | null;
  speaker: boolean;
}

export interface JourneyContact {
  id: string;
  name: string;
  org: string | null;
  role: string | null;
  /** Most recent interactions, newest first (「今日 打ち合わせ」「9/24 メール」). */
  history: readonly { at: string; kind: "meeting" | "email" | "message" | "note" | "other" }[];
  linkedTypeKey: string | null;
}

export interface JourneyLivePorts {
  /** Upcoming published events (bounded: next 120 days, ≤ 200). */
  catalogue(now: Date): Promise<JourneyEvent[]>;
  /** One published event, or null. */
  event(eventId: string): Promise<JourneyEvent | null>;
  /** Organizer history: editions (all time), first edition date, average registrations. */
  organizerStats(organizerKey: string): Promise<{ editions: number; since: string | null; averageAttendance: number | null; monthly: boolean } | null>;
  /** Event id by its public code (参加コード). */
  eventIdByCode(code: string): Promise<string | null>;
  publicAttendees(eventId: string): Promise<{ total: number; attendees: JourneyPublicAttendee[] }>;

  /** Signed-in actor's facts. */
  myEvents(actorId: string): Promise<Array<{ eventId: string; status: MyEventStatus; organizerKey: string | null }>>;
  contacts(actorId: string): Promise<JourneyContact[]>;
  /** Rule-based score for one event against my current plan (same `judgeEvent` / `scoreEvent` as the plan page); null without plan. */
  judge(actorId: string, eventIds: readonly string[], language: "ja" | "zh" | "en"): Promise<{ hasPlan: boolean; goal: string | null; results: Record<string, NonNullable<DiscoverCandidate["judge"]> & { display: { goalFit: number; people: number; timeCost: number }; basis: string; assessmentId: string | null; planFitNames: readonly string[] }> }>;
  /** Plan person-type label per attendee (my current plan, rule typing). */
  planTypesFor(actorId: string, attendees: readonly { attendeeId: string; name: string; org: string | null; role: string | null }[]): Promise<Record<string, { key: string; label: string } | null>>;
  /** 自己紹介：my registration draft (E4) for this event, else my profile intro. */
  selfIntro(actorId: string, eventId: string): Promise<{ text: string; source: "registration_draft" | "profile" } | null>;

  /** Canonical registration is `rsvped` for this actor and event. */
  registered(actorId: string, eventId: string): Promise<boolean>;
  /** Attendee-side operations projection (published results only). */
  venueWorkspace(actorId: string, eventId: string): Promise<VenueWorkspace | null>;
  /** R17：受付 QR v2 与受付番号（可选；没有的端口不显示 QR / 番号）。 */
  checkInPass?(actorId: string, eventId: string, participantId: string, eventEndsAt: string): Promise<{ qrPayload: string | null; receptionNumber: string | null }>;

  /** 会後 inputs. */
  afterInputs(actorId: string, eventId: string): Promise<{ met: AfterMetPerson[]; wantedTotal: number; meetings: number; ai: AfterAiDraft | null; legacy: { summary: string | null; messageDraft: string | null } | null; plan: AfterPlan | null; confirmedAt: string | null }>;
  /** Confirms the checked rows: To-do (follow-up date), contact 「出会い」(metEventId), plan `talked` (same person × type once). Idempotent by key. */
  confirmAfter(actorId: string, eventId: string, input: { items: readonly { attendeeId: string; followupDate: string; planTypeKey?: string | null }[]; idempotencyKey: string }): Promise<EventAfterConfirmResult>;

  /** Notifications (SC-R27-13) writer. */
  upsertInbox(actorId: string, input: { semanticKey: string; sourceKind: "event_deadline" | "event_prep"; eventId: string; title: string; body: string; href: string; at: string }): Promise<boolean>;
}

export type { DiscoverCandidate, EventPrepChecklistItem, PrepAttendee };
