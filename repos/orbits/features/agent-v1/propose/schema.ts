/**
 * The second layer's output (设计稿 §3.2, 附录 C `OperationIntent`; agent-design AG06).
 *
 * The model only says, per write part, which record kind and verb, the user's words that point at the
 * record, the words of each value, the words of a date, the people with their roles, and for a memo the
 * kind of contact. Every text it gives must be copied from the CURRENT message: code keeps them as offsets
 * into the message (the checkpoint holds no words) and does all the rest — finding the records in the
 * account, telling apart several matches, working out dates, building the change and the card.
 */

export const PROPOSE_ENTITIES = ["todo", "memo", "contact", "privateEvent", "attendance", "schedule"] as const;
/** AG12: restore and import are contact verbs only. AG13: delete for private events, «我去过», schedule items and to-dos; complete and reopen for to-dos. */
export const PROPOSE_VERBS = ["create", "update", "delete", "restore", "import", "complete", "reopen"] as const;
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
  // AG13: a private event's name and place; a schedule item's title; the user's own line on «我去过».
  "privateEvent.create": ["title", "venue"],
  "privateEvent.update": ["title", "venue"],
  "schedule.create": ["title"],
  "schedule.update": ["title"],
  "attendance.create": ["note"],
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
  /** AG13: the words of the time of day ("晚上七点", "下午两点到三点", "2pm", "11時から12時"), worked out by code. */
  timeText?: string;
  /** AG13: words naming events (the event attended, the event a schedule item is for, events to link to a to-do). */
  eventClues?: string[];
  /** AG20a R7: a new to-do's deadline words when a planned day is said too ("最迟周五中午"), worked out by code. */
  dueText?: string;
  /** AG20a R6: a schedule item's time-zone words ("伦敦时间", "New York time") and its length ("45 分钟"), worked out by code. */
  timeZoneText?: string;
  durationText?: string;
  dependsOn: string[];
}

export interface ProposeOutput {
  operations: OperationIntent[];
}

/** An intent as the checkpoint keeps it: codes and [start, end) offsets into this turn's message. */
export interface StoredIntent {
  localId: string;
  capability: "todo.create" | "todo.update" | "memo.create" | "contact.create" | "contact.update" | "contact.delete" | "contact.restore" | "contact.import"
    | "privateEvent.create" | "privateEvent.update" | "privateEvent.delete" | "attendance.create" | "attendance.delete" | "schedule.create" | "schedule.update" | "schedule.delete" | "todo.complete" | "todo.reopen" | "todo.delete" | "memo.update";
  /** AG12: a contact's values, as offsets into the message. */
  values?: Partial<Record<ContactValueField, [number, number]>>;
  selector: [number, number][];
  title?: [number, number];
  body?: [number, number];
  date?: [number, number];
  relations: { quote: [number, number]; role: (typeof RELATION_ROLES)[number] }[];
  channel?: (typeof MEMO_CHANNELS)[number];
  direction?: (typeof MEMO_DIRECTIONS)[number];
  /** AG13: offsets of the time words, the event clues, a private event's place, the user's own line. */
  time?: [number, number];
  events?: [number, number][];
  venue?: [number, number];
  note?: [number, number];
  /** AG13: the model's localId of the operation this one depends on (an attendance note on the event created before it). */
  after?: string;
  /** AG20a: offsets of a to-do's deadline words, a schedule item's zone words and its length words. */
  due?: [number, number];
  zone?: [number, number];
  duration?: [number, number];
}
