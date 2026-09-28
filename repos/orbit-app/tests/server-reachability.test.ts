import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitApiClient } from "../src/api/client";
import { createServerReachability, serverReachability } from "../src/api/server-reachability";

// Sprint 0131: the API client records whether the server answered (no extra
// request), and a watched reconnect probes while the server is unreachable so
// the device syncs the moment it answers again.
const baseUrl = "http://reach.example";

test("the API client records reachability from real request outcomes; an aborted request records nothing", async () => {
  serverReachability.reset();
  let mode: "down" | "503" | "ok" = "down";
  const fetchImpl = async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (mode === "down") throw new TypeError("Network request failed");
    return new Response(JSON.stringify(mode === "ok" ? { success: true, data: {} } : { success: false, error: { code: "SERVICE_UNAVAILABLE", message: "down" } }), { status: mode === "ok" ? 200 : 503, headers: { "Content-Type": "application/json" } });
  };
  const client = createOrbitApiClient({ baseUrl, fetchImpl });
  assert.equal(serverReachability.state(baseUrl), "unknown");
  await client.get("/api/profile");
  assert.equal(serverReachability.state(baseUrl), "unreachable");
  mode = "503";
  await client.post("/api/tasks", { body: {} });
  assert.equal(serverReachability.state(baseUrl), "reachable", "a 5xx still means the server answered");
  mode = "down";
  const controller = new AbortController();
  controller.abort();
  await client.get("/api/profile?aborted=1", { signal: controller.signal });
  assert.equal(serverReachability.state(baseUrl), "reachable", "an aborted request says nothing about the server");
  await client.get("/api/profile?down=1");
  assert.equal(serverReachability.state(baseUrl), "unreachable");
  serverReachability.reset();
});

test("a watched reconnect probes only while unreachable and every listener hears the server come back", async () => {
  const pending: { callback: () => void; ms: number }[] = [];
  const reachability = createServerReachability({
    intervalMs: 3000,
    timers: { setTimeout(callback, ms) { const entry = { callback, ms }; pending.push(entry); return entry; }, clearTimeout(handle) { const index = pending.indexOf(handle as never); if (index >= 0) pending.splice(index, 1); } },
  });
  const heard: string[] = [];
  reachability.subscribe((_url, state, previous) => heard.push(`${previous}->${state}`));
  let probes = 0;
  let serverUp = false;
  const stop = reachability.watchReconnect(baseUrl, async () => {
    probes += 1;
    if (serverUp) reachability.markReachable(baseUrl); else reachability.markUnreachable(baseUrl);
  });
  assert.equal(pending.length, 0, "no probe while the server has not failed");
  reachability.markUnreachable(baseUrl);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]!.ms, 3000);
  pending.shift()!.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(probes, 1);
  assert.equal(pending.length, 1, "still unreachable: the next probe is scheduled");
  serverUp = true;
  pending.shift()!.callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(probes, 2);
  assert.equal(pending.length, 0, "reachable again: probing stops");
  assert.deepEqual(heard, ["unknown->unreachable", "unreachable->reachable"]);
  reachability.markUnreachable(baseUrl);
  assert.equal(pending.length, 1);
  stop();
  assert.equal(pending.length, 0, "nobody watches: probing stops");
});
