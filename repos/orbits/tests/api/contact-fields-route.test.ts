import assert from "node:assert/strict";
import test from "node:test";

import { createContactFieldsPatchHandler } from "../../app/api/contacts/[id]/fields/handler";
import { ContactFieldWriteError } from "../../features/contacts/contact-field-write";

// R11a SC-10（連絡先の編集）：请求严格、错误映射、只把白名单字段交给 applyContactFieldValues。
const actor = { id: "a", accountId: "a", userId: "u", workspaceId: "w", name: "T", email: "a@example.test" };
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const request = (body: unknown) => new Request("http://x/api/contacts/c1/fields", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

test("R11a: editing name / company / title / email goes through the field writer", async () => {
  assert.equal((await createContactFieldsPatchHandler({ resolveActor: async () => null })(request({ values: {} }), context("c1"))).status, 401);
  const calls: unknown[] = [];
  const handler = createContactFieldsPatchHandler({ resolveActor: async () => actor, update: async (actorId, contactId, input) => {
    calls.push([actorId, contactId, input]);
    if (contactId === "gone") throw new ContactFieldWriteError("NOT_FOUND", "x");
    if (input.values.displayName === null) throw new ContactFieldWriteError("INVALID", "A contact must keep a name.");
    return { contactId, changed: ["role"], updatedAt: "2026-10-18T00:00:00.000Z" };
  } });
  const ok = await handler(request({ values: { role: "代表取締役", email: null } }), context("c1"));
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).data.changed, ["role"]);
  assert.deepEqual(calls[0], ["a", "c1", { values: { role: "代表取締役", email: null } }]);
  assert.equal((await handler(request({ values: { nickname: "x" } }), context("c1"))).status, 400, "unknown fields are refused");
  assert.equal((await handler(request({ values: {}, extra: 1 }), context("c1"))).status, 400);
  assert.equal((await handler(request({ values: { displayName: null } }), context("c1"))).status, 400);
  assert.equal((await handler(request({ values: { role: "x" } }), context("gone"))).status, 404);
});

test("AG12-2: an optional expected version goes to the field writer; a stale one is 409; the result carries the new version; old clients unchanged", async () => {
  const calls: unknown[] = [];
  const handler = createContactFieldsPatchHandler({ resolveActor: async () => actor, update: async (_actorId, contactId, input) => {
    calls.push(input);
    if (input.expectedVersion === 2) throw new ContactFieldWriteError("CONFLICT", "The contact changed since it was read.");
    return { contactId, changed: ["role"], updatedAt: "2026-11-18T00:00:00.000Z", version: 4 };
  } });
  const ok = await handler(request({ expectedVersion: 3, values: { role: "采购部长" } }), context("c1"));
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).data.version, 4);
  assert.deepEqual(calls[0], { expectedVersion: 3, values: { role: "采购部长" } });
  const stale = await handler(request({ expectedVersion: 2, values: { role: "x" } }), context("c1"));
  assert.equal(stale.status, 409);
  assert.equal((await handler(request({ expectedVersion: -1, values: { role: "x" } }), context("c1"))).status, 400);
  assert.equal((await handler(request({ expectedVersion: 1.5, values: { role: "x" } }), context("c1"))).status, 400);
  // An old client sends no expected version: the writer gets none (it re-reads and retries as before).
  await handler(request({ values: { role: "y" } }), context("c1"));
  assert.deepEqual(calls.at(-1), { values: { role: "y" } });
});
