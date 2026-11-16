/**
 * Server-side authorization of this turn's @ references, six kinds (设计稿 §3.6, 附录 D, 附录 E 消息引用;
 * agent-design AG05-5). Every reference is checked on its own — kind, id, owner, not deleted (events:
 * published on the platform or the account's own) — through the same read adapters as every other read,
 * so a withdrawn permission counts too. Attendance records arrive in AG13 and are never accessible here.
 *
 * One reference that fails does not fail the turn: it comes back `accessible: false` with
 * REFERENCE_NOT_ACCESSIBLE (or SOURCE_UNAVAILABLE when the read failed), and the part that needs it
 * asks the user to choose again. A reference grants no right to change the record, links nothing and
 * writes no memory. Checked again on every turn, a resumed one included.
 */
import { gapOfReadError } from "../domains/registry";
import type { DomainKind, DomainReader, DomainScope, RecordView } from "../domains/types";

export type ReferenceKind = DomainKind | "attendance";

export interface ReferenceInput {
  id: string;
  /** The protocol's kinds; "note" is the old name of a memo. */
  type: string;
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

/** The name a record is shown by: a contact's name, a title, or the first words of a memo. */
export function nameOfView(view: RecordView): string | null {
  const fields = view.fields as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  return text(fields.displayName) ?? text(fields.title) ?? (text(fields.body) ? text(fields.body)!.slice(0, 12) : null);
}

export async function authorizeReferences(reader: DomainReader, scope: DomainScope, references: readonly ReferenceInput[]): Promise<AuthorizedReference[]> {
  const seen = new Set<string>();
  const out: AuthorizedReference[] = [];
  for (const reference of references.slice(0, MAX_REFERENCES)) {
    const kind = referenceKind(reference.type);
    const key = `${kind}:${reference.id}`;
    if (!kind || !reference.id || seen.has(key)) continue;
    seen.add(key);
    if (kind === "attendance") {
      out.push({ accessible: false, id: reference.id, name: null, reason: "REFERENCE_NOT_ACCESSIBLE", type: kind });
      continue;
    }
    try {
      const read = await reader.read(kind, scope, { id: reference.id });
      const view = read.items[0];
      if (!view) out.push({ accessible: false, id: reference.id, name: null, reason: "REFERENCE_NOT_ACCESSIBLE", type: kind });
      else out.push({ accessible: true, id: reference.id, name: nameOfView(view), type: kind, view });
    } catch (error) {
      const gap = gapOfReadError(error, { byId: true });
      out.push({ accessible: false, id: reference.id, name: null, reason: gap === "service_error" ? "SOURCE_UNAVAILABLE" : "REFERENCE_NOT_ACCESSIBLE", type: kind });
    }
  }
  return out;
}
