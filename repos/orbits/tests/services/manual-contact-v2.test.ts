import assert from "node:assert/strict";
import test from "node:test";

import { findCardDuplicateCandidate } from "../../features/contacts/contact-duplicate-candidates";
import { createMemoryManualContactV2Storage } from "../../features/contacts/manual-contact-v2/configured";
import {
  createManualContactV2Service,
  ManualContactV2Error,
  MANUAL_CONTACT_UNDO_WINDOW_MS,
  type ManualContactPlanMatchPort,
} from "../../features/contacts/manual-contact-v2/service";
import type { ManualContactCreateInput } from "../../shared/contract/manual-contact";
import type { LiveRecord } from "../../shared/storage/live-record-store";

const WS = "workspace:manual-test";
const ALICE = "actor:alice";
const BOB = "actor:bob";
const T0 = "2026-10-01T00:00:00.000Z";

function contact(id: string, owner: string, payload: Record<string, unknown>, updatedAt = T0): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: "contacts",
    createdAt: T0,
    evidenceIds: ["evidence:seed"],
    lifecycleState: "active",
    payload: { id, stage: "captured", source: { id: "seed", type: "business_card_ocr" }, evidenceIds: ["evidence:seed"], createdAt: T0, updatedAt, ...payload },
    recordId: id,
    sourceId: "seed",
    sourceType: "business_card_ocr",
    updatedAt,
    userId: owner,
    workspaceId: WS,
  };
}

function harness(seed: LiveRecord<Record<string, unknown>>[] = [], start = "2026-10-11T03:00:00.000Z") {
  let now = new Date(start);
  const enqueued: string[] = [];
  const cancelled: string[] = [];
  const planMatch: ManualContactPlanMatchPort = {
    async cancel({ contactId }) { cancelled.push(contactId); },
    async enqueue({ contactId }) { enqueued.push(contactId); },
  };
  const storage = createMemoryManualContactV2Storage({ planMatch, workspaceId: WS });
  for (const record of seed) storage.store.upsertRecord(record);
  const service = createManualContactV2Service({ log: () => undefined, now: () => now, storage });
  return {
    advance(ms: number) { now = new Date(now.getTime() + ms); },
    cancelled,
    enqueued,
    service,
    store: storage.store,
    async get(id: string, includeDeleted = false) {
      return storage.store.getRecord({ collectionName: "contacts", includeDeleted, recordId: id, workspaceId: WS });
    },
  };
}

const input = (overrides: Partial<ManualContactCreateInput> = {}): ManualContactCreateInput => ({ displayName: "山田 太郎", idempotencyKey: `key:${JSON.stringify(overrides)}`, ...overrides });

const isError = (code: string) => (error: unknown) => error instanceof ManualContactV2Error && error.code === code;

test("a name alone is enough to save; an empty name is rejected", async () => {
  const h = harness();
  const created = await h.service.create(ALICE, input());
  assert.equal(created.outcome, "created");
  assert.equal(created.undoUntil, new Date(Date.parse("2026-10-11T03:00:00.000Z") + MANUAL_CONTACT_UNDO_WINDOW_MS).toISOString());
  const saved = (await h.get(created.contactId!))!;
  assert.equal(saved.userId, ALICE);
  assert.equal(saved.payload.displayName, "山田 太郎");
  assert.equal(saved.payload.createdVia, "manual_v2");
  assert.equal(saved.sourceType, "manual");
  assert.deepEqual(saved.payload.source, { id: saved.payload.source && (saved.payload.source as { id: string }).id, label: "Manual entry", type: "manual" });
  await assert.rejects(h.service.create(ALICE, input({ displayName: "   " })), isError("INVALID"));
});

