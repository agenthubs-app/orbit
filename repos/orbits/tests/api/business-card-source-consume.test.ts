import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createCardUploadHandlers } from "../../app/api/contact-drafts/business-card/uploads/handlers";
import { IngestConflictError, type IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";

const actor = { id: "owner" } as AuthenticatedApiActor;
const input = { sourceId: randomUUID(), batchId: "batch", itemId: "item", operation: "replace", expectedVersion: 3 };
const request = (body: unknown, origin = "https://orbit.test") => new Request("https://orbit.test/api/contact-drafts/business-card/uploads/consume-v2", {
  method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body),
});

test("source consume HTTP boundary authenticates and validates targets before database work", async () => {
  let runs = 0, signedIn: AuthenticatedApiActor | null = null;
  const handler = createCardUploadHandlers({ resolveActor: async () => signedIn, consumeV2: async () => async (received) => {
    runs++; assert.equal(received.actorId, actor.id); assert.equal(received.expectedVersion, 3);
    return { item: { id: "item" } as IngestItemDTO, reused: true };
  } }).consume;
  assert.equal((await handler(request(input))).status, 401);
  signedIn = actor;
  assert.equal((await handler(request(input, "https://other.test"))).status, 403);
  for (const invalid of [{ ...input, actorId: "other" }, { ...input, expectedVersion: 0 }, { ...input, sourceId: "url" }, { ...input, operation: "delete" }]) {
    assert.equal((await handler(request(invalid))).status, 400);
  }
  assert.equal(runs, 0);
  const response = await handler(request(input));
  assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).data.reused, true); assert.equal(runs, 1);
});

test("source consume preserves meaningful conflicts without exposing provider diagnostics", async () => {
  for (const [cause, status, code] of [
    [new IngestConflictError("VERSION_CONFLICT", "private detail"), 409, "VERSION_CONFLICT"],
    [new IngestConflictError("BATCH_GONE", "private detail"), 404, "BATCH_GONE"],
    [new Error("private provider diagnostic"), 503, "UPLOAD_CONSUMPTION_UNAVAILABLE"],
  ] as const) {
    const handler = createCardUploadHandlers({ resolveActor: async () => actor, consumeV2: async () => async () => { throw cause; } }).consume;
    const response = await handler(request(input)); assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
  }
});
