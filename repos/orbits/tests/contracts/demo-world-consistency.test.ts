import assert from "node:assert/strict";
import test from "node:test";

import { accountDeletionRequestSchema, accountExportSchema, appVersionSchema } from "../../shared/api-schema/account";
import { contactCompletionQuestionSchema } from "../../shared/api-schema/contact-completion";
import { eventAssessmentSchema } from "../../shared/api-schema/event-assessment";
import { eventRecommendationDismissResultSchema } from "../../shared/api-schema/event-recommendation-feedback";
import { DEFAULT_HOME_LAYOUT, homeLayoutSchema } from "../../shared/api-schema/home-layout";
import { inboxNotificationSchema } from "../../shared/api-schema/inbox-notifications";
import { inviteCodePreviewSchema, inviteCodeRedeemResultSchema, inviteCodeSchema } from "../../shared/api-schema/invite-codes";
import { inboxDeliveryPreferencesSchema } from "../../shared/api-schema/notification-delivery-policy";
import { planV2SummaryResponseSchema } from "../../shared/api-schema/plan-v2";
import { DEMO_EVENTS, DEMO_NOTES, DEMO_PEOPLE, DEMO_PLAN, DEMO_TODOS } from "../../shared/mock/demo-world";
import * as fixtures from "../../shared/mock/demo-world/fixtures";

// R08 (SC-R08-01 / 04): one demo world. Every fixture validates against its
// contract schema, every person a fixture names exists with one name and one
// company, and every sample record carries the sample mark.
test("every fixture parses with its contract schema", () => {
  homeLayoutSchema.parse(fixtures.demoHomeLayout);
  homeLayoutSchema.parse({ revision: 1, ...DEFAULT_HOME_LAYOUT });
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
});

test("the people the fixtures name all exist, each with one name and one company", () => {
  const ids = new Set<string>(DEMO_PEOPLE.map((person) => person.id));
  for (const [where, refs] of Object.entries(fixtures.demoFixturePeopleRefs)) for (const id of refs) assert.ok(ids.has(id), `${where} names ${id}`);
  assert.equal(new Set(DEMO_PEOPLE.map((person) => person.name)).size, DEMO_PEOPLE.length, "names are unique");
  // The names inside free text (questions, reasons, titles) match the person records.
  const text = JSON.stringify([fixtures.demoCompletionQuestion, fixtures.demoSecretaryNotifications, fixtures.demoEventAssessment, DEMO_NOTES, DEMO_TODOS]);
  // (「青木 里奈さん」 is a full name; 「渡辺さん」 a surname.)
  const named = text.match(/(?:\p{Script=Han}{1,3} )?\p{Script=Han}{1,3}(?=さん)/gu) ?? [];
  assert.ok(named.length >= 5);
  for (const name of named) {
    assert.ok(DEMO_PEOPLE.some((person) => person.name === name || person.name.startsWith(`${name} `)), `「${name}さん」 is not a demo person`);
  }
  // The contact rows carry the same name and company as the person records.
  for (const row of fixtures.demoContactRows) {
    const person = DEMO_PEOPLE.find((item) => item.id === row.id)!;
    assert.deepEqual([row.displayName, row.organization], [person.name, person.company]);
  }
  // An event organiser that is a demo company is spelled the same way.
  const companies = new Set<string>(DEMO_PEOPLE.map((person) => person.company));
  assert.ok(DEMO_EVENTS.some((event) => companies.has(event.organizer)));
  assert.equal(fixtures.demoEventAssessment.facts.title, DEMO_EVENTS.find((event) => event.id === "demo-event-saas-summit")!.title);
});

test("every sample record is marked, and the summary counts agree with the people", () => {
  for (const list of [DEMO_PEOPLE, DEMO_EVENTS, DEMO_NOTES, DEMO_TODOS, fixtures.demoContactRows, fixtures.demoNotes]) for (const item of list) assert.equal(item.sample, true);
  for (const item of [DEMO_PLAN, fixtures.demoCompletionQuestion, fixtures.demoEventAssessment, fixtures.demoPlanSummary.summary]) assert.equal(item.sample, true);
  const counts = fixtures.demoContactSummaryExtras.densityCounts!;
  assert.equal(counts[1] + counts[2] + counts[3], DEMO_PEOPLE.length);
  const total = fixtures.demoEventAssessment.scoreBreakdown.reduce((sum, item) => sum + item.score, 0);
  assert.equal(total, fixtures.demoEventAssessment.total);
  for (const type of fixtures.demoPlanSummary.summary.personTypes) assert.equal(type.met, DEMO_PLAN.personTypes.find((item) => item.key === type.key)!.personIds.length);
});

test("the contacts filter R11 adds works over the demo rows", () => {
  assert.deepEqual(fixtures.filterDemoContacts(new URLSearchParams("density=3")).map((row) => row.id), ["demo-person-watanabe", "demo-person-takahashi"]);
  assert.ok(fixtures.filterDemoContacts(new URLSearchParams("goalRelated=1")).every((row) => DEMO_PLAN.personTypes.some((type) => (type.personIds as readonly string[]).includes(row.id))));
  assert.deepEqual(fixtures.filterDemoContacts(new URLSearchParams("needsFollowUp=1")).map((row) => row.id), ["demo-person-watanabe", "demo-person-takahashi"]);
  assert.equal(fixtures.filterDemoContacts(new URLSearchParams()).length, DEMO_PEOPLE.length);
});