test("met context: an event writes metEventId; intro / other and the note go into the contact note", async () => {
  const h = harness();
  const event = await h.service.create(ALICE, input({ displayName: "A", metContext: { eventId: "event:expo", kind: "event", label: "Japan IT Week" } }));
  const a = (await h.get(event.contactId!))!.payload;
  assert.equal(a.metEventId, "event:expo");
  assert.equal(a.metEventTitle, "Japan IT Week");
  assert.equal(a.notes, undefined);
  const intro = await h.service.create(ALICE, input({ displayName: "B", metContext: { kind: "intro", label: "佐藤さん" }, note: "来月また連絡" }));
  assert.equal((await h.get(intro.contactId!))!.payload.notes, "出会い：紹介（佐藤さん）\n来月また連絡");
  const other = await h.service.create(ALICE, input({ displayName: "C", metContext: { kind: "other", label: "大学の同窓会" } }));
  assert.equal((await h.get(other.contactId!))!.payload.notes, "出会い：大学の同窓会");
});

test("duplicates use the business-card rule (email / phone / name + company), and identical ones are never auto-merged", async () => {
  const h = harness([contact("c:sato", ALICE, { displayName: "佐藤 健", organization: "Cloudline", primaryEmail: "ken@cloudline.jp" })]);
  const byEmail = await h.service.create(ALICE, input({ displayName: "Ken Sato", email: "KEN@cloudline.jp" }));
  assert.equal(byEmail.outcome, "duplicate_review");
  assert.equal(byEmail.candidates?.[0]?.contactId, "c:sato");
  assert.deepEqual(byEmail.candidates?.[0]?.matchedOn, ["email"]);
  const identical = await h.service.create(ALICE, input({ displayName: "佐藤 健", email: "ken@cloudline.jp", organization: "Cloudline" }));
  assert.equal(identical.outcome, "duplicate_review", "manual entry does not merge on its own even when identical");
  assert.deepEqual(identical.candidates?.[0]?.matchedOn, ["email", "name_organization"]);
  assert.equal((await h.service.checkDuplicates(ALICE, { displayName: "佐藤健", organization: "Cloudline" })).candidates[0]?.contactId, "c:sato");
  assert.equal(h.enqueued.length, 0, "nothing was written");
});

test("same-name rule: name only ↔ a card with details, and name + company ↔ a name-only contact", async () => {
  // 只填名字 → 之后拍了同名名片：名片 v2 duplicates 能查到这个人。
  const h = harness();
  const nameOnly = await h.service.create(ALICE, input({ displayName: "高橋 花子" }));
  const records = await h.store.listRecords({ collectionName: "contacts", limit: 100, workspaceId: WS });
  const card = { address: "", displayName: "高橋　花子", email: "hanako@tt.jp", organization: "Tokyo Trading", phone: "", role: "" };
  const fromCard = findCardDuplicateCandidate(records, ALICE, card);
  assert.equal(fromCard?.contactId, nameOnly.contactId);
  assert.deepEqual(fromCard?.matchedOn, ["name"]);
  assert.equal(fromCard?.identical, false);

  // 名字 + 公司 → 人脈里有只填了名字的同名人：提示。
  const h2 = harness([contact("c:only-name", ALICE, { displayName: "John Smith" })]);
  const result = await h2.service.create(ALICE, input({ displayName: "john  smith", organization: "Acme" }));
  assert.equal(result.outcome, "duplicate_review");
  assert.deepEqual(result.candidates?.map((c) => [c.contactId, c.matchedOn, c.identical]), [["c:only-name", ["name"], false]]);

  // 两边都有公司且不同：同名不提示（交给 findContactCandidate）。
  const h3 = harness([contact("c:other", ALICE, { displayName: "John Smith", organization: "Beta" })]);
  assert.deepEqual((await h3.service.checkDuplicates(ALICE, { displayName: "John Smith", organization: "Acme" })).candidates, []);
});

test("candidates are capped at three, the strongest first", async () => {
  const seed = [
    contact("c:strong", ALICE, { displayName: "田中 一", primaryPhone: "090-1234-5678", organization: "X" }),
    ...[1, 2, 3, 4].map((n) => contact(`c:name${n}`, ALICE, { displayName: "田中 一" }, `2026-10-0${n}T00:00:00.000Z`)),
  ];
  const h = harness(seed);
  const { candidates } = await h.service.checkDuplicates(ALICE, { displayName: "田中一", phone: "09012345678" });
  assert.equal(candidates.length, 3);
  assert.equal(candidates[0]!.contactId, "c:strong");
  assert.deepEqual(candidates.slice(1).map((c) => c.contactId), ["c:name4", "c:name3"]);
});

