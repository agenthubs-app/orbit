// R12 名刺をスキャン · Web (b11 A1 Web): staging before the batch is created — photos are
// held here, a photo can be made the back of the card before it (the pipeline pairs only
// what the person names; there is no time or filename guess, ingest-v2 pairing rules).
// Pure: no React, no storage.

export type StagedPhoto = { id: string; file: File; url: string };
export type StagedCard = { id: string; front: StagedPhoto; back: StagedPhoto | null };

export const SCAN_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const IMAGE_NAME = /\.(jpe?g|png|webp|heic|heif)$/i;

/** JPG / PNG / WebP / HEIC (the v2 pipeline's upload types); PDF and the rest are refused. */
export function isScanImage(file: { name: string; type: string }): boolean {
  if (/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return true;
  // Some browsers give HEIC no type (or octet-stream): fall back to the file name.
  return (!file.type || file.type === "application/octet-stream") && IMAGE_NAME.test(file.name);
}

export function photoCount(cards: readonly StagedCard[]): number {
  return cards.reduce((sum, card) => sum + (card.back ? 2 : 1), 0);
}

/** Adds photos as new cards (one photo, one card), up to `max` photos in all. */
export function addPhotos(cards: readonly StagedCard[], photos: readonly StagedPhoto[], max: number): { cards: StagedCard[]; dropped: number } {
  const room = Math.max(0, max - photoCount(cards));
  const kept = photos.slice(0, room);
  return { cards: [...cards, ...kept.map((photo) => ({ id: photo.id, front: photo, back: null }))], dropped: photos.length - kept.length };
}

/** 「前の名刺の裏にする」: a single-photo card becomes the back of the card right before it. */
export function pairWithPrevious(cards: readonly StagedCard[], cardId: string): StagedCard[] {
  const index = cards.findIndex((card) => card.id === cardId);
  const previous = index > 0 ? cards[index - 1] : undefined;
  const card = cards[index];
  if (!card || !previous || previous.back || card.back) return [...cards];
  return cards.flatMap((entry, at) => (at === index ? [] : at === index - 1 ? [{ ...entry, back: card.front }] : [entry]));
}

export function canPairWithPrevious(cards: readonly StagedCard[], cardId: string): boolean {
  const index = cards.findIndex((card) => card.id === cardId);
  return index > 0 && !cards[index]!.back && !cards[index - 1]!.back;
}

/** 「裏を外す」: the back becomes its own card again, right after. */
export function unpairBack(cards: readonly StagedCard[], cardId: string): StagedCard[] {
  return cards.flatMap((card) => (card.id === cardId && card.back ? [{ ...card, back: null }, { id: card.back.id, front: card.back, back: null }] : [card]));
}

/** はじめての方へ: open on the first three visits, a single line after that (DESIGN §2.2). */
export const SCAN_GUIDE_VISITS_KEY = "orbit.add.scanGuideVisits.v1";
export const SCAN_GUIDE_OPEN_VISITS = 3;

export function scanGuideOpen(previousVisits: number): boolean {
  return previousVisits < SCAN_GUIDE_OPEN_VISITS;
}

/** Reads and bumps the visit count; storage that throws (private mode) counts as a first visit. */
export function recordScanGuideVisit(storage: Pick<Storage, "getItem" | "setItem"> | null | undefined): number {
  try {
    const raw = Number.parseInt(storage?.getItem(SCAN_GUIDE_VISITS_KEY) ?? "0", 10);
    const previous = Number.isFinite(raw) && raw > 0 ? raw : 0;
    storage?.setItem(SCAN_GUIDE_VISITS_KEY, String(previous + 1));
    return previous;
  } catch {
    return 0;
  }
}
