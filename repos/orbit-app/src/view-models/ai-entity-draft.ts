import type { MessageKey, OrbitTranslator } from "../i18n/messages";

/**
 * Sprint 0085: the five entity cards and the draft card, decided here.
 *
 * The screen renders rows; which rows a kind shows, and in what order, is a
 * data decision rather than JSX. Keeping it in a view-model means the card for
 * a task and the card for a note cannot drift apart by accident.
 */

// Contacts keep their existing acquisition flow; the agent does not draft them.
export const AI_ENTITY_KINDS = ["task", "note", "schedule", "event"] as const;
export type AiEntityKind = (typeof AI_ENTITY_KINDS)[number];

export const AI_ENTITY_DRAFT_STATES = [
  "pending_confirmation",
  "created",
  "cancelled",
  "superseded",
  "failed",
] as const;
export type AiEntityDraftState = (typeof AI_ENTITY_DRAFT_STATES)[number];

export interface AiEntityDraftSourceRef {
  kind: "note" | "contact" | "event" | "task" | "schedule";
  id: string;
}

export interface AiEntityDraft {
  draftId: string;
  kind: AiEntityKind;
  state: AiEntityDraftState;
  revision: number;
  fields: Readonly<Record<string, string>>;
  sourceRefs: readonly AiEntityDraftSourceRef[];
  createdRecordId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiEntityDraftRow {
  /** The field this row edits; absent for rows that are derived, not entered. */
  field?: string;
  label: string;
  value: string;
  editable: boolean;
}

export interface AiEntityDraftCardView {
  draftId: string;
  kind: AiEntityKind;
  kindLabel: string;
  state: AiEntityDraftState;
  /** Shown as the card's heading; the row list never repeats it. */
  title: string;
  rows: readonly AiEntityDraftRow[];
  sourceSummary: string | null;
  /** Only a pending card may be confirmed — the button is absent otherwise. */
  confirmable: boolean;
  failureReason: string | null;
  createdHref: string | null;
  footnote: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFields(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const fields: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const item = text(raw);
    if (item) fields[key] = item;
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

function readSourceRefs(value: unknown): readonly AiEntityDraftSourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const id = text(entry.id);
    const kind = text(entry.kind);
    return id && kind && ["note", "contact", "event", "task", "schedule"].includes(kind)
      ? [{ id, kind } as AiEntityDraftSourceRef]
      : [];
  });
}

/**
 * A payload that does not parse becomes no card. A partially understood draft
 * is the one thing worse than none: the user might confirm it.
 */
export function readAiEntityDraft(value: unknown): AiEntityDraft | null {
  if (!isRecord(value)) return null;
  const draftId = text(value.draftId);
  const kind = AI_ENTITY_KINDS.find((item) => item === value.kind);
  const state = AI_ENTITY_DRAFT_STATES.find((item) => item === value.state);
  const fields = readFields(value.fields);
  const revision = typeof value.revision === "number" && Number.isInteger(value.revision)
    ? value.revision
    : null;
  const createdAt = text(value.createdAt);
  const updatedAt = text(value.updatedAt);
  if (!draftId || !kind || !state || !fields || !revision || !createdAt || !updatedAt) {
    return null;
  }
  return {
    createdAt,
    draftId,
    fields,
    kind,
    revision,
    sourceRefs: readSourceRefs(value.sourceRefs),
    state,
    updatedAt,
    ...(text(value.createdRecordId) ? { createdRecordId: text(value.createdRecordId)! } : {}),
    ...(text(value.failureReason) ? { failureReason: text(value.failureReason)! } : {}),
  };
}

/** Which field carries the card's heading, per kind. */
const TITLE_FIELD: Readonly<Record<AiEntityKind, string>> = {
  event: "title",
  note: "title",
  schedule: "title",
  task: "title",
};

/**
 * At most four rows per the design: a card names the record, it does not
 * reproduce it. Anything longer belongs on the detail page.
 */
