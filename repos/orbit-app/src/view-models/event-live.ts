/**
 * Sprint 0107: pure view model for the App event live page (`/events/[id]/live`),
 * the counterpart of web `/app/events/[id]/live`. Everything is derived from the
 * registered attendee workspace (`GET /api/events/:id/operations`); nothing here
 * invents schedule, seating or recommendation content.
 */
import type { AttendeeWorkspace } from "../api/event-attendee-operations";

export type LiveTab = "home" | "rec" | "all" | "group" | "agenda";
export const LIVE_TABS: readonly LiveTab[] = ["home", "rec", "all", "group", "agenda"];

type Param = string | string[] | undefined | null;
const first = (value: Param) => (Array.isArray(value) ? value[0] : value) ?? undefined;

/** Web tab keys are accepted too; the web graph tab lives in the App agenda tab. */
export function liveTabFrom(value: Param): LiveTab {
  const tab = first(value);
  if (tab === "graph") return "agenda";
  return LIVE_TABS.includes(tab as LiveTab) ? tab as LiveTab : "home";
}

export function liveHref(eventId: string, options: { tab?: LiveTab; participant?: string } = {}): string {
  const params = new URLSearchParams();
  if (options.tab && options.tab !== "home") params.set("tab", options.tab);
  if (options.participant) params.set("participant", options.participant);
  const query = params.toString();
  return `/events/${encodeURIComponent(eventId)}/live${query ? `?${query}` : ""}`;
}

/** Old `/party*` links: the live page of the named event, else the event catalogue. */
export function partyRedirectHref(params: { eventId?: Param; code?: Param }, variant: "overview" | "checkin" | "graph"): string {
  const eventId = first(params.eventId)?.trim() || first(params.code)?.trim();
  if (!eventId) return "/events";
  return liveHref(eventId, variant === "graph" ? { tab: "agenda" } : {});
}

type Person = AttendeeWorkspace["directory"][number];
type Table = NonNullable<AttendeeWorkspace["roundOneTable"]>;

export function initialFor(name: string): string {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0]!.toUpperCase() : "?";
}

export function personRole(person: Pick<Person, "role" | "company">): string {
  return [person.role, person.company].filter(value => value && value.trim()).join(" · ");
}

// ── Agenda: the three configured schedule instants (same source as the web live page) ──
export type AgendaKey = "checkIn" | "roundOne" | "roundTwo";
export type AgendaStatus = "done" | "now" | "soon" | "later";
export interface AgendaItem { key: AgendaKey; at: string }

export function agendaItems(workspace: AttendeeWorkspace): AgendaItem[] {
  const c = workspace.configuration;
  return [{ key: "checkIn", at: c.checkInOpensAt }, { key: "roundOne", at: c.roundOneStartsAt }, { key: "roundTwo", at: c.roundTwoStartsAt }];
}

/** Last started item is "now", earlier started ones "done", first not started "soon". */
export function agendaStatuses(items: readonly AgendaItem[], now: number): AgendaStatus[] {
  const startedAt = items.map(item => Date.parse(item.at));
  const started = startedAt.map(ms => Number.isFinite(ms) && ms <= now);
  const current = started.lastIndexOf(true);
  const soon = startedAt.findIndex((ms, index) => Number.isFinite(ms) && !started[index] && index > current);
  return items.map((_, index) => index === current ? "now" : index < current && started[index] ? "done" : index === soon ? "soon" : "later");
}

// ── Seating ──
export interface Placement { round: 1 | 2; table: Table; seat: string; myRationale: string; members: Person[] }

/** A table is shown only when every member has a published rationale (web `tableView`). */
function placementFor(workspace: AttendeeWorkspace, table: Table | null, round: 1 | 2): Placement | null {
  if (!table) return null;
  const me = table.members.find(member => member.participantId === workspace.me.participantId);
  if (!me) return null;
  if (Object.keys(table.memberRationales).length !== table.members.length || table.members.some(member => !table.memberRationales[member.participantId]?.trim())) return null;
  const members = table.members.flatMap(member => {
    if (member.participantId === workspace.me.participantId) return [];
    const person = workspace.directory.find(p => p.participantId === member.participantId);
    return person ? [person] : [];
  });
  return { round, table, seat: me.seat, myRationale: table.memberRationales[me.participantId]!, members };
}

