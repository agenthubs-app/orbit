import assert from "node:assert/strict";
import test from "node:test";

import { createConfirmedEventFollowupsGetHandler, createConfirmedEventFollowupsPostHandler } from "../../app/api/events/[id]/post-event/followups/handler";
import type { ConfirmedEventFollowupService, ConfirmedEventFollowupView } from "../../features/events/confirmed-followup/service";
import { mockEventRecords } from "../../features/events/event-crud-and-import/fixtures";

const ACTOR = "actor:aiko";
const EVENT = "demo-event-1";
const view: ConfirmedEventFollowupView = {
  contactDisplayName: "Ren Hayashi",
  contactHref: "/app/contacts/contact%3Aren",
  contactId: "contact:ren",
  createdAt: null,
  dueAt: null,
  encounterId: "encounter:aiko-ren",
  evidenceIds: ["evidence:human-encounter:encounter:aiko-ren"],
  noteExcerpt: "Discussed a measured retail pilot.",
  reminderId: "reminder:event-followup:one",
  reminderStatus: "missing",
  sourceIndex: 0,
  sourceKind: "next_step",
  sourceText: "Review metrics on Friday",
  state: "available",
  taskHref: "/app/followups",
  taskId: "task:event-followup:one",
  taskStatus: "missing",
};

function registration() {
  return { eventId: EVENT, status: "rsvped" as const, userId: ACTOR } as never;
}

function dependencies(service: ConfirmedEventFollowupService) {
  return {
    getRegistration: async () => registration(),
    loadEvent: async () => mockEventRecords.find((event) => event.id === EVENT) ?? null,
    now: () => "2026-08-05T08:00:00.000Z",
    resolveActor: async () => ({ id: ACTOR }),
    service,
  };
}

test("GET lists only the registered actor event boundary", async () => {
  let observed: unknown = null;
  const handler = createConfirmedEventFollowupsGetHandler(dependencies({
    async confirm() { throw new Error("unused"); },
    async list(input) { observed = input; return [view]; },
  }));
  const response = await handler(new Request(`http://localhost/api/events/${EVENT}/post-event/followups`), { params: Promise.resolve({ id: EVENT }) });
  assert.equal(response.status, 200);
  assert.deepEqual(observed, { actorId: ACTOR, eventId: EVENT });
  assert.deepEqual((await response.json()).data, [view]);
});

test("POST confirms only an evidence selector plus optional due time", async () => {
  let observed: unknown = null;
  const saved = { ...view, createdAt: "2026-08-05T08:00:00.000Z", dueAt: "2026-08-09T09:00:00.000Z", reminderStatus: "pending" as const, state: "created" as const, taskStatus: "open" as const };
  const handler = createConfirmedEventFollowupsPostHandler(dependencies({
    async confirm(input) { observed = input; return saved; },
    async list() { return []; },
  }));
  const response = await handler(new Request(`http://localhost/api/events/${EVENT}/post-event/followups`, {
    body: JSON.stringify({
      dueAt: "2026-08-09T09:00:00.000Z",
      encounterId: "encounter:aiko-ren",
      sourceIndex: 0,
      sourceKind: "next_step",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  }), { params: Promise.resolve({ id: EVENT }) });
  assert.equal(response.status, 201);
  assert.deepEqual(observed, {
    actorId: ACTOR,
    dueAt: "2026-08-09T09:00:00.000Z",
    encounterId: "encounter:aiko-ren",
    eventId: EVENT,
    sourceIndex: 0,
    sourceKind: "next_step",
  });
  assert.deepEqual((await response.json()).data, saved);
});

test("route rejects malformed bodies before service execution and enforces registration", async () => {
  let calls = 0;
  const service: ConfirmedEventFollowupService = { async confirm() { calls += 1; return view; }, async list() { return []; } };
  const handler = createConfirmedEventFollowupsPostHandler(dependencies(service));
  const invalid = await handler(new Request(`http://localhost/api/events/${EVENT}/post-event/followups`, { body: JSON.stringify({ encounterId: "encounter:aiko-ren" }), headers: { "content-type": "application/json" }, method: "POST" }), { params: Promise.resolve({ id: EVENT }) });
  assert.equal(invalid.status, 400);
  assert.equal(calls, 0);

  const extraKeys = await handler(new Request(`http://localhost/api/events/${EVENT}/post-event/followups`, { body: JSON.stringify({ encounterId: "encounter:aiko-ren", sourceIndex: 0, sourceKind: "next_step", sourceText: "fabricated" }), headers: { "content-type": "application/json" }, method: "POST" }), { params: Promise.resolve({ id: EVENT }) });
  assert.equal(extraKeys.status, 400);
  const invalidDueAtType = await handler(new Request(`http://localhost/api/events/${EVENT}/post-event/followups`, { body: JSON.stringify({ dueAt: 123, encounterId: "encounter:aiko-ren", sourceIndex: 0, sourceKind: "next_step" }), headers: { "content-type": "application/json" }, method: "POST" }), { params: Promise.resolve({ id: EVENT }) });
  assert.equal(invalidDueAtType.status, 400);
  assert.equal(calls, 0);

  const forbidden = createConfirmedEventFollowupsPostHandler({ ...dependencies(service), getRegistration: async () => null });
  const denied = await forbidden(new Request(`http://localhost/api/events/${EVENT}/post-event/followups`, { body: JSON.stringify({ encounterId: "encounter:aiko-ren", sourceIndex: 0, sourceKind: "next_step" }), headers: { "content-type": "application/json" }, method: "POST" }), { params: Promise.resolve({ id: EVENT }) });
  assert.equal(denied.status, 403);
  assert.equal(calls, 0);

  const beforeEventEnd = createConfirmedEventFollowupsPostHandler({
    ...dependencies(service),
    now: () => "2026-06-28T11:00:00.000Z",
  });
  const early = await beforeEventEnd(new Request(`http://localhost/api/events/${EVENT}/post-event/followups`, { body: JSON.stringify({ encounterId: "encounter:aiko-ren", sourceIndex: 0, sourceKind: "next_step" }), headers: { "content-type": "application/json" }, method: "POST" }), { params: Promise.resolve({ id: EVENT }) });
  assert.equal(early.status, 409);
  assert.equal(calls, 0);
});
