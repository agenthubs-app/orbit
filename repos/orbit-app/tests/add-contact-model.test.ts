import assert from "node:assert/strict";
import test from "node:test";

import type { PreparedBatchImage } from "../src/api/batch-images";
import { EMPTY_LEDGER, GUIDE_AUTO_SHOW_LIMIT, hideScanGuide, readScanGuide, recordScanGuideShown, setAddStorageAdapter, shouldAutoShowGuide } from "../src/screens/add/add-storage";
import { confirmedDraftContactId, pendingDraftRows, readAttribution } from "../src/screens/add/add-read";
import { createBody, defaultChoices, differingFields, duplicateCheckBody, EMPTY_MANUAL_FORM, eventChips, formDensity } from "../src/screens/add/manual-model";
import {
  autoEligible,
  buildScanView,
  confirmBlock,
  confirmBody,
  confirmTarget,
  initialEnrichment,
  issueGroupFor,
  metEventFor,
  type ScanBatchInput,
} from "../src/screens/add/scan-batch-model";
import { addFronts, addShot, canShootBack, cardCount, chooseSide, EMPTY_TRAY, remainingShots, removeShot, SCAN_MAX_PHOTOS, skipBack, trayImages } from "../src/screens/add/scan-capture-model";
import { reconcileBusinessCardReviewCard } from "../src/view-models/business-card-batch";
import { batchRoutePath, ingestCards } from "../src/view-models/business-card-ingest";
import { batch, candidate, detail, digestOf, extraction, item } from "./helpers/add-fixtures";

// R12 人脈を追加 (DESIGN §2.2, §2.3, §2.9): the App add screens' pure rules.

const image = (seed: string): PreparedBatchImage => ({ clientDigest: digestOf(seed), fileName: `${seed}.jpg`, mimeType: "image/jpeg", rawSize: 100, uri: `file:///${seed}.jpg` });

test("camera tray: 表面 starts a card, 裏面 pairs with the last front and returns to 表面, 裏なし skips", () => {
  let tray = addShot(EMPTY_TRAY, image("a"), "a");
  assert.equal(canShootBack(tray), true);
  tray = chooseSide(tray, "back");
  assert.equal(tray.side, "back");
  tray = addShot(tray, image("a-back"), "a-back");
  assert.equal(tray.side, "front", "after the back the camera is on 表面 again");
  assert.equal(canShootBack(tray), false, "a card has one back at most");
  assert.equal(chooseSide(tray, "back").side, "front", "裏面 needs a front to pair with");
  tray = addShot(tray, image("b"), "b");
  tray = skipBack(chooseSide(tray, "back"));
  assert.equal(tray.side, "front");
  const images = trayImages(tray);
  assert.deepEqual(images.map((entry) => [entry.cardId, entry.side]), [["card:a", "front"], ["card:a", "back"], ["card:b", "front"]]);
  assert.equal(cardCount(tray), 2);
  // Removing a front removes its back; the limit counts photos.
  const removed = removeShot(tray, "a");
  assert.deepEqual(removed.shots.map((shot) => shot.id), ["b"]);
  assert.equal(remainingShots(tray), SCAN_MAX_PHOTOS - 3);
});

test("camera tray: 100 photos at most; album picks are fronts, the same photo once", () => {
  const many = Array.from({ length: 120 }, (_, index) => ({ id: `p${index}`, image: image(`p${index}`) }));
  const { tray, leftOut } = addFronts(EMPTY_TRAY, many);
  assert.equal(tray.shots.length, SCAN_MAX_PHOTOS);
  assert.equal(leftOut, 20);
  assert.equal(addShot(tray, image("extra"), "extra"), tray, "a full tray keeps the photo out");
  const again = addFronts(EMPTY_TRAY, [{ id: "x", image: image("same") }, { id: "y", image: image("same") }]);
  assert.equal(again.tray.shots.length, 1);
});

