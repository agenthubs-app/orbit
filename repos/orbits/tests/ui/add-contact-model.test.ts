import assert from "node:assert/strict";
import test from "node:test";

import { resolveAddContactRoute } from "../../app/(app)/app/contacts/new/_add/add-route";
import { buildScanBatchView } from "../../app/(app)/app/contacts/new/_add/scan-batch-view";
import { initialCardDraft, groupIngestItemsByCardId } from "../../app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model";
import { ADD_INVITE_DOOR_ENABLED, ADD_OTHER_DOORS } from "../../app/(app)/app/orbit-2026/add/AddContactDoors";
import { addSearchFor } from "../../app/(app)/app/orbit-2026/add/AddContactScreen";
import {
  EMPTY_MANUAL_FORM,
  applySignature,
  createBody,
  differingFields,
  duplicateCheckBody,
  eventChips,
  formDensity,
  signatureRuns,
} from "../../app/(app)/app/orbit-2026/add/manual-model";
import {
  addPhotos,
  canPairWithPrevious,
  isScanImage,
  pairWithPrevious,
  photoCount,
  recordScanGuideVisit,
  scanGuideOpen,
  unpairBack,
  type StagedPhoto,
} from "../../app/(app)/app/orbit-2026/add/upload-model";
import { splitSignature } from "../../shared/compute/signature-split";
import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import type { IngestContactCandidateContract } from "../../shared/contract/business-card-batch";

// R12 Web 人脈を追加: the pure rules behind the doors page, the 手入力 drawer, the scan
// upload and the batch view (DESIGN §2.1–§2.3, §7).

test("old links: ?job= and ?method=scan go to the new scan pages; その他 keeps the old import until R16", () => {
  assert.deepEqual(resolveAddContactRoute({ job: "batch-9" }), { kind: "redirect", href: "/app/contacts/new/scan/batch-9" });
  assert.deepEqual(resolveAddContactRoute({ job: "batch-9", lang: "en" }), { kind: "redirect", href: "/app/contacts/new/scan/batch-9?lang=en" });
  assert.deepEqual(resolveAddContactRoute({ method: "scan" }), { kind: "redirect", href: "/app/contacts/new/scan" });
  assert.deepEqual(resolveAddContactRoute({ method: "scan", job: "b1" }), { kind: "redirect", href: "/app/contacts/new/scan/b1" });
  assert.deepEqual(resolveAddContactRoute({ method: "csv" }), { kind: "legacy", method: "csv" });
  assert.deepEqual(resolveAddContactRoute({ method: "contacts", import: "imp-1" }), { kind: "legacy", method: "contacts", importId: "imp-1" });
  assert.deepEqual(resolveAddContactRoute({ method: "event" }), { kind: "legacy", method: "event" });
  assert.deepEqual(resolveAddContactRoute({ import: "imp-2" }), { kind: "legacy", method: "csv", importId: "imp-2" });
  assert.deepEqual(resolveAddContactRoute({}), { kind: "doors", manual: false, invite: false });
  assert.deepEqual(resolveAddContactRoute({ add: "manual" }), { kind: "doors", manual: true, invite: false });
  // R15: ?add=invite opens the 招待コード dialog.
  assert.deepEqual(resolveAddContactRoute({ add: "invite" }), { kind: "doors", manual: false, invite: true });
  assert.deepEqual(resolveAddContactRoute({ method: "unknown" }), { kind: "doors", manual: false, invite: false });
});

test("doors: 招待コード open since R15; the four その他 doors point at the old import", () => {
  assert.equal(ADD_INVITE_DOOR_ENABLED, true);
  assert.deepEqual(ADD_OTHER_DOORS.map((door) => door.href), [
    "/app/contacts/new?method=contacts",
    "/app/contacts/new?method=csv",
    "/app/contacts/new?method=csv",
    "/app/contacts/new?method=event",
  ]);
  assert.equal(addSearchFor("?lang=en", true), "?lang=en&add=manual");
  assert.equal(addSearchFor("?lang=en&add=manual", false), "?lang=en");
  assert.equal(addSearchFor("", false), "");
  assert.equal(addSearchFor("?lang=en", "invite"), "?lang=en&add=invite");
  assert.equal(addSearchFor("?add=invite", null), "");
  assert.equal(addSearchFor("?add=manual", "invite"), "?add=invite");
});

const candidate = (patch: Partial<IngestContactCandidateContract>): IngestContactCandidateContract => ({
  address: "", contactId: "c-1", displayName: "", email: "", identical: false, matchedOn: ["name"], organization: "", phone: "", role: "", ...patch,
});

