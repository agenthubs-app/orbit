/**
 * Memo (note) reads (设计稿 §4 Memo, 附录 B; agent-design AG05). Notes of the account only; by id, by a
 * linked contact, by words in the title or body, in a date range, newest or oldest first. With
 * `status: "interaction"` only memos that record an actual interaction with the contact are read, by
 * when it happened (the recent-interaction view). The interaction field is read when stored (AG06 writes it).
 */
import type { ReadInput } from "../../../orbit-ai/data-query/read-contract";
import { readNoteInteraction } from "../../../notes/interaction";
import { defined, objectAt, refsOf, str, strs, type RecordDomain } from "../record-adapter";
import type { RecordSpec } from "../source";

const NOTE = (field: string) => ["note", field] as const;

export const MEMO_DOMAIN: RecordDomain = {
  fieldsOf(row) {
    const note = objectAt(row.payload, "note");
    if (!note || typeof note.body !== "string") return null;
    const contactIds = strs(note.contactIds) ?? [];
    const interaction = readNoteInteraction(note.interaction, contactIds);
    return defined({
      body: note.body,
      contactIds,
      createdAt: str(note.createdAt),
      eventIds: strs(note.eventIds) ?? [],
      // AG13: the typed event links (platform and private).
      eventRefs: refsOf(note.eventRefs),
      interaction: interaction ? { ...interaction, actualContactIds: [...interaction.actualContactIds] } : undefined,
      title: str(note.title),
      updatedAt: str(note.updatedAt),
      version: typeof note.version === "number" ? note.version : undefined,
    });
  },
  kind: "memo",
  specOf(input: ReadInput): RecordSpec {
    const interactions = input.status === "interaction";
    const spec: RecordSpec = {
      collection: "notes",
      order: interactions
        ? { direction: input.order === "oldest" ? "asc" : "desc", paths: [NOTE("interaction").concat("occurredAt"), NOTE("interaction").concat("occurredOn"), NOTE("createdAt")] }
        : { direction: input.order === "oldest" ? "asc" : "desc", paths: [NOTE("createdAt")] },
      ...(input.operation === "get" && input.id ? { ids: [input.id] } : {}),
    };
    const contains = [];
    if (input.contactId) contains.push({ path: interactions ? [...NOTE("interaction"), "actualContactIds"] : NOTE("contactIds"), value: input.contactId });
    if (input.eventId) contains.push({ path: NOTE("eventIds"), value: input.eventId });
    return {
      ...spec,
      ...(contains.length ? { contains } : {}),
      ...(input.operation === "search" ? { text: { paths: "search_text" as const, value: input.query } } : {}),
      ...(input.from || input.to ? { range: { paths: [NOTE("createdAt")], ...(input.from ? { from: input.from } : {}), ...(input.to ? { to: input.to } : {}) } } : {}),
      ...(interactions ? { present: [[...NOTE("interaction"), "precision"]] } : {}),
    };
  },
  updatedAtOf: (row) => str(objectAt(row.payload, "note")?.updatedAt) ?? row.updatedAt,
  versionOf: (row) => String(objectAt(row.payload, "note")?.version ?? ""),
};
