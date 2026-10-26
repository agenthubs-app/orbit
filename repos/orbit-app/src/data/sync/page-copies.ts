/**
 * Sprint 0131: page copies (页面副本). Some pages the user wants offline are
 * computed by the server on every read — the own profile, the agent action
 * centre and ledger, the relationship follow-up and suggestion pages, Today,
 * a relationship's next step, a meeting's details, the public event catalogue
 * and the event recommendations. They have no rows a sync domain could send
 * incrementally, so the device keeps the last successful online read of each
 * (the "last seen" copy) and shows it with the 「截至」 notice when the server
 * cannot be reached.
 *
 * A copy is bound to the offline read lease, like a sync domain's rows:
 *   - it is stored under (workspace, authorization epoch) of the accepted lease,
 *     and every sync that accepts a lease drops copies of any other epoch
 *     (rotation) or all of them when the lease grants nothing (revocation);
 *   - it is readable only while that lease is accepted (≤ 7 days, same actor,
 *     same server), so an expired lease locks copies with the domains;
 *   - it lives in the identity's own local database (native: SQLCipher; browser:
 *     each value AES-GCM encrypted by the mirror's payload codec), which is
 *     deleted on sign-out, account switch and server switch.
 * Only the ids below exist; a browser stores only WEB_MIRROR_PAGE_COPY_IDS
 * (threat model section 2, 「页面副本」). A copy is never written from a failed
 * or non-2xx read, and never holds more than `maxBytes`.
 */
export interface PageCopyDefinition {
  id: string;
  /** The GET the copy is the last successful response of. */
  endpoint: string;
  /**
   * "single": one copy (optionally a few fixed variants such as a list mode).
   * "keyed": one copy per opened item; the most recently saved `maxVariants` are kept.
   */
  variants: "single" | "keyed";
  maxVariants: number;
  /** Serialized response bytes a copy may hold; a larger response is not kept. */
  maxBytes: number;
  /** Who can see it: "account" data is per actor; "platform" data (the public catalogue) is the same for everyone. */
  audience: "account" | "platform";
  description: string;
}

const KB = 1024;

export const PAGE_COPY_DEFINITIONS: readonly PageCopyDefinition[] = [
  { id: "self-profile", endpoint: "/api/profile", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "The account's own profile (profile page, preview, tags)." },
  { id: "agent-actions", endpoint: "/api/agent/actions", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "The agent action centre's current actions." },
  // Three ledger pages: the first page is what the ledger opens on, and two more cover a normal
  // week of agent activity (a page is 20 entries); older entries are history the user rarely needs offline.
  { id: "agent-ledger", endpoint: "/api/agent/ledger", variants: "single", maxVariants: 3, maxBytes: 256 * KB, audience: "account", description: "The All Actions ledger: the first three pages (variants page-1..page-3)." },
  { id: "relationship-tasks", endpoint: "/api/relationship-tasks/page", variants: "single", maxVariants: 2, maxBytes: 128 * KB, audience: "account", description: "The first relationship follow-up page per mode (open, completed)." },
  { id: "task-suggestions", endpoint: "/api/task-suggestions/page", variants: "single", maxVariants: 1, maxBytes: 128 * KB, audience: "account", description: "The first page of pending relationship task suggestions." },
  { id: "today-page", endpoint: "/api/today", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "Today's first task page (taskMode=page) for the device's time zone." },
  { id: "today-summary", endpoint: "/api/today", variants: "single", maxVariants: 1, maxBytes: 128 * KB, audience: "account", description: "The Today summary block on the AI tab (taskMode=summary)." },
  { id: "todo-page", endpoint: "/api/todo/page", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "The first To-do page (decisions, next moves, and follow-ups), last seen online; excludes external-calendar events and marks stale information after local midnight." },
  { id: "relationship-lifecycle", endpoint: "/api/connections/:id/lifecycle", variants: "keyed", maxVariants: 20, maxBytes: 128 * KB, audience: "account", description: "A relationship's next-step page, per connection; the 20 most recently opened are kept." },
  { id: "meeting-details", endpoint: "/api/schedule-items/:id/meeting-details", variants: "keyed", maxVariants: 20, maxBytes: 128 * KB, audience: "account", description: "A meeting's details, per meeting; the 20 most recently opened are kept." },
  { id: "calendar-meetings", endpoint: "/api/schedule-items", variants: "keyed", maxVariants: 3, maxBytes: 256 * KB, audience: "account", description: "Confirmed meeting previews for the three most recently viewed calendar windows; native device only, excluding personal schedules and external events." },
  // Meetings (appointments) have no sync domain; the home schedule keeps the meeting rows of its last online answer.
  { id: "home-schedule", endpoint: "/api/schedule-items", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "The home schedule card's last answer (its confirmed meetings are shown offline next to the personal-schedule and registered-event domains)." },
  // Sprint 0131 (coordinator item from 0117): the source audit reads every audited collection, so it runs on demand;
  // the dashboard shows the last result and its time.
  // LF1 (local-first repair): Home cards the device has no domain for keep their last answer, shown at once
  // and re-read only after their fresh window or a write (data/sync/page-copy-freshness.ts).
  { id: "home-plan-summary", endpoint: "/api/agent/plans/v2/summary", variants: "single", maxVariants: 1, maxBytes: 128 * KB, audience: "account", description: "The Home plan score card's last answer (current plan, score and segments)." },
  { id: "home-guide-progress", endpoint: "/api/home/guide-progress", variants: "single", maxVariants: 1, maxBytes: 16 * KB, audience: "account", description: "The Home three-step guide's last answer (derived from contacts, goal and plan on the server)." },
  { id: "home-week", endpoint: "/api/schedule-items", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "The Home week card's last answer (this week's calendar items)." },
  { id: "completion-question", endpoint: "/api/contacts/completion-question", variants: "single", maxVariants: 1, maxBytes: 32 * KB, audience: "account", description: "Today's one completion question (the card re-reads after an answer or skip)." },
  // LF2: events. The tab's three lists, and the detail and venue answers of the most recently opened events, so a
  // registered attendee can read them on the event day without signal (what 0115's event-day screens gave).
  { id: "event-assessments", endpoint: "/api/events/assessments", variants: "single", maxVariants: 1, maxBytes: 256 * KB, audience: "account", description: "The events tab's assessment list as last seen." },
  { id: "events-mine", endpoint: "/api/events/mine", variants: "single", maxVariants: 2, maxBytes: 256 * KB, audience: "account", description: "The events tab's upcoming and past registrations as last seen (variants upcoming, past)." },
  { id: "host-summary", endpoint: "/api/events/center", variants: "single", maxVariants: 1, maxBytes: 16 * KB, audience: "account", description: "The my page's host row: hosted, active and this month's applied counts as last seen (LF8)." },
  { id: "event-overview", endpoint: "/api/events/:id/overview", variants: "keyed", maxVariants: 20, maxBytes: 256 * KB, audience: "account", description: "An event's detail page per event; the 20 most recently opened are kept." },
  { id: "event-venue", endpoint: "/api/events/:id/venue", variants: "keyed", maxVariants: 10, maxBytes: 512 * KB, audience: "account", description: "An event's venue page (seats, rounds, recommendations, people) per event; the 10 most recently opened are kept." },
  // LF3: the AI tab's plan drafts list (plans have no sync domain).
  { id: "plan-intakes", endpoint: "/api/agent/plans/intakes", variants: "single", maxVariants: 1, maxBytes: 128 * KB, audience: "account", description: "The account's plan intakes (drafts in progress) as last seen, shown on the AI tab." },
  { id: "plan-overview", endpoint: "/api/agent/plans/v2/:planId", variants: "keyed", maxVariants: 5, maxBytes: 256 * KB, audience: "account", description: "The Task plan segment's overview per goal as last seen (LF9); the 5 most recently opened goals are kept." },
  { id: "plan-legacy", endpoint: "/api/agent/plans/legacy", variants: "single", maxVariants: 1, maxBytes: 64 * KB, audience: "account", description: "The Task plan segment's read-only earlier (v1) plans as last seen (LF9)." },
  { id: "task-demo-status", endpoint: "/api/tasks/demo-status", variants: "single", maxVariants: 1, maxBytes: 8 * KB, audience: "account", description: "Whether the Task plan segment is in the guided sample (and its n/3 steps) as last seen (LF9)." },
  { id: "public-events", endpoint: "/api/events/public", variants: "single", maxVariants: 1, maxBytes: 512 * KB, audience: "platform", description: "The public event catalogue as last seen (platform data, stored per identity so one clearing rule applies)." },
  { id: "event-recommendations", endpoint: "/api/recommendations/events", variants: "single", maxVariants: 2, maxBytes: 256 * KB, audience: "account", description: "The account's event recommendations as last seen (variants: home card, events tab)." },
];

