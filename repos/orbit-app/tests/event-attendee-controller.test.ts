import assert from "node:assert/strict";
import test from "node:test";
import { createAttendeeController } from "../src/view-models/event-attendee-controller";
import type { OrbitApiClient } from "../src/api/client";
import { attendeeFixture, participantFixture } from "./helpers/attendee-operations-fixtures";
const ok = (data: unknown) => ({ success: true as const, status: 200, data, meta: { featureMode: null, privacy: null, runtimeBoundary: null } });
test.beforeEach(() => { test.mock.method(Date, "now", () => Date.parse("2026-09-17T02:00:00Z")); });
test.afterEach(() => test.mock.restoreAll());
function setup() {
  const calls: { path: string; options: any; resolve: (value: any) => void }[] = [];
  const invoke = (path: string, options: any) => new Promise(resolve => calls.push({ path, options, resolve }));
  const client = { get: invoke, post: invoke } as unknown as OrbitApiClient;
  let current = true;
  const c = createAttendeeController({ client, eventId: "event_1", participantId: "p_other", operationsActorId: "account-one", isCurrent: () => current });
  return { c, calls, revoke() { current = false; c.dispose(); } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
async function loaded(s: ReturnType<typeof setup>, workspace: unknown = attendeeFixture(), detail: unknown = participantFixture()) {
  const pending = s.c.load(); s.calls[0]!.resolve(ok(workspace)); await tick();
  s.calls[1]!.resolve(ok(detail)); await pending;
}
test("reads workspace then exact participant; no inferred account participant", async () => {
  const s = setup(); await loaded(s);
  assert.equal(s.calls[1]!.path, "/api/events/event_1/operations/participants/p_other");
  assert.equal(s.c.getSnapshot().detail?.participantId, "p_other");
});
test("double presses serialize one explicit request and await receipt and reread", async () => {
  const s = setup(); await loaded(s);
  const pending = s.c.act("request"); void s.c.act("request");
  assert.equal(s.calls.length, 3);
  assert.deepEqual(s.calls[2]!.options.body, { targetParticipantId: "p_other", expectedRevision: null });
  assert.equal(s.c.getSnapshot().detail?.contactRequest.status, "none");
  s.revoke(); s.calls[2]!.resolve(ok({})); await pending;
  assert.equal(s.calls.length, 3);
});
test("old owner callback and late read cannot write/publish in new owner scope", async () => {
  const s = setup(); const pending = s.c.load(); s.revoke();
  s.calls[0]!.resolve(ok(attendeeFixture())); await pending;
  await s.c.act("request");
  assert.equal(s.calls.length, 1);
  assert.equal(s.c.getSnapshot().workspace, null);
  assert.equal(s.calls[0]!.options.signal.aborted, true);
});
test("conflict reloads authoritative state, exposes error and does not auto repost", async () => {
  const s = setup(); await loaded(s);
  const pending = s.c.act("request");
  s.calls[2]!.resolve({ success: false, status: 409, error: { code: "CONFLICT", message: "Changed" } }); await tick();
  assert.match(s.calls[3]!.path, /\/operations$/);
  s.calls[3]!.resolve(ok(attendeeFixture())); await tick(); s.calls[4]!.resolve(ok(participantFixture())); await pending;
  assert.equal(s.c.getSnapshot().error, "Changed");
  assert.equal(s.calls.length, 5);
});
test("malformed receipt is never success; failed refresh revokes old action data", async () => {
  const s = setup(); await loaded(s); const pending = s.c.act("request");
  s.calls[2]!.resolve(ok({})); await tick();
  s.calls[3]!.resolve({ success: false, status: 503, error: { message: "Offline", code: "UNAVAILABLE" } }); await pending;
  assert.equal(s.c.getSnapshot().workspace, null);
  assert.equal(s.c.getSnapshot().detail, null);
  assert.ok(s.c.getSnapshot().error);
  await s.c.act("request"); assert.equal(s.calls.length, 4);
});
for (const action of ["accept", "decline", "withdraw"] as const) test(`explicit ${action} uses read revision and exact direction`, async () => {
  const incoming = action !== "withdraw";
  const r = { contactId: null, requestId: "r", revision: 3, requesterParticipantId: incoming ? "p_other" : "p_me", targetParticipantId: incoming ? "p_me" : "p_other", status: "awaiting_target_consent", withdrawnAt: null };
  const s = setup(); await loaded(s, { ...attendeeFixture(), contactRequests: [r] }, { ...participantFixture(), contactRequest: { ...r, direction: incoming ? "incoming" : "outgoing" } });
  const pending = s.c.act(action); assert.equal(s.calls.length, 3);
  assert.deepEqual(s.calls[2]!.options.body, incoming ? { accept: action === "accept", expectedRevision: 3 } : { expectedRevision: 3 });
  const next = { ...r, revision: 4, status: action === "accept" ? "accepted" : action === "decline" ? "declined" : "withdrawn", contactId: action === "accept" ? "mine" : null };
  s.calls[2]!.resolve(ok({ ...next, eventId: "event_1" })); await tick();
  s.calls[3]!.resolve(ok({ ...attendeeFixture(), contactRequests: [next] })); await tick();
  s.calls[4]!.resolve(ok({ ...participantFixture(), contactRequest: { ...next, direction: incoming ? "incoming" : "outgoing" } })); await pending;
  assert.equal(s.c.getSnapshot().detail?.contactRequest.status, next.status); assert.equal(s.c.getSnapshot().error, null);
});
test("lost ACK rereads a committed request without issuing a second POST", async () => {
  const s = setup(); await loaded(s); const pending = s.c.act("request");
  s.calls[2]!.resolve({ success: false, status: 0, error: { code: "NETWORK", message: "Lost ACK" } }); await tick();
  const r = { contactId: null, requestId: "r", revision: 1, requesterParticipantId: "p_me", targetParticipantId: "p_other", status: "awaiting_target_consent", withdrawnAt: null };
  s.calls[3]!.resolve(ok({ ...attendeeFixture(), contactRequests: [r] })); await tick();
  s.calls[4]!.resolve(ok({ ...participantFixture(), contactRequest: { ...r, direction: "outgoing" } })); await pending;
  assert.equal(s.c.getSnapshot().detail?.contactRequest.status, "awaiting_target_consent");
  await s.c.act("request"); assert.equal(s.calls.length, 5);
});
test("future timegate never allows a card request even via retained direct action", async () => {
  const s = setup(); const w = attendeeFixture(); w.configuration.eventStartsAt = "2099-01-01T00:00:00Z";
  await loaded(s, w); await s.c.act("request"); assert.equal(s.calls.length, 2);
});
