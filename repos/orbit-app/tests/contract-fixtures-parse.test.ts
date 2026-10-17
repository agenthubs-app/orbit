import assert from "node:assert/strict";
import test from "node:test";

import { isNotImplemented, whenNotImplemented } from "../src/api/compute/not-implemented";
import { accountDeletionRequestSchema, accountExportSchema, appVersionSchema } from "../src/api/schema/account";
import { contactCardSummarySchema } from "../src/api/schema/contact-card-page";
import { contactCompletionQuestionSchema } from "../src/api/schema/contact-completion";
import { eventAssessmentSchema } from "../src/api/schema/event-assessment";
import { eventRecommendationDismissResultSchema } from "../src/api/schema/event-recommendation-feedback";
import { homeLayoutSchema } from "../src/api/schema/home-layout";
import { inboxNotificationSchema } from "../src/api/schema/inbox-notifications";
import { parseSecretaryPreviewForActor } from "../src/api/schema/secretary-preview";
import { inviteCodeHistoryResponseSchema, inviteCodePreviewSchema, inviteCodeRedeemResultSchema, inviteCodeSchema, inviteConnectionViewSchema } from "../src/api/schema/invite-codes";
import { contactListItemSchema } from "../src/api/schema/mobile-contacts-dashboard";
import { inboxDeliveryPreferencesSchema } from "../src/api/schema/notification-delivery-policy";
import { planV2DetailSchema, planV2SummaryResponseSchema } from "../src/api/schema/plan-v2";
// The demo-world fixtures live on the server side; a test may read ../orbits (it
// never ships in the App bundle).
import * as fixtures from "../../orbits/shared/mock/demo-world/fixtures";
import { demoCalendarExternalEvents, demoTodoPage } from "../../orbits/shared/mock/demo-world/todo";
import { todoPageSchema } from "../src/api/schema/todo-page";
import { calendarExternalEventsResponseSchema } from "../src/api/schema/calendar-external-events";

test("R18a synced account schemas parse sparse, regular, complete and legacy responses", async () => {
  const schemas = await import("../src/api/schema/profile-account").catch(() => null);
  assert.ok(schemas, "R18a synced profile schemas are missing");
  const account = await import("../../orbits/shared/mock/demo-world/account");
  for (const profile of Object.values(account.demoAccountProfiles)) {
    const parsed = schemas.profileAccountSchema.parse(profile);
    assert.equal(parsed.completeness.card?.items.length, 4);
    const legacy = structuredClone(parsed);
    delete legacy.completeness.card;
    if (legacy.profile) delete legacy.profile.publicFields;
    assert.ok(schemas.profileAccountSchema.safeParse(legacy).success);
  }
  assert.equal(schemas.profileCardCompletenessSchema.parse({ score: 0, items: [{ key: "future", weight: 25, done: false }] }).items[0].key, "future");
});

// 改版 R08 (SC-R08-03 / 06): after npm run sync:contract the App's own copies of
// the schemas parse every redesign fixture, and the shared 「尚未実装」 helper works.
test("the App's synced schemas parse every redesign fixture", () => {
  assert.equal(calendarExternalEventsResponseSchema.parse(demoCalendarExternalEvents).events.length, 2);
  assert.deepEqual(todoPageSchema.parse(demoTodoPage).counts, { decisions: 4, nextMoves: 3, followups: 3, overdue: 1 });
  homeLayoutSchema.parse(fixtures.demoHomeLayout);
  contactCompletionQuestionSchema.parse(fixtures.demoCompletionQuestion);
  inviteCodeSchema.parse(fixtures.demoInviteCode);
  inviteCodePreviewSchema.parse(fixtures.demoInvitePreview);
  inviteCodeRedeemResultSchema.parse(fixtures.demoInviteRedeem);
  // 改版 R15：履历、别人发给我的码（预览与兑换结果，含 already_connected）、招待连接。
  assert.equal(inviteCodeHistoryResponseSchema.parse({ items: fixtures.demoInviteHistory }).items.length, fixtures.demoInviteHistory.length);
  for (const peer of [fixtures.demoInviteFromPeer, fixtures.demoInviteAlreadyConnected]) {
    inviteCodePreviewSchema.parse(peer.preview);
    inviteCodeRedeemResultSchema.parse(peer.redeem);
  }
  assert.equal(inviteConnectionViewSchema.parse(fixtures.demoInviteConnection).contactId, fixtures.demoInviteConnection.contactId);
  for (const item of fixtures.demoSecretaryNotifications) inboxNotificationSchema.parse(item);
  const secretaryPreview = parseSecretaryPreviewForActor(fixtures.demoSecretaryPreview('app-demo-actor'), 'app-demo-actor');
  assert.equal(secretaryPreview.items.length, 3);
  assert.throws(() => parseSecretaryPreviewForActor(fixtures.demoSecretaryPreview('another-actor'), 'app-demo-actor'));
  inboxDeliveryPreferencesSchema.parse(fixtures.demoDeliveryPreferences);
  eventAssessmentSchema.parse(fixtures.demoEventAssessment);
  eventRecommendationDismissResultSchema.parse(fixtures.demoDismissResult);
  accountExportSchema.parse(fixtures.demoAccountExport);
  accountDeletionRequestSchema.parse(fixtures.demoDeletionRequest);
  appVersionSchema.parse(fixtures.demoAppVersion);
  planV2SummaryResponseSchema.parse(fixtures.demoPlanSummary);
  planV2DetailSchema.parse(fixtures.demoPlanDetail);
  const summary = contactCardSummarySchema.parse({ total: 10, sources: {}, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-10-07T00:00:00.000Z", ...fixtures.demoContactSummaryExtras });
  assert.deepEqual(summary.densityCounts, fixtures.demoContactSummaryExtras.densityCounts);
  for (const row of fixtures.demoContactRows) assert.equal(contactListItemSchema.parse(row).sample, true);
});

test("「尚未実装」 from the server picks a default or hides the entry", () => {
  const envelope = { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "x", context: { capabilityId: "home-layout", reason: "NOT_IMPLEMENTED", requestedMode: "live" } } };
  assert.equal(isNotImplemented(envelope), true);
  assert.equal(isNotImplemented({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } }), false);
  assert.deepEqual(whenNotImplemented(envelope, { use: "default", value: "fallback" }), { show: true, value: "fallback" });
  assert.deepEqual(whenNotImplemented(envelope, { use: "hide" }), { show: false });
});
