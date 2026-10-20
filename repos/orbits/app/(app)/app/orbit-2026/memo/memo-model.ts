import type { NoteContract, NoteMentionContract } from "../../../../../shared/contract/notes";

export type MemoTab = "all" | "meeting" | "free";
export type MemoRow = Pick<NoteContract, "id" | "title" | "body" | "version" | "contactIds" | "eventIds" | "manualContactIds" | "mentions" | "updatedAt"> & {
  noteKind?: string;
  usedForPlan?: boolean;
  sample?: true;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function memoTabForKind(kind: unknown): Exclude<MemoTab, "all"> {
  return kind === "meeting" ? "meeting" : "free";
}

export type MemoMentionCandidate = { id: string; label: string; kind: "contact" | "event" };

export function activeMemoMentionQuery(body: string, cursor: number, mentions: readonly NoteMentionContract[]): { start: number; end: number; query: string } | null {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > body.length) return null;
  const match = body.slice(0, cursor).match(/(?:^|\s)@([^\s@]{0,30})$/u);
  if (!match || match.index === undefined) return null;
  const start = match.index + (match[0].startsWith("@") ? 0 : 1);
  if (mentions.some(mention => mention.start < cursor && mention.end > start)) return null;
  return { start, end: cursor, query: match[1]! };
}

export function insertMemoMention(body: string, mentions: readonly NoteMentionContract[], active: { start: number; end: number; query: string }, candidate: MemoMentionCandidate): { body: string; mentions: NoteMentionContract[] } {
  if (!candidate.id.trim() || !candidate.label.trim() || body.slice(active.start, active.end) !== `@${active.query}`
    || mentions.some(mention => mention.start < active.end && mention.end > active.start)) throw new Error("Invalid memo mention insertion");
  const displayText = `@${candidate.label.trim()}`;
  const nextBody = `${body.slice(0, active.start)}${displayText} ${body.slice(active.end)}`;
  const delta = displayText.length + 1 - (active.end - active.start);
  const inserted: NoteMentionContract = candidate.kind === "event"
    ? { entityType: "event", eventId: candidate.id, start: active.start, end: active.start + displayText.length, displayText }
    : { entityType: "contact", contactId: candidate.id, start: active.start, end: active.start + displayText.length, displayText };
  return { body: nextBody, mentions: [...mentions.map(mention => mention.start >= active.end
    ? { ...mention, start: mention.start + delta, end: mention.end + delta } : mention), inserted].sort((left, right) => left.start - right.start) };
}

export function memoContactIds(manualContactIds: readonly string[], mentions: readonly NoteMentionContract[]): string[] {
  return [...new Set([...manualContactIds, ...mentions.filter(mention => (mention.entityType ?? "contact") === "contact").map(mention => mention.contactId).filter((id): id is string => Boolean(id))])];
}

export function rebaseMemoMentions(previousBody: string, nextBody: string, mentions: readonly NoteMentionContract[]): NoteMentionContract[] | null {
  let prefix = 0;
  while (prefix < previousBody.length && prefix < nextBody.length && previousBody[prefix] === nextBody[prefix]) prefix++;
  let suffix = 0;
  while (suffix < previousBody.length - prefix && suffix < nextBody.length - prefix
    && previousBody[previousBody.length - 1 - suffix] === nextBody[nextBody.length - 1 - suffix]) suffix++;
  const editEnd = previousBody.length - suffix;
  const shift = nextBody.length - previousBody.length;
  const output: NoteMentionContract[] = [];
  for (const mention of mentions) {
    const next = mention.end <= prefix ? mention : mention.start >= editEnd
      ? { ...mention, start: mention.start + shift, end: mention.end + shift } : null;
    if (next && nextBody.slice(next.start, next.end) === next.displayText) { output.push(next); continue; }
    if (mention.entityType && mention.entityType !== "contact" && mention.entityType !== "event") return null;
  }
  return output;
}

export function memoPage(value: unknown): { notes: MemoRow[]; total: number; nextCursor?: string } | null {
  if (!record(value) || !Array.isArray(value.notes) || !Number.isSafeInteger(value.total) || Number(value.total) < 0) return null;
  if (value.nextCursor !== undefined && (typeof value.nextCursor !== "string" || !value.nextCursor)) return null;
  const notes = value.notes.filter((row): row is MemoRow => record(row)
    && typeof row.id === "string" && !!row.id
    && typeof row.title === "string" && typeof row.body === "string"
    && Number.isSafeInteger(row.version) && Number(row.version) >= 1
    && typeof row.updatedAt === "string"
    && Array.isArray(row.contactIds) && row.contactIds.every((id: unknown) => typeof id === "string")
    && Array.isArray(row.eventIds) && row.eventIds.every((id: unknown) => typeof id === "string")
    && Array.isArray(row.manualContactIds) && row.manualContactIds.every((id: unknown) => typeof id === "string")
    && Array.isArray(row.mentions));
  if (Number(value.total) < notes.length) return null;
  return { notes, total: Number(value.total), ...(value.nextCursor ? { nextCursor: value.nextCursor as string } : {}) };
}

export function memoRequest(input: {
  title: string; body: string; kind: "meeting" | "free" | "voice"; contactIds: readonly string[]; eventIds: readonly string[];
  mentions?: readonly NoteMentionContract[]; usedForPlan: boolean;
}) {
  const title = input.title.trim(), body = input.body;
  if (!title || !body.trim()) throw new Error("A title and body are required");
  if (input.usedForPlan && (input.kind !== "meeting" || memoContactIds(input.contactIds, input.mentions ?? []).length !== 1)) throw new Error("Plan use requires one contact in a meeting memo");
  return { title, body, noteKind: input.kind, usedForPlan: input.usedForPlan,
    manualContactIds: [...new Set(input.contactIds)], eventIds: [...new Set(input.eventIds)], mentions: [...(input.mentions ?? [])] };
}
