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
  const title = input.title.trim(), body = input.body.trim();
  if (!title || !body) throw new Error("A title and body are required");
  if (input.usedForPlan && (input.kind !== "meeting" || input.contactIds.length !== 1)) throw new Error("Plan use requires one contact in a meeting memo");
  return { title, body, noteKind: input.kind, usedForPlan: input.usedForPlan,
    manualContactIds: [...new Set(input.contactIds)], eventIds: [...new Set(input.eventIds)], mentions: [...(input.mentions ?? [])] };
}
