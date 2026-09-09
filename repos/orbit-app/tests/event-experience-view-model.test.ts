import assert from "node:assert/strict";
import test from "node:test";
import type { EventExperienceSnapshotContract } from "../src/api/contract/event-experience";
import { initialEventExperienceConfiguration, eventExperienceConfigurationFromSnapshot, eventExperienceQuestionsForTrack, eventExperienceInitialQuestion, eventExperienceValidation, eventExperienceFreeze, eventExperiencePath } from "../src/view-models/event-experience";

test("initial editor preserves the agreed standard questions and display defaults", () => {
  assert.deepEqual(initialEventExperienceConfiguration(), {
    accentColor: null, coverAssetId: null, introduction: null, templateId: "default",
    questionSet: { track: "v1", questions: [
      { id: "target_attendees", intent: "target_attendees", options: ["Founders", "Operators", "Investors or partners"], participantProfileField: "targetAttendees", prompt: "Who would make this event useful for you?", required: true },
      { id: "value_offered", intent: "value_offered", options: ["Introductions", "Operating experience", "Feedback or expertise"], participantProfileField: "valueOffered", prompt: "What could you offer people you meet here?", required: true },
    ] },
  });
});

test("draft precedes published and empty snapshots fall back to defaults", () => {
  const configuration = initialEventExperienceConfiguration();
  const version = { configuration, createdAt: "2026-09-10T00:00:00Z", createdByActorId: "owner", eventId: "event", hash: "hash", version: 1 };
  const snapshot: EventExperienceSnapshotContract = { draft: { ...version, configuration: { ...configuration, introduction: "Draft" } }, published: { ...version, configuration: { ...configuration, introduction: "Published" } }, head: { eventId: "event", revision: 2, draftVersion: 1, publishedVersion: 1, publishedAt: null, frozenAt: null } };
  assert.equal(eventExperienceConfigurationFromSnapshot(snapshot).introduction, "Draft");
  assert.equal(eventExperienceConfigurationFromSnapshot({ ...snapshot, draft: null }).introduction, "Published");
  assert.equal(eventExperienceConfigurationFromSnapshot(null).questionSet.questions.length, 2);
});

test("switching tracks keeps edits, restores required target/value order and bounds custom unique intents", () => {
  const questions = [eventExperienceInitialQuestion("positioning"), { ...eventExperienceInitialQuestion("value_offered"), prompt: "Edited" }];
  const standard = eventExperienceQuestionsForTrack("v1", questions);
  assert.deepEqual(standard.map(q => [q.intent, q.required]), [["target_attendees", true], ["value_offered", true]]);
  assert.equal(standard[1]?.prompt, "Edited");
  assert.ok(eventExperienceQuestionsForTrack("v2", standard).every(q => !q.required));
  assert.equal(eventExperienceQuestionsForTrack("v2", []).length, 0);
  const custom = eventExperienceQuestionsForTrack("v2", [...questions, ...questions, eventExperienceInitialQuestion("desired_outcome"), eventExperienceInitialQuestion("follow_up_preference"), eventExperienceInitialQuestion("target_attendees")]);
  assert.equal(custom.length, 4);
  assert.equal(new Set(custom.map(q => q.intent)).size, 4);
});

test("all fixed intents use accepted prompts, options and profile mappings", () => {
  for (const [intent, field, prompt, options] of [
    ["desired_outcome", "desiredOutcome", "What outcome would make this event worthwhile?", ["A pilot", "A useful introduction"]],
    ["follow_up_preference", "followUpPreference", "How would you prefer to continue a useful conversation?", ["A short follow-up", "A deeper conversation"]],
    ["positioning", "positioning", "How would you like other participants to understand your work?", ["Founder", "Operator", "Investor or partner"]],
  ] as const) assert.deepEqual(eventExperienceInitialQuestion(intent), { id: intent, intent, participantProfileField: field, prompt, options, required: false });
});

test("validation rejects blank/duplicate/oversize options without dropping rows and permits legal display edits", () => {
  const initial = initialEventExperienceConfiguration();
  assert.equal(eventExperienceValidation({ ...initial, introduction: "Hello", accentColor: "#12abCD" }), null);
  for (const options of [["", "B"], ["A", " A "], ["A"], ["A", "B", "C", "D", "E", "F"], ["A", "x".repeat(81)]]) {
    const configuration = { ...initial, questionSet: { ...initial.questionSet, questions: initial.questionSet.questions.map((q, i) => i ? q : { ...q, options }) } };
    assert.ok(eventExperienceValidation(configuration));
    assert.deepEqual(configuration.questionSet.questions[0]?.options, options);
  }
  for (const patch of [{ introduction: "x".repeat(1001) }, { accentColor: "red" }, { coverAssetId: "asset" }]) assert.ok(eventExperienceValidation({ ...initial, ...patch }));
  for (const prompt of [" ", "x".repeat(241)]) assert.ok(eventExperienceValidation({ ...initial, questionSet: { ...initial.questionSet, questions: initial.questionSet.questions.map(q => ({ ...q, prompt })) } }));
  assert.equal(eventExperienceValidation({ ...initial, questionSet: { track: "v2", questions: [] } }), null);
});

test("deadline locks only questions and compares the published question set", () => {
  const configuration = initialEventExperienceConfiguration();
  const version = { configuration, createdAt: "2026-09-10T00:00:00Z", createdByActorId: "owner", eventId: "event", hash: "hash", version: 1 };
  const snapshot: EventExperienceSnapshotContract = { draft: version, published: version, head: { eventId: "event", revision: 2, draftVersion: 1, publishedVersion: 1, publishedAt: null, frozenAt: "2026-09-11T00:00:00Z" } };
  assert.deepEqual(eventExperienceFreeze(snapshot, configuration, Date.parse("2026-09-10T00:00:00Z")), { frozen: false, blocked: false, canRestore: false });
  const now = Date.parse("2026-09-11T00:00:00Z");
  assert.deepEqual(eventExperienceFreeze(snapshot, { ...configuration, introduction: "Still editable" }, now), { frozen: true, blocked: false, canRestore: false });
  assert.deepEqual(eventExperienceFreeze(snapshot, { ...configuration, questionSet: { questions: configuration.questionSet.questions, track: "v1" } }, now), { frozen: true, blocked: false, canRestore: false }, "object field order does not change the matching question set");
  assert.deepEqual(eventExperienceFreeze(snapshot, { ...configuration, questionSet: { track: "v2", questions: [] } }, now), { frozen: true, blocked: true, canRestore: true });
  assert.deepEqual(eventExperienceFreeze({ ...snapshot, published: null }, configuration, now), { frozen: true, blocked: true, canRestore: false });
});

test("mutation paths encode the entire event identifier once", () => {
  assert.equal(eventExperiencePath("event:/?# 空"), "/api/events/event%3A%2F%3F%23%20%E7%A9%BA/experience");
});
