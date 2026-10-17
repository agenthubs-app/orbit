import assert from "node:assert/strict";
import test from "node:test";
import { createScheduleItemsGetHandler } from "../../app/api/schedule-items/handler";

const from = "2026-10-31T04:00:00.000Z", to = "2026-12-12T05:00:00.000Z";
const request = (query: Record<string, string> = {}) => new Request(`http://localhost/api/schedule-items?${new URLSearchParams({ scope: "calendar", from, to, language: "ja", ...query })}`);
test("calendar scope forwards the complete selected DST window and language under server actor identity", async () => {
  const calls: unknown[] = [];
  const GET = createScheduleItemsGetHandler({ resolveActor: async () => ({ id: "a", workspaceId: "w" }), scheduleProvider: { async list(input) { calls.push(input); return []; } } });
  const response = await GET(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ actorId: "a", from, to, language: "ja" }]);
  assert.match(response.headers.get("cache-control")!, /no-store/);
});
test("calendar scope rejects malformed/unbounded/extra parameters and auth before reading", async () => {
  let calls = 0;
  const provider = { async list() { calls++; return []; } };
  const GET = createScheduleItemsGetHandler({ resolveActor: async () => ({ id: "a", workspaceId: "w" }), scheduleProvider: provider });
  for (const query of [{ from: "" }, { to: "" }, { from: "2026-02-30T00:00:00Z" }, { to: from }, { to: "2028-01-01T00:00:00Z" }, { language: "fr" }, { actorId: "b" }, { workspaceId: "other" }]) assert.equal((await GET(request(query))).status, 400, JSON.stringify(query));
  assert.equal((await GET(new Request(request().url + "&from=" + from))).status, 400);
  assert.equal((await createScheduleItemsGetHandler({ resolveActor: async () => null, scheduleProvider: provider })(request())).status, 401);
  assert.equal(calls, 0);
});
