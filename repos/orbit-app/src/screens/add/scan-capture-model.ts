// R12 名刺をスキャン · カメラ (DESIGN §2.2 step 3, b11 A1 ②, b1 B2): the shot tray as a pure
// model. [表面][裏面]: a front starts a new card; a back is paired with the last front
// that has no back yet (the v2 manifest's `cardId` + `side`, as the old two-sided picker
// did), then the camera returns to 表面. 裏なし goes straight back to 表面. Up to 100
// photos per batch (INGEST_V2_MAX_ITEMS). No React, no IO.
import type { PreparedBatchImage } from "../../api/batch-images";
import type { IngestCardImage } from "../../view-models/business-card-ingest";

export const SCAN_MAX_PHOTOS = 100;

export type ShotSide = "front" | "back";

export interface Shot {
  id: string;
  cardId: string;
  side: ShotSide;
  image: PreparedBatchImage;
}

export interface ShotTray {
  shots: readonly Shot[];
  /** The side the next photo is taken as. */
  side: ShotSide;
}

export const EMPTY_TRAY: ShotTray = { shots: [], side: "front" };

/** The last front without a back: the one a 裏面 photo pairs with. */
export function openFront(tray: ShotTray): Shot | null {
  for (let index = tray.shots.length - 1; index >= 0; index -= 1) {
    const shot = tray.shots[index]!;
    if (shot.side === "front") return tray.shots.some((other) => other.cardId === shot.cardId && other.side === "back") ? null : shot;
  }
  return null;
}

export function canShootBack(tray: ShotTray): boolean {
  return openFront(tray) !== null;
}

export function remainingShots(tray: ShotTray): number {
  return Math.max(0, SCAN_MAX_PHOTOS - tray.shots.length);
}

/** Switches the side; 裏面 needs a front to pair with. */
export function chooseSide(tray: ShotTray, side: ShotSide): ShotTray {
  if (side === "back" && !canShootBack(tray)) return tray;
  return { ...tray, side };
}

/** 裏なし: back to 表面 without a back for the current card. */
export function skipBack(tray: ShotTray): ShotTray {
  return { ...tray, side: "front" };
}

/** Adds one photo as the current side; a full tray (100) keeps the photo out. */
export function addShot(tray: ShotTray, image: PreparedBatchImage, id: string): ShotTray {
  if (remainingShots(tray) === 0) return tray;
  const front = tray.side === "back" ? openFront(tray) : null;
  if (front) return { shots: [...tray.shots, { cardId: front.cardId, id, image, side: "back" }], side: "front" };
  return { shots: [...tray.shots, { cardId: `card:${id}`, id, image, side: "front" }], side: tray.side === "back" ? "front" : tray.side };
}

/**
 * Adds album photos, each one a card front (同一管道), up to the limit; the same photo
 * picked twice is added once. Returns how many were left out by the limit.
 */
export function addFronts(tray: ShotTray, images: readonly { id: string; image: PreparedBatchImage }[]): { tray: ShotTray; leftOut: number } {
  const seen = new Set(tray.shots.map((shot) => shot.image.clientDigest));
  const fresh = images.filter(({ image }) => (seen.has(image.clientDigest) ? false : (seen.add(image.clientDigest), true)));
  const room = remainingShots(tray);
  const taken = fresh.slice(0, room);
  return {
    leftOut: fresh.length - taken.length,
    tray: { shots: [...tray.shots, ...taken.map(({ id, image }) => ({ cardId: `card:${id}`, id, image, side: "front" as const }))], side: "front" },
  };
}

/** Removes a photo; removing a front removes its back too (a back cannot stand alone). */
export function removeShot(tray: ShotTray, id: string): ShotTray {
  const target = tray.shots.find((shot) => shot.id === id);
  if (!target) return tray;
  const shots = tray.shots.filter((shot) => shot.id !== id && !(target.side === "front" && shot.cardId === target.cardId));
  const next = { shots, side: tray.side };
  return next.side === "back" && !canShootBack(next) ? { ...next, side: "front" } : next;
}

/** The photos as manifest images: each card's front, then its back (creationAttempt order). */
export function trayImages(tray: ShotTray): IngestCardImage[] {
  const fronts = tray.shots.filter((shot) => shot.side === "front");
  return fronts.flatMap((front) => {
    const back = tray.shots.find((shot) => shot.cardId === front.cardId && shot.side === "back");
    return [
      { ...front.image, cardId: front.cardId, side: "front" as const },
      ...(back ? [{ ...back.image, cardId: back.cardId, side: "back" as const }] : []),
    ];
  });
}

export function cardCount(tray: ShotTray): number {
  return tray.shots.filter((shot) => shot.side === "front").length;
}
