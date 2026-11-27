// R27 — イベント詳細 read model: event facts, my rule-based assessment strip, organizer stats, public attendees.
// Owner: 甲 (R27). Used by: events (詳細, both clients; signed-out visitors get the public part only, R26-08).
import type { EventAssessmentVerdict } from "./event-assessment";
import type { EventRelevance } from "./event-relevance";
import type { HostEventContact } from "./host-events";

/** My relation to the event (same vocabulary as 参加予定, plus `none`). */
export type EventOverviewRegistrationStatus = "none" | "registered" | "pending_review" | "waitlisted" | "rejected" | "cancelled" | "attended";

export interface EventOverviewAttendee {
  attendeeId: string;
  name: string;
  org?: string | null;
  role?: string | null;
  /** One line from their public registration profile. */
  note?: string | null;
  initial: string;
  /** Matches a person type in my current plan. */
  planFit: boolean;
  /** Already in my contacts. */
  known: boolean;
  /** Marked 会いたい by me (from my plan match). */
  wanted: boolean;
}

export interface EventOverviewResponse {
  eventId: string;
  title: string;
  emoji: string;
  /** 2026-11-20 主办方上传的活动图片（2:1）；null / 缺省 = 没有图，保持 emoji 卡片。 */
  coverUrl?: string | null;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  priceYen?: number | null;
  capacity?: number | null;
  remaining?: number | null;
  /** 2026-11-27: no seat left still takes registrations, as the waitlist (キャンセル待ち). */
  waitlistEnabled?: boolean;
  review: boolean;
  /** Registration closes within 72 hours. */
  deadlineSoon: boolean;
  description?: string | null;
  agenda: readonly { at: string; title: string; detail?: string | null }[];
  organizer: {
    organizerId?: string | null;
    name: string;
    /** `name` is only the opaque fallback label (no public organizer name yet): the UI shows a generic 「主催者」 instead. */
    unnamed?: boolean;
    /** Public organizer page slug (o/[slug]); absent when the organizer has no public page. */
    slug?: string | null;
    emoji?: string | null;
    /** First edition date (「2023年から」). */
    since?: string | null;
    monthly?: boolean;
    editions?: number | null;
    averageAttendance?: number | null;
    /** Largest person-type share among past attendees (「CFO 比率 41%」). */
    typeShare?: { label: string; percent: number } | null;
    myAttendance?: number | null;
    following?: boolean;
    /** The organizer's soonest event that has not started yet (shown on an ended event's 「次回」 card). */
    next?: { eventId: string; title: string; startsAt: string } | null;
    /** One-line organizer profile bio (`organizer_profiles.bio`); null when none. 2026-11-15 detail rail organizer card. */
    bio?: string | null;
    /** Up to 2 most recent ended events of the same organizer (not this one); `attendance` = check-ins, null when none recorded. */
    past?: readonly { eventId: string; title: string; startsAt: string; attendance: number | null }[];
  };
  /** Rule-based (no AI) assessment for my current plan; absent when signed out or without a plan. */
  assessment?: {
    score: number;
    verdict: EventAssessmentVerdict;
    display: { goalFit: number; people: number; timeCost: number };
    basis: string;
    assessmentId?: string | null;
    /** 2026-11-15 去分数：「あなたに関係すること」卡（新版只看这个）。 */
    relevance?: EventRelevance | null;
  } | null;
  /** Attendees not public yet: the assessment's 「会える人」 shows 「—」 and its `basis` explains why. */
  assessmentPeopleUnknown?: boolean;
  /** Signed in: whether I have a current plan. `false` → the score slot and the rail show a 「プランを作る」 guide instead of staying empty. */
  hasPlan?: boolean;
  /** Attendees not public yet: people I can likely meet, estimated from the speakers. */
  speakerCandidates?: readonly { emoji: string; name: string; label: string; note: string }[];
  /** One line about a known person (「伊藤さんがキーノートに登壇 · 9/24 にメールでやりとり」). */
  knownNote?: { text: string; detail?: string | null } | null;
  /** When attendees become public (「申込者の公開は 9/25 から」); only while none are public yet. */
  attendeesPublicAt?: string | null;
  /** When registration closes (the invite-code card shows 「10/3 まで有効」). */
  registrationClosesAt?: string | null;
  /** I run this event (owner or co-host): show host actions (manage / check-in) instead of 报名. */
  hosting?: boolean;
  attendeeCounts: { all: number; planFit: number; known: number };
  /** Names are hidden from me (not registered yet, or signed out): show the counts and 「参加登録すると参加者が見られます」 (R27 roster policy A). */
  rosterLocked?: boolean;
  /** Only people who made their registration profile public; capped (`attendeeCounts.all` is the real total). */
  attendees: readonly EventOverviewAttendee[];
  knownAttendees: readonly { name: string; initial: string; speaker?: boolean }[];
  registration: { status: EventOverviewRegistrationStatus; href: string };
  /**
   * 主催者の連絡先（微信 / LINE / 一句说明）。服务端只给本场已报名的人（審査中 / 確定 / キャンセル待ち / 受付済み）：
   * 字段缺省 = 我看不到；null = 我能看但主办方没填（界面显示「まだありません」）。
   */
  hostContact?: HostEventContact | null;
  /**
   * 2026-11-20「会場の記録」入口（详情页）。只在 已结束 + 我是报名者 + 我在主办方公开的分组结果里 时给；
   * null / 缺省 = 不出入口。tablemates = 各轮同桌去重人数；recommended = 当天推荐给我的人数；exchanged = 交换成立人数。
   */
  venueRecord?: { tablemates: number; recommended: number; exchanged: number; checkedIn: boolean } | null;
  signedOut?: boolean;
  sample?: true;
}
