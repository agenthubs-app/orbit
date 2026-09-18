import assert from "node:assert/strict";
import test from "node:test";
import type { SavedPortrait } from "../src/api/contract/event-registration-portrait";
import { appendPortraitAnswer, createPortraitSession, editPortraitHistory, portraitPreviewBody, portraitReceiptMatches, portraitSessionScope, portraitToView, seedPortraitHistory, type PortraitHistoryEntry } from "../src/view-models/event-registration-portrait";

test("portrait history seeds trusted stored original questions or honest legacy labels and never fabricates a proof", () => {
  const registrationData = { registration: { updatedAt: "2026-09-17T09:00:00.000Z", participantProfile: { answers: { targetAttendees: "Builders", valueOffered: "Reviews" } } } };
  assert.throws(() => seedPortraitHistory({ registrationData, questions: [], answers: {} }), /canonical registration reference/);
  const registrationSource = { actorId: "self", eventId: "event", sourceVersion: "c".repeat(64), answers: (["targetAttendees", "valueOffered"] as const).map(field => ({ responseId: `legacy:${field}`, field, label: { en: field, zh: field }, answer: field === "targetAttendees" ? "Builders" : "Reviews", question: null, questionSource: "legacy_unknown" as const, generation: null, source: "registration" as const, sourceVersion: "c".repeat(64) })) };
  const seeded = seedPortraitHistory({ registrationData, registrationSource, questions: [], answers: { targetAttendees: "Changed draft" } });
  assert.deepEqual(seeded.map(entry => [entry.field, entry.prompt, entry.answer, entry.proof]), [["targetAttendees", null, "Changed draft", { kind: "stored_response", source: "registration", sourceVersion: "c".repeat(64), responseId: "legacy:targetAttendees", answer: "Changed draft" }], ["valueOffered", null, "Reviews", { kind: "stored_response", source: "registration", sourceVersion: "c".repeat(64), responseId: "legacy:valueOffered", answer: "Reviews" }]]);
  const questions = [{ id: "target", field: "targetAttendees", prompt: "Real original formal question?", options: ["Builders"], answer: "", required: true, portraitQuestionToken: "formal-proof" }];
  const formal = seedPortraitHistory({ registrationData: { registration: null }, questions, answers: { targetAttendees: "Builders" } });
  assert.deepEqual(formal[0]!.proof, { kind: "registration_question", portraitQuestionToken: "formal-proof", answer: "Builders" });
  assert.equal(formal[0]!.prompt, "Real original formal question?");
  assert.equal(seedPortraitHistory({ registrationData: null, questions: questions.map(({ portraitQuestionToken, ...question }) => question), answers: { targetAttendees: "Builders" } }).length, 0);
});

const history: PortraitHistoryEntry[] = (["targetAttendees", "valueOffered", "desiredOutcome"] as const).map((field) => ({ id: field, field, prompt: null, options: [], answer: field, proof: { kind: "stored_response", source: "registration", responseId: `legacy:${field}`, sourceVersion: "2026-09-17T09:00:00.000Z", answer: field } }));

test("editing history keeps the valid prefix, expires its preview, and cannot mutate persisted source answers", () => {
  const session = { ...createPortraitSession(portraitSessionScope("https://a.test", "self", "event"), history), preview: { generationToken: "old-preview", answersVersion: "a".repeat(64), sourceRegistrationVersion: null, persona: {} } as never, saveState: "saved" as const };
  assert.equal(editPortraitHistory(session, 0, history[0]!.answer), session);
  const edited = editPortraitHistory(session, 1, "New value");
  assert.deepEqual(edited.history.map((entry) => entry.answer), ["targetAttendees", "New value"]);
  assert.equal(edited.history[1]!.proof.answer, "New value");
  assert.equal(edited.preview, null);
  assert.equal(edited.saveState, "idle");
  assert.equal(edited.editRevision, 1);
  assert.equal(history[1]!.answer, "valueOffered");
  assert.equal(history.length, 3);
  assert.throws(() => editPortraitHistory(session, 1, "  "));
});

test("portrait submission sends only answer proofs, deduplicates fields, and requires both core fields", () => {
  const session = createPortraitSession("scope", history.slice(0, 2));
  assert.deepEqual(portraitPreviewBody(session, "en"), { mode: "portrait-preview", language: "en", responses: history.slice(0, 2).map((entry) => entry.proof) });
  assert.throws(() => portraitPreviewBody(createPortraitSession("scope", history.slice(1)), "en"));
  assert.throws(() => appendPortraitAnswer(session, history[0]!));
  assert.equal(appendPortraitAnswer(session, history[2]!).history.length, 3);
  assert.notEqual(portraitSessionScope("https://a.test", "self", "event"), portraitSessionScope("https://b.test", "self", "event"));
});

test("portrait read and receipt validation never report completion for malformed or cross-scope data", () => {
  assert.equal(portraitToView({ portrait: null }), null);
  assert.throws(() => portraitToView({ portrait: { id: "forged" } }));
  assert.equal(portraitReceiptMatches({ receipt: { mutationId: "save" } }, { portrait: null }, "self", "event", "save"), false);
});

test("portrait completion requires its exact save receipt and independently read matching durable version", () => {
  const portrait: SavedPortrait = { id: "portrait:self", actorId: "self", eventId: "event", version: 2, updatedAt: "2026-09-17T10:00:00.000Z", generatedAt: "2026-09-17T09:59:00.000Z", sourceEventVersion: "event-core-postgres:event:v1", sourceQuestionSetHash: null, sourceQuestionSetVersion: null, sourceRegistrationVersion: "2026-09-17T09:00:00.000Z", answersVersion: "a".repeat(64), persona: { energyStyle: "Listening", industryTags: ["Robotics"], offering: "Reviews", openers: ["What are you building?"], seeking: "Builders", tagline: "Robotics builder", tags: ["Robotics"], provenance: { generationMethod: "orbit-agent-model-adaptive", fallbackReason: null, model: "synthetic", provider: "synthetic" } }, sourceAnswers: history.slice(0, 2).map((entry) => ({ field: entry.field, responseId: entry.id, label: { en: entry.field, zh: entry.field }, answer: entry.answer, question: null, questionSource: "legacy_unknown", generation: null, source: "registration", sourceVersion: "2026-09-17T09:00:00.000Z" })) };
  const data = { portrait, receipt: { mutationId: "save", portraitId: portrait.id, actorId: "self", eventId: "event", portraitVersion: 2, answersVersion: portrait.answersVersion, updatedAt: portrait.updatedAt } };
  assert.deepEqual(portraitToView({ portrait }), portrait);
  assert.equal(portraitReceiptMatches(data, { portrait }, "self", "event", "save"), true);
  for (const patch of [{ actorId: "other" }, { eventId: "other" }, { version: 3 }, { answersVersion: "b".repeat(64) }, { updatedAt: "2026-09-17T10:01:00.000Z" }]) assert.equal(portraitReceiptMatches(data, { portrait: { ...portrait, ...patch } }, "self", "event", "save"), false);
  assert.equal(portraitReceiptMatches(data, { portrait }, "self", "event", "other-save"), false);
});
