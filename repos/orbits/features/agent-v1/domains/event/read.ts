/**
 * Event reads (设计稿 §4 活动, 附录 B; agent-design AG05): platform events by id, as the canonical event
 * table holds them. An event is readable when it is published on the platform or the account organizes
 * it. Private events arrive in AG13. Only the time, place and title fields are given.
 */
import { createHash } from "node:crypto";

import type { CanonicalEventRecord } from "../../../events/core/contract";
import type { CanonicalRow, ReadAdapter } from "../../../orbit-ai/data-query/read-contract";
import { emitTrace, takeEvalFault } from "../../observability/trace";
import { defined } from "../record-adapter";

export interface EventSource {
  byIds(ids: readonly string[]): Promise<readonly CanonicalEventRecord[]>;
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
  return {
    evidenceIds: [],
    fields: defined({ endsAt: event.endsAt ?? undefined, location: event.venue ?? undefined, startsAt: event.startsAt ?? undefined, title: event.title ?? undefined }),
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
        const events = (await options.source.byIds([id])).filter((event) => allowed(event, scope.actorId));
        return { partialReasons: [], rows: events.map(canonical), snapshot: snap, total: events.length };
      } catch (error) {
        emitTrace({ error: error instanceof Error ? error.message : String(error), type: "read.error", where: "event.read" });
        return { partialReasons: ["source_unavailable"], rows: [], snapshot: snap };
      }
    },
    async readCurrentAtRevision(scope, expected) {
      const events = (await options.source.byIds(expected.map((item) => item.id))).filter((event) => allowed(event, scope.actorId));
      return events.map(canonical).filter((row) => expected.some((item) => item.id === row.id && item.revision === row.revision));
    },
  };
}
