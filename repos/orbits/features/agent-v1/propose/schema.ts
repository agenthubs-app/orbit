/**
 * The second layer's output (设计稿 §3.2, 附录 C `OperationIntent`; agent-design AG06).
 *
 * The model only says, per write part, which record kind and verb, the user's words that point at the
 * record, the words of each value, the words of a date, the people with their roles, and for a memo the
 * kind of contact. Every text it gives must be copied from the CURRENT message: code keeps them as offsets
 * into the message (the checkpoint holds no words) and does all the rest — finding the records in the
 * account, telling apart several matches, working out dates, building the change and the card.
 */

export const PROPOSE_ENTITIES = ["todo", "memo", "contact"] as const;
/** AG12: delete, restore and import are contact verbs only. */
export const PROPOSE_VERBS = ["create", "update", "delete", "restore", "import"] as const;
/** AG12: the contact fields a value may be given for (the field writer's five; others stay on the contact's page). */
export const CONTACT_VALUE_FIELDS = ["name", "company", "role", "email", "phone"] as const;
export type ContactValueField = (typeof CONTACT_VALUE_FIELDS)[number];
export const RELATION_ROLES = ["actual_contact", "mentioned", "about"] as const;
export const MEMO_CHANNELS = ["phone", "meeting", "message", "email", "other"] as const;
export const MEMO_DIRECTIONS = ["incoming", "outgoing", "mutual"] as const;

/** Fields a value may be given for (附录 B: the editable fields of the operations this version proposes). */
export const VALUE_FIELDS: Record<string, readonly string[]> = {
  "contact.create": CONTACT_VALUE_FIELDS,
  "contact.update": CONTACT_VALUE_FIELDS,
  "memo.create": ["body"],
  "todo.create": ["title"],
  "todo.update": ["title"],
};

export interface OperationIntent {
  localId: string;
  partId: string;
  entity: (typeof PROPOSE_ENTITIES)[number];
  verb: (typeof PROPOSE_VERBS)[number];
  selector?: { clues: string[] };
  fields?: { name: string; valueText: string }[];
  /** The words of the date ("周五", "今天", "11 月 30 日"), worked out by code. */
  dateText?: string;
  relations?: { entity: "contact"; clue: string; role: (typeof RELATION_ROLES)[number] }[];
  /** memo.create only. */
  channel?: (typeof MEMO_CHANNELS)[number];
  direction?: (typeof MEMO_DIRECTIONS)[number];
  dependsOn: string[];
}

export interface ProposeOutput {
  operations: OperationIntent[];
}

/** An intent as the checkpoint keeps it: codes and [start, end) offsets into this turn's message. */
export interface StoredIntent {
  localId: string;
  capability: "todo.create" | "todo.update" | "memo.create" | "contact.create" | "contact.update" | "contact.delete" | "contact.restore" | "contact.import";
  /** AG12: a contact's values, as offsets into the message. */
  values?: Partial<Record<ContactValueField, [number, number]>>;
  selector: [number, number][];
  title?: [number, number];
  body?: [number, number];
  date?: [number, number];
  relations: { quote: [number, number]; role: (typeof RELATION_ROLES)[number] }[];
  channel?: (typeof MEMO_CHANNELS)[number];
  direction?: (typeof MEMO_DIRECTIONS)[number];
}
