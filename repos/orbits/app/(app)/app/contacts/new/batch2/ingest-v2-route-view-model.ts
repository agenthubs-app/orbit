import type {
  IngestCardConfirmationInputContract,
  IngestCardFieldSourcesContract,
} from "../../../../../../shared/contract/business-card-batch";
import type {
  BusinessCardContactPoint,
  BusinessCardStructuredExtraction,
} from "../../../../../../features/acquisition/business-card-cloud-ocr";
import type {
  IngestCardSide,
  IngestItemDTO,
  IngestManifestEntry,
} from "../../../../../../features/acquisition/business-card-ingest-v2/contract";
import { aggregateBusinessCardNotes } from "../../../../../../features/acquisition/business-card-notes-aggregation";

export const INGEST_V2_FIELDS = [
  "displayName",
  "organization",
  "role",
  "email",
  "phone",
] as const;

export type IngestV2Field = (typeof INGEST_V2_FIELDS)[number];

export interface IngestV2FixedFields {
  displayName: string;
  organization: string;
  role: string;
  email: string;
  phone: string;
  relationshipContext: string;
  notes: string;
}

export interface PairingPhoto {
  id: string;
  fileName: string;
  mimeType: string;
  rawSize: number;
  clientDigest: string;
}

export interface PairingCard {
  cardId: string;
  front: PairingPhoto;
  back: PairingPhoto | null;
}

export interface FrozenManifestSubmission {
  idempotencyKey: string;
  manifest: readonly IngestManifestEntry[];
}

export interface IngestV2CardViewModel {
  cardId: string;
  front: IngestItemDTO | null;
  back: IngestItemDTO | null;
  items: readonly IngestItemDTO[];
  isLegacySingleSide: boolean;
  isTwoSided: boolean;
  allConfirmed: boolean;
  confirmedContactId: string | null;
  allExtracted: boolean;
  hasTerminalFailure: boolean;
  hasMissingImageDigest: boolean;
  invalidStructure: boolean;
  reviewable: boolean;
}

export interface IngestV2FieldCandidate {
  field: IngestV2Field;
  value: string;
  itemId: string;
  side: IngestCardSide;
  version: number;
  imageDigest: string | null;
}

export interface IngestV2SourceSnapshot {
  itemId: string;
  version: number;
  imageDigest: string | null;
}

export interface IngestV2CardDraft {
  fields: IngestV2FixedFields;
  fieldSources: IngestCardFieldSourcesContract;
  sourceSnapshots: Record<IngestV2Field, IngestV2SourceSnapshot | null>;
  conflictedFields: readonly IngestV2Field[];
  staleFields: readonly IngestV2Field[];
  notesDirty?: boolean;
  notesSourceFingerprint?: string;
  notesSourceUpdated?: boolean;
}

export interface IngestV2Progress {
  photoCount: number;
  photoSettled: number;
  cardCount: number;
  cardSettled: number;
  cardConfirmed: number;
}

export type ConfirmationBlockedReason =
  | "card_not_ready"
  | "conflicting_fields"
  | "missing_image_digest"
  | "source_expired"
  | "name_required";

export interface ConfirmationPayloadResult {
  payload: IngestCardConfirmationInputContract | null;
  blockedReason: ConfirmationBlockedReason | null;
}

export interface ConfirmationReceipt {
  ok: boolean;
  contactId: string | null;
  items: readonly IngestItemDTO[];
  reason: "created" | "duplicate_review" | "incomplete_receipt" | "wrong_contact" | "wrong_card";
}

export interface IngestConfirmationResponseLike {
  state?: string;
  contactId?: string;
  duplicateContactId?: string;
  item?: IngestItemDTO;
  items?: readonly IngestItemDTO[];
}

const CJK_CHAR_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/u;

