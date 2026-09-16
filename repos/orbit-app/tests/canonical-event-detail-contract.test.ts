import assert from "node:assert/strict";
import test from "node:test";

// Dynamic lookup lets the first RED name missing behavior instead of failing module setup.
const modulePath = "../src/api/canonical-event-detail-contract";
let contract: Record<string, any> | null;
test.before(async () => { contract = await import(modulePath).catch(() => null); });
function schema(name: string, ...args: string[]) {
  assert.ok(contract, "canonical consumer validation is not implemented");
  assert.equal(typeof contract[name], "function");
  return contract[name](...args);
}
const eligibility = { allowedActions: [], applicationVersion: null, evaluatedAt: "2026-09-16T11:29:12.959Z", policyVersion: null, reason: "unavailable", registrationVersion: null, state: "unavailable" };
const questionSet = { provenance: { aiProviderRequested: false, externalNetworkRequested: false, fallbackReason: "QUESTIONS_NOT_REQUESTED", generationMethod: "deterministic-not-requested", model: null, provider: null }, questions: [] };
const registration = { id: "registration-1", eventId: "event-1", userId: "actor-1", status: "rsvped", participantProfileId: "profile-1", participantProfile: { id: "profile-1", eventId: "event-1", userId: "actor-1", answers: { desiredOutcome: "投资合作" } }, updatedAt: "2026-09-16T00:00:00Z" };

test("actual questions-disabled unavailable registration remains valid unavailable, not malformed or ordinary empty", () => {
  const parsed = schema("createCanonicalRegistrationSchema", "event-1", "actor-1").parse({ eligibility, questionSet, registration: null });
  assert.equal(parsed.eligibility.state, "unavailable");
  assert.deepEqual(parsed.eligibility.allowedActions, []);
});
for (const field of ["evaluatedAt", "state", "allowedActions"]) test(`registration rejects invalid server ${field}`, () => {
  const broken = { ...eligibility, [field]: field === "allowedActions" ? ["send"] : "invalid" };
  assert.equal(schema("createCanonicalRegistrationSchema", "event-1", "actor-1").safeParse({ eligibility: broken, questionSet, registration: null }).success, false);
});
for (const patch of [{ eventId: "event-2" }, { userId: "actor-2" }, { participantProfileId: "wrong" }, { participantProfile: { ...registration.participantProfile, userId: "actor-2" } }]) test(`registration refuses actor/event/profile mismatch ${JSON.stringify(patch)}`, () => {
  assert.equal(schema("createCanonicalRegistrationSchema", "event-1", "actor-1").safeParse({ eligibility: { ...eligibility, state: "registered", reason: "registered" }, questionSet, registration: { ...registration, ...patch } }).success, false);
});
test("registered eligibility without an active registration is rejected rather than authorizing downstream reads", () => {
  assert.equal(schema("createCanonicalRegistrationSchema", "event-1", "actor-1").safeParse({ eligibility: { ...eligibility, state: "registered", reason: "registered" }, questionSet, registration: null }).success, false);
});
test("unexpected question generation provenance is rejected by the read-only contract", () => {
  assert.equal(schema("createCanonicalRegistrationSchema", "event-1", "actor-1").safeParse({ eligibility, registration: null, questionSet: { ...questionSet, provenance: { ...questionSet.provenance, aiProviderRequested: true } } }).success, false);
});
const me = { participantId: "p1", displayName: "当前参会者" };
const other = { participantId: "p2", displayName: "投资人", company: "示例公司", privateEmail: "must-not-survive" };
const result = { eventId: "event-1", me, directory: [me, other], resultsState: "ready", recommendations: { sourceParticipantId: "p1", noMatchReason: null, recommendations: [{ targetParticipantId: "p2", score: 82, reasons: ["共同关注机器人"], memberHint: "交流产业经验", icebreakers: ["聊聊机器人", "交流投资方向"] }] }, graph: { private: true }, contactRequests: [{ private: true }] };
test("published attendee recommendations consume only scoped fields, not raw graph or private directory properties", () => {
  const parsed = schema("createCanonicalOperationsSchema", "event-1", "p1").parse(result);
  assert.equal(parsed.recommendations.sourceParticipantId, "p1");
  assert.equal("graph" in parsed, false);
  assert.equal("contactRequests" in parsed, false);
  assert.equal("privateEmail" in parsed.directory[1], false);
});
for (const patch of [{ eventId: "event-2" }, { recommendations: { ...result.recommendations, sourceParticipantId: "p2" } }, { directory: [me] }, { resultsState: "processing" }]) test(`operations refuses inconsistent event/source/visibility ${JSON.stringify(patch)}`, () => {
  assert.equal(schema("createCanonicalOperationsSchema", "event-1", "p1").safeParse({ ...result, ...patch }).success, false);
});
test("same-event self-consistent foreign attendee recommendations cannot satisfy the current registration identity", () => {
  const foreign = { ...result, me: { participantId: "foreign-profile", displayName: "其他账号" }, recommendations: { ...result.recommendations, sourceParticipantId: "foreign-profile" } };
  assert.equal(schema("createCanonicalOperationsSchema", "event-1", "p1").safeParse(foreign).success, false);
});
const artifact = { summary: "已保存的会后总结", evidenceHash: "hash-1", evidenceIds: ["evidence-1"], generatedAt: "2026-10-28T01:00:00Z", messageDraft: null, model: "saved-model", provider: "saved-provider", promptVersion: 1, version: 1 };
test("stored ready artifact requires real metadata and never invents a review/contact identity", () => {
  const parsed = schema("createCanonicalArtifactSchema", "event-1").parse({ eventId: "event-1", status: "ready", failureCode: null, updatedAt: artifact.generatedAt, artifact });
  assert.equal(parsed.artifact.summary, "已保存的会后总结");
  assert.equal("reviewId" in parsed, false);
});
test("ready artifact accepts the backend's permitted empty citation list without losing stored provenance", () => {
  const parsed = schema("createCanonicalArtifactSchema", "event-1").parse({ eventId: "event-1", status: "ready", failureCode: null, updatedAt: artifact.generatedAt, artifact: { ...artifact, evidenceIds: [] } });
  assert.equal(parsed.artifact.provider, "saved-provider");
  assert.deepEqual(parsed.artifact.evidenceIds, []);
});
for (const patch of [{ eventId: "event-2" }, { artifact: null }, { artifact: { ...artifact, evidenceHash: "" } }, { status: "queued" }]) test(`artifact rejects inconsistent ready identity or metadata ${JSON.stringify(patch)}`, () => {
  assert.equal(schema("createCanonicalArtifactSchema", "event-1").safeParse({ eventId: "event-1", status: "ready", failureCode: null, updatedAt: artifact.generatedAt, artifact, ...patch }).success, false);
});