export function placements(workspace: AttendeeWorkspace): { one: Placement | null; two: Placement | null } {
  return { one: placementFor(workspace, workspace.roundOneTable, 1), two: placementFor(workspace, workspace.roundTwoTable, 2) };
}

/** Round two is current once its configured start has passed and a round-two table exists. */
export function currentPlacement(workspace: AttendeeWorkspace, now: number): Placement | null {
  const { one, two } = placements(workspace);
  const roundTwoStarted = Date.parse(workspace.configuration.roundTwoStartsAt) <= now;
  return roundTwoStarted && two ? two : one ?? two;
}

// ── Contact exchange ──
export type ExchangeKind = "self" | "none" | "outgoing" | "incoming" | "accepted" | "declined" | "withdrawn_outgoing" | "withdrawn_incoming";
export interface ExchangeState { kind: ExchangeKind; requestId: string | null; contactId: string | null }

export function exchangeState(workspace: AttendeeWorkspace, participantId: string): ExchangeState {
  const me = workspace.me.participantId;
  if (participantId === me) return { kind: "self", requestId: null, contactId: null };
  const request = workspace.contactRequests.find(r =>
    (r.requesterParticipantId === me && r.targetParticipantId === participantId) || (r.targetParticipantId === me && r.requesterParticipantId === participantId));
  if (!request) return { kind: "none", requestId: null, contactId: null };
  const outgoing = request.requesterParticipantId === me;
  const kind: ExchangeKind = request.contactId || request.status === "accepted" ? "accepted"
    : request.status === "awaiting_target_consent" ? outgoing ? "outgoing" : "incoming"
    : request.status === "declined" ? "declined"
    : outgoing ? "withdrawn_outgoing" : "withdrawn_incoming";
  return { kind, requestId: request.requestId, contactId: request.contactId };
}

/** Exchange opens when the event starts (same gate as the attendee controller and web). */
export function exchangeOpen(workspace: AttendeeWorkspace, now: number): boolean {
  return now >= Date.parse(workspace.configuration.eventStartsAt);
}

// ── People ──
export interface RecommendedPerson { person: Person; score: number; reasons: string[]; memberHint: string; icebreakers: string[] }

export function recommendedPeople(workspace: AttendeeWorkspace): RecommendedPerson[] {
  if (workspace.resultsState !== "ready" || !workspace.recommendations) return [];
  return workspace.recommendations.recommendations.flatMap(r => {
    const person = workspace.directory.find(p => p.participantId === r.targetParticipantId);
    return person && person.participantId !== workspace.me.participantId
      ? [{ person, score: r.score, reasons: r.reasons, memberHint: r.memberHint, icebreakers: r.icebreakers }] : [];
  });
}

export function otherAttendees(workspace: AttendeeWorkspace, query: string): Person[] {
  const needle = query.trim().toLocaleLowerCase();
  return workspace.directory.filter(person => person.participantId !== workspace.me.participantId && (!needle ||
    [person.displayName, person.company, person.role, person.industry, ...person.topics].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle)));
}