function trimmed(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function preferredDisplayName(extraction: BusinessCardStructuredExtraction | null): string {
  const native = trimmed(extraction?.nativeFullName);
  if (native && CJK_CHAR_RE.test(native)) return native;
  return trimmed(extraction?.fullName) || native;
}

function preferredPhone(extraction: BusinessCardStructuredExtraction | null): string {
  const point = extraction?.contactPoints.find(
    (candidate: BusinessCardContactPoint) => candidate.type === "phone" || candidate.type === "mobile",
  );
  return trimmed(point?.value);
}

function itemFieldValue(item: IngestItemDTO, field: IngestV2Field): string {
  const extraction = item.extraction;
  if (!extraction) return "";
  switch (field) {
    case "displayName": return preferredDisplayName(extraction);
    case "organization": return trimmed(extraction.organization);
    case "role": return trimmed(extraction.title);
    case "email": return trimmed(extraction.emails[0]?.value);
    case "phone": return preferredPhone(extraction);
  }
}

function candidateKey(field: IngestV2Field, value: string): string {
  const normalized = value.trim();
  return field === "email" ? normalized.toLocaleLowerCase() : normalized;
}

export function fieldCandidates(item: IngestItemDTO): readonly IngestV2FieldCandidate[] {
  return INGEST_V2_FIELDS.flatMap((field) => {
    const value = itemFieldValue(item, field);
    return value
      ? [{ field, value, itemId: item.id, side: item.side, version: item.version, imageDigest: item.imageDigest }]
      : [];
  });
}

export function createInitialPairing(
  photos: readonly PairingPhoto[],
  cardIdFactory: (photo: PairingPhoto, index: number) => string = (_photo, index) => `card:${index + 1}`,
): PairingCard[] {
  return photos.map((photo, index) => ({ cardId: cardIdFactory(photo, index), front: photo, back: null }));
}

/**
 * Pairing intentionally has no similarity or filename heuristic. The caller
 * must name the target card and the photo that becomes its back.
 */
export function pairPhotoAsBack(
  cards: readonly PairingCard[],
  photoId: string,
  targetCardId: string,
): PairingCard[] {
  const target = cards.find((card) => card.cardId === targetCardId);
  const source = cards.find((card) => card.front.id === photoId || card.back?.id === photoId);
  if (!target || !source || target.cardId === source.cardId || target.back) return [...cards];

  if (source.front.id === photoId) {
    // Moving a front photo out of a card that already has a back would orphan
    // the back. Keep the operation explicit and lossless instead of guessing
    // which side should become the new front.
    if (source.back) return [...cards];
    return cards
      .filter((card) => card.cardId !== source.cardId)
      .map((card) => (card.cardId === targetCardId ? { ...card, back: source.front } : card));
  }

  const photo = source.back!;
  return cards.map((card) => {
    if (card.cardId === source.cardId) return { ...card, back: null };
    if (card.cardId === targetCardId) return { ...card, back: photo };
    return card;
  });
}

export function unpairBackPhoto(
  cards: readonly PairingCard[],
  targetCardId: string,
  cardIdFactory: (photo: PairingPhoto) => string = (photo) => `card:${photo.id}`,
): PairingCard[] {
  const target = cards.find((card) => card.cardId === targetCardId);
  if (!target?.back) return [...cards];
  const standalone: PairingCard = { cardId: cardIdFactory(target.back), front: target.back, back: null };
  return cards.flatMap((card) => (card.cardId === targetCardId ? [
    { ...card, back: null },
    standalone,
  ] : [card]));
}

export function removePairingPhoto(
  cards: readonly PairingCard[],
  photoId: string,
): PairingCard[] {
  return cards.flatMap((card) => {
    if (card.front.id === photoId) return card.back ? [{ ...card, front: card.back, back: null }] : [];
    if (card.back?.id === photoId) return [{ ...card, back: null }];
    return [card];
  });
}

export function pairingManifest(cards: readonly PairingCard[]): IngestManifestEntry[] {
  let seq = 1;
  return cards.flatMap((card) => {
    const entries: IngestManifestEntry[] = [];
    for (const [side, photo] of [["front", card.front], ["back", card.back]] as const) {
      if (!photo) continue;
      entries.push({
        cardId: card.cardId,
        side,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
        rawSize: photo.rawSize,
        seq: seq++,
        clientDigest: photo.clientDigest,
      });
    }
    return entries;
  });
}

export function freezeManifestSubmission(
  cards: readonly PairingCard[],
  idempotencyKey: string,
): FrozenManifestSubmission {
  const manifest = pairingManifest(cards).map((entry) => Object.freeze({ ...entry }));
  return Object.freeze({ idempotencyKey, manifest: Object.freeze(manifest) });
}

export function groupIngestItemsByCardId(items: readonly IngestItemDTO[]): IngestV2CardViewModel[] {
  const groups = new Map<string, IngestItemDTO[]>();
  for (const item of items) groups.set(item.cardId, [...(groups.get(item.cardId) ?? []), item]);

  return [...groups.entries()]
    .map(([cardId, grouped]) => {
      const sorted = [...grouped].sort((a, b) => a.seq - b.seq);
      const fronts = sorted.filter((item) => item.side === "front");
      const backs = sorted.filter((item) => item.side === "back");
      const front = fronts.length === 1 ? fronts[0]! : null;
      const back = backs.length === 1 ? backs[0]! : null;
      const invalidStructure = fronts.length !== 1 || backs.length > 1;
      // Keep every server row in the model. Duplicate sides are an invalid
      // response that must be visible/blocking, never silently collapsed into
      // a single-sided card.
      const cardItems = sorted;
      const confirmedIds = [...new Set(cardItems.map((item) => item.confirmedContactId).filter(Boolean))];
      const allConfirmed = !invalidStructure
        && cardItems.length > 0
        && confirmedIds.length === 1
        && cardItems.every((item) => item.status === "confirmed" && item.confirmedContactId === confirmedIds[0]);
      return {
        cardId,
        front,
        back,
        items: cardItems,
        isLegacySingleSide: cardItems.length === 1 && cardItems[0]?.cardIdentityExplicit === false,
        isTwoSided: !invalidStructure && cardItems.length === 2,
        allConfirmed,
        confirmedContactId: confirmedIds.length === 1 ? confirmedIds[0]! : null,
        allExtracted: cardItems.length > 0 && cardItems.every((item) => item.status === "extracted"),
        hasTerminalFailure: cardItems.some((item) => item.status === "terminal_failed"),
        hasMissingImageDigest: cardItems.some((item) => item.imageDigest === null),
        invalidStructure,
        reviewable: !invalidStructure && cardItems.length > 0 && cardItems.every((item) => item.status === "extracted" || item.status === "terminal_failed"),
      } satisfies IngestV2CardViewModel;
    })
    .sort((a, b) => (a.items[0]?.seq ?? 0) - (b.items[0]?.seq ?? 0));
}

export function progressForItems(items: readonly IngestItemDTO[]): IngestV2Progress {
  const cards = groupIngestItemsByCardId(items);
  const settled = new Set(["extracted", "terminal_failed", "confirmed", "skipped", "excluded"]);
  return {
    photoCount: items.length,
    photoSettled: items.filter((item) => settled.has(item.status)).length,
    cardCount: cards.length,
    cardSettled: cards.filter((card) => card.items.every((item) => settled.has(item.status))).length,
    cardConfirmed: cards.filter((card) => card.allConfirmed && card.confirmedContactId !== null).length,
  };
}

export function collectingProgressForItems(items: readonly IngestItemDTO[]): IngestV2Progress {
  const cards = groupIngestItemsByCardId(items);
  const ready = new Set(["uploaded", "excluded"]);
  return {
    photoCount: items.length,
    photoSettled: items.filter((item) => ready.has(item.status)).length,
    cardCount: cards.length,
    cardSettled: cards.filter((card) => card.items.length > 0 && card.items.every((item) => ready.has(item.status))).length,
    cardConfirmed: 0,
  };
}

export function completionCountsForItems(items: readonly IngestItemDTO[]): { confirmed: number; skipped: number } {
  const cards = groupIngestItemsByCardId(items);
  return {
    confirmed: cards.filter((card) => card.allConfirmed).length,
    skipped: cards.filter((card) => card.items.length > 0 && card.items.every((item) => item.status === "skipped" || item.status === "excluded")).length,
  };
}

function sourceSnapshot(item: IngestItemDTO): IngestV2SourceSnapshot {
  return { itemId: item.id, version: item.version, imageDigest: item.imageDigest };
}

function sourceMatches(snapshot: IngestV2SourceSnapshot, item: IngestItemDTO): boolean {
  return snapshot.itemId === item.id && snapshot.version === item.version && snapshot.imageDigest === item.imageDigest;
}

function notesForCard(card: IngestV2CardViewModel, fields: Pick<IngestV2FixedFields, "email" | "phone">): string {
  return card.items
    .flatMap((item) => {
      if (!item.extraction) return [];
      const notes = aggregateBusinessCardNotes(item.extraction, {
        email: fields.email || null,
        phone: fields.phone || null,
      });
      return notes ? [`${item.side === "front" ? "正面" : "反面"} · ${item.sourceFileName}\n${notes}`] : [];
    })
    .join("\n\n");
}

function notesSourceFingerprint(card: IngestV2CardViewModel, fields: Pick<IngestV2FixedFields, "email" | "phone">): string {
  return JSON.stringify({
    sources: card.items.map((item) => ({ id: item.id, version: item.version, imageDigest: item.imageDigest })),
    notes: notesForCard(card, fields),
  });
}

export function initialCardDraft(card: IngestV2CardViewModel): IngestV2CardDraft {
  const fields = Object.fromEntries(INGEST_V2_FIELDS.map((field) => [field, ""])) as Record<IngestV2Field, string>;
  const fieldSources = Object.fromEntries(INGEST_V2_FIELDS.map((field) => [field, null])) as IngestCardFieldSourcesContract;
  const sourceSnapshots = Object.fromEntries(INGEST_V2_FIELDS.map((field) => [field, null])) as Record<IngestV2Field, IngestV2SourceSnapshot | null>;
  const conflictedFields: IngestV2Field[] = [];

  for (const field of INGEST_V2_FIELDS) {
    const candidates = card.items.flatMap(fieldCandidates).filter((candidate) => candidate.field === field);
    const valuesByKey = new Map<string, IngestV2FieldCandidate>();
    for (const candidate of candidates) {
      const key = candidateKey(field, candidate.value);
      if (!valuesByKey.has(key)) valuesByKey.set(key, candidate);
    }
    const values = [...valuesByKey.values()];
    if (values.length === 1) {
      const candidate = values[0]!;
      fields[field] = candidate.value;
      fieldSources[field] = candidate.itemId;
      const item = card.items.find((entry) => entry.id === candidate.itemId);
      if (item) sourceSnapshots[field] = sourceSnapshot(item);
    } else if (values.length > 1) {
      conflictedFields.push(field);
    }
  }

  const baseFields: IngestV2FixedFields = {
    ...fields,
    relationshipContext: "",
    notes: "",
  };
  baseFields.notes = notesForCard(card, baseFields);
  return {
    fields: baseFields,
    fieldSources,
    sourceSnapshots,
    conflictedFields,
    staleFields: [],
    notesDirty: false,
    notesSourceFingerprint: notesSourceFingerprint(card, baseFields),
    notesSourceUpdated: false,
  };
}

export function reconcileCardDraft(
  previous: IngestV2CardDraft,
  next: IngestV2CardViewModel,
): IngestV2CardDraft {
  const base = initialCardDraft(next);
  let notesWereEdited = previous.notesDirty === true;
  if (!notesWereEdited && previous.notesSourceFingerprint) {
    try {
      const parsed = JSON.parse(previous.notesSourceFingerprint) as { notes?: unknown };
      notesWereEdited = parsed.notes !== previous.fields.notes;
    } catch {
      notesWereEdited = true;
    }
  } else if (!previous.notesSourceFingerprint) {
    // Drafts created before notes provenance was tracked must retain the
    // reviewer's existing text rather than silently replacing it on a poll.
    notesWereEdited = true;
  }
  const notesDirty = notesWereEdited;
  const previousNotesFingerprint = previous.notesSourceFingerprint;
  const notesChanged = Boolean(previousNotesFingerprint && previousNotesFingerprint !== base.notesSourceFingerprint);
  const fields = {
    ...base.fields,
    relationshipContext: previous.fields.relationshipContext,
    notes: notesDirty ? previous.fields.notes : base.fields.notes,
  };
  const fieldSources = { ...base.fieldSources };
  const sourceSnapshots = { ...base.sourceSnapshots };
  const staleFields: IngestV2Field[] = [];
  const conflictedFields = new Set<IngestV2Field>(base.conflictedFields);

  for (const field of INGEST_V2_FIELDS) {
    if (previous.staleFields.includes(field)) {
      fields[field] = previous.fields[field];
      fieldSources[field] = null;
      sourceSnapshots[field] = null;
      staleFields.push(field);
      conflictedFields.delete(field);
      continue;
    }
    const previousSource = previous.fieldSources[field];
    if (!previousSource) {
      fields[field] = previous.fields[field];
      fieldSources[field] = null;
      sourceSnapshots[field] = null;
      if (!previous.conflictedFields.includes(field)) conflictedFields.delete(field);
      continue;
    }
    const item = next.items.find((entry) => entry.id === previousSource);
    const snapshot = previous.sourceSnapshots[field];
    if (!item || !snapshot || !sourceMatches(snapshot, item)) {
      fields[field] = "";
      fieldSources[field] = null;
      sourceSnapshots[field] = null;
      staleFields.push(field);
      conflictedFields.delete(field);
      continue;
    }
    fields[field] = previous.fields[field];
    fieldSources[field] = previousSource;
    sourceSnapshots[field] = snapshot;
    // A previous explicit source choice resolves the initial disagreement;
    // polling must not recreate that conflict from the base candidate map.
    conflictedFields.delete(field);
  }

  return {
    fields,
    fieldSources,
    sourceSnapshots,
    conflictedFields: [...conflictedFields],
    staleFields,
    notesDirty,
    notesSourceFingerprint: base.notesSourceFingerprint,
    notesSourceUpdated: Boolean(previous.notesSourceUpdated || notesChanged),
  };
}

/** A reviewer action resolves a conflict/stale marker and makes the field manual. */
export function setManualDraftField(
  draft: IngestV2CardDraft,
  field: IngestV2Field,
  value: string,
): IngestV2CardDraft {
  return {
    ...draft,
    fields: { ...draft.fields, [field]: value },
    fieldSources: { ...draft.fieldSources, [field]: null },
    sourceSnapshots: { ...draft.sourceSnapshots, [field]: null },
    conflictedFields: draft.conflictedFields.filter((entry) => entry !== field),
    staleFields: draft.staleFields.filter((entry) => entry !== field),
  };
}

export function setManualDraftNotes(
  draft: IngestV2CardDraft,
  value: string,
): IngestV2CardDraft {
  return {
    ...draft,
    fields: { ...draft.fields, notes: value },
    notesDirty: true,
    notesSourceUpdated: false,
  };
}

export function setDraftFieldSource(
  draft: IngestV2CardDraft,
  field: IngestV2Field,
  candidate: IngestV2FieldCandidate,
): IngestV2CardDraft {
  return {
    ...draft,
    fields: { ...draft.fields, [field]: candidate.value },
    fieldSources: { ...draft.fieldSources, [field]: candidate.itemId },
    sourceSnapshots: {
      ...draft.sourceSnapshots,
      [field]: { itemId: candidate.itemId, version: candidate.version, imageDigest: candidate.imageDigest },
    },
    conflictedFields: draft.conflictedFields.filter((entry) => entry !== field),
    staleFields: draft.staleFields.filter((entry) => entry !== field),
  };
}

function allExpectedItems(card: IngestV2CardViewModel): readonly { itemId: string; version: number; imageDigest: string }[] | null {
  if (card.items.length === 0 || card.items.some((item) => item.imageDigest === null)) return null;
  return card.items.map((item) => ({ itemId: item.id, version: item.version, imageDigest: item.imageDigest! }));
}

export function buildConfirmationPayload(
  card: IngestV2CardViewModel,
  draft: IngestV2CardDraft,
  confirmationIntentId: string,
  allowDuplicate = false,
  manual = false,
): ConfirmationPayloadResult {
  if (!card.reviewable || (!manual && !card.allExtracted)) {
    return { payload: null, blockedReason: "card_not_ready" };
  }
  if (card.hasMissingImageDigest) return { payload: null, blockedReason: "missing_image_digest" };
  if (draft.conflictedFields.length > 0) return { payload: null, blockedReason: "conflicting_fields" };
  if (draft.staleFields.length > 0) return { payload: null, blockedReason: "source_expired" };
  const hasExpiredSource = INGEST_V2_FIELDS.some((field) => {
    const sourceId = draft.fieldSources[field];
    if (sourceId === null) return false;
    const item = card.items.find((entry) => entry.id === sourceId);
    const snapshot = draft.sourceSnapshots[field];
    return !item || !snapshot || !sourceMatches(snapshot, item);
  });
  if (hasExpiredSource) return { payload: null, blockedReason: "source_expired" };
  if (!draft.fields.displayName.trim()) return { payload: null, blockedReason: "name_required" };
  const expectedCardItems = allExpectedItems(card);
  if (!expectedCardItems) return { payload: null, blockedReason: "missing_image_digest" };
  return {
    payload: {
      confirmationIntentId,
      expectedCardItems,
      fieldSources: draft.fieldSources,
      displayName: draft.fields.displayName,
      organization: draft.fields.organization,
      role: draft.fields.role,
      email: draft.fields.email,
      phone: draft.fields.phone,
      relationshipContext: draft.fields.relationshipContext,
      notes: draft.fields.notes,
      ...(allowDuplicate ? { allowDuplicate: true } : {}),
    },
    blockedReason: null,
  };
}

export function readConfirmationReceipt(
  response: IngestConfirmationResponseLike,
  card: IngestV2CardViewModel,
): ConfirmationReceipt {
  if (response.state === "duplicate_review") {
    return { ok: false, contactId: null, items: [], reason: "duplicate_review" };
  }
  if (response.state !== "created" || !response.contactId) {
    return { ok: false, contactId: null, items: [], reason: "incomplete_receipt" };
  }
  const received = response.items?.length ? response.items : response.item ? [response.item] : [];
  const expectedById = new Map(card.items.map((item) => [item.id, item]));
  const expectedIds = new Set(card.items.map((item) => item.id));
  const receivedIds = new Set(received.map((item) => item.id));
  const completeLegacySingle = card.isLegacySingleSide && received.length === 1;
  const complete = completeLegacySingle || received.length === card.items.length;
  const sameCard = received.length === receivedIds.size
    && receivedIds.size === expectedIds.size
    && received.every((entry) => {
      const expected = expectedById.get(entry.id);
      return expected !== undefined
        && entry.batchId === expected.batchId
        && entry.cardId === expected.cardId
        && entry.side === expected.side;
    });
  const sameContact = received.every((item) => item.status === "confirmed" && item.confirmedContactId === response.contactId);
  if (!complete || !sameCard) return { ok: false, contactId: response.contactId, items: received, reason: "wrong_card" };
  if (!sameContact) return { ok: false, contactId: response.contactId, items: received, reason: "wrong_contact" };
  return { ok: true, contactId: response.contactId, items: received, reason: "created" };
}

export function hasNoFixedFields(fields: Pick<IngestV2FixedFields, IngestV2Field>): boolean {
  return INGEST_V2_FIELDS.every((field) => !fields[field].trim());
}
