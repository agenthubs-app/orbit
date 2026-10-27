import assert from "node:assert/strict";
import test from "node:test";

import { deleteNoteOnServer } from "../src/screens/memo/delete-note";

function client(status: number, success = status < 400) {
  const calls: string[] = [];
  return {
    calls,
    delete: async (path: string) => { calls.push(path); return (success ? { success: true, data: { deleted: true }, status } : { success: false, error: { code: "X", message: "x" }, status }) as never; },
  };
}

test("QA-D: deleting a note sends DELETE with the loaded version", async () => {
  const fake = client(200);
  assert.equal(await deleteNoteOnServer(fake, { id: "note:a b", version: 3 }), "deleted");
  assert.deepEqual(fake.calls, ["/api/notes/note%3Aa%20b?expectedVersion=3"]);
});

test("QA-D: a note already gone counts as deleted; a newer edit is a conflict; anything else failed", async () => {
  assert.equal(await deleteNoteOnServer(client(404, false), { id: "n", version: 1 }), "deleted");
  assert.equal(await deleteNoteOnServer(client(409, false), { id: "n", version: 1 }), "conflict");
  assert.equal(await deleteNoteOnServer(client(405, false), { id: "n", version: 1 }), "failed");
  assert.equal(await deleteNoteOnServer(client(503, false), { id: "n", version: 1 }), "failed");
});

test("QA-D: a note that only exists on this phone is never sent", async () => {
  const fake = client(200);
  assert.equal(await deleteNoteOnServer(fake, { id: "local:1", version: 1 }), "failed");
  assert.deepEqual(fake.calls, []);
});
