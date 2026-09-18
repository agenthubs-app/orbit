import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createPollingTransport } from "../src/data/sync/polling-invalidation-transport";
import type { Clock, InvalidationTransport } from "../src/data/sync/invalidation-transport";

function clock(t: TestContext): Clock {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  return { now: () => Date.now(), random: () => 0.5,
    set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>) };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const summary = { registryVersion: 1, serverTime: "2026-09-16T00:00:00Z", domains: [] };

for (const intervalMs of [15000, 5000] as const) {
  test(`polls immediately then ${intervalMs}ms after completion without overlap`, async t => {
    const c = clock(t);
    let release!: (value: unknown) => void;
    let reads = 0;
    const hints: unknown[] = [];
    const transport = createPollingTransport({ clock: c, intervalMs,
      read: async () => { reads++; return new Promise(resolve => { release = resolve; }); } });
    const stop = await transport.start({ signal: new AbortController().signal,
      onHint: value => hints.push(value), onError: () => assert.fail("unexpected failure") });
    t.after(stop);
    assert.equal(reads, 1);
    t.mock.timers.tick(60000); await flush();
    assert.equal(reads, 1);
    release(summary); await flush();
    assert.deepEqual(hints, [summary]);
    t.mock.timers.tick(intervalMs - 1); await flush(); assert.equal(reads, 1);
    t.mock.timers.tick(1); await flush(); assert.equal(reads, 2);
  });
}
for (const mode of ["abort", "stop"] as const) {
  for (const outcome of ["resolve", "reject"] as const) {
    test(`${mode} cancels HTTP and suppresses late ${outcome} callbacks`, async t => {
      const c = clock(t); const parent = new AbortController();
      let signal!: AbortSignal; let finish!: () => void; let callbacks = 0; let reads = 0;
      const stop = await createPollingTransport({ clock: c, intervalMs: 15000,
        read: async s => { signal = s; reads++; return new Promise((resolve, reject) => {
          finish = () => outcome === "resolve" ? resolve(summary) : reject(Error("network"));
        }); } }).start({ signal: parent.signal, onHint: () => callbacks++, onError: () => callbacks++ });
      if (mode === "abort") parent.abort(); else stop();
      assert.equal(signal.aborted, true);
      finish(); await flush(); t.mock.timers.tick(60000); await flush();
      assert.equal(callbacks, 0); assert.equal(reads, 1); stop();
    });
  }
}
test("already aborted start performs no read and stopping clears a scheduled poll", async t => {
  const c = clock(t); let reads = 0;
  const transport = createPollingTransport({ clock: c, intervalMs: 5000,
    read: async () => { reads++; return summary; } });
  const parent = new AbortController(); parent.abort();
  await transport.start({ signal: parent.signal, onHint: () => assert.fail(), onError: () => assert.fail() });
  assert.equal(reads, 0);
  const stop = await transport.start({ signal: new AbortController().signal, onHint: () => {}, onError: () => {} });
  await flush(); stop(); t.mock.timers.tick(60000); await flush(); assert.equal(reads, 1);
});
test("HTTP failures remain visible and polling survives optional auth failure", async t => {
  const c = clock(t); const errors: string[] = []; const hints: unknown[] = []; let reads = 0;
  const input = { signal: new AbortController().signal, onHint: (v: unknown) => hints.push(v),
    onError: (code: "network" | "auth" | "invalid") => errors.push(code) };
  const stop = await createPollingTransport({ clock: c, intervalMs: 5000,
    read: async () => { if (++reads === 1) throw Error("network"); return summary; } }).start(input);
  t.after(stop); await flush();
  const optional: InvalidationTransport = { start: async i => { i.onError("auth"); throw Error("auth"); } };
  await assert.rejects(optional.start(input), /auth/);
  t.mock.timers.tick(5000); await flush();
  assert.deepEqual(errors, ["network", "auth"]); assert.deepEqual(hints, [summary]);
});
