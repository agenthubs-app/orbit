import assert from "node:assert/strict";
import test from "node:test";

import { inboxNotificationSchema } from "../src/api/schema/inbox-notifications";
import { inboxDeliveryPreferencesSchema } from "../src/api/schema/notification-delivery-policy";
import * as fixtures from "../../orbits/shared/mock/demo-world/fixtures";

// README rule 10 (product owner, 2026-10-10): the App reads responses tolerantly —
// the two places that read with strict schemas before (src/api/inbox-notifications.ts,
// NotificationDeliverySettings) now get the server's newer fields and values without
// dropping the record.
test("a notification with fields and values this build does not know still reads", () => {
  const note = fixtures.demoSecretaryNotifications[0]!;
  const parsed = inboxNotificationSchema.safeParse({ ...note, priority: "high", kind: "celebration", sources: [{ ...note.sources[0]!, sourceKind: "calendar_digest" }], actions: ["read", "pin"] });
  assert.equal(parsed.success, true);
  const value = parsed.data as unknown as Record<string, unknown> & { kind: string; actions: string[] };
  assert.deepEqual([value.kind, value.actions, "priority" in value], ["update", ["read"], false]);
});

test("delivery preferences with a newer setting still read", () => {
  const parsed = inboxDeliveryPreferencesSchema.safeParse({ ...fixtures.demoDeliveryPreferences, digestMode: "weekly", lockScreenContent: "blurred" });
  assert.equal(parsed.success, true);
  assert.equal((parsed.data as { lockScreenContent: string }).lockScreenContent, "private");
});
