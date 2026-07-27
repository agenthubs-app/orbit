import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactIntroductionRepository,
} from "../../features/contacts/introduction-records";
import { AppError } from "../../shared/errors/app-error";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

function contactRecord(
  actorId: string,
  id: string,
  displayName: string,
): LiveRecord<Record<string, unknown>> {
  const now = "2026-07-27T00:00:00.000Z";
  return {
    workspaceId: "test-workspace",
    collectionName: "contacts",
    recordId: id,
    userId: actorId,
    sourceType: "manual",
    sourceId: `source:${id}`,
    evidenceIds: [`evidence:${id}`],
    createdAt: now,
    updatedAt: now,
    lifecycleState: "active",
    payload: {
      id,
      displayName,
      accountId: actorId,
    },
  };
}

function connectionRecord(
  actorId: string,
  contactId: string,
): LiveRecord<Record<string, unknown>> {
  const now = "2026-07-27T00:00:00.000Z";
  return {
    workspaceId: "test-workspace",
    collectionName: "connections",
    recordId: `connection:${actorId}:${contactId}`,
    userId: actorId,
    sourceType: "manual",
    sourceId: `source:connection:${contactId}`,
    evidenceIds: [`evidence:connection:${contactId}`],
    createdAt: now,
    updatedAt: now,
    lifecycleState: "active",
    payload: {
      id: `connection:${actorId}:${contactId}`,
      accountId: actorId,
      contactId,
    },
  };
}

test("contact introductions persist as actor-scoped drafts", async () => {
  const store = createMemoryLiveRecordStore([
    contactRecord("actor-a", "contact-a", "Aiko Tanaka"),
    contactRecord("actor-a", "contact-b", "Mei Lin"),
    contactRecord("actor-b", "contact-c", "Other Account"),
  ]);
  const repository = createContactIntroductionRepository({
    store,
    workspaceId: "test-workspace",
  });

  const created = await repository.create("actor-a", {
    contactAId: "contact-a",
    contactBId: "contact-b",
    blurb: "Aiko and Mei should compare their Japan market work.",
  });

  assert.equal(created.status, "draft");
  assert.equal(created.labelA, "Aiko Tanaka");
  assert.equal(created.labelB, "Mei Lin");
  assert.deepEqual(
    (await repository.list("actor-a")).map((item) => item.id),
    [created.id],
  );
  assert.deepEqual(await repository.list("actor-b"), []);
});

test("contact introduction lists use the contacts' current display names", async () => {
  const store = createMemoryLiveRecordStore([
    contactRecord("actor-a", "contact-a", "Old name A"),
    contactRecord("actor-a", "contact-b", "Old name B"),
  ]);
  const repository = createContactIntroductionRepository({
    store,
    workspaceId: "test-workspace",
  });

  await repository.create("actor-a", {
    contactAId: "contact-a",
    contactBId: "contact-b",
    blurb: "A saved introduction remains linked to both contact records.",
  });
  await store.upsertRecord(
    contactRecord("actor-a", "contact-a", "联系人甲"),
  );
  await store.upsertRecord(
    contactRecord("actor-a", "contact-b", "联系人乙"),
  );

  const [introduction] = await repository.list("actor-a");
  assert.equal(introduction.labelA, "联系人甲");
  assert.equal(introduction.labelB, "联系人乙");
});

test("contact introductions reject cross-account contacts and blank notes", async () => {
  const store = createMemoryLiveRecordStore([
    contactRecord("actor-a", "contact-a", "Aiko Tanaka"),
    contactRecord("actor-b", "contact-b", "Other Account"),
  ]);
  const repository = createContactIntroductionRepository({
    store,
    workspaceId: "test-workspace",
  });

  await assert.rejects(
    repository.create("actor-a", {
      contactAId: "contact-a",
      contactBId: "contact-b",
      blurb: "Cross-account draft",
    }),
    (error: unknown) =>
      error instanceof AppError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    repository.create("actor-a", {
      contactAId: "contact-a",
      contactBId: "contact-a",
      blurb: "",
    }),
    (error: unknown) =>
      error instanceof AppError && error.code === "VALIDATION_ERROR",
  );
});

test("contact introductions accept contacts linked through an actor-owned connection", async () => {
  const linkedContact = {
    ...contactRecord("source-owner", "contact-linked", "Linked Contact"),
    userId: null,
    payload: {
      id: "contact-linked",
      displayName: "Linked Contact",
    },
  };
  const store = createMemoryLiveRecordStore([
    contactRecord("actor-a", "contact-a", "Aiko Tanaka"),
    linkedContact,
    connectionRecord("actor-a", "contact-linked"),
  ]);
  const repository = createContactIntroductionRepository({
    store,
    workspaceId: "test-workspace",
  });

  const created = await repository.create("actor-a", {
    contactAId: "contact-a",
    contactBId: "contact-linked",
    blurb: "Both contacts are visible in actor A's relationship graph.",
  });

  assert.equal(created.labelB, "Linked Contact");
});
