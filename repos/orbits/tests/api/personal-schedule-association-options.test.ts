import assert from "node:assert/strict";
import test from "node:test";
import { createAssociationOptionsGetHandler } from "../../app/api/schedule-items/association-options/handler";
import { createAssociationOptionsService } from "../../features/personal-schedule/association-options";

function fixture() {
  let version = "v1", calls = 0;
  const service = createAssociationOptionsService(async input => {
    calls++;
    assert.equal(input.actorId, "actor-1");
    const all = Array.from({ length: 25 }, (_, i) => ({ id: `contact:${String(i).padStart(3, "0")}`, title: i === 24 ? "林悦" : `Person ${i}` }));
    const candidates = all.filter(value => !input.afterId || value.id > input.afterId).slice(0, input.limit);
    return { candidates, sourceVersion: version, hasMore: candidates.at(-1)?.id !== all.at(-1)?.id };
  });
  const handler = createAssociationOptionsGetHandler("contact", { resolveActor: async () => ({ id: "actor-1" }), service });
  return { handler, calls: () => calls, changeVersion: () => { version = "v2"; } };
}
const request = (query: string, kind = "contacts") => new Request(`https://orbit.test/api/schedule-items/association-options/${kind}?${query}`);

test("association GET returns actor-scoped empty-query summaries and server initial matches", async () => {
  const f = fixture();
  const response = await f.handler(request(""));
  assert.equal(response.status, 200);
  const data = (await response.json()).data;
  assert.equal(data.actorId, "actor-1");
  assert.equal(data.options.length, 20);
  assert.ok(data.nextCursor);
  assert.deepEqual(Object.keys(data.options[0]).sort(), ["id", "title"]);
  const matched = await f.handler(request("q=LY"));
  assert.deepEqual((await matched.json()).data.options, [{ id: "contact:024", title: "林悦" }]);
});

test("association GET rejects forged scope, unsupported or duplicated parameters before reads", async () => {
  const f = fixture();
  for (const query of ["actorId=actor-2", "kind=note", "limit=21", "limit=0", "limit=1.5", "q=one&q=two", `q=${"x".repeat(201)}`]) {
    assert.equal((await f.handler(request(query))).status, 400, query);
  }
  assert.equal(f.calls(), 0);
});

test("association GET requires authentication without constructing or calling storage", async () => {
  let calls = 0;
  const handler = createAssociationOptionsGetHandler("note", { resolveActor: async () => null, service: async () => { calls++; throw new Error("must not read"); } });
  assert.equal((await handler(request("", "notes"))).status, 401);
  assert.equal(calls, 0);
});

test("association GET distinguishes malformed cursor and changed source", async () => {
  const f = fixture();
  assert.equal((await f.handler(request("cursor=invalid"))).status, 400);
  const first = (await (await f.handler(request(""))).json()).data;
  f.changeVersion();
  assert.equal((await f.handler(request(`cursor=${encodeURIComponent(first.nextCursor)}`))).status, 409);
});

test("association GET fails safely rather than serializing malformed summaries or SQL details", async () => {
  const handler = createAssociationOptionsGetHandler("note", { resolveActor: async () => ({ id: "actor-1" }), service: async () => { throw new Error("postgres secret connection-string"); } });
  const response = await handler(request("", "notes"));
  assert.equal(response.status, 500);
  assert.equal((await response.text()).includes("secret"), false);
});

test("note association route fixes kind server-side and rejects query attempts to switch it", async () => {
  let calls = 0;
  const service = createAssociationOptionsService(async input => {
    calls++;
    assert.equal(input.actorId, "actor-1");
    assert.equal(input.kind, "note");
    return { candidates: [{ id: "note:owned", title: "Private title" }], sourceVersion: "v1", hasMore: false };
  });
  const handler = createAssociationOptionsGetHandler("note", { resolveActor: async () => ({ id: "actor-1" }), service });
  const response = await handler(request("", "notes"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.kind, "note");
  assert.equal((await handler(request("kind=contact", "notes"))).status, 400);
  assert.equal(calls, 1);
});
