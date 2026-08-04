import assert from "node:assert/strict";
import test from "node:test";

import type { LiveContactsGraphProvider } from "../../features/contacts/live-service";
import { createMemoryHumanEncounterProjectionRepository } from "../../features/encounters/memory-projection-repository";
import { projectPendingHumanEncounters } from "../../features/encounters/projector";
import { createHumanEncounterService, type HumanEncounterRecord } from "../../features/encounters/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function providerFor(contactVisible: boolean): LiveContactsGraphProvider {
  return {
    source: "test",
    sourceLabel: "test",
    async readContactGraph() { return { contacts: [], connections: [], evidence: [], generatedAt: "2026-08-04T06:00:00.000Z" }; },
    async readContactGraphForContact(contactId: string, actorId?: string) {
      return { contacts: contactVisible && actorId === "actor:aiko" ? [{ id: contactId }] : [], connections: [], evidence: [], generatedAt: "2026-08-04T06:00:00.000Z" };
    },
  } as unknown as LiveContactsGraphProvider;
}

async function capture(idempotencyKey: string, noteText: string, observedAt: string, options: { projected?: boolean; canonical?: boolean } = {}): Promise<HumanEncounterRecord> {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createHumanEncounterService({
    contactProvider: providerFor(options.projected ?? true),
    now: () => "2026-08-04T06:00:00.000Z",
    relationshipAuthority: { async isCanonicalRelationshipSide(input) { return options.canonical !== false && input.eventId === "event:tokyo-ai-night" && input.actorId === "actor:aiko" && input.contactId === "contact:ren"; } },
    store,
    workspaceId: "workspace:test",
  });
  return service.capture({
    actorId: "actor:aiko",
    commitments: ["Aiko sends a bilingual pilot brief", "Ren introduces a mobility operator"],
    contactId: "contact:ren",
    eventId: "event:tokyo-ai-night",
    idempotencyKey,
    nextStep: "Review the pilot economics on Friday",
    noteText,
    observedAt,
    privacy: "private",
    talked: "yes",
    tags: ["cross-border", "mobility"],
  });
}

test("explicit encounter can save immediately from canonical accepted relationship before contact outbox projection", async () => {
  const record = await capture("encounter:acceptance-race", "Saved immediately after the target accepted the card exchange.", "2026-08-04T05:40:00.000Z", { projected: false, canonical: true });
  assert.equal(record.projection.status, "pending");
  assert.equal(record.contactId, "contact:ren");
});

test("two workers append two encounters to one contact without lost or duplicate notes", async () => {
  const first = await capture("encounter:aiko-ren:1", "We compared regulated enterprise sales cycles in Japan and Singapore.", "2026-08-04T05:40:00.000Z");
  const second = await capture("encounter:aiko-ren:2", "We agreed on a mobility data pilot with explicit procurement owners.", "2026-08-04T05:45:00.000Z");
  const repository = createMemoryHumanEncounterProjectionRepository([first, second]);
  const [workerA, workerB] = await Promise.all([
    projectPendingHumanEncounters({ limit: 1, now: () => "2026-08-04T06:00:00.000Z", repository, workerId: "worker:a" }),
    projectPendingHumanEncounters({ limit: 1, now: () => "2026-08-04T06:00:00.000Z", repository, workerId: "worker:b" }),
  ]);
  assert.equal(workerA.completed + workerB.completed, 2);
  const detail = repository.detail("actor:aiko", "contact:ren")!;
  assert.equal(detail.notes.length, 2);
  assert.equal(new Set(detail.notes.map((note) => note.noteId)).size, 2);
  assert.match(detail.notes.map((note) => note.body).join("\n"), /mobility data pilot/);
  assert.equal(detail.lastInteraction?.occurredAt, "2026-08-04T05:45:00.000Z");
});

test("crash after contact write rolls back atomically and retry appends exactly once", async () => {
  const record = await capture("encounter:crash-retry", "A detailed follow-up memo that must survive worker restart.", "2026-08-04T05:50:00.000Z");
  const repository = createMemoryHumanEncounterProjectionRepository([record]);
  const crashed = await projectPendingHumanEncounters({
    afterContactWrite: async () => { throw new Error("simulated process crash after contact write"); },
    now: () => "2026-08-04T06:00:00.000Z",
    repository,
    workerId: "worker:crash",
  });
  assert.equal(crashed.retried, 1);
  assert.equal(repository.detail("actor:aiko", "contact:ren"), null, "transaction rollback removes the partial contact write");
  const retried = await projectPendingHumanEncounters({ now: () => "2026-08-04T06:01:00.000Z", repository, workerId: "worker:retry" });
  assert.equal(retried.completed, 1);
  assert.equal(repository.detail("actor:aiko", "contact:ren")!.notes.length, 1);
  assert.equal(repository.encounter(record.encounterId)!.projection.status, "completed");
});

test("human encounter rejects contacts outside both projected and canonical actor relationship graphs", async () => {
  await assert.rejects(() => capture("forged", "forged", "2026-08-04T05:50:00.000Z", { projected: false, canonical: false }), /not an accepted canonical relationship side/);
});

test("event-scoped encounter rejects a globally projected contact without accepted canonical event authority", async () => {
  await assert.rejects(
    () => capture("wrong-event-authority", "Globally visible but not accepted for this event.", "2026-08-04T05:50:00.000Z", { projected: true, canonical: false }),
    /not an accepted canonical relationship side for this actor and event/,
  );
});

test("encounter idempotency replays the same request and rejects key reuse with changed content", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createHumanEncounterService({ contactProvider: providerFor(true), now: () => "2026-08-04T06:00:00.000Z", relationshipAuthority: { async isCanonicalRelationshipSide() { return true; } }, store, workspaceId: "workspace:test" });
  const base = { actorId: "actor:aiko", contactId: "contact:ren", eventId: "event:tokyo-ai-night", idempotencyKey: "stable-key", noteText: "Original detailed memo", observedAt: "2026-08-04T05:50:00.000Z", privacy: "private" as const, talked: "yes" as const };
  const first = await service.capture(base);
  assert.equal((await service.capture(base)).encounterId, first.encounterId);
  await assert.rejects(() => service.capture({ ...base, noteText: "Different content using the same key" }), /already used for different encounter content/);
});
