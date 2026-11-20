/**
 * Event reads (设计稿 §4 活动, 附录 B; agent-design AG05): platform events by id, as the canonical event
 * table holds them. An event is readable when it is published on the platform or the account organizes
 * it. Only the time, place and title fields are given.
 *
 * AG11 (§3.6 @ references): the account's own private events (`private_event:…`) and «我去过» notes (`attendance:…`,
 * the user's own words about having been there, with the event it is about) are read by id through `own` — only the
 * account's own, never searched.
 */
import { createHash } from "node:crypto";

import type { CanonicalEventRecord } from "../../../events/core/contract";
import type { CanonicalRow, ReadAdapter } from "../../../orbit-ai/data-query/read-contract";
import { emitTrace, takeEvalFault } from "../../observability/trace";
import { defined } from "../record-adapter";

/** AG11: one of the account's own event records as the Agent may read it. */
export interface OwnEventRecord {
  id: string;
  kind: "private_event" | "attendance";
  title: string;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
  /** AG20a: a private event said with a day only (startsAt is 00:00 of that day). */
  allDay?: boolean | undefined;
  location?: string | undefined;
  /** «我去过»: the local day, the parts of the day and the user's own sentence. */
  attendedOn?: string | undefined;
  dayParts?: readonly string[] | undefined;
  selfNote?: string | undefined;
  /** AG19: «我去过»: the event the note is about (kind and id only), so its card opens that event. */
  eventRef?: { kind: "platform" | "private"; id: string } | undefined;
  version: number;
  updatedAt: string;
}

export interface EventSource {
  byIds(ids: readonly string[]): Promise<readonly CanonicalEventRecord[]>;
  /** AG11: the account's own private event or «我去过» note by id; null when it is not theirs or is gone. */
  own?(actorId: string, id: string): Promise<OwnEventRecord | null>;
}

const OWN_ID = /^(attendance|private_event):/u;

/**
 * AG11: `own` over the AG13 services. A «我去过» note is shown with the event it is about (its title and time come from
 * the private event or the platform event, read under the same rules); a note whose event cannot be read keeps its own
 * day and sentence.
 */
export function ownEventsOf(input: {
  attendance: { get(actorId: string, id: string): Promise<{ id: string; attendedOn: string; dayParts?: readonly string[] | undefined; selfNote?: string | undefined; eventRef: { kind: "platform" | "private"; id: string }; version: number; updatedAt: string } | null> };
  privateEvents: { get(actorId: string, id: string): Promise<{ id: string; title: string; startsAt: string; endsAt?: string | undefined; allDay?: boolean | undefined; venue?: string | undefined; version: number; updatedAt: string } | null> };
  byIds(ids: readonly string[]): Promise<readonly CanonicalEventRecord[]>;
}): NonNullable<EventSource["own"]> {
  return async (actorId, id) => {
    if (id.startsWith("private_event:")) {
      const event = await input.privateEvents.get(actorId, id);
      return event ? { ...(event.allDay ? { allDay: true } : {}), endsAt: event.endsAt, id: event.id, kind: "private_event", location: event.venue, startsAt: event.startsAt, title: event.title, updatedAt: event.updatedAt, version: event.version } : null;
    }
    const note = await input.attendance.get(actorId, id);
    if (!note) return null;
    let about: { title: string; startsAt?: string | undefined; endsAt?: string | undefined; location?: string | undefined; allDay?: boolean | undefined } | null = null;
    if (note.eventRef.kind === "private") {
      const event = await input.privateEvents.get(actorId, note.eventRef.id).catch(() => null);
      if (event) about = { ...(event.allDay ? { allDay: true } : {}), endsAt: event.endsAt, location: event.venue, startsAt: event.startsAt, title: event.title };
    } else {
      const [event] = (await input.byIds([note.eventRef.id]).catch(() => [])).filter((item) => visible(item, actorId));
      if (event) about = { endsAt: event.endsAt ?? undefined, location: event.venue ?? undefined, startsAt: event.startsAt ?? undefined, title: event.title ?? "" };
    }
    return {
      ...(about?.allDay ? { allDay: true } : {}),
      attendedOn: note.attendedOn,
      dayParts: note.dayParts,
      endsAt: about?.endsAt,
      eventRef: { id: note.eventRef.id, kind: note.eventRef.kind },
      id: note.id,
      kind: "attendance",
      location: about?.location,
      selfNote: note.selfNote,
      startsAt: about?.startsAt,
      title: about?.title ?? "",
      updatedAt: note.updatedAt,
      version: note.version,
    };
  };
}

function ownRow(record: OwnEventRecord): CanonicalRow {
  return {
    evidenceIds: [],
    fields: defined({
      allDay: record.allDay ? true : undefined,
      attendedOn: record.attendedOn,
      dayParts: record.dayParts?.length ? [...record.dayParts] : undefined,
      endsAt: record.endsAt,
      eventRefId: record.eventRef?.id,
      eventRefKind: record.eventRef?.kind,
      kind: record.kind,
      location: record.location,
      selfNote: record.selfNote,
      startsAt: record.startsAt,
      title: record.title,
    }),
    id: record.id,
    position: JSON.stringify([record.startsAt ?? record.attendedOn ?? "", record.id]),
    revision: String(record.version),
    updatedAt: record.updatedAt,
  };
}

function visible(event: CanonicalEventRecord, actorId: string): boolean {
  if (event.archivedAt) return false;
  return event.lifecycleState === "published" || event.organizerActorId === actorId;
}