export function sharedTopics(a: readonly string[], b: readonly string[]): string[] {
  const other = new Set(b.map(topic => topic.trim().toLocaleLowerCase()));
  const seen = new Set<string>();
  return a.filter(topic => {
    const key = topic.trim().toLocaleLowerCase();
    if (!key || !other.has(key) || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

// ── One-ring graph around me ──
export interface GraphNode { participantId: string; initial: string; name: string; kind: "known" | "recommended"; x: number; y: number }
export interface GraphRing { nodes: GraphNode[]; center: { x: number; y: number }; radius: number; knownCount: number; recommendedCount: number }

export function graphRing(workspace: AttendeeWorkspace, limit = 8, size = { width: 358, height: 240 }): GraphRing {
  const known = workspace.directory.filter(p => exchangeState(workspace, p.participantId).kind === "accepted");
  const knownIds = new Set(known.map(p => p.participantId));
  const recommended = recommendedPeople(workspace).map(r => r.person).filter(p => !knownIds.has(p.participantId));
  const center = { x: size.width / 2, y: size.height / 2 };
  const radius = Math.min(size.width, size.height) / 2 - 30;
  const picked = [...known.map(p => ({ p, kind: "known" as const })), ...recommended.map(p => ({ p, kind: "recommended" as const }))].slice(0, limit);
  const nodes = picked.map(({ p, kind }, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / Math.max(picked.length, 1);
    return { participantId: p.participantId, initial: initialFor(p.displayName), name: p.displayName, kind, x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
  });
  return { nodes, center, radius, knownCount: known.length, recommendedCount: recommended.length };
}

// ── Event detail entry ──
function calendarDay(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/**
 * Registered attendees see the entry until the event ends; on the event's
 * calendar day (in the viewer's time zone) it is pinned.
 */
export function liveEntryState(input: { eligibilityState: string | undefined; startsAt: string; endsAt: string; now: number; timeZone: string }): { pinned: boolean; inProgress: boolean } | null {
  if (input.eligibilityState !== "registered") return null;
  const start = Date.parse(input.startsAt); const end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || input.now > end) return null;
  const inProgress = input.now >= start;
  const pinned = inProgress || calendarDay(input.now, input.timeZone) === calendarDay(start, input.timeZone);
  return { pinned, inProgress };
}

// ── Appointment proposal (same rules as the web live schedule modal) ──
export const SCHEDULE_SLOTS: readonly string[] = ["10:00 - 10:30", "10:30 - 11:00", "11:00 - 11:30", "14:00 - 14:30", "14:30 - 15:00", "15:00 - 15:30"];
export const SCHEDULE_MIN_CANDIDATES = 3;
export const SCHEDULE_MAX_CANDIDATES = 5;
export const SCHEDULE_DURATION_MINUTES = 30;
export const SCHEDULE_TIMEZONE = "Asia/Tokyo";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const two = (value: number) => String(value).padStart(2, "0");
const WEEKDAY = { zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ja: ["日", "月", "火", "水", "木", "金", "土"] } as const;

export interface ScheduleDay { iso: string; label: string; weekday: string }

export function scheduleDays(now: number, language: "zh" | "en" | "ja", count = 5): ScheduleDay[] {
  const tokyo = new Date(now + JST_OFFSET_MS);
  const base = Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate());
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base + index * 86_400_000);
    const month = date.getUTCMonth() + 1; const day = date.getUTCDate();
    return { iso: `${date.getUTCFullYear()}-${two(month)}-${two(day)}`, label: language === "en" ? `${month}/${day}` : `${month}月${day}日`, weekday: WEEKDAY[language][date.getUTCDay()]! };
  });
}

export function slotStartsAtUtc(dayIso: string, slot: string): string {
  const [year, month, day] = dayIso.split("-").map(Number);
  const [hour, minute] = slot.split(" - ")[0]!.split(":").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!) - JST_OFFSET_MS).toISOString();
}

export function candidateTimesFrom(keys: readonly string[]): { startsAtUtc: string }[] {
  return keys.map(key => { const [dayIso, ...rest] = key.split(" "); return slotStartsAtUtc(dayIso!, rest.join(" ")); })
    .sort().map(startsAtUtc => ({ startsAtUtc }));
}

export function composeNoteText(parts: { what: string; need: string; offer: string }, labels: { need: string; offer: string }): string {
  const lines = [parts.what.trim()];
  if (parts.need.trim()) lines.push(`${labels.need}：${parts.need.trim()}`);
  if (parts.offer.trim()) lines.push(`${labels.offer}：${parts.offer.trim()}`);
  return lines.filter(Boolean).join("\n");
}