test("はじめての方へ opens by itself the first three times and never after 次回から表示しない", async () => {
  const store = new Map<string, string>();
  setAddStorageAdapter({ getItem: async (key) => store.get(key) ?? null, setItem: async (key, value) => { store.set(key, value); } });
  try {
    let state = await readScanGuide();
    for (let visit = 1; visit <= GUIDE_AUTO_SHOW_LIMIT; visit += 1) {
      assert.equal(shouldAutoShowGuide(state), true, `visit ${visit}`);
      state = await recordScanGuideShown(state);
    }
    assert.equal(shouldAutoShowGuide(await readScanGuide()), false, "the 4th visit goes straight to the camera");
    const fresh = { hidden: false, shown: 0 };
    assert.equal(shouldAutoShowGuide(await hideScanGuide(fresh)), false);
  } finally {
    setAddStorageAdapter(null);
  }
});

function input(d: ReturnType<typeof detail>, extra: Partial<ScanBatchInput> = {}): ScanBatchInput {
  const cards = ingestCards(d);
  const drafts = Object.fromEntries(cards.map((card) => [card.cardId, reconcileBusinessCardReviewCard(card.items)]));
  const enrichment = Object.fromEntries(cards.map((card) => [card.cardId, initialEnrichment(card.items)]));
  return {
    attribution: { cards: {}, events: [] },
    autoAttempted: new Set(),
    autoRunning: false,
    detail: d,
    drafts,
    enrichment,
    ledger: EMPTY_LEDGER,
    loadFailed: false,
    matches: Object.fromEntries(cards.map((card) => [card.cardId, null])),
    matchesReady: true,
    now: Date.parse("2026-10-11T02:00:00.000Z"),
    selectedEventId: null,
    ...extra,
  };
}

const READY = batch("b1", "ready_for_review", 5);
const FOUR = detail(READY, [
  item("b1", "same", "front", 1, { extraction: extraction({ email: "sato@example.jp", name: "佐藤 健", organization: "ミライ精機" }) }),
  item("b1", "similar", "front", 2, { extraction: extraction({ name: "高橋 美咲", organization: "東邦テクノ" }) }),
  item("b1", "unread", "front", 3, { errorCode: "IMAGE_INVALID", errorStage: "ocr", extraction: null, status: "terminal_failed" }),
  item("b1", "clean", "front", 4, { extraction: extraction({ name: "石川 陽介", organization: "北辰製作所", title: "部長" }) }),
  item("b1", "clean", "back", 5, { extraction: extraction({ name: "石川 陽介", organization: "北辰製作所" }) }),
]);

test("automatic pass: clean cards import, an identical match merges, similar / 同名 / unreadable stay, each card once", () => {
  const matches = {
    clean: null,
    same: candidate("contact-sato", { displayName: "佐藤 健", email: "sato@example.jp", identical: true, matchedOn: ["email"], organization: "ミライ精機" }),
    similar: candidate("contact-takahashi", { displayName: "高橋 美咲", identical: false, matchedOn: ["name"] }),
  };
  const eligible = autoEligible(input(FOUR, { matches }));
  assert.deepEqual(eligible, [
    { action: "merge", cardId: "same", mergeInto: "contact-sato" },
    { action: "import", cardId: "clean", mergeInto: null },
  ]);
  // A card the pass already tried is never tried again (no double import).
  assert.deepEqual(autoEligible(input(FOUR, { autoAttempted: new Set(["same", "clean"]), matches })), []);
  // Nothing runs before the duplicate lookup and the event candidates are known.
  assert.deepEqual(autoEligible(input(FOUR, { matches, matchesReady: false })), []);
  assert.deepEqual(autoEligible(input(FOUR, { attribution: null, matches })), []);
  assert.deepEqual(autoEligible(input({ ...FOUR, batch: { ...READY, status: "processing" } }, { matches })), []);
});

test("W0015: a card with an event candidate is never added automatically; its 会った場所 is the batch choice", () => {
  const attribution = readAttribution({ cards: { clean: "event-cfo", similar: null }, events: [{ eventId: "event-cfo", startsAt: "2026-10-07T10:00:00.000Z", title: "CFO Night Tokyo" }, { eventId: "event-other", title: "Other" }] });
  const view = input(FOUR, { attribution });
  assert.deepEqual(autoEligible(view).map((entry) => entry.cardId), ["same", "similar"], "clean (event candidate) waits for the person");
  const built = buildScanView({ ...view, selectedEventId: "event-cfo" });
  assert.equal(built.cards.find((card) => card.cardId === "clean")?.section, "ready");
  assert.deepEqual(built.events.map((event) => event.eventId), ["event-cfo"], "only events some card points to");
  assert.equal(metEventFor("clean", attribution, "event-cfo"), "event-cfo");
  assert.equal(metEventFor("clean", attribution, null), null, "付けない");
  assert.equal(metEventFor("similar", attribution, "event-cfo"), null, "never another card's event");
});

