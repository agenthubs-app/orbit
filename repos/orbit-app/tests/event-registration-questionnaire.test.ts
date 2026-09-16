import assert from "node:assert/strict";
import test from "node:test";
import { registrationQuestionDraft, registrationQuestionAnswer, registrationQuestionOptions, registrationQuestionnaireProgress } from "../src/view-models/event-registration-questionnaire";

test("ordinary choices serialize only their option while custom answers reopen other", () => {
  assert.deepEqual(registrationQuestionDraft(["Founder"], "Founder"), { mode: "option", option: "Founder", customText: "" });
  assert.deepEqual(registrationQuestionDraft(["Founder"], "Independent advisor"), { mode: "other", option: null, customText: "Independent advisor" });
  assert.equal(registrationQuestionAnswer({ mode: "other", option: null, customText: "  " }), "");
  assert.equal(registrationQuestionAnswer({ mode: "option", option: "Founder", customText: "Hidden draft" }), "Founder");
  assert.equal(registrationQuestionAnswer(registrationQuestionDraft([], "Open answer")), "Open answer");
});
test("reserved other labels become one UI entrance without discarding similar ordinary labels", () => {
  assert.deepEqual(registrationQuestionOptions(["Founder", "其他", "Other", "その他", "Other industry"]), ["Founder", "Other industry"]);
  assert.equal(registrationQuestionDraft(["Founder", "Other"], "Other").mode, "other");
});
test("coverage is eight legal dimensions, deduplicated and separate from two core answers", () => {
  assert.deepEqual(registrationQuestionnaireProgress([]), { answeredCount: 0, totalCount: 8, coreAnsweredCount: 0, coreTotalCount: 2, canSuggestStop: false });
  assert.deepEqual(registrationQuestionnaireProgress([{ field: "targetAttendees", answer: "Founders" }]), { answeredCount: 1, totalCount: 8, coreAnsweredCount: 1, coreTotalCount: 2, canSuggestStop: false });
  assert.deepEqual(registrationQuestionnaireProgress([{ field: "targetAttendees", answer: "Founders" }, { field: "targetAttendees", answer: "Investors" }, { field: "valueOffered", answer: "Experience" }, { field: "industry", answer: " " }, { field: "unknown", answer: "ignored" }]), { answeredCount: 2, totalCount: 8, coreAnsweredCount: 2, coreTotalCount: 2, canSuggestStop: true });
  assert.equal(registrationQuestionnaireProgress(["positioning", "industry", "targetAttendees", "valueOffered", "desiredOutcome", "energyStyle", "experienceHighlight", "followUpPreference"].map(field => ({ field, answer: "A" }))).answeredCount, 8);
});
