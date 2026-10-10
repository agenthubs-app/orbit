import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { accountExportSchema } from "../../shared/api-schema/account";
import { eventAssessmentSchema } from "../../shared/api-schema/event-assessment";
import { homeLayoutSchema, homeLayoutUpdateInputSchema } from "../../shared/api-schema/home-layout";
import { inboxNotificationListSchema, inboxNotificationSchema, inboxNotificationWriteSchema } from "../../shared/api-schema/inbox-notifications";
import { inboxDeliveryPreferencesInputSchema, inboxDeliveryPreferencesSchema } from "../../shared/api-schema/notification-delivery-policy";
import { demoDeliveryPreferences, demoEventAssessment, demoHomeLayout, demoSecretaryNotifications } from "../../shared/mock/demo-world/fixtures";

// README rule 10 (product owner, 2026-10-10): responses are read tolerantly, request
// bodies and server writes stay strict.
const note = demoSecretaryNotifications[0]!;

test("a notification from a newer server still reads: extra keys dropped, unknown secondary values fall back", () => {
  const newer = {
    ...note,
    futureField: { anything: true },
    origin: "partner",
    sources: [{ ...note.sources[0]!, futureFlag: 1 }],
    target: { ...note.target, kind: "workspace", status: "archived_elsewhere" },
    actions: ["read", "pin", "dismiss"],
    disposition: "snoozed_forever",
  };
  const read = inboxNotificationSchema.parse(newer) as unknown as Record<string, unknown> & typeof note;
  assert.equal("futureField" in read, false);
  assert.deepEqual([read.origin, read.target.kind, read.target.status, read.disposition], ["automation", "source", "unavailable", "open"]);
  assert.deepEqual(read.actions, ["read", "dismiss"]);
  assert.equal(inboxNotificationSchema.safeParse({ ...note, kind: undefined }).success, false, "a missing value is still an error");
});

test("a notification of a kind this client cannot show is skipped; the page and the server unread total stay", () => {
  const unknownKind = { ...note, id: "n-kind", kind: "celebration" };
  const unknownSource = { ...note, id: "n-source", sources: [{ ...note.sources[0]!, sourceKind: "calendar_digest" }] };
  const page = inboxNotificationListSchema.parse({ enabled: true, items: [note, unknownKind, unknownSource, { id: "broken" }], unreadCount: 4, nextCursor: "p2", asOf: note.occurredAt });
  assert.deepEqual(page.items.map((item) => item.id), [note.id]);
  assert.equal(page.unreadCount, 4);
});

test("the server's write validation stays strict", () => {
  assert.equal(inboxNotificationWriteSchema.safeParse(note).success, true);
  assert.equal(inboxNotificationWriteSchema.safeParse({ ...note, futureField: 1 }).success, false);
  assert.equal(inboxNotificationWriteSchema.safeParse({ ...note, kind: "celebration" }).success, false);
  const service = readFileSync("features/notifications/inbox-record-service.ts", "utf8");
  assert.match(service, /inboxNotificationWriteSchema\.safeParse\(/u);
  assert.doesNotMatch(service, /inboxNotificationSchema\.safeParse\(/u);
});

test("delivery preferences read tolerantly; their input stays strict", () => {
  const read = inboxDeliveryPreferencesSchema.parse({ ...demoDeliveryPreferences, lockScreenContent: "blurred", dailyCap: 9, quietStart: "25:99", digestMode: "weekly" }) as unknown as Record<string, unknown>;
  assert.deepEqual([read.lockScreenContent, read.dailyCap, read.quietStart, "digestMode" in read], ["private", undefined, undefined, false]);
  assert.equal(inboxDeliveryPreferencesInputSchema.safeParse({ expectedRevision: 1, digestMode: "weekly" }).success, false);
});

test("the redesign responses read tolerantly; their request bodies stay strict", () => {
  const layout = homeLayoutSchema.parse({ ...demoHomeLayout, app: [...demoHomeLayout.app, { key: "weather", size: "xl" }], web: [{ key: "today", size: "xl" }], theme: "x" }) as unknown as Record<string, unknown> & typeof demoHomeLayout;
  assert.equal(layout.app.length, demoHomeLayout.app.length, "an unknown widget is skipped");
  assert.deepEqual(layout.web, [{ key: "today", size: "s" }]);
  assert.equal("theme" in layout, false);
  assert.equal(homeLayoutUpdateInputSchema.safeParse({ expectedRevision: 1, mutationId: "m", app: [], web: [], theme: "x" }).success, false);
  const assessment = eventAssessmentSchema.parse({ ...demoEventAssessment, verdict: "maybe", missingFields: ["price", "dressCode"] }) as typeof demoEventAssessment;
  assert.deepEqual([assessment.verdict, assessment.missingFields], ["conditional", ["price"]]);
  const exported = accountExportSchema.parse({ id: "e1", scope: ["contacts", "photos"], status: "archiving", requestedAt: demoEventAssessment.createdAt }) as unknown as { scope: string[]; status: string };
  assert.deepEqual([exported.scope, exported.status], [["contacts"], "running"]);
});
