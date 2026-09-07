import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createCardUploadHandlers } from "../../app/api/contact-drafts/business-card/uploads/handlers";
import { CardUploadSourceError } from "../../features/acquisition/storage/business-card-upload-source-error";
import type { AuthenticatedApiActor } from "../../app/api/_shared/authenticated-actor";

test("upload mode requires a session and reports the configured storage path", async () => {
  const anonymous = createCardUploadHandlers({ resolveActor: async () => null, privateUploads: () => { assert.fail("anonymous mode lookup"); } });
  assert.equal((await anonymous.mode()).status, 401);
  for (const directUpload of [true, false]) {
    const handler = createCardUploadHandlers({ resolveActor: async () => ({ id: "owner" }) as AuthenticatedApiActor, privateUploads: () => directUpload });
    const response = await handler.mode();
    assert.deepEqual(await response.json(), { data: { directUpload } });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("consumption distinguishes a missing upload from an expired source without provider details", async () => {
  for (const [code, status] of [["UPLOAD_SOURCE_NOT_UPLOADED", 404], ["UPLOAD_SOURCE_EXPIRED", 410]] as const) {
    const handler = createCardUploadHandlers({ resolveActor: async () => ({ id: "owner" }) as AuthenticatedApiActor,
      consumeV2: async () => async () => { throw new CardUploadSourceError(code); },
    });
    const response = await handler.consume(new Request("https://orbit.test/uploads/consume-v2", { method: "POST",
      headers: { origin: "https://orbit.test", "content-type": "application/json" },
      body: JSON.stringify({ sourceId: randomUUID(), batchId: "batch", itemId: "item", operation: "upload" }),
    }));
    assert.equal(response.status, status); assert.deepEqual(await response.json(), { error: { code } });
  }
});