test("手入力: the duplicate check needs only a name; empty fields are not sent", () => {
  assert.equal(duplicateCheckBody(EMPTY_MANUAL_FORM), null);
  assert.equal(duplicateCheckBody({ ...EMPTY_MANUAL_FORM, displayName: "   " }), null);
  assert.deepEqual(duplicateCheckBody({ ...EMPTY_MANUAL_FORM, displayName: " 石川 陽介 " }), { displayName: "石川 陽介" });
  assert.deepEqual(duplicateCheckBody({ ...EMPTY_MANUAL_FORM, displayName: "石川 陽介", organization: "ミライ精機", email: " y@m.example " }), { displayName: "石川 陽介", email: "y@m.example", organization: "ミライ精機" });
});

test("手入力: 統合 lists only the fields that differ, and the save body carries the choices", () => {
  const form = { ...EMPTY_MANUAL_FORM, displayName: "石川　陽介", organization: "ミライ精機株式会社", role: "部長", email: "", phone: "03-1234-5678" };
  const existing = candidate({ displayName: "石川 陽介", organization: "ミライ精機", role: "", email: "y@m.example", phone: "0312345678" });
  // Same name after normalising (full-width space), same phone digits; role / email empty on one side.
  assert.deepEqual(differingFields(existing, form), ["organization"]);
  const body = createBody(form, { kind: "merge", contactId: "c-1", choices: { organization: "existing" } }, "key-1");
  assert.deepEqual(body, { displayName: "石川　陽介", fieldChoices: { organization: "existing" }, idempotencyKey: "key-1", mergeIntoContactId: "c-1", organization: "ミライ精機株式会社", phone: "03-1234-5678", role: "部長" });
  assert.equal(createBody(form, { kind: "separate" }, "key-2").allowDuplicate, true);
  const withMet = createBody({ ...form, met: { kind: "intro", label: " 鈴木さん " } }, { kind: "none" }, "k");
  assert.deepEqual(withMet.metContext, { kind: "intro", label: "鈴木さん" });
  assert.equal(withMet.allowDuplicate, undefined);
});

test("手入力: a pasted signature fills the empty fields, keeps what was typed, and highlights the original", () => {
  const text = "石川 陽介\n石川デザイン事務所 代表\n〒150-0001 東京都渋谷区神宮前1-2-3\nTEL 03-1234-5678\nyosuke@ishikawa-design.example";
  const spans = splitSignature(text);
  const filled = applySignature({ ...EMPTY_MANUAL_FORM, organization: "自分で入力" }, spans);
  assert.equal(filled.displayName, "石川 陽介");
  assert.equal(filled.organization, "自分で入力");
  assert.equal(filled.email, "yosuke@ishikawa-design.example");
  assert.equal(filled.phone, "03-1234-5678");
  assert.match(filled.note, /150-0001/);
  const runs = signatureRuns(text, spans);
  assert.equal(runs.map((run) => run.text).join(""), text);
  assert.ok(runs.some((run) => run.field === "email" && run.text === "yosuke@ishikawa-design.example"));
  assert.ok(runs.some((run) => run.field === "phone"));
});

test("手入力: event chips are the person's events within 30 days, nearest first; density preview", () => {
  const now = new Date("2026-10-11T03:00:00Z");
  const chips = eventChips([
    { id: "far", title: "Far", startsAt: "2026-12-01T00:00:00Z" },
    { id: "last-week", title: "CFO Night", startsAt: "2026-10-07T10:00:00Z" },
    { id: "tomorrow", title: "製造業DX", startsAt: "2026-10-12T01:00:00Z" },
    { id: 3, title: "bad" },
  ], now);
  // R12 review M3: only events that have started (an upcoming one is not 「会った場所」 yet — the plan would count it as attended).
  assert.deepEqual(chips.map((chip) => chip.eventId), ["last-week"]);
  assert.equal(formDensity({ ...EMPTY_MANUAL_FORM, displayName: "A" }), 1);
  assert.equal(formDensity({ ...EMPTY_MANUAL_FORM, displayName: "A", email: "a@b.example", met: { kind: "intro" } }), 2);
});

const photo = (id: string, name = `${id}.jpg`): StagedPhoto => ({ id, file: { name, size: 1, type: "image/jpeg" } as File, url: `blob:${id}` });

test("名刺 upload: one photo one card, up to the limit; a back is paired with the card before it", () => {
  assert.equal(isScanImage({ name: "a.HEIC", type: "" }), true);
  assert.equal(isScanImage({ name: "a.pdf", type: "application/pdf" }), false);
  const added = addPhotos([], [photo("a"), photo("b"), photo("c")], 2);
  assert.equal(added.dropped, 1);
  assert.equal(photoCount(added.cards), 2);
  assert.equal(canPairWithPrevious(added.cards, "a"), false);
  assert.equal(canPairWithPrevious(added.cards, "b"), true);
  const paired = pairWithPrevious(added.cards, "b");
  assert.equal(paired.length, 1);
  assert.equal(paired[0]!.back?.id, "b");
  assert.equal(photoCount(paired), 2);
  assert.deepEqual(unpairBack(paired, "a").map((card) => card.id), ["a", "b"]);
});

