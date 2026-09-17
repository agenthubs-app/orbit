import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createInitialPairing,
  freezeManifestSubmission,
  pairingManifest,
  pairPhotoAsBack,
  removePairingPhoto,
  unpairBackPhoto,
  type PairingPhoto,
} from "../../app/(app)/app/contacts/new/batch2/ingest-v2-route-view-model";

const startSource = readFileSync(
  "app/(app)/app/contacts/new/batch2/business-card-ingest-v2-start.tsx",
  "utf8",
);

function photo(id: string): PairingPhoto {
  return {
    id,
    fileName: `${id}.jpg`,
    mimeType: "image/jpeg",
    rawSize: 10,
    clientDigest: `sha256:${id.padEnd(64, "0").slice(0, 64)}`,
  };
}

test("new photos start as separate explicit cards and never auto-pair", () => {
  const cards = createInitialPairing([photo("front-a"), photo("back-a"), photo("front-b")], (entry) => `card:${entry.id}`);
  assert.deepEqual(cards.map((card) => [card.cardId, card.front.id, card.back?.id ?? null]), [
    ["card:front-a", "front-a", null],
    ["card:back-a", "back-a", null],
    ["card:front-b", "front-b", null],
  ]);
});

test("pairing a selected photo moves it to the selected card back and preserves card identity", () => {
  const initial = createInitialPairing([photo("front-a"), photo("back-a"), photo("front-b")], (entry) => `card:${entry.id}`);
  const paired = pairPhotoAsBack(initial, "back-a", "card:front-a");
  assert.deepEqual(pairingManifest(paired).map(({ cardId, side, seq }) => ({ cardId, side, seq })), [
    { cardId: "card:front-a", side: "front", seq: 1 },
    { cardId: "card:front-a", side: "back", seq: 2 },
    { cardId: "card:front-b", side: "front", seq: 3 },
  ]);
  assert.equal(paired.find((card) => card.cardId === "card:front-a")?.back?.id, "back-a");
});

test("an occupied back or same-card selection is a no-op instead of guessing", () => {
  const cards = createInitialPairing([photo("a"), photo("b"), photo("c")], (entry) => `card:${entry.id}`);
  const paired = pairPhotoAsBack(cards, "b", "card:a");
  assert.deepEqual(pairPhotoAsBack(paired, "c", "card:a"), paired);
  assert.deepEqual(pairPhotoAsBack(paired, "a", "card:a"), paired);
  assert.deepEqual(pairPhotoAsBack(paired, "a", "card:c"), paired);
});

test("moving an existing back preserves its original front and never drops a photo", () => {
  const initial = createInitialPairing([photo("a"), photo("b"), photo("c")], (entry) => `card:${entry.id}`);
  const paired = pairPhotoAsBack(initial, "b", "card:a");
  const moved = pairPhotoAsBack(paired, "b", "card:c");
  assert.deepEqual(moved.map((card) => [card.front.id, card.back?.id ?? null]), [
    ["a", null],
    ["c", "b"],
  ]);
});

test("unpairing and removing a photo retain the remaining images without re-pairing", () => {
  const cards = createInitialPairing([photo("front"), photo("back"), photo("other")], (entry) => `card:${entry.id}`);
  const paired = pairPhotoAsBack(cards, "back", "card:front");
  const unpaired = unpairBackPhoto(paired, "card:front", (entry) => `new:${entry.id}`);
  assert.deepEqual(unpaired.map((card) => [card.front.id, card.back?.id ?? null]), [
    ["front", null],
    ["back", null],
    ["other", null],
  ]);
  assert.deepEqual(removePairingPhoto(paired, "back").map((card) => [card.front.id, card.back?.id ?? null]), [
    ["front", null],
    ["other", null],
  ]);
});

test("a frozen manifest keeps card sides, sequence and idempotency key for retries", () => {
  const cards = pairPhotoAsBack(
    createInitialPairing([photo("front"), photo("back")], (entry) => `card:${entry.id}`),
    "back",
    "card:front",
  );
  const frozen = freezeManifestSubmission(cards, "intent:one");
  assert.equal(frozen.idempotencyKey, "intent:one");
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(Object.isFrozen(frozen.manifest), true);
  assert.throws(() => (frozen.manifest as unknown as Array<unknown>).push({}), TypeError);
  assert.deepEqual(frozen.manifest.map(({ cardId, side }) => ({ cardId, side })), [
    { cardId: "card:front", side: "front" },
    { cardId: "card:front", side: "back" },
  ]);
});

test("frozen pairing cannot be unlocked while a request is in flight and slot pickers are keyboard reachable", () => {
  assert.match(startSource, /bci-adjust-pairing[\s\S]{0,220}disabled=\{preparing\}/u);
  assert.match(startSource, /if \(preparing \|\| startBusyRef\.current\) return;/u);
  assert.match(startSource, /role="button"/u);
  assert.match(startSource, /tabIndex=\{controlsDisabled \? -1 : 0\}/u);
  assert.match(startSource, /event\.key === "Enter" \|\| event\.key === " "/u);
});

test("pairing slot filenames keep a wrapping column while actions move below", () => {
  assert.match(startSource, /\.bci-slot \{[^}]*grid-template-columns: 42px minmax\(0, 1fr\);/u);
  assert.match(startSource, /\.bci-slot-actions \{[^}]*grid-column: 2;[^}]*grid-row: 2;/u);
  assert.equal((startSource.match(/sizes="52px"/gu) ?? []).length, 2);
});

test("batch navigation preserves the active language query", () => {
  assert.match(startSource, /const \{ preserveHref, t \} = useOrbitLanguage\(\);/u);
  assert.match(startSource, /router\.push\(preserveHref\(`/u);
});
