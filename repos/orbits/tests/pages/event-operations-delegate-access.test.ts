import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadEventOperationsPageEvent } from "../../app/(app)/app/events/[id]/operations/event-operations-page-event";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("capability-authorized operations pages read title and schedule from canonical Event Core, not an owner-scoped live event record", async () => {
  const pageEvent = await loadEventOperationsPageEvent("event:delegate-visible", {
    async getEvent(eventId) {
      assert.equal(eventId, "event:delegate-visible");
      return {
        archivedAt: null,
        cancelledAt: null,
        description: "Canonical event visible after the per-event guard.",
        endsAt: "2026-10-08T11:00:00.000Z",
        eventId,
        eventVersion: 3,
        lifecycleState: "published",
        organizerActorId: "actor:owner-not-delegate",
        phase: "upcoming",
        publicCode: "delegate-visible",
        sourcePayload: {},
        startsAt: "2026-10-08T09:00:00.000Z",
        timezone: "Asia/Tokyo",
        title: "委派运营可见的活动",
        venue: "Tokyo",
        workspaceId: "workspace:delegate",
      };
    },
  });
  assert.deepEqual(pageEvent, {
    endsAt: "2026-10-08T11:00:00.000Z",
    id: "event:delegate-visible",
    startsAt: "2026-10-08T09:00:00.000Z",
    title: "委派运营可见的活动",
  });
});

test("operations page resolves canonical identity before capability and reads details only after the guard", () => {
  const page = readFileSync(
    join(projectRoot, "app/(app)/app/events/[id]/operations/page.tsx"),
    "utf8",
  );
  assert.match(page, /capability: "operations\.read_sensitive"/u);
  assert.match(page, /createConfiguredEventCoreService\(\)/u);
  assert.match(page, /canonicalEventId = \(await eventCore\.getEvent\(eventId\)\)\?\.eventId/u);
  assert.match(page, /eventId: canonicalEventId/u);
  assert.match(page, /loadEventOperationsPageEvent/u);
  assert.doesNotMatch(page, /createEventCrudAndImportService/u);
});
