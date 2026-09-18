import assert from "node:assert/strict";
import test from "node:test";

import {
  parseServerTiming,
  withTotalServerTiming,
  withServerTiming,
} from "../../shared/performance/server-timing";

test("parses bounded redaction-safe Server-Timing spans", () => {
  assert.deepEqual(
    parseServerTiming("orbit-auth;dur=12.5, orbit-read;dur=40, orbit-total;dur=55.25"),
    [
      { durationMs: 12.5, name: "orbit-auth" },
      { durationMs: 40, name: "orbit-read" },
      { durationMs: 55.25, name: "orbit-total" },
    ],
  );
  assert.deepEqual(parseServerTiming(null), []);
});

test("rejects malformed, duplicate, descriptive, private, or non-finite spans", () => {
  for (const value of [
    "orbit-read",
    "orbit-read;dur=-1",
    "orbit-read;dur=NaN",
    "orbit-read;dur=1, orbit-read;dur=2",
    'orbit-read;dur=1;desc="record count 42"',
    "user-id;dur=1",
  ]) {
    assert.throws(() => parseServerTiming(value), /Server-Timing/);
  }
});

test("adds timing without changing response status, body, or existing headers", async () => {
  const response = withServerTiming(
    new Response(JSON.stringify({ success: true }), {
      headers: { "content-type": "application/json", "x-existing": "yes" },
      status: 202,
    }),
    [
      { durationMs: 4.25, name: "orbit-auth" },
      { durationMs: 10, name: "orbit-total" },
    ],
  );

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("x-existing"), "yes");
  assert.equal(response.headers.get("server-timing"), "orbit-auth;dur=4.25, orbit-total;dur=10");
  assert.deepEqual(await response.json(), { success: true });
});

test("serializer rejects non-orbit names and invalid durations", () => {
  assert.throws(
    () => withServerTiming(new Response(), [{ durationMs: 1, name: "query" }]),
    /Server-Timing/,
  );
  assert.throws(
    () => withServerTiming(new Response(), [{ durationMs: Infinity, name: "orbit-read" }]),
    /Server-Timing/,
  );
});

test("route wrapper records total time while preserving the handler response", async () => {
  const calls: string[] = [];
  const handler = withTotalServerTiming(async (request: Request) => {
    calls.push(request.url);
    return new Response("unchanged", { status: 207 });
  }, { now: (() => {
    const values = [10, 25.5];
    return () => values.shift()!;
  })() });

  const response = await handler(new Request("https://orbit.test/api/read"));
  assert.deepEqual(calls, ["https://orbit.test/api/read"]);
  assert.equal(response.status, 207);
  assert.equal(await response.text(), "unchanged");
  assert.equal(response.headers.get("server-timing"), "orbit-total;dur=15.5");
});