const ROW_FIELDS: Readonly<Record<AiEntityKind, readonly { field: string; key: MessageKey }[]>> = {
  event: [
    { field: "startsAt", key: "aiEntityDraft.fieldStartsAt" },
    { field: "endsAt", key: "aiEntityDraft.fieldEndsAt" },
    { field: "location", key: "aiEntityDraft.fieldLocation" },
    // Sprint 0093: the event service requires a reason an event belongs in
    // Orbit. Showing it here is what lets the user correct it before
    // confirming, instead of finding out from a refused write.
    { field: "sourceNote", key: "aiEntityDraft.fieldSourceNote" },
  ],
  note: [{ field: "body", key: "aiEntityDraft.fieldBody" }],
  schedule: [
    { field: "startsAt", key: "aiEntityDraft.fieldStartsAt" },
    { field: "endsAt", key: "aiEntityDraft.fieldEndsAt" },
    { field: "location", key: "aiEntityDraft.fieldLocation" },
  ],
  task: [
    { field: "dueAt", key: "aiEntityDraft.fieldDueAt" },
    { field: "category", key: "aiEntityDraft.fieldCategory" },
    { field: "notes", key: "aiEntityDraft.fieldNotes" },
  ],
};

const KIND_LABEL: Readonly<Record<AiEntityKind, MessageKey>> = {
  event: "aiEntityDraft.kindEvent",
  note: "aiEntityDraft.kindNote",
  schedule: "aiEntityDraft.kindSchedule",
  task: "aiEntityDraft.kindTask",
};

const SOURCE_LABEL: Readonly<Record<AiEntityDraftSourceRef["kind"], MessageKey>> = {
  contact: "aiEntityDraft.kindContact",
  event: "aiEntityDraft.kindEvent",
  note: "aiEntityDraft.kindNote",
  schedule: "aiEntityDraft.kindSchedule",
  task: "aiEntityDraft.kindTask",
};

/** Where a created record can be opened. Contacts land as a draft, so they differ. */
export function aiEntityRecordHref(kind: AiEntityKind, recordId: string): string | null {
  const id = encodeURIComponent(recordId);
  switch (kind) {
    case "task": return `/tasks/${id}`;
    case "note": return `/notes/${id}`;
    // A schedule draft creates a personal entry; /schedule/<id> is not a route.
    case "schedule": return `/schedule/personal/${id}`;
    case "event": return `/events/${id}`;
    default: return null;
  }
}

export function aiEntityDraftCardView(
  draft: AiEntityDraft,
  t: OrbitTranslator,
): AiEntityDraftCardView {
  const title = draft.fields[TITLE_FIELD[draft.kind]] ?? "";
  const rows = ROW_FIELDS[draft.kind].flatMap((row) => {
    const value = draft.fields[row.field];
    return value ? [{ editable: true, field: row.field, label: t(row.key), value }] : [];
  });

  const counts = new Map<AiEntityDraftSourceRef["kind"], number>();
  for (const ref of draft.sourceRefs) {
    counts.set(ref.kind, (counts.get(ref.kind) ?? 0) + 1);
  }
  const sourceSummary = counts.size > 0
    ? [...counts.entries()]
        .map(([kind, count]) => `${t(SOURCE_LABEL[kind])} ${count}`)
        .join(" · ")
    : null;

  const created = draft.state === "created";
  return {
    confirmable: draft.state === "pending_confirmation",
    createdHref: created && draft.createdRecordId
      ? aiEntityRecordHref(draft.kind, draft.createdRecordId)
      : null,
    draftId: draft.draftId,
    failureReason: draft.failureReason ?? null,
    footnote: created
      ? t("aiEntityDraft.footnoteCreated")
      : t("aiEntityDraft.footnotePending"),
    kind: draft.kind,
    kindLabel: t(KIND_LABEL[draft.kind]),
    rows: [...rows, ...(sourceSummary
      ? [{ editable: false, label: t("aiEntityDraft.fieldSources"), value: sourceSummary }]
      : [])],
    sourceSummary,
    state: draft.state,
    title,
  };
}
