import assert from "node:assert/strict";
import test from "node:test";
import { contactDetailToSummary } from "../src/view-models/contacts";

// Sprint 0126: a contact created with the App's manual form stores the user's note
// as "Manual note: <note> · <next step>". The Chinese contact detail tried to
// localize it like English seed copy, found no keyword and showed "关系背景待补充。",
// while the web detail shows the note. Payload captured from GET /api/contacts/:id
// on the local production build (QA data, since deleted).
const manualContact = {"id":"contact:manual:734b95531edf79dac2e11bfa","displayName":"QA Person 0126","role":"Head of Sales","organization":"QA Corp","location":"","profileSnippet":null,"relationshipContext":"Manual note: Met at QA meetup · Call next week","selfIntroduction":null,"status":"needs_follow_up","source":{"type":"manual","label":"Live manual contact note · confirmed by qa0126a"},"nextAction":"","publicProfile":{"bio":"Manual note: Met at QA meetup · Call next week","selfIntroduction":"Manual note: Met at QA meetup · Call next week","offering":[],"seeking":[],"topics":[]}};

test("a user's own manual note is shown on the Chinese contact detail, as on the web", () => {
  const summary = contactDetailToSummary({ contact: manualContact });
  assert.equal(summary.relationship, "Met at QA meetup · Call next week");
});

test("a Chinese manual note keeps its text and drops only the storage label", () => {
  const summary = contactDetailToSummary({ contact: { ...manualContact,
    relationshipContext: "Manual note: 在QA活动认识 · 下周约电话",
    publicProfile: { ...manualContact.publicProfile, bio: "Manual note: 在QA活动认识 · 下周约电话", selfIntroduction: "" } } });
  assert.equal(summary.relationship, "在QA活动认识 · 下周约电话");
});

test("English seed copy without the manual-note label is still localized, not shown raw", () => {
  const summary = contactDetailToSummary({ contact: { ...manualContact,
    relationshipContext: "Founder at Aster Grid focused on storage pilot partnerships.",
    publicProfile: { bio: "", selfIntroduction: "" } } });
  assert.equal(summary.relationship, "QA Corp 的Head of Sales，正在推进储能试点合作。");
});

test("an empty manual note still falls back to the pending placeholder", () => {
  const summary = contactDetailToSummary({ contact: { ...manualContact,
    relationshipContext: "Manual note:   ", publicProfile: { bio: "", selfIntroduction: "" } } });
  assert.equal(summary.relationship, "关系背景待补充。");
});