/** LF7: page copies an earlier build saved and this one no longer shows (the 0117 dashboard's source audit); deleted on sync. */
export const RETIRED_PAGE_COPY_IDS: readonly string[] = ["provenance-audit"];

export type PageCopyId = (typeof PAGE_COPY_DEFINITIONS)[number]["id"];

export function findPageCopyDefinition(id: string): PageCopyDefinition | null {
  return PAGE_COPY_DEFINITIONS.find((definition) => definition.id === id) ?? null;
}

/** The last successful online read of a page, as the device keeps it. */
export interface PageCopy<TData = unknown> {
  data: TData;
  /** When the server answered (ISO). */
  syncedAt: string;
}

/** What a page may say about a copy it is showing. */
export interface PageCopyStatus {
  /** The copy on screen is from `lastSyncedAt`. */
  lastSyncedAt: string | null;
  /** The server could not be reached, or answered with an error, after the copy was shown. */
  offline: boolean;
  /** Why: no connection, or the server answered 5xx. */
  reason: "unreachable" | "unavailable" | null;
  /** QA-D: true when this is LF1's fresh copy, used as this visit's answer (no server read) — current enough to act on. */
  fresh?: boolean;
}

export const PAGE_COPY_VARIANT_MAX_LENGTH = 200;

export function assertPageCopyKey(id: string, variant: string): PageCopyDefinition {
  const definition = findPageCopyDefinition(id);
  if (!definition) throw new TypeError("page copy is not registered");
  if (typeof variant !== "string" || variant.length === 0 || variant.length > PAGE_COPY_VARIANT_MAX_LENGTH) throw new TypeError("page copy variant is invalid");
  return definition;
}

/** 0 (no connection) and 5xx keep a copy on screen; any other answer is the server's word. */
export function keepsPageCopy(result: { success: true } | { success: false; status: number; error: { code: string } }): "unreachable" | "unavailable" | null {
  if (result.success || !("error" in result)) return null;
  if (result.status === 0 || result.error.code === "ORBIT_APP_NETWORK_ERROR") return "unreachable";
  return result.status >= 500 ? "unavailable" : null;
}

/** A feature-level not-implemented answer is authoritative even when a prior copy exists. */
export function shouldRetainPageCopy(state: { kind: string; error?: { code: string } }, dropOnCodes: readonly string[] = []): boolean {
  return state.kind !== "failure" || !state.error || !dropOnCodes.includes(state.error.code);
}