test("allowDuplicate saves a separate person; the plan-match job is enqueued", async () => {
  const h = harness([contact("c:only-name", ALICE, { displayName: "John Smith" })]);
  const created = await h.service.create(ALICE, input({ allowDuplicate: true, displayName: "John Smith" }));
  assert.equal(created.outcome, "created");
  assert.notEqual(created.contactId, "c:only-name");
  assert.deepEqual(h.enqueued, [created.contactId]);
});

test("merge writes field by field: chosen values overwrite (old values go to history), others only fill blanks", async () => {
  const h = harness([contact("c:sato", ALICE, { displayName: "佐藤 健", organization: "Cloudline", role: "部長", primaryEmail: "ken@cloudline.jp" })]);
  const merged = await h.service.create(ALICE, input({
    displayName: "佐藤 健",
    email: "ken@new.jp",
    fieldChoices: { email: "existing", organization: "incoming" },
    mergeIntoContactId: "c:sato",
    metContext: { eventId: "event:expo", kind: "event" },
    note: "名刺を忘れた",
    organization: "Nexa",
    phone: "03-1111-2222",
    role: "CTO",
  }));
  assert.deepEqual(merged, { contactId: "c:sato", outcome: "merged" });
  const payload = (await h.get("c:sato"))!.payload;
  assert.equal(payload.organization, "Nexa", "chose incoming");
  assert.equal(payload.primaryEmail, "ken@cloudline.jp", "chose existing");
  assert.equal(payload.role, "部長", "not chosen and not blank: unchanged (not overwritten wholesale)");
  assert.equal(payload.primaryPhone, "03-1111-2222", "not chosen and blank: filled");
  assert.equal(payload.metEventId, "event:expo");
  assert.equal(payload.notes, "名刺を忘れた");
  assert.deepEqual((payload.fieldHistory as Array<{ field: string; previous: string | null }>).map((e) => [e.field, e.previous]), [["organization", "Cloudline"], ["phone", null]]);
  assert.deepEqual(h.enqueued, ["c:sato"]);
});

test("merging into someone else's contact is not found and changes nothing", async () => {
  const h = harness([contact("c:bob", BOB, { displayName: "佐藤 健", organization: "Cloudline" })]);
  await assert.rejects(h.service.create(ALICE, input({ fieldChoices: { organization: "incoming" }, mergeIntoContactId: "c:bob", organization: "Hack" })), isError("NOT_FOUND"));
  assert.equal((await h.get("c:bob"))!.payload.organization, "Cloudline");
});

test("other people's contacts never show up as candidates or company suggestions", async () => {
  const h = harness([contact("c:bob", BOB, { displayName: "山田 太郎", organization: "Acme" })]);
  assert.deepEqual((await h.service.checkDuplicates(ALICE, { displayName: "山田 太郎" })).candidates, []);
  assert.deepEqual((await h.service.suggestOrganizations(ALICE, "ac")).organizations, []);
  assert.equal((await h.service.create(ALICE, input())).outcome, "created");
});

test("idempotency: the same key replays the first result; the same key with other content is a conflict", async () => {
  const h = harness();
  const first = await h.service.create(ALICE, input({ idempotencyKey: "k1", organization: "Acme" }));
  h.advance(1000);
  const replay = await h.service.create(ALICE, input({ idempotencyKey: "k1", organization: "Acme" }));
  assert.deepEqual(replay, first);
  assert.equal((await h.store.listRecords({ collectionName: "contacts", limit: 10, workspaceId: WS })).length, 1);
  assert.deepEqual(h.enqueued, [first.contactId], "replay does not enqueue again");
  await assert.rejects(h.service.create(ALICE, input({ idempotencyKey: "k1", organization: "Other" })), isError("IDEMPOTENCY_CONFLICT"));
  // 别人用同一个键是另一条回执。
  assert.equal((await h.service.create(BOB, input({ idempotencyKey: "k1", organization: "Acme" }))).outcome, "created");
});

