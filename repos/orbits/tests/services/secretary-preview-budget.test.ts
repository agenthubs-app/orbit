import assert from "node:assert/strict";
import test from "node:test";

import type { InboxNotificationDTO } from "../../shared/contract/inbox-notifications";
import { secretaryPreviewDecided } from "../../features/notifications/secretary/preview-reader";

// LF4: the Home secretary preview stops reading inbox pages once the answer is decided (four distinct events, none
// still displaceable), instead of paging through up to 5,000 notifications on every view.
function row(id: string, eventId: string, sourceKind: "event_deadline" | "event_prep" | "event_pick", semanticKey = `k:${id}`): InboxNotificationDTO {
  return {
    id, actorId: "actor:1", kind: "reminder", origin: "automation", semanticKey, title: id, body: "", priority: "normal",
    sources: [{ sourceKind, sourceId: eventId, sourceRevision: "1", occurredAt: "2026-10-20T00:00:00.000Z", readAt: null, excerpt: "" }],
    target: { kind: "event", id: eventId, href: `/events/${eventId}`, status: "available" },
    occurredAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z", readAt: null, disposition: "open",
  } as unknown as InboxNotificationDTO;
}

test("LF4: three events are not enough to decide (hasMore needs a fourth)", () => {
  assert.equal(secretaryPreviewDecided([row("a", "e1", "event_deadline"), row("b", "e2", "event_prep"), row("c", "e3", "event_pick")]), false);
});

test("LF4: four settled events decide the preview", () => {
  assert.equal(secretaryPreviewDecided([row("a", "e1", "event_deadline"), row("b", "e2", "event_prep"), row("c", "e3", "event_pick"), row("d", "e4", "event_deadline")]), true);
});

test("LF4: an event shown only by a daily recommendation keeps reading (an older event pick may replace it)", () => {
  const daily = row("c", "e3", "event_pick", "secretary-daily:2026-10-20");
  assert.equal(secretaryPreviewDecided([row("a", "e1", "event_deadline"), row("b", "e2", "event_prep"), daily, row("d", "e4", "event_deadline")]), false);
  assert.equal(secretaryPreviewDecided([row("a", "e1", "event_deadline"), row("b", "e2", "event_prep"), daily, row("d", "e4", "event_deadline"), row("e", "e3", "event_pick")]), true);
});
