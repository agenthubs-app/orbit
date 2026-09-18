/**
 * Sprint 0085: the structured object the model hands back instead of a sentence.
 *
 * The failing session it comes from (`agent-session-mobile-3ede834e…`) had the
 * model narrate a confirmation flow — "reply once and I'll submit it" — for a
 * button that did not exist. Three turns, zero writes. The fix is not a better
 * prompt: it is that the model's only way to propose a write is to emit one of
 * these, and that confirming one is something only a user action can do.
 */

export const ENTITY_DRAFT_KINDS = [
  "task",
  "note",
  "schedule",
  "event",
  "contact",
] as const;

export type EntityDraftKind = (typeof ENTITY_DRAFT_KINDS)[number];

export const ENTITY_DRAFT_SOURCE_KINDS = [
  "note",
  "contact",
  "event",
  "task",
  "schedule",
] as const;

export type EntityDraftSourceKind = (typeof ENTITY_DRAFT_SOURCE_KINDS)[number];

export interface EntityDraftSourceRef {
  kind: EntityDraftSourceKind;
  id: string;
}

/**
 * `superseded` exists because only one draft per conversation may be awaiting
 * confirmation: otherwise the word "确认" has no single referent. A replaced
 * draft is kept rather than deleted so the transcript stays readable.
 */
export const ENTITY_DRAFT_STATES = [
  "pending_confirmation",
  "created",
  "cancelled",
  "superseded",
  "failed",
] as const;

export type EntityDraftState = (typeof ENTITY_DRAFT_STATES)[number];

/** Field values are text; each adapter interprets them for its own domain. */
export type EntityDraftFields = Readonly<Record<string, string>>;

export interface EntityDraft {
  draftId: string;
  conversationId: string;
  actorId: string;
  kind: EntityDraftKind;
  revision: number;
  state: EntityDraftState;
  fields: EntityDraftFields;
  sourceRefs: readonly EntityDraftSourceRef[];
  createdRecordId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

/** What the model is allowed to emit. Anything else is not a draft. */
export interface EntityDraftProposal {
  kind: EntityDraftKind;
  fields: EntityDraftFields;
  sourceRefs: readonly EntityDraftSourceRef[];
}

const MAX_FIELD_LENGTH = 2000;
const MAX_FIELDS = 12;
const MAX_SOURCE_REFS = 8;

/** Every kind needs enough to name the record; without it there is nothing to confirm. */
const REQUIRED_FIELDS: Readonly<Record<EntityDraftKind, readonly string[]>> = {
  task: ["title"],
  note: ["title"],
  schedule: ["title", "startsAt"],
  event: ["title", "startsAt"],
  contact: ["name"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= MAX_FIELD_LENGTH ? text : null;
}

function parseSourceRefs(value: unknown): readonly EntityDraftSourceRef[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_SOURCE_REFS) return null;
  const refs: EntityDraftSourceRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const id = boundedText(entry.id);
    const kind = ENTITY_DRAFT_SOURCE_KINDS.find((item) => item === entry.kind);
    if (!id || !kind) return null;
    refs.push({ id, kind });
  }
  return refs;
}

/**
 * Strict on purpose. A draft that does not parse becomes no draft at all, which
 * the caller reports as "I could not turn that into something to confirm" —
 * never a half-filled card the user might confirm into a wrong record.
 */
export function parseEntityDraftProposal(value: unknown): EntityDraftProposal | null {
  if (!isRecord(value)) return null;
  const kind = ENTITY_DRAFT_KINDS.find((item) => item === value.kind);
  if (!kind || !isRecord(value.fields)) return null;

  const entries = Object.entries(value.fields);
  if (entries.length === 0 || entries.length > MAX_FIELDS) return null;

  const fields: Record<string, string> = {};
  for (const [key, raw] of entries) {
    const name = key.trim();
    const text = boundedText(raw);
    if (!name || !text) return null;
    fields[name] = text;
  }
  if (REQUIRED_FIELDS[kind].some((name) => !fields[name])) return null;

  const sourceRefs = parseSourceRefs(value.sourceRefs);
  if (!sourceRefs) return null;

  return { fields, kind, sourceRefs };
}

/**
 * Typing "确认" must do exactly what tapping the button does. The mapping lives
 * here, in code, so the model cannot claim a confirmation happened by saying so.
 */
export type EntityDraftIntent = "confirm" | "cancel";

const CONFIRM_PATTERNS = [
  /^确认(创建|一下|吧|了)?[。.!！]?$/u,
  /^就这样(吧|创建)?[。.!！]?$/u,
  /^(好的?|可以|没问题)[，,]?(创建|就这样|确认)?[。.!！]?$/u,
  /^(confirm|confirm it|yes,? create( it)?|go ahead)[.!]?$/iu,
];

const CANCEL_PATTERNS = [
  /^(取消|算了|不用了|先不(创建|要)了?)[。.!！]?$/u,
  /^(cancel|never ?mind|discard)[.!]?$/iu,
];

export function readEntityDraftIntent(message: string): EntityDraftIntent | null {
  const text = message.trim();
  if (!text || text.length > 40) return null;
  if (CONFIRM_PATTERNS.some((pattern) => pattern.test(text))) return "confirm";
  if (CANCEL_PATTERNS.some((pattern) => pattern.test(text))) return "cancel";
  return null;
}

/**
 * One key per draft revision: editing a field and confirming again is a new
 * write, confirming the same revision twice is not.
 */
export function entityDraftIdempotencyKey(draft: {
  conversationId: string;
  draftId: string;
  revision: number;
}): string {
  return `agent:${draft.conversationId}:${draft.draftId}:${draft.revision}`;
}
