import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "events", "EventDetailScreen.tsx"),
  "utf8"
);

test("event detail screen loads readiness and recommendation modules", () => {
  assert.match(screenSource, /eventReadinessPath/u);
  assert.match(screenSource, /eventRecommendationsPath/u);
  assert.match(screenSource, /eventReadinessToView/u);
  assert.match(screenSource, /eventRecommendationsToView/u);
  assert.match(screenSource, /title="会前准备度"/u);
  assert.match(screenSource, /title="推荐认识的人"/u);
});

test("event detail screen renders web-style event information modules", () => {
  assert.match(screenSource, /function EventRegistrationModule/u);
  assert.match(screenSource, /function EventAboutModule/u);
  assert.match(screenSource, /function EventAgendaModule/u);
  assert.match(screenSource, /function EventOrganizerModule/u);
  assert.match(screenSource, /event\.aboutSections/u);
  assert.match(screenSource, /event\.agenda/u);
  assert.match(screenSource, /event\.attendeePreview/u);
  assert.match(screenSource, /title="关于活动"/u);
  assert.match(screenSource, /title="当晚议程"/u);
  assert.match(screenSource, /title="主办方"/u);
  assert.match(screenSource, /event\.registrationActionLabel/u);
});

test("event detail registration card labels event status as event confirmation", () => {
  assert.match(screenSource, /registrationStatusLabel/u);
  assert.match(screenSource, /活动已确认/u);
  assert.doesNotMatch(
    screenSource,
    /styles\.eventStatusBadge\}>\{event\.status\}<\/Text>[\s\S]*<Pressable/u
  );
});

test("event detail recommendations can refresh an opening line through the web API", () => {
  assert.match(screenSource, /eventOpeningLinePath/u);
  assert.match(screenSource, /useOrbitApiClient/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*eventOpeningLinePath/u);
  assert.match(screenSource, /eventOpeningLineToView/u);
  assert.match(screenSource, /"换一句"/u);
});

test("event detail recommendation people include a visual identity marker", () => {
  assert.match(screenSource, /function RecommendedPersonAvatar/u);
  assert.match(screenSource, /styles\.recommendationAvatar/u);
  assert.match(screenSource, /person\.name\.slice\(0,\s*1\)/u);
  assert.match(screenSource, /<RecommendedPersonAvatar/u);
});

test("event detail readiness can confirm the current goal through the web API", () => {
  assert.match(screenSource, /eventGoalPath/u);
  assert.match(screenSource, /eventGoalRequestFromReadiness/u);
  assert.match(screenSource, /client\.put<unknown>\(\s*eventGoalPath/u);
  assert.match(screenSource, /readinessState\.refresh/u);
  assert.match(screenSource, /"确认目标"/u);
});

test("event detail readiness can choose a suggested goal or type a custom goal", () => {
  assert.match(screenSource, /TextInput/u);
  assert.match(screenSource, /goalDraft/u);
  assert.match(screenSource, /selectedSuggestionId/u);
  assert.match(screenSource, /view\.suggestedGoals\.map/u);
  assert.match(screenSource, />自定义目标</u);
  assert.match(screenSource, /"用这个目标"/u);
});

test("event detail screen loads the post-event review module", () => {
  assert.match(screenSource, /eventPostEventPath/u);
  assert.match(screenSource, /postEventState/u);
  assert.match(screenSource, /eventPostEventReviewToView/u);
  assert.match(screenSource, /EventPostEventReviewModule/u);
  assert.match(screenSource, /title="会后复核"/u);
});

test("event detail post-event review can confirm candidates through the web API", () => {
  assert.match(screenSource, /eventPostEventConfirmPath/u);
  assert.match(screenSource, /eventPostEventConfirmRequestFromReview/u);
  assert.match(screenSource, /eventPostEventConfirmToView/u);
  assert.match(screenSource, /client\.post<unknown>\(\s*eventPostEventConfirmPath/u);
  assert.match(screenSource, /postEventState\.refresh/u);
  assert.match(screenSource, /"确认这些候选"/u);
});

test("event detail post-event result links to the contact review queue", () => {
  assert.match(screenSource, /useRouter/u);
  assert.match(screenSource, /reviewQueueHref/u);
  assert.match(screenSource, /reviewQueueLabel/u);
  assert.match(
    screenSource,
    /router\.push\(confirmResult\.reviewQueueHref as Href\)/u
  );
});