test("はじめての方へ: open on the first three visits, then one line; storage that throws counts as new", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
  const seen = [1, 2, 3, 4, 5].map(() => scanGuideOpen(recordScanGuideVisit(storage)));
  assert.deepEqual(seen, [true, true, true, false, false]);
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => undefined };
  assert.equal(scanGuideOpen(recordScanGuideVisit(broken)), true);
});

function item(patch: Partial<IngestItemDTO> & { id: string; cardId: string }): IngestItemDTO {
  return {
    attemptCount: 1, batchId: "b1", cardIdentityExplicit: true, clientDigest: `d-${patch.id}`, confirmedContactId: null, createdAt: "2026-10-11T00:00:00Z",
    derivativeObjectKey: "k", derivativeSize: 1, errorCode: null, errorStage: null, extraction: null, extractionSchemaVersion: 3, idempotencyKey: "",
    imageDigest: `sha256:${patch.id}`, leaseExpiresAt: null, nextRetryAt: null, rawMimeType: "image/jpeg", rawSize: 1, reviewIssues: [], seq: 1, side: "front",
    sourceFileName: `${patch.id}.jpg`, status: "extracted", updatedAt: "2026-10-11T00:00:00Z", usage: null, version: 1, ...patch,
  } as IngestItemDTO;
}

const extraction = (name: string, organization = "ミライ精機株式会社") => ({
  addresses: [], certifications: [], contactPoints: [], departments: [], detectedLanguages: ["ja"], emails: [], fullName: name, nativeFullName: name,
  organization, romanizedFullName: null, title: "部長", website: null,
});

test("batch view: sections, the three tiles and the 完成 counts (unreadable never counts as added)", () => {
  const items = [
    item({ id: "auto", cardId: "c-auto", seq: 1, status: "confirmed", confirmedContactId: "p1", extraction: extraction("高山 亮") }),
    item({ id: "dup", cardId: "c-dup", seq: 2, extraction: extraction("高橋 美咲") }),
    item({ id: "guess", cardId: "c-guess", seq: 3, extraction: extraction("松本 千尋"), reviewIssues: [{ code: "ORG_SUFFIX_MISSING", field: "organization" }] as unknown as IngestItemDTO["reviewIssues"] }),
    item({ id: "fail", cardId: "c-fail", seq: 4, status: "terminal_failed", errorCode: "IMAGE_INVALID" }),
    item({ id: "held", cardId: "c-held", seq: 5, extraction: extraction("伊達 修平") }),
  ];
  const cards = groupIngestItemsByCardId(items);
  const drafts = Object.fromEntries(cards.filter((card) => card.reviewable).map((card) => [card.cardId, initialCardDraft(card)]));
  const pending = cards.filter((card) => card.cardId !== "c-auto");
  const view = buildScanBatchView({
    attributed: {}, attribution: { cards: { "c-held": "ev-1" }, events: [{ eventId: "ev-1", startsAt: "2026-10-07T10:00:00Z", title: "CFO Night" }, { eventId: "ev-x", startsAt: "", title: "other" }] },
    attributionDecisions: {}, autoCount: 1, autoPending: false, autoRunning: false, batchId: "b1", cards,
    detail: { batch: { createdAt: "2026-10-11T00:00:00Z" }, items } as never,
    drafts, duplicates: new Set(["c-dup"]), finished: false, loadFailed: false,
    matches: { "c-dup": candidate({ contactId: "p9", displayName: "高橋 美咲", matchedOn: ["email"] }) },
    mergedCount: 0, missing: 0, pending, queue: pending, reviewing: true, settledCount: 5, stage: "review", status: "ready_for_review", uploadFailed: false, userCount: 0,
  });
  assert.equal(view.phase, "review");
  const section = Object.fromEntries(view.cards.map((card) => [card.cardId, card.section]));
  assert.deepEqual(section, { "c-auto": null, "c-dup": "duplicate", "c-fail": "failed", "c-guess": "review", "c-held": "ready" });
  assert.equal(view.cards.find((card) => card.cardId === "c-guess")!.issueGroup, "orgSuffix");
  assert.equal(view.cards.find((card) => card.cardId === "c-fail")!.failure, "image");
  assert.deepEqual(view.counts, { asIs: 2, autoAdded: 1, created: 1, duplicate: 1, failed: 1, held: 1, merged: 0, review: 1, unreadable: 1 });
  // Only events that are some card's candidate; chosen by default (decision not made = on).
  assert.deepEqual(view.events.map((event) => event.eventId), ["ev-1"]);
  assert.equal(view.selectedEventId, "ev-1");
  const kinds = Object.fromEntries(view.cards.map((card) => [card.cardId, card.kind]));
  assert.deepEqual(kinds, { "c-auto": "added", "c-dup": "duplicate", "c-fail": "failed", "c-guess": "guess", "c-held": "ready" });
});
