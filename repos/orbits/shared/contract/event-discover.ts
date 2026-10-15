// R27 — 「探す」: community events, events that help my plan (scored with `scoreEvent`), and everything by date.
// Owner: 甲 (R27). Used by: events (探す tab, both clients); signed-out visitors get the `all` group only (R26-08).
import type { EventAssessmentVerdict } from "./event-assessment";

export type EventDiscoverPeriod = "this_week" | "this_month" | "next_month" | "custom";
export type EventDiscoverArea = "online" | "tokyo" | "osaka" | "nagoya";
/** Fixed theme list (matched against title / description / tags by keyword rules). */
export type EventDiscoverTheme = "funding" | "saas" | "manufacturing_dx" | "hiring" | "management" | "networking" | "ipo" | "global";
export type EventDiscoverFormat = "speakers" | "networking" | "small";
export type EventDiscoverSort = "recommended" | "date";
/** `members_only` / `early_access` only when the organizer set that switch; `last_time` = I attended the previous edition. */
export type EventDiscoverBadge = "members_only" | "early_access" | "last_time";
/** Why a community row is in my community: I follow the organizer, or I attended one of its events. */
export type EventDiscoverCommunityReason = "following" | "attended";

export interface EventDiscoverRow {
  eventId: string;
  title: string;
  startsAt: string;
  endsAt?: string | null;
  venue?: string | null;
  area?: EventDiscoverArea | null;
  /** 0 = free; missing = unknown. */
  priceYen?: number | null;
  emoji: string;
  organizerId?: string | null;
  organizerName?: string | null;
  /** Same `scoreEvent` total as the plan page; omitted when signed out or without a plan. */
  score?: number | null;
  verdict?: EventAssessmentVerdict | null;
  /** 🎯 line, e.g. 「VC パートナー 3名が登壇」. */
  reason?: string | null;
  /** The 「?」 explanation (plan, overlapping person types, basis). */
  reasonDetail?: string | null;
  badges?: readonly EventDiscoverBadge[];
  communityReason?: EventDiscoverCommunityReason | null;
  /** 会えそうな人 (Web selected-event panel). */
  meetCandidates?: readonly { emoji: string; label: string }[];
  /** Names of my contacts who are going (「高橋さん・加藤さんも参加予定」). */
  knownAttendees?: readonly string[];
  registrationCount?: number | null;
  href: string;
  sample?: true;
}

/** One-click widening suggestions when few events match (「期間を『今月』に +9件」). */
export interface EventDiscoverWidenSuggestion {
  kind: "period" | "area" | "theme";
  value: string;
  extra: number;
}

/** `GET /api/events/discover?period=&from=&to=&areas=&themes=&formats=&freeOnly=&planFirst=&sort=&q=` */
export interface EventDiscoverResponse {
  community: readonly EventDiscoverRow[];
  planFit: readonly EventDiscoverRow[];
  all: readonly EventDiscoverRow[];
  /** Matching events for the current filters (「今月 28件」). */
  total: number;
  planFitTotal: number;
  /** No plan (or signed out): rows are ordered by registrations — 「今は『人気順』で表示しています」. */
  popularityFallback: boolean;
  /** Current-plan goal label for the 「?」 text, when there is a plan. */
  planGoal?: string | null;
  widen?: readonly EventDiscoverWidenSuggestion[];
  /** Signed-out visitors: only `all`, no scores. */
  signedOut?: boolean;
}

export interface EventDiscoverQuery {
  period?: EventDiscoverPeriod;
  from?: string;
  to?: string;
  areas?: readonly EventDiscoverArea[];
  themes?: readonly EventDiscoverTheme[];
  formats?: readonly EventDiscoverFormat[];
  freeOnly?: boolean;
  planFirst?: boolean;
  sort?: EventDiscoverSort;
}
