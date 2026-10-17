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
