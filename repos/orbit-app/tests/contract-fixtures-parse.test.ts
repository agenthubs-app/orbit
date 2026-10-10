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
import { inviteCodePreviewSchema, inviteCodeRedeemResultSchema, inviteCodeSchema } from "../src/api/schema/invite-codes";
import { inboxDeliveryPreferencesSchema } from "../src/api/schema/notification-delivery-policy";
import { planV2SummaryResponseSchema } from "../src/api/schema/plan-v2";
// The demo-world fixtures live on the server side; a test may read ../orbits (it
// never ships in the App bundle).
import * as fixtures from "../../orbits/shared/mock/demo-world/fixtures";

// 改版 R08 (SC-R08-03 / 06): after npm run sync:contract the App's own copies of
// the schemas parse every redesign fixture, and the shared 「尚未実装」 helper works.
test("the App's synced schemas parse every redesign fixture", () => {
  homeLayoutSchema.parse(fixtures.demoHomeLayout);
  contactCompletionQuestionSchema.parse(fixtures.demoCompletionQuestion);
  inviteCodeSchema.parse(fixtures.demoInviteCode);
  inviteCodePreviewSchema.parse(fixtures.demoInvitePreview);
  inviteCodeRedeemResultSchema.parse(fixtures.demoInviteRedeem);
  for (const item of fixtures.demoSecretaryNotifications) inboxNotificationSchema.parse(item);
  inboxDeliveryPreferencesSchema.parse(fixtures.demoDeliveryPreferences);
  eventAssessmentSchema.parse(fixtures.demoEventAssessment);
  eventRecommendationDismissResultSchema.parse(fixtures.demoDismissResult);
  accountExportSchema.parse(fixtures.demoAccountExport);
  accountDeletionRequestSchema.parse(fixtures.demoDeletionRequest);
  appVersionSchema.parse(fixtures.demoAppVersion);
  planV2SummaryResponseSchema.parse(fixtures.demoPlanSummary);
  const summary = contactCardSummarySchema.parse({ total: 10, sources: {}, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: "2026-10-07T00:00:00.000Z", ...fixtures.demoContactSummaryExtras });
  assert.deepEqual(summary.densityCounts, fixtures.demoContactSummaryExtras.densityCounts);
});

test("「尚未実装」 from the server picks a default or hides the entry", () => {
  const envelope = { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "x", context: { capabilityId: "home-layout", reason: "NOT_IMPLEMENTED", requestedMode: "live" } } };
  assert.equal(isNotImplemented(envelope), true);
  assert.equal(isNotImplemented({ success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } }), false);
  assert.deepEqual(whenNotImplemented(envelope, { use: "default", value: "fallback" }), { show: true, value: "fallback" });
  assert.deepEqual(whenNotImplemented(envelope, { use: "hide" }), { show: false });
});
