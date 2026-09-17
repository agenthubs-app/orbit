import assert from "node:assert/strict";
import test from "node:test";
import { registrationQuestionnaireProgress } from "../../features/mobile/registration-questionnaire-progress";

test("coverage excludes blank and unknown answers and counts each legal field once", () => {
  assert.deepEqual(registrationQuestionnaireProgress([]), { answeredCount: 0, totalCount: 8, coreAnsweredCount: 0, coreTotalCount: 2, canSuggestStop: false });
  assert.deepEqual(registrationQuestionnaireProgress([{ field: "targetAttendees", answer: "Founders" }]), { answeredCount: 1, totalCount: 8, coreAnsweredCount: 1, coreTotalCount: 2, canSuggestStop: false });
  assert.deepEqual(registrationQuestionnaireProgress([{ field: "targetAttendees", answer: "Founders" }, { field: "targetAttendees", answer: "Investors" }, { field: "valueOffered", answer: "Experience" }, { field: "industry", answer: " " }, { field: "unknown", answer: "ignored" }]), { answeredCount: 2, totalCount: 8, coreAnsweredCount: 2, coreTotalCount: 2, canSuggestStop: true });
  assert.equal(registrationQuestionnaireProgress(["positioning", "industry", "targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "experienceHighlight", "followUpPreference"].map(field => ({ field, answer: "A" }))).answeredCount, 8);
});
