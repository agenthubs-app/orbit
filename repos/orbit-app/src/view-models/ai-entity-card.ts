import type { MessageKey, OrbitTranslator } from "../i18n/messages";

/**
 * Sprint 0094: one card shape for every entity the assistant surfaces.
 *
 * Before this, contacts, events, tasks and schedules each had their own panel
 * and notes had none, so the same question produced five different visual
 * answers. The artifact payloads are already near-identical — every item is
 * `{ id, title, body, metadata, actions, evidenceIds }` — so the difference was
 * in the rendering, not the data.
 */

export const AI_ENTITY_CARD_KINDS = ["contact", "event", "task", "schedule", "note"] as const;
export type AiEntityCardKind = (typeof AI_ENTITY_CARD_KINDS)[number];

export interface AiEntityCardView {
  /** Stable per item, so a list of cards can key on it. */
  key: string;
  kind: AiEntityCardKind;
  kindLabel: string;
  title: string;
  /** One line of the attributes that identify the record. */
  meta: string | null;
  /** One line of why this record is in the reply. */
  reason: string | null;
  href: string | null;
}

interface RawItem {
  id?: unknown;
  title?: unknown;
  subtitle?: unknown;
  reason?: unknown;
  body?: unknown;
  metadata?: unknown;
  actions?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `contact-recommendation:contact_089` and `task:abc` both name their entity. */
const ID_PREFIX_KINDS: readonly (readonly [RegExp, AiEntityCardKind])[] = [
  [/^contact(-recommendation)?:/u, "contact"],
  [/^event(-recommendation)?:/u, "event"],
  [/^task:/u, "task"],
  [/^personal:|^schedule(-item)?:/u, "schedule"],
  [/^note:/u, "note"],
];

export function aiEntityCardKindFor(id: string): AiEntityCardKind | null {
  return ID_PREFIX_KINDS.find(([pattern]) => pattern.test(id))?.[1] ?? null;
}

/** The recommendation prefix is a wrapper; the record id is what routes. */
export function aiEntityRecordIdFor(id: string): string {
  return id.replace(/^[a-z-]+recommendation:/u, "").replace(/^[a-z-]+:/u, (match) =>
    /^(task|note|personal|contact|event):$/u.test(match) ? match : "");
}

const KIND_LABEL: Readonly<Record<AiEntityCardKind, MessageKey>> = {
  contact: "aiEntityDraft.kindContact",
  event: "aiEntityDraft.kindEvent",
  note: "aiEntityDraft.kindNote",
  schedule: "aiEntityDraft.kindSchedule",
  task: "aiEntityDraft.kindTask",
};

/** Which metadata labels identify each kind, in the order they should read. */
const META_LABELS: Readonly<Record<AiEntityCardKind, readonly string[]>> = {
  contact: ["组织", "最近联系"],
  // Producers label these in the reply's language; both spellings are real.
  event: ["startsAt", "开始", "venue", "location", "地点"],
  note: ["updatedAt"],
  schedule: ["startsAt"],
  task: ["dueAt", "category"],
};

function metadataMap(value: unknown): Map<string, string> {
  const entries = new Map<string, string>();
  if (!Array.isArray(value)) return entries;
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const label = text(entry.label);
    const item = text(entry.value);
    if (label && item) entries.set(label, item);
  }
  return entries;
}

/**
 * Instants in metadata are machine format; a card shows a readable day.
 *
 * Which values are instants is decided by the value, not by the label: the same
 * field arrives as `startsAt` or as 「开始」 depending on the reply's language,
 * and a date with no time (`2026-09-21`) must not grow an invented 00:00.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u;
function readableInstant(value: string, language: string): string {
  const parsed = Date.parse(value);
  if (!ISO_INSTANT.test(value) || !Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : language === "ja" ? "ja-JP" : "zh-CN", {
    day: "numeric", hour: "2-digit", minute: "2-digit", month: "numeric",
  }).format(new Date(parsed));
}

function firstSentence(value: string): string {
  const [sentence] = value.split(/(?<=[。.!！?？])\s*/u);
  return (sentence ?? value).trim();
}