test("duplicate_review leaves no receipt, so the same key can be resent with allowDuplicate", async () => {
  const h = harness([contact("c:x", ALICE, { displayName: "山田 太郎" })]);
  assert.equal((await h.service.create(ALICE, input({ idempotencyKey: "k2" }))).outcome, "duplicate_review");
  assert.equal((await h.service.create(ALICE, input({ allowDuplicate: true, idempotencyKey: "k2" }))).outcome, "created");
});

test("undo within 10 minutes tombstones the contact and cancels its plan-match job", async () => {
  const h = harness();
  const created = await h.service.create(ALICE, input());
  h.advance(5 * 60 * 1000);
  assert.deepEqual(await h.service.undo(ALICE, created.contactId!), { outcome: "undone" });
  assert.equal(await h.get(created.contactId!), null);
  const tombstone = (await h.get(created.contactId!, true))!;
  assert.equal(tombstone.lifecycleState, "deleted", "a tombstone, not a physical delete (App sync relies on it)");
  assert.deepEqual(h.cancelled, [created.contactId]);
  await assert.rejects(h.service.undo(ALICE, created.contactId!), isError("NOT_FOUND"));
});

test("undo is refused after 10 minutes, after an edit, for other sources, and for other people", async () => {
  const h = harness([contact("c:card", ALICE, { displayName: "名刺の人" })]);
  const late = await h.service.create(ALICE, input({ displayName: "Late" }));
  const edited = await h.service.create(ALICE, input({ displayName: "Edited" }));
  const bobs = await h.service.create(BOB, input({ displayName: "Bob's" }));
  const record = (await h.get(edited.contactId!))!;
  h.store.upsertRecord({ ...record, payload: { ...record.payload, role: "CTO", updatedAt: "2026-10-11T03:01:00.000Z" }, updatedAt: "2026-10-11T03:01:00.000Z" });
  h.advance(2 * 60 * 1000);
  await assert.rejects(h.service.undo(ALICE, edited.contactId!), isError("UNDO_EXPIRED"));
  await assert.rejects(h.service.undo(ALICE, "c:card"), isError("UNDO_EXPIRED"));
  await assert.rejects(h.service.undo(ALICE, bobs.contactId!), isError("NOT_FOUND"));
  h.advance(MANUAL_CONTACT_UNDO_WINDOW_MS);
  await assert.rejects(h.service.undo(ALICE, late.contactId!), isError("UNDO_EXPIRED"));
  for (const id of [late.contactId!, edited.contactId!, "c:card"]) assert.equal((await h.get(id))?.lifecycleState, "active");
  assert.equal((await h.store.getRecord({ collectionName: "contacts", recordId: bobs.contactId!, workspaceId: WS }))?.lifecycleState, "active");
  assert.deepEqual(h.cancelled, []);
});

test("company suggestions: own contacts, normalized prefix, at most five, with counts", async () => {
  const seed = [
    ...["Acme", "ACME", "Ａｃｍｅ", "Acme"].map((org, i) => contact(`c:a${i}`, ALICE, { displayName: `A${i}`, organization: org })),
    ...["Acorn", "Ace Labs", "Acrobat", "Activ", "Acute", "Beta"].map((org, i) => contact(`c:b${i}`, ALICE, { displayName: `B${i}`, organization: org })),
  ];
  const h = harness(seed);
  const { organizations } = await h.service.suggestOrganizations(ALICE, " ａｃ");
  assert.equal(organizations.length, 5);
  assert.deepEqual(organizations[0], { contactCount: 4, name: "Acme" });
  assert.ok(organizations.every((org) => org.name.toLowerCase().startsWith("ac")));
  assert.deepEqual((await h.service.suggestOrganizations(ALICE, "")).organizations, []);
  assert.deepEqual((await h.service.suggestOrganizations(ALICE, "  ")).organizations, []);
});

test("an enqueue failure does not fail the save", async () => {
  const storage = createMemoryManualContactV2Storage({ planMatch: { async cancel() {}, async enqueue() { throw new Error("plan db down"); } }, workspaceId: WS });
  const logged: string[] = [];
  const service = createManualContactV2Service({ log: (line) => logged.push(line), storage });
  assert.equal((await service.create(ALICE, input())).outcome, "created");
  assert.match(logged[0] ?? "", /manual_contact_plan_match_enqueue_failed/);
});
