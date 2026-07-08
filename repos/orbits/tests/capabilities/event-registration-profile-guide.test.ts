import assert from "node:assert/strict";
import test from "node:test";

import {
  mockEventRecords,
  mockOrbitAiRecommendedEventDetailRecord,
} from "../../features/events/event-crud-and-import/fixtures";
import {
  buildRegistrationProfileGuide,
  listRegisterableDemoRegistrationProfileGuides,
  loadRegistrationProfileGuideForCurrentTestUser,
} from "../../features/events/registration-profile-guide";
import {
  mockManualProfile,
  mockProfileFixture,
} from "../../features/profile/fixtures";

function eventById(eventId: string) {
  const event =
    eventId === mockOrbitAiRecommendedEventDetailRecord.id
      ? mockOrbitAiRecommendedEventDetailRecord
      : mockEventRecords.find((record) => record.id === eventId);

  assert.ok(event, `${eventId} must exist in the deterministic event fixtures`);

  return event;
}

function guideFor(eventId: string, languagePreference: "en" | "zh") {
  const guide = buildRegistrationProfileGuide({
    completeness: mockProfileFixture.completeness,
    event: eventById(eventId),
    languagePreference,
    profile: mockManualProfile,
  });

  assert.equal(guide.state, "success", `${eventId} must be registerable`);

  if (guide.state !== "success") {
    throw new Error(`${eventId} did not produce a registration guide`);
  }

  return guide.guide;
}

test("every registerable demonstration event has deterministic non-generic questions for the current test user", () => {
  const registerableFixtureEventIds = [
    ...mockEventRecords,
    mockOrbitAiRecommendedEventDetailRecord,
  ]
    .filter((event) => ["confirmed", "imported"].includes(event.status))
    .map((event) => event.id)
    .sort();
  const guides = listRegisterableDemoRegistrationProfileGuides({
    languagePreference: "en",
  });

  assert.deepEqual(
    guides.map((guide) => guide.event.id).sort(),
    registerableFixtureEventIds,
  );

  for (const guide of guides) {
    assert.equal(guide.currentUser.id, mockManualProfile.id);
    assert.equal(guide.provenance.generationMethod, "deterministic-demo-fixture");
    assert.equal(guide.provenance.aiProviderRequested, false);
    assert.equal(guide.answersPersistence, "staged-until-confirmed");
    assert.ok(
      guide.questions.length >= 4,
      `${guide.event.id} must not fall back to an empty generic guide`,
    );
    assert.ok(
      guide.questions.some(
        (question) => question.profileField === "preferredIntroChannels",
      ),
      `${guide.event.id} must ask about the current user's missing intro-channel field`,
    );

    const prompts = guide.questions.map((question) => question.prompt).join(" ");

    assert.doesNotMatch(prompts, /tell us about yourself|generic question|TBD/i);
    assert.match(prompts, new RegExp(guide.topic.split(" ")[0], "i"));
  }
});

test("question sets differ by event topic target attendees language and missing profile fields", () => {
  const climate = guideFor("demo-event-1", "en");
  const storage = guideFor("demo-event-2", "zh");
  const investor = guideFor("event_001", "en");

  assert.notEqual(climate.topic, storage.topic);
  assert.notEqual(storage.topic, investor.topic);
  assert.notEqual(climate.targetAttendees, storage.targetAttendees);
  assert.notEqual(storage.targetAttendees, investor.targetAttendees);
  assert.equal(climate.languagePreference, "en");
  assert.equal(storage.languagePreference, "zh");

  assert.notDeepEqual(
    climate.questions.map((question) => question.prompt),
    storage.questions.map((question) => question.prompt),
  );
  assert.notDeepEqual(
    storage.questions.map((question) => question.prompt),
    investor.questions.map((question) => question.prompt),
  );

  assert.ok(
    climate.questions.some((question) => /climate/i.test(question.prompt)),
  );
  assert.ok(
    storage.questions.some((question) => /储能|storage/i.test(question.prompt)),
  );
  assert.ok(
    investor.questions.some((question) => /investor|投资/i.test(question.prompt)),
  );
  assert.ok(
    storage.questions.some((question) =>
      question.missingProfileFields.includes("preferredIntroChannels"),
    ),
  );
});

test("current test user loader reads event context without writing profile answers", async () => {
  const result = await loadRegistrationProfileGuideForCurrentTestUser({
    eventId: "event_001",
    languagePreference: "en",
    mode: "mock",
  });

  assert.equal(result.state, "success");

  if (result.state === "success") {
    assert.equal(result.guide.event.id, "event_001");
    assert.equal(result.guide.event.title, "Seed Investor and Founder Matching Salon");
    assert.equal(result.guide.currentUser.missingFields.length, 1);
    assert.equal(result.guide.currentUser.missingFields[0], "preferredIntroChannels");
    assert.equal(result.guide.provenance.profileWriteExecuted, false);
    assert.equal(result.guide.provenance.liveDatabaseWriteExecuted, false);
    assert.equal(
      result.guide.confirmationLabel,
      "Review and confirm staged answers",
    );
    assert.equal(result.guide.skipGuideLabel, "Skip profile questions");
  }
});

test("current test user loader resolves canonical demo registration events without a mock-mode query", async () => {
  const result = await loadRegistrationProfileGuideForCurrentTestUser({
    eventId: "event_001",
    languagePreference: "en",
    mode: "hybrid",
  });

  assert.equal(result.state, "success");

  if (result.state === "success") {
    assert.equal(result.guide.event.id, "event_001");
    assert.match(result.guide.event.title, /Seed Investor/);
    assert.ok(
      result.guide.questions.some((question) =>
        /seed investor|warm introduction/i.test(question.prompt),
      ),
    );
    assert.equal(result.guide.provenance.aiProviderRequested, false);
    assert.equal(result.guide.provenance.profileWriteExecuted, false);
  }
});

test("questions include concise field context so technical profile terms stay understandable", () => {
  const guide = guideFor("event_001", "zh");
  const introChannelQuestion = guide.questions.find(
    (question) => question.profileField === "preferredIntroChannels",
  );

  assert.ok(introChannelQuestion);
  assert.equal(introChannelQuestion.profileFieldLabel, "preferredIntroChannels");
  assert.match(
    introChannelQuestion.profileFieldDescription,
    /偏好的引荐渠道.*邮件.*共同联系人/,
  );
  assert.ok(
    guide.questions.every((question) =>
      question.profileFieldDescription.includes(question.profileField),
    ),
    "each technical field name should be paired with user-facing context",
  );
});
