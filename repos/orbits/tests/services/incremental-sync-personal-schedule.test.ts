import assert from "node:assert/strict";
import test from "node:test";
import { createIncrementalSyncReadService, type SyncReadRow, type SyncSqlClient } from "../../features/sync/read-service";
import { personalScheduleSchema } from "../../shared/api-schema/personal-schedule";

const actorId = "account:schedule-sync";
const workspaceId = "workspace:schedule-sync";
const at = "2026-09-18T03:00:00.000Z";
const personal = {
  id: "schedule:synthetic", sourceId: "schedule:synthetic",
  accountId: actorId, ownerUserId: actorId, kind: "personal", category: "personal",
  state: "upcoming", title: "Synthetic schedule", startsAt: at, createdAt: at, updatedAt: at,
};

async function payloadFor(payload: Record<string, unknown>) {
  const row: SyncReadRow = {
    workspace_id: workspaceId, user_id: actorId, record_id: personal.id,
    collection_name: "personal_schedule_items", lifecycle_state: "active",
    deleted_at: null, updated_at: at, sync_revision: "1", payload,
  };
  const client: SyncSqlClient = {
    async query<TRow>(sql: string) {
      return { rows: (sql.includes("sync:high-watermark") ? [{ high_watermark: "1" }] : [row]) as TRow[] };
    },
  };
  const page = await createIncrementalSyncReadService({
    client, cursorSecret: "synthetic-personal-schedule-sync-secret-32-bytes",
  }).readPage({ actorId, workspaceId, limit: 1 });
  return page.changes[0].payload as Record<string, unknown>;
}

test("personal schedule sync directly satisfies the shared strict App schema", async () => {
  assert.equal(personalScheduleSchema.safeParse(personal).success, true);
  const payload = await payloadFor(personal);
  assert.equal(personalScheduleSchema.safeParse(payload).success, true);
  assert.deepEqual(Object.keys(payload).sort(), [
    "accountId", "category", "createdAt", "id", "kind", "ownerUserId", "sourceId",
    "startsAt", "state", "title", "updatedAt",
  ]);
});

test("personal wire projection preserves declared optionals and excludes authority-only fields", async () => {
  const payload = await payloadFor({
    ...personal, endsAt: "2026-09-18T04:00:00.000Z", location: "Synthetic location",
    evidenceIds: ["evidence:synthetic"], details: "Authority detail", allDay: false,
    contactId: "contact:synthetic", timeZone: "Asia/Tokyo",
  });
  assert.equal(personalScheduleSchema.safeParse(payload).success, true);
  assert.equal(payload.endsAt, "2026-09-18T04:00:00.000Z");
  assert.equal(payload.location, "Synthetic location");
  for (const key of ["evidenceIds", "details", "allDay", "contactId", "timeZone"]) {
    assert.equal(Object.hasOwn(payload, key), false, key);
  }
});

test("meeting schedule sync retains its existing evidence and authority fields", async () => {
  const payload = await payloadFor({
    ...personal, kind: "meeting", category: "meeting", meetingId: "meeting:synthetic",
    evidenceIds: ["evidence:synthetic"], details: "Authority detail", allDay: false,
  });
  assert.deepEqual(payload.evidenceIds, ["evidence:synthetic"]);
  assert.equal(payload.meetingId, "meeting:synthetic");
  assert.equal(payload.details, "Authority detail");
  assert.equal(payload.allDay, false);
});
