import assert from "node:assert/strict";
import test from "node:test";

import type { SyncRecord } from "../../shared/contract/sync";
import {
  aiSyncVisibilitySchema,
  clientSyncMutationSchema,
  localSyncStateSchema,
  syncEntityKindSchema,
  syncRecordSchema,
} from "../../features/data-authority/registry";

const entityKinds = [
  "contact",
  "note",
  "task",
  "relationship_followup",
  "personal_schedule",
  "inbox_item",
] as const;

const baseRecord = {
  actorId: "actor:one",
  workspaceId: "workspace:one",
  kind: "note",
  id: "note:one",
  revision: "server-revision::opaque/v1",
  updatedAt: "2026-09-16T08:00:00.000Z",
  deletedAt: null,
  payload: { title: "Canonical" },
  syncState: "synced",
  aiVisibility: "available_when_synced",
} as const satisfies SyncRecord<{ title: string }>;

test("sync schemas accept only the six provider-neutral entity kinds", () => {
  for (const kind of entityKinds) assert.equal(syncEntityKindSchema.parse(kind), kind);
  assert.equal(syncEntityKindSchema.safeParse("provider_calendar_event").success, false);
});

test("sync records require non-empty actor/workspace scope and an opaque non-empty server revision", () => {
  assert.equal(syncRecordSchema.parse(baseRecord).revision, "server-revision::opaque/v1");
  assert.equal(syncRecordSchema.parse({ ...baseRecord, revision: "  opaque server value  " }).revision, "  opaque server value  ");

  for (const field of ["actorId", "workspaceId", "revision"] as const) {
    assert.equal(syncRecordSchema.safeParse({ ...baseRecord, [field]: "" }).success, false);
    assert.equal(syncRecordSchema.safeParse({ ...baseRecord, [field]: "   " }).success, false);
  }
});

test("sync record tombstones have null payload while live records retain payload", () => {
  assert.equal(syncRecordSchema.safeParse(baseRecord).success, true);
  assert.equal(
    syncRecordSchema.safeParse({ ...baseRecord, deletedAt: "2026-09-16T09:00:00.000Z", payload: null }).success,
    true,
  );
  assert.equal(syncRecordSchema.safeParse({ ...baseRecord, payload: null }).success, false);
  assert.equal(
    syncRecordSchema.safeParse({ ...baseRecord, deletedAt: "2026-09-16T09:00:00.000Z" }).success,
    false,
  );
});

test("sync schemas freeze the four local states and two AI visibility states", () => {
  for (const state of ["synced", "pending", "conflicted", "failed"] as const) {
    assert.equal(localSyncStateSchema.parse(state), state);
  }
  assert.equal(localSyncStateSchema.safeParse("sending").success, false);

  for (const visibility of ["available_when_synced", "excluded"] as const) {
    assert.equal(aiSyncVisibilitySchema.parse(visibility), visibility);
  }
  assert.equal(aiSyncVisibilitySchema.safeParse("always").success, false);
});

test("client sync mutations reject every client-supplied authority field", () => {
  const input = { kind: "note", id: "note:one", payload: { title: "Local edit" } } as const;
  assert.deepEqual(clientSyncMutationSchema.parse(input), input);

  for (const authorityField of [
    "actorId",
    "workspaceId",
    "revision",
    "updatedAt",
    "deletedAt",
    "syncState",
    "aiVisibility",
  ] as const) {
    assert.equal(
      clientSyncMutationSchema.safeParse({ ...input, [authorityField]: "client-controlled" }).success,
      false,
      authorityField,
    );
  }
});
