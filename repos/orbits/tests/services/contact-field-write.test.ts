import assert from "node:assert/strict";
import test from "node:test";

import {
  applyContactFieldValues,
  CONTACT_FIELD_HISTORY_LIMIT,
  ContactFieldWriteError,
  type ContactFieldHistoryEntry,
} from "../../features/contacts/contact-field-write";
import { createMemoryLiveRecordStore, type LiveRecord, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";

const WS = "workspace:test";
const ALICE = "actor:alice";
const BOB = "actor:bob";
const T0 = "2026-10-11T00:00:00.000Z";
const clock = (iso = "2026-10-11T01:00:00.000Z") => () => new Date(iso);

function contact(id: string, owner: string, payload: Record<string, unknown> = {}): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: "contacts",
    createdAt: T0,
    evidenceIds: ["evidence:x"],
    lifecycleState: "active",
    payload: { id, displayName: "山田 太郎", organization: "Acme", role: "部長", primaryEmail: "taro@acme.jp", notes: "初回メモ", createdAt: T0, updatedAt: T0, ...payload },
    recordId: id,
    sourceId: "s",
    sourceType: "manual",
    updatedAt: T0,
    userId: owner,
    workspaceId: WS,
  };
}

function seed(...records: LiveRecord<Record<string, unknown>>[]) {
  return createMemoryLiveRecordStore<Record<string, unknown>>(records);
}

test("overwrites listed fields, clears null fields, keeps the rest, and records the old values", async () => {
  const store = seed(contact("c1", ALICE));
  const result = await applyContactFieldValues({
    actorId: ALICE, contactId: "c1", now: clock(), source: "manual", store, workspaceId: WS,
    values: { organization: "Beta 株式会社", email: null, phone: "090-1111-2222", role: "部長" },
  });
  assert.deepEqual(result.changed.sort(), ["email", "organization", "phone"]);
  assert.equal(result.written, true);
  const saved = (await store.getRecord({ collectionName: "contacts", recordId: "c1", workspaceId: WS }))!;
  assert.equal(saved.payload.organization, "Beta 株式会社");
  assert.equal(saved.payload.primaryEmail, undefined, "null clears the field");
  assert.equal(saved.payload.primaryPhone, "090-1111-2222");
  assert.equal(saved.payload.role, "部長");
  assert.equal(saved.payload.notes, "初回メモ");
  assert.equal(saved.updatedAt, "2026-10-11T01:00:00.000Z");
  assert.equal(saved.payload.updatedAt, saved.updatedAt);
  assert.match(saved.searchText ?? "", /Beta/);
  const history = saved.payload.fieldHistory as ContactFieldHistoryEntry[];
  assert.deepEqual(
    history.map(({ field, previous, next, source }) => ({ field, next, previous, source })),
    [
      { field: "organization", next: "Beta 株式会社", previous: "Acme", source: "manual" },
      { field: "email", next: null, previous: "taro@acme.jp", source: "manual" },
      { field: "phone", next: "090-1111-2222", previous: null, source: "manual" },
    ],
  );
  assert.ok(history.every((entry) => entry.at === "2026-10-11T01:00:00.000Z"));
});

test("no change writes nothing; the name can never be cleared", async () => {
  const store = seed(contact("c1", ALICE));
  const same = await applyContactFieldValues({ actorId: ALICE, contactId: "c1", source: "manual", store, values: { organization: " Acme " }, workspaceId: WS });
  assert.equal(same.written, false);
  assert.equal((await store.getRecord({ collectionName: "contacts", recordId: "c1", workspaceId: WS }))!.updatedAt, T0);
  await assert.rejects(
    applyContactFieldValues({ actorId: ALICE, contactId: "c1", source: "manual", store, values: { displayName: null }, workspaceId: WS }),
    (error: unknown) => error instanceof ContactFieldWriteError && error.code === "INVALID",
  );
});