const DETAIL_PATH: Readonly<Record<AiEntityCardKind, string>> = {
  contact: "/contacts/",
  event: "/events/",
  note: "/notes/",
  schedule: "/schedule/",
  task: "/tasks/",
};

/**
 * A schedule entry has no single detail page: personal entries, meetings and
 * event attendance are three routes. The entry says which it is in its own
 * `kind` field, so the card reads that rather than assuming a flat
 * `/schedule/<id>`, which is not a route and lands the user on the home screen.
 */
const SCHEDULE_SEGMENT: Readonly<Record<string, string>> = { event: "events/", meeting: "meetings/", personal: "personal/" };

function detailPathFor(kind: AiEntityCardKind, metadata: Map<string, string>): string | null {
  if (kind !== "schedule") return DETAIL_PATH[kind];
  const segment = SCHEDULE_SEGMENT[metadata.get("kind") ?? ""];
  // An entry that does not say which kind it is gets no link, rather than one
  // that silently goes nowhere.
  return segment ? `${DETAIL_PATH.schedule}${segment}` : null;
}

/**
 * The link is derived from the record's own id, never taken from the payload.
 *
 * An artifact may carry an action with its own href. Trusting it would let
 * whatever produced the artifact point a card anywhere, so a supplied href is
 * only honoured when it resolves to the same record this card is for — the same
 * binding `contactArtifactDetailHref` enforces for contacts server-side.
 */
function hrefFor(path: string | null, recordId: string, actions: unknown): string | null {
  if (!recordId || !path) return null;
  const derived = `${path}${encodeURIComponent(recordId)}`;
  if (!Array.isArray(actions)) return derived;
  for (const entry of actions) {
    const supplied = isRecord(entry) ? text(entry.href) : null;
    if (!supplied) continue;
    // `/app` is the Web shell's prefix for the same route.
    const match = new RegExp(`^(?:/app)?${path}([^/?#]+)$`, "u").exec(supplied);
    let decoded: string | null = null;
    try { decoded = match ? decodeURIComponent(match[1]!) : null; } catch { decoded = null; }
    if (decoded !== recordId) return null;
  }
  return derived;
}

export function aiEntityCardForItem(
  raw: unknown,
  t: OrbitTranslator,
  language = "zh",
): AiEntityCardView | null {
  if (!isRecord(raw)) return null;
  const item = raw as RawItem;
  const id = text(item.id);
  const title = text(item.title);
  if (!id || !title) return null;
  const kind = aiEntityCardKindFor(id);
  if (!kind) return null;

  const metadata = metadataMap(item.metadata);
  const meta = [
    text(item.subtitle),
    ...META_LABELS[kind].map((label) => {
      const value = metadata.get(label);
      if (!value) return null;
      return readableInstant(value, language);
    }),
  ].filter((value): value is string => Boolean(value)).join(" · ");

  const reasonSource = text(item.reason);
  return {
    href: hrefFor(detailPathFor(kind, metadata), aiEntityRecordIdFor(id), item.actions),
    key: id,
    kind,
    kindLabel: t(KIND_LABEL[kind]),
    meta: meta || null,
    reason: reasonSource ? firstSentence(reasonSource) : null,
    title,
  };
}

/** Every renderable card in an assistant artifact, in the order it arrived. */
export function aiEntityCardsFromArtifact(
  artifact: unknown,
  t: OrbitTranslator,
  language = "zh",
): AiEntityCardView[] {
  if (!isRecord(artifact)) return [];
  const result = isRecord(artifact.result) ? artifact.result : artifact;
  // A live turn nests sections under generatedView; a recovered history turn
  // carries them directly. Both are the same shape underneath.
  const generated = isRecord(result.generatedView) ? result.generatedView : null;
  const sections = Array.isArray(generated?.sections)
    ? generated.sections
    : Array.isArray(result.sections) ? result.sections : [];
  return sections.flatMap((section) => {
    const items = isRecord(section) && Array.isArray(section.items) ? section.items : [];
    return items.flatMap((item) => {
      const card = aiEntityCardForItem(item, t, language);
      return card ? [card] : [];
    });
  });
}
