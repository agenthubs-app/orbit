/**
 * The "recent interaction" read view (设计稿 §4 读取视图「最近互动」; agent-design AG05-1, PLANNER 易错边界 7).
 *
 * Counted only when the records show structurally that the person took part:
 *   - a memo whose interaction lists them among its actual contacts (附录 E),
 *   - a logged encounter with them (human_encounters),
 *   - a schedule meeting that lists them and has already started.
 * Newest first by when it happened. On the same day, unless both have an exact time, a stable id decides
 * the display order and `sameDay` says the true order is not known. An encounter and its projection as
 * a note (`note:<encounterId>`) count once.
 *
 * Old notes about the person without an interaction come back only when no interaction was found, as
 * `legacy` — material to quote as "from your notes", never as a confirmed interaction. The summaries the
 * contact detail page keeps (`lastInteraction`) are not read here. The view writes nothing.
 */
import type { DomainReader, DomainScope, RecordView } from "../domains/types";
import type { RecordSource } from "../domains/source";

export interface InteractionItem {
  ref: string;
  source: "memo" | "encounter" | "schedule";
  /** The local day it happened (YYYY-MM-DD, in the time zone given). */
  occurredOn: string;
  occurredAt: string | null;
  precision: "day" | "instant";
  channel: string | null;
  view: RecordView | null;
}

export interface RecentInteractionResult {
  contactId: string;
  latest: InteractionItem | null;
  interactions: InteractionItem[];
  /** Refs that share a day and whose order is not known (only for days with more than one). */
  sameDay: string[][];
  legacy: RecordView[];
  withheld: number;
  /** A source could not be read (the result covers the others). */
  failures: string[];
}

export interface RecentInteractionDeps {
  reader: DomainReader;
  /** For the logged encounters (no Agent read adapter of their own). */
  source?: RecordSource;
}

export function localDay(iso: string, timeZone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/u.test(iso)) return iso;
  const parts = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function order(left: InteractionItem, right: InteractionItem): number {
  if (left.occurredOn !== right.occurredOn) return left.occurredOn < right.occurredOn ? 1 : -1;
  if (left.precision === "instant" && right.precision === "instant" && left.occurredAt && right.occurredAt && left.occurredAt !== right.occurredAt) return left.occurredAt < right.occurredAt ? 1 : -1;
  return left.ref < right.ref ? -1 : left.ref > right.ref ? 1 : 0;
}

export async function readRecentInteraction(deps: RecentInteractionDeps, scope: DomainScope, input: { contactId: string; now: string; timeZone: string; limit?: number }): Promise<RecentInteractionResult> {
  const failures: string[] = [];
  const items: InteractionItem[] = [];
  let withheld = 0;
  const encounterIds = new Set<string>();

  if (deps.source) {
    try {
      const rows = await deps.source.page({ accountId: scope.accountId, workspaceId: scope.workspaceId }, { collection: "human_encounters", equals: [{ paths: [["contactId"]], value: input.contactId }, { paths: [["actorId"]], value: scope.accountId }], order: { direction: "desc", paths: [["observedAt"]] }, range: { paths: [["observedAt"]], to: input.now } }, null, 10);
      for (const row of rows) {
        const observedAt = typeof row.payload.observedAt === "string" ? row.payload.observedAt : null;
        if (!observedAt) continue;
        encounterIds.add(row.id);
        items.push({ channel: "meeting", occurredAt: observedAt, occurredOn: localDay(observedAt, input.timeZone), precision: "instant", ref: `encounter:${row.id}`, source: "encounter", view: null });
      }
    } catch (error) {
      failures.push(`encounter: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    const memos = await deps.reader.read("memo", scope, { contactId: input.contactId, status: "interaction" });
    withheld += memos.withheld ?? 0;
    for (const view of memos.items) {
      const interaction = view.fields.interaction as { actualContactIds: string[]; channel: string; occurredOn?: string; occurredAt?: string; precision: "day" | "instant" } | undefined;
      if (!interaction?.actualContactIds.includes(input.contactId)) continue;
      // A note that is the projection of a logged encounter is that encounter.
      if (encounterIds.has(view.id.replace(/^note:/u, ""))) continue;
      const at = interaction.precision === "instant" ? interaction.occurredAt ?? null : null;
      const day = interaction.occurredOn ?? (at ? localDay(at, input.timeZone) : null);
      if (!day) continue;
      items.push({ channel: interaction.channel, occurredAt: at, occurredOn: day, precision: interaction.precision, ref: view.ref, source: "memo", view });
    }
  } catch (error) {
    failures.push(`memo: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const meetings = await deps.reader.read("schedule", scope, { contactId: input.contactId, order: "newest", to: input.now });
    withheld += meetings.withheld ?? 0;
    for (const view of meetings.items) {
      const startsAt = typeof view.fields.startsAt === "string" ? view.fields.startsAt : null;
      if (!startsAt || Date.parse(startsAt) > Date.parse(input.now)) continue;
      items.push({ channel: "meeting", occurredAt: startsAt, occurredOn: localDay(startsAt, input.timeZone), precision: "instant", ref: view.ref, source: "schedule", view });
    }
  } catch (error) {
    failures.push(`schedule: ${error instanceof Error ? error.message : String(error)}`);
  }

  const interactions = items.sort(order).slice(0, input.limit ?? 10);
  const days = new Map<string, InteractionItem[]>();
  for (const item of interactions) days.set(item.occurredOn, [...(days.get(item.occurredOn) ?? []), item]);
  const sameDay = [...days.values()].filter((list) => list.length > 1 && !list.every((item) => item.precision === "instant" && item.occurredAt)).map((list) => list.map((item) => item.ref));

  let legacy: RecordView[] = [];
  if (!interactions.length) {
    try {
      const notes = await deps.reader.read("memo", scope, { contactId: input.contactId, limit: 10 });
      withheld += notes.withheld ?? 0;
      legacy = notes.items;
    } catch (error) {
      failures.push(`memo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { contactId: input.contactId, failures, interactions, latest: interactions[0] ?? null, legacy, sameDay, withheld };
}