test("note lines append without duplicates and the met event is filled only when empty", async () => {
  const store = seed(contact("c1", ALICE), contact("c2", ALICE, { metEventId: "event:old" }));
  await applyContactFieldValues({ actorId: ALICE, appendNoteLines: ["初回メモ", "出会い：紹介"], contactId: "c1", fillMetEvent: { eventId: "event:new", title: "Expo" }, source: "manual", store, values: {}, workspaceId: WS });
  const c1 = (await store.getRecord({ collectionName: "contacts", recordId: "c1", workspaceId: WS }))!;
  assert.equal(c1.payload.notes, "初回メモ\n出会い：紹介");
  assert.equal(c1.payload.metEventId, "event:new");
  assert.equal(c1.payload.metEventTitle, "Expo");
  assert.equal(c1.payload.fieldHistory, undefined, "notes and events are not field history");
  await applyContactFieldValues({ actorId: ALICE, contactId: "c2", fillMetEvent: { eventId: "event:new" }, source: "manual", store, values: {}, workspaceId: WS });
  assert.equal((await store.getRecord({ collectionName: "contacts", recordId: "c2", workspaceId: WS }))!.payload.metEventId, "event:old");
});

test(`history keeps the newest ${CONTACT_FIELD_HISTORY_LIMIT} entries`, async () => {
  const old = Array.from({ length: CONTACT_FIELD_HISTORY_LIMIT }, (_, index) => ({ at: T0, field: "role", next: `r${index + 1}`, previous: `r${index}`, source: "manual" }));
  const store = seed(contact("c1", ALICE, { fieldHistory: old }));
  await applyContactFieldValues({ actorId: ALICE, contactId: "c1", source: "invite", store, values: { role: "CTO" }, workspaceId: WS });
  const history = (await store.getRecord({ collectionName: "contacts", recordId: "c1", workspaceId: WS }))!.payload.fieldHistory as ContactFieldHistoryEntry[];
  assert.equal(history.length, CONTACT_FIELD_HISTORY_LIMIT);
  assert.equal(history[0]!.next, "r2", "the oldest entry is dropped");
  assert.deepEqual({ ...history.at(-1), at: undefined }, { at: undefined, field: "role", next: "CTO", previous: "部長", source: "invite" });
});

test("someone else's, missing, or deleted contacts are not found", async () => {
  const deleted = { ...contact("gone", ALICE), lifecycleState: "deleted" as const };
  const store = seed(contact("bob", BOB), contact("acct", ALICE, { accountId: BOB }), deleted);
  for (const contactId of ["bob", "acct", "gone", "missing"]) {
    await assert.rejects(
      applyContactFieldValues({ actorId: ALICE, contactId, source: "manual", store, values: { role: "x" }, workspaceId: WS }),
      (error: unknown) => error instanceof ContactFieldWriteError && error.code === "NOT_FOUND",
      contactId,
    );
  }
  assert.equal((await store.getRecord({ collectionName: "contacts", recordId: "bob", workspaceId: WS }))!.payload.role, "部長");
});

test("a concurrent edit is re-read and retried; values written by the other edit survive", async () => {
  const inner = seed(contact("c1", ALICE));
  let raced = false;
  const store: LiveRecordStoreLike<Record<string, unknown>> = {
    ...inner,
    async updateRecordIfCurrent(record, expected) {
      if (!raced) {
        raced = true;
        const current = (await inner.getRecord({ collectionName: "contacts", recordId: "c1", workspaceId: WS }))!;
        inner.upsertRecord({ ...current, payload: { ...current.payload, notes: "別の端末で編集" }, updatedAt: "2026-10-11T00:30:00.000Z" });
      }
      return inner.updateRecordIfCurrent!(record, expected);
    },
  };
  const result = await applyContactFieldValues({ actorId: ALICE, contactId: "c1", now: clock(), source: "manual", store, values: { role: "CTO" }, workspaceId: WS });
  assert.equal(result.written, true);
  const saved = (await inner.getRecord({ collectionName: "contacts", recordId: "c1", workspaceId: WS }))!;
  assert.equal(saved.payload.role, "CTO");
  assert.equal(saved.payload.notes, "別の端末で編集");
});

test("still conflicting after three attempts is a clear CONFLICT error", async () => {
  const inner = seed(contact("c1", ALICE));
  let attempts = 0;
  const store: LiveRecordStoreLike<Record<string, unknown>> = { ...inner, async updateRecordIfCurrent() { attempts++; return null; } };
  await assert.rejects(
    applyContactFieldValues({ actorId: ALICE, contactId: "c1", source: "manual", store, values: { role: "CTO" }, workspaceId: WS }),
    (error: unknown) => error instanceof ContactFieldWriteError && error.code === "CONFLICT",
  );
  assert.equal(attempts, 3);
});
