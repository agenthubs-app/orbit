/**
 * Server-side authorization of this turn's @ references, six kinds (设计稿 §3.6, 附录 D, 附录 E 消息引用;
 * agent-design AG05-5, AG11). Every reference is checked on its own — kind, id, owner, not deleted (events:
 * published on the platform or the account's own) — through the same read adapters as every other read,
 * so a withdrawn permission counts too. AG11: «我去过» (attendance) and the account's private events are read
 * through the event adapter by their own ids; an event reference that says it is private (or platform) must be one.
 *
 * One reference that fails does not fail the turn: it comes back `accessible: false` with
 * REFERENCE_NOT_ACCESSIBLE (or SOURCE_UNAVAILABLE when the read failed), and the part that needs it
 * asks the user to choose again. A reference grants no right to change the record, links nothing and
 * writes no memory. Checked again on every turn, a resumed one included. The name a client showed is never
 * used to look a record up: only the kind and the id are.
 */
import { gapOfReadError } from "../domains/registry";
import type { DomainKind, DomainReader, DomainScope, RecordView } from "../domains/types";

export type ReferenceKind = DomainKind | "attendance";

export interface ReferenceInput {
  id: string;
  /** The protocol's kinds; "note" is the old name of a memo. */
  type: string;
  /** AG11: the marker's place in the message, [start, end). */
  start?: number | undefined;
  end?: number | undefined;
  /** AG11: an event reference's EventRef kind. */
  eventKind?: "platform" | "private" | undefined;
}

export interface AuthorizedReference {
  type: ReferenceKind;
  id: string;
  accessible: boolean;
  /** A name to show (the contact's name, the record's title); null when not accessible. */
  name: string | null;
  reason?: "REFERENCE_NOT_ACCESSIBLE" | "SOURCE_UNAVAILABLE";
  /** The record as read now (kept for this request only, never in the checkpoint). */
  view?: RecordView;
  /** AG11: every marker of this record in the message (a record marked twice has two). */
  marks?: [number, number][];
}

export const MAX_REFERENCES = 20;

export function referenceKind(type: string): ReferenceKind | null {
  switch (type) {
    case "contact":
    case "memo":
    case "todo":
    case "schedule":
    case "event":
    case "attendance":
      return type;
    case "note":
      return "memo";
    case "task":
      return "todo";
    default:
      return null;
  }
}

/** AG11: the ids of the account's own event records (AG13 services): «我去过» notes and private events. */
export const ATTENDANCE_ID = /^attendance:/u;
export const PRIVATE_EVENT_ID = /^private_event:/u;

/** AG11: whether an id fits the kind it was sent as (an attendance id is not an event, a private event is not platform). */
export function idFitsKind(kind: ReferenceKind, id: string, eventKind?: "platform" | "private"): boolean {
  if (kind === "attendance") return ATTENDANCE_ID.test(id);
  if (ATTENDANCE_ID.test(id)) return false;
  if (kind !== "event") return !PRIVATE_EVENT_ID.test(id);
  if (eventKind === "private") return PRIVATE_EVENT_ID.test(id);
  if (eventKind === "platform") return !PRIVATE_EVENT_ID.test(id);
  return true;
}

/** The name a record is shown by: a contact's name, a title, or the first words of a memo. */
export function nameOfView(view: RecordView): string | null {
  const fields = view.fields as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  return text(fields.displayName) ?? text(fields.title) ?? (text(fields.body) ? text(fields.body)!.slice(0, 12) : null);
}

export async function authorizeReferences(reader: DomainReader, scope: DomainScope, references: readonly ReferenceInput[]): Promise<AuthorizedReference[]> {
  const byKey = new Map<string, AuthorizedReference>();
  const out: AuthorizedReference[] = [];
  for (const reference of references.slice(0, MAX_REFERENCES)) {
    const kind = referenceKind(reference.type);
    if (!kind || !reference.id) continue;
    const key = `${kind}:${reference.id}`;
    const mark: [number, number] | null = typeof reference.start === "number" && typeof reference.end === "number" ? [reference.start, reference.end] : null;
    const known = byKey.get(key);
    if (known) {
      if (mark) known.marks = [...(known.marks ?? []), mark];
      continue;
    }
    const withMark = (item: AuthorizedReference): AuthorizedReference => (mark ? { ...item, marks: [mark] } : item);
    let item: AuthorizedReference;
    if (!idFitsKind(kind, reference.id, reference.eventKind)) {
      item = withMark({ accessible: false, id: reference.id, name: null, reason: "REFERENCE_NOT_ACCESSIBLE", type: kind });
    } else {
      try {
        // «我去过» is read through the event adapter by its own id (AG11).
        const read = await reader.read(kind === "attendance" ? "event" : kind, scope, { id: reference.id });
        const view = read.items[0];
        item = withMark(view
          ? { accessible: true, id: reference.id, name: nameOfView(view), type: kind, view }
          : { accessible: false, id: reference.id, name: null, reason: "REFERENCE_NOT_ACCESSIBLE", type: kind });
      } catch (error) {
        const gap = gapOfReadError(error, { byId: true });
        item = withMark({ accessible: false, id: reference.id, name: null, reason: gap === "service_error" ? "SOURCE_UNAVAILABLE" : "REFERENCE_NOT_ACCESSIBLE", type: kind });
      }
    }
    byKey.set(key, item);
    out.push(item);
  }
  return out;
}
