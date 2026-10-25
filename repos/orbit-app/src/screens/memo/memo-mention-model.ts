import type { NoteMentionContract } from "../../api/contract/notes";

export type MemoMentionCandidate = { id: string; label: string; kind: "contact" | "event" };

export function activeMemoMentionQuery(body: string): { start: number; query: string } | null {
  const match = body.match(/(?:^|\s)@([^\s@]{0,30})$/u);
  if (!match || match.index === undefined) return null;
  return { start: match.index + (match[0].startsWith("@") ? 0 : 1), query: match[1]! };
}

export function insertMemoMention(body: string, active: { start: number; query: string }, candidate: MemoMentionCandidate): { body: string; mention: NoteMentionContract } {
  const displayText = `@${candidate.label}`;
  const end = active.start + active.query.length + 1;
  const nextBody = `${body.slice(0, active.start)}${displayText} ${body.slice(end)}`;
  const range = { start: active.start, end: active.start + displayText.length, displayText };
  return { body: nextBody, mention: candidate.kind === "event"
    ? { ...range, entityType: "event", eventId: candidate.id }
    : { ...range, entityType: "contact", contactId: candidate.id } };
}

/** null means an unknown future token would be changed; keep the draft and explain it. */
export function updateMemoMentionRanges(previousBody: string, nextBody: string, mentions: readonly NoteMentionContract[]): NoteMentionContract[] | null {
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

// UX-6: a title taken from the first line (noteTitleFor) is not shown twice; mentions on that line keep the full body.
export function bodyAfterTitle(title: string, body: string, mentions: readonly NoteMentionContract[]): { body: string; mentions: readonly NoteMentionContract[] } {
  const lineEnd = body.indexOf("\n");
  const firstLine = lineEnd < 0 ? body : body.slice(0, lineEnd);
  const cut = lineEnd < 0 ? body.length : lineEnd + 1;
  if (!title.trim() || firstLine.trim() !== title.trim() || mentions.some(mention => mention.start < cut)) return { body, mentions };
  return { body: body.slice(cut), mentions: mentions.map(mention => ({ ...mention, start: mention.start - cut, end: mention.end - cut })) };
}

/** UX-6: a typed title, else the body's first line (40 characters at most). */
export function noteTitleFor(title: string, body: string): string {
  const trimmed = title.trim();
  if (trimmed) return trimmed;
  const first = body.trim().split(/\r?\n/u)[0]?.trim() ?? "";
  return [...first].length > 40 ? `${[...first].slice(0, 40).join("")}…` : first;
}

/** The title field shows what was typed; a title that is just the body's first line stays automatic (empty field). */
export function editableNoteTitle(title: string, body: string): string {
  return title.trim() && title.trim() === noteTitleFor("", body) ? "" : title;
}