test("まとめて確認: sections, issue groups, reading marks and the 完成 counts", () => {
  const matches = { clean: null, same: null, similar: candidate("contact-takahashi", { displayName: "高橋 美咲", matchedOn: ["name"] }) };
  const withIssue = detail(READY, FOUR.items.map((entry) => (entry.cardId === "same" ? { ...entry, reviewIssues: [{ code: "ORG_SUFFIX_MISSING", field: "organization", message: "" }] } : entry)));
  const view = buildScanView(input(withIssue, { autoAttempted: new Set(["clean", "same", "similar", "unread"]), matches }));
  const byId = Object.fromEntries(view.cards.map((card) => [card.cardId, card]));
  assert.equal(byId.similar!.section, "duplicate");
  assert.equal(byId.similar!.kind, "duplicate");
  assert.equal(byId.same!.section, "review");
  assert.equal(byId.same!.kind, "guess");
  assert.equal(byId.same!.issueGroup, "orgSuffix");
  assert.equal(byId.unread!.section, "failed");
  assert.equal(byId.unread!.failure, "image");
  assert.equal(byId.clean!.section, "ready");
  assert.equal(byId.clean!.twoSided, true);
  assert.deepEqual([view.counts.duplicate, view.counts.review, view.counts.failed], [1, 1, 1]);
  assert.equal(view.phase, "review");
  // 完成: confirmed cards split by the ledger; 読み取れず never counts as added.
  const done = detail({ ...READY, status: "completed" }, FOUR.items.map((entry) => {
    if (entry.cardId === "unread") return { ...entry, status: "skipped" as const };
    return { ...entry, confirmedContactId: `contact-${entry.cardId}`, status: "confirmed" as const };
  }));
  const finished = buildScanView(input(done, { ledger: { auto: ["clean", "same"], merged: ["same"], user: ["similar"] } }));
  assert.equal(finished.phase, "done");
  assert.deepEqual([finished.counts.created, finished.counts.merged, finished.counts.unreadable], [2, 1, 1]);
  assert.equal(finished.completed, true);
});

test("issue groups follow the existing codes; a two-sided conflict blocks the confirmation until picked", () => {
  const sides = detail(batch("b2", "ready_for_review", 2), [
    item("b2", "c", "front", 1, { extraction: extraction({ email: "a@example.jp", name: "森 恭平" }) }),
    item("b2", "c", "back", 2, { extraction: extraction({ email: "b@example.jp", name: "森 恭平" }) }),
  ]);
  const [card] = ingestCards(sides);
  const draft = reconcileBusinessCardReviewCard(card!.items);
  const enrichment = initialEnrichment(card!.items);
  assert.deepEqual(draft.unresolvedConflicts, ["email"]);
  assert.equal(issueGroupFor(card!, draft, enrichment), "sides");
  assert.equal(confirmBlock(draft, enrichment), "sides");
  assert.equal(confirmBlock({ ...draft, fields: { ...draft.fields, displayName: " " } }, enrichment), "name");
  const industries = detail(batch("b3", "ready_for_review", 2), [
    item("b3", "i", "front", 1, { extraction: extraction({ industry: "manufacturing_supply_chain", name: "A" }) }),
    item("b3", "i", "back", 2, { extraction: extraction({ industry: "finance_investment", name: "A" }) }),
  ]);
  const both = initialEnrichment(industries.items);
  assert.equal(both.industry.conflicted, true);
  assert.equal(confirmBlock(reconcileBusinessCardReviewCard(industries.items), both), "enrichment");
});

