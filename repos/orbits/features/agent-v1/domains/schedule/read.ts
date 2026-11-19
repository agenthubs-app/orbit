/**
 * Personal schedule reads (设计稿 §4 个人日程, 附录 B; agent-design AG05). Items of the account only; by
 * id, by a linked contact, in a date range — a repeating series that started before the range's end is
 * read too and kept only when one of its occurrences falls inside (occurrenceIn). Earliest first.
 */
import type { ReadInput } from "../../../orbit-ai/data-query/read-contract";
import { defined, refsOf, str, strs, type RecordDomain } from "../record-adapter";
import type { RecordSpec } from "../source";

export const SCHEDULE_DOMAIN: RecordDomain = {
  fieldsOf(row) {
    const item = row.payload;
    if (typeof item.title !== "string" || typeof item.startsAt !== "string") return null;
    const recurrence = item.recurrence && typeof item.recurrence === "object" ? str((item.recurrence as Record<string, unknown>).frequency) : undefined;
    return defined({
      allDay: typeof item.allDay === "boolean" ? item.allDay : undefined,
      category: str(item.category),
      contactIds: strs(item.contactIds),
      // AG13: the notes and events the item is linked to.
      noteIds: strs(item.noteIds),
      eventRefs: refsOf(item.eventRefs),
      details: str(item.notes) ?? str(item.details),
      endsAt: str(item.endsAt),
      kind: str(item.kind),
      location: str(item.location),
      meetingMethod: str(item.meetingMethod),
      recurrence,
      startsAt: item.startsAt,
      timeZone: str(item.timeZone),
      title: item.title,
      updatedAt: str(item.updatedAt),
    });
  },
  kind: "schedule",
  specOf(input: ReadInput): RecordSpec {
    return {
      collection: "personal_schedule_items",
      excludes: [{ path: ["state"], values: ["deleted", "cancelled"] }],
      order: { direction: input.order === "newest" ? "desc" : "asc", paths: [["startsAt"]] },
      ...(input.operation === "get" && input.id ? { ids: [input.id] } : {}),
      ...(input.contactId ? { contains: [{ path: ["contactIds"], value: input.contactId }] } : {}),
      ...(input.operation === "search" ? { text: { paths: [["title"]], value: input.query } } : {}),
      // A series is kept if it started before the end of the range; occurrenceIn() decides afterwards.
      ...(input.from || input.to ? { range: { paths: [["startsAt"]], ...(input.from ? { from: input.from } : {}), ...(input.to ? { to: input.to } : {}), seriesPath: ["recurrence", "frequency"] } } : {}),
    };
  },
  updatedAtOf: (row) => str(row.payload.updatedAt) ?? row.updatedAt,
  versionOf: (row) => str(row.payload.updatedAt) ?? row.updatedAt,
};

/**
 * The first occurrence of an item in [from, to): the item itself, or the next repetition of a daily,
 * weekly or monthly series (the product's three kinds of repetition). Null when none falls inside.
 */
export function occurrenceIn(startsAt: string, recurrence: string | undefined, from: string | undefined, to: string | undefined): string | null {
  const start = Date.parse(startsAt);
  const lower = from ? Date.parse(from) : Number.NEGATIVE_INFINITY;
  const upper = to ? Date.parse(to) : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(start)) return null;
  if (!recurrence) return start >= lower && start < upper ? startsAt : null;
  let at = new Date(start);
  for (let guard = 0; guard < 2000 && at.getTime() < upper; guard += 1) {
    if (at.getTime() >= lower) return at.toISOString();
    if (recurrence === "daily") at = new Date(at.getTime() + 86_400_000);
    else if (recurrence === "weekly") at = new Date(at.getTime() + 7 * 86_400_000);
    else if (recurrence === "monthly") at = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate(), at.getUTCHours(), at.getUTCMinutes()));
    else return null;
  }
  return null;
}