/**
 * AG10 (设计稿 §3.5 比较: "未标价的活动不能认作免费"): an event's topics and fee as the organizer stored them. The topics
 * are the 「主题：…」 line of the description; the fee is the host payload's kind and amount. A fee the organizer did not
 * fill in is "unstated", never "free".
 */
export interface EventFacts {
  topics: string[];
  fee: { kind: "free" | "amount" | "pay_at_door" | "external_link" | "unstated"; amountYen?: number };
}

export function eventFactsOf(event: Pick<CanonicalEventRecord, "description" | "sourcePayload">): EventFacts {
  const line = event.description?.match(/(?:主题|テーマ|topics?)[：:]\s*([^\n]+)/iu)?.[1]?.trim() ?? "";
  const topics = line ? line.split(/[、,，/／]\s*/u).map((item) => item.trim()).filter(Boolean) : [];
  const host = (event.sourcePayload as { host?: { feeKind?: unknown; feeAmountYen?: unknown } } | undefined)?.host;
  const kind = host?.feeKind;
  const amount = typeof host?.feeAmountYen === "number" && Number.isFinite(host.feeAmountYen) ? host.feeAmountYen : undefined;
  if (kind === "amount" && amount !== undefined) return { fee: { amountYen: amount, kind: "amount" }, topics };
  if (kind === "pay_at_door" || kind === "external_link") return { fee: { kind }, topics };
  // "free" is also what a published event holds when the organizer never filled the fee in (the host payload's default),
  // so the organizer's own fee line in the description decides when there is one ("费用：未标价" is not free).
  const said = event.description?.match(/(?:费用|費用|料金|参加费|参加費|门票|fee|price)[：:]\s*([^\n]+)/iu)?.[1]?.trim();
  if (said) {
    if (/(免费|無料|\bfree\b)/iu.test(said)) return { fee: { kind: "free" }, topics };
    const yen = said.match(/(\d[\d,]*)\s*(?:日元|円|JPY|yen)/iu) ?? said.match(/(?:JPY|¥|￥)\s*(\d[\d,]*)/iu);
    if (yen) return { fee: { amountYen: Number(yen[1].replace(/,/gu, "")), kind: "amount" }, topics };
    return { fee: { kind: "unstated" }, topics };
  }
  if (kind === "free") return { fee: { kind: "free" }, topics };
  return { fee: { kind: "unstated" }, topics };
}

function canonical(event: CanonicalEventRecord): CanonicalRow {
  // AG19 repair round 1 (judges, AE-ANS-003): an event is read with its topics and its fee too — the same facts the
  // ranking uses — so an answer about events read by id is not written from the title, time and place alone.
  const facts = eventFactsOf(event);
  return {
    evidenceIds: [],
    fields: defined({ endsAt: event.endsAt ?? undefined, feeAmountYen: facts.fee.amountYen !== undefined ? String(facts.fee.amountYen) : undefined, feeKind: facts.fee.kind, location: event.venue ?? undefined, startsAt: event.startsAt ?? undefined, title: event.title ?? undefined, topics: facts.topics.length ? facts.topics : undefined }),
    id: event.eventId,
    position: JSON.stringify([event.startsAt ?? "", event.eventId]),
    revision: String(event.eventVersion),
    updatedAt: event.startsAt ?? new Date(0).toISOString(),
  };
}

export function createEventAdapter(options: { source: EventSource; denied?: () => ReadonlySet<string> }): ReadAdapter {
  const allowed = (event: CanonicalEventRecord, actorId: string) => visible(event, actorId) && !options.denied?.().has(event.eventId);
  return {
    async authorize(scope) {
      return Boolean(scope.actorId && scope.workspaceId);
    },
    async authorizeEvidence() {
      return [];
    },
    async page(scope, input, _position, snapshot) {
      const snap = snapshot ?? createHash("sha256").update(JSON.stringify(input)).digest("base64url");
      const fault = takeEvalFault("event.read");
      if (fault) {
        emitTrace({ kind: fault.kind, note: "eval fault: the read source is unavailable", type: "read.fault", where: "event.read" });
        return { partialReasons: ["source_unavailable"], rows: [], snapshot: snap };
      }
      const id = input.operation === "get" ? input.id : input.eventId;
      // Only reads by id: searching the whole directory is not a read the Agent does in this version.
      if (!id) return { partialReasons: [], rows: [], snapshot: snap, total: 0 };
      try {
        if (OWN_ID.test(id)) {
          const own = options.denied?.().has(id) || !options.source.own ? null : await options.source.own(scope.actorId, id);
          return { partialReasons: [], rows: own ? [ownRow(own)] : [], snapshot: snap, total: own ? 1 : 0 };
        }
        const events = (await options.source.byIds([id])).filter((event) => allowed(event, scope.actorId));
        return { partialReasons: [], rows: events.map(canonical), snapshot: snap, total: events.length };
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "event.read" });
        return { partialReasons: ["source_unavailable"], rows: [], snapshot: snap };
      }
    },
    async readCurrentAtRevision(scope, expected) {
      const ownIds = expected.filter((item) => OWN_ID.test(item.id));
      const own: CanonicalRow[] = [];
      for (const item of ownIds) {
        const record = options.denied?.().has(item.id) || !options.source.own ? null : await options.source.own(scope.actorId, item.id);
        if (record) own.push(ownRow(record));
      }
      const others = expected.filter((item) => !OWN_ID.test(item.id));
      const events = others.length ? (await options.source.byIds(others.map((item) => item.id))).filter((event) => allowed(event, scope.actorId)) : [];
      return [...own, ...events.map(canonical)].filter((row) => expected.some((item) => item.id === row.id && item.revision === row.revision));
    },
  };
}