test("confirmation body: the old review fields + card snapshot, merge target, W0015 event and agreed W0045 values", () => {
  const [, , , clean] = ingestCards(FOUR);
  const draft = reconcileBusinessCardReviewCard(clean!.items);
  const body = confirmBody(clean!, draft, initialEnrichment(clean!.items), "intent-1", { mergeInto: "contact-x", metEventId: "event-cfo" });
  assert.equal(body.displayName, "石川 陽介");
  assert.equal(body.confirmationIntentId, "intent-1");
  assert.equal(body.mergeIntoContactId, "contact-x");
  assert.equal(body.metEventId, "event-cfo");
  assert.equal(body.allowDuplicate, false);
  assert.deepEqual((body.expectedCardItems as { itemId: string }[]).map((entry) => entry.itemId), ["b1:item:4", "b1:item:5"]);
  assert.deepEqual(confirmTarget(clean!), { itemId: "b1:item:4", manual: false });
  const [, , unread] = ingestCards(FOUR);
  assert.deepEqual(confirmTarget(unread!), { itemId: "b1:item:3", manual: true }, "手入力で補う uses manual-entry");
  const separate = confirmBody(clean!, draft, initialEnrichment(clean!.items), "intent-2", { allowDuplicate: true });
  assert.equal(separate.allowDuplicate, true);
  assert.equal("mergeIntoContactId" in separate, false);
});

test("old batch links: a v2 batch opens the new batch page, a v1 batch the scan page", () => {
  assert.equal(batchRoutePath("current", "batch:/ 空"), "/contacts/new/scan/batch%3A%2F%20%E7%A9%BA");
  assert.equal(batchRoutePath("legacy", "batch:/ 空"), "/contacts/new/scan?from=legacy");
});

test("手入力: a name alone is checked; 統合 lists only differing fields; the bodies follow the decision", () => {
  assert.equal(duplicateCheckBody(EMPTY_MANUAL_FORM), null);
  assert.deepEqual(duplicateCheckBody({ ...EMPTY_MANUAL_FORM, displayName: " 石川 陽介 " }), { displayName: "石川 陽介" });
  const form = { ...EMPTY_MANUAL_FORM, displayName: "石川 陽介", organization: "ミライ精機", email: "ishikawa@example.jp", role: "" };
  const existing = candidate("contact-ishikawa", { displayName: "石川 洋介", organization: "ミライ精機", role: "生産技術部" });
  const fields = differingFields(existing, form);
  assert.deepEqual(fields, ["displayName"], "same company and an empty role are not asked");
  assert.deepEqual(createBody(form, { choices: defaultChoices(fields), contactId: "contact-ishikawa", kind: "merge" }, "k1"), {
    displayName: "石川 陽介", email: "ishikawa@example.jp", fieldChoices: { displayName: "incoming" }, idempotencyKey: "k1", mergeIntoContactId: "contact-ishikawa", organization: "ミライ精機",
  });
  assert.deepEqual(createBody(form, { kind: "separate" }, "k2").allowDuplicate, true);
  assert.equal(formDensity({ ...EMPTY_MANUAL_FORM, displayName: "A" }), 1);
  assert.equal(formDensity({ ...form, met: { eventId: "e", kind: "event" } }), 2);
  const chips = eventChips([{ id: "far", startsAt: "2026-12-30T00:00:00Z", title: "Far" }, { id: "near", startsAt: "2026-10-07T10:00:00Z", title: "CFO Night" }, { id: "x" }], new Date("2026-10-11T00:00:00Z"));
  assert.deepEqual(chips.map((chip) => chip.eventId), ["near"]);
});

test("draft queue: only drafts still waiting; a confirmed draft names its contact when one was written", () => {
  const rows = pendingDraftRows({ drafts: [
    { id: "d1", status: "pending_confirmation", confirmation: { state: "pending" }, displayName: "林 悦", organization: "星野", role: "", source: { label: "CFO Night" }, createdAt: "2026-10-10T00:00:00Z" },
    { id: "d2", status: "confirmed", displayName: "done" },
    { displayName: "no id" },
  ] });
  assert.deepEqual(rows.map((row) => [row.id, row.sourceLabel]), [["d1", "CFO Night"]]);
  assert.equal(confirmedDraftContactId({ contactCandidate: { contactId: "contact-1" } }), "contact-1");
  assert.equal(confirmedDraftContactId({ contactCandidate: {} }), null);
});
