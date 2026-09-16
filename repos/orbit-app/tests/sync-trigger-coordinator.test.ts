import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createTriggerCoordinator } from "../src/data/sync/sync-trigger-coordinator";
import type { Clock, ValidatedInvalidation } from "../src/data/sync/invalidation-transport";

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function clock(t: TestContext, random = 0.5): Clock {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  return { now: () => Date.now(), random: () => random,
    set: (fn, ms) => setTimeout(fn, ms), clear: h => clearTimeout(h as ReturnType<typeof setTimeout>) };
}
function gate() {
  let resolve!: () => void; let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function hint(watermark = "1", domainId = "fixture.messages", authorizationEpoch = "epoch-1",
  reason: "changed" | "unchanged" | "reset-required" | "not-authorized" = "changed") {
  return { registryVersion: 1, serverTime: "2026-09-16T00:00:00Z",
    domains: [{ domainId, schemaVersion: 1, authorizationEpoch, watermark, reason }] };
}
// Wire schema + authenticated manifest binding belongs to Task 1/3.
const validate = (value: unknown) => value as ValidatedInvalidation;

test("a hint during a run survives completion and its waiter awaits the next run", async t => {
  const gates = [gate(), gate()]; const calls: string[][] = []; let secondDone = false;
  const coordinator = createTriggerCoordinator({ clock: clock(t), validate,
    run: async ids => { calls.push([...ids]); await gates[calls.length - 1]!.promise; } });
  t.after(() => coordinator.dispose());
  const first = coordinator.request("manual", ["fixture.messages"]);
  const second = coordinator.request("hint", ["fixture.notifications"]).then(() => { secondDone = true; });
  gates[0]!.resolve(); await first; await flush();
  assert.deepEqual(calls, [["fixture.messages"], ["fixture.notifications"]]);
  assert.equal(secondDone, false); gates[1]!.resolve(); await second;
});
test("100 hints within 250ms coalesce; equal and out-of-order large watermarks do not rerun", async t => {
  const calls: string[][] = [];
  const coordinator = createTriggerCoordinator({ clock: clock(t), validate, run: async ids => { calls.push([...ids]); } });
  t.after(() => coordinator.dispose());
  for (let i = 0; i < 100; i++) coordinator.hint(hint("90071992547409930"));
  t.mock.timers.tick(249); await flush(); assert.equal(calls.length, 0);
  t.mock.timers.tick(1); await flush(); assert.deepEqual(calls, [["fixture.messages"]]);
  coordinator.hint(hint("90071992547409930")); coordinator.hint(hint("90071992547409929"));
  t.mock.timers.tick(250); await flush(); assert.equal(calls.length, 1);
  coordinator.hint(hint("90071992547409931")); t.mock.timers.tick(250); await flush(); assert.equal(calls.length, 2);
});
test("watermarks 10 then 9 do not regress and unchanged summaries never pull delta", async t => {
  const calls: string[][] = [];
  const coordinator = createTriggerCoordinator({ clock: clock(t), validate, run: async ids => { calls.push([...ids]); } });
  t.after(() => coordinator.dispose());
  coordinator.hint(hint("10", "fixture.messages", "epoch-1", "unchanged"));
  t.mock.timers.tick(250); await flush(); assert.equal(calls.length, 0);
  coordinator.hint(hint("11")); t.mock.timers.tick(250); await flush();
  coordinator.hint(hint("9")); t.mock.timers.tick(250); await flush(); assert.equal(calls.length, 1);
});
test("100 in-flight hints require one rerun; a change during that rerun requires a third", async t => {
  const gates = [gate(), gate(), gate()]; const calls: string[][] = []; let active = 0; let max = 0;
  const coordinator = createTriggerCoordinator({ clock: clock(t), validate,
    run: async ids => { calls.push([...ids]); max = Math.max(max, ++active);
      await gates[calls.length - 1]!.promise; active--; } });
  t.after(() => coordinator.dispose());
  const first = coordinator.request("launch", ["fixture.messages"]);
  for (let i = 1; i <= 100; i++) coordinator.hint(hint(String(i)));
  gates[0]!.resolve(); await first; await flush(); assert.equal(calls.length, 2);
  coordinator.hint(hint("101")); gates[1]!.resolve(); await flush();
  assert.equal(calls.length, 3); gates[2]!.resolve(); await flush(); assert.equal(max, 1);
});
test("failed batch stays dirty; manual bypasses backoff without overlapping active work", async t => {
  const firstGate = gate(); const secondGate = gate(); const calls: string[][] = []; let active = 0; let max = 0;
  const coordinator = createTriggerCoordinator({ clock: clock(t), validate,
    run: async ids => { calls.push([...ids]); max = Math.max(max, ++active);
      try { if (calls.length === 1) await firstGate.promise; else if (calls.length === 2) await secondGate.promise; }
      finally { active--; } } });
  t.after(() => coordinator.dispose());
  const first = coordinator.request("poll", ["fixture.messages"]);
  const failed = assert.rejects(first, /offline/); firstGate.reject(Error("offline")); await failed; await flush();
  const second = coordinator.request("manual", ["fixture.notifications"]);
  assert.deepEqual(calls[1], ["fixture.messages", "fixture.notifications"]);
  const third = coordinator.request("manual", ["fixture.messages"]);
  assert.equal(calls.length, 2); secondGate.resolve(); await Promise.all([second, third]); assert.equal(max, 1);
});
for (const random of [0, 0.5, 1]) {
  test(`full jitter ${random} follows capped backoff, and success resets attempts`, async t => {
    const c = clock(t, random); const delays: number[] = [];
    const baseSet = c.set; c.set = (fn, ms) => { delays.push(ms); return baseSet(fn, ms); };
    let calls = 0;
    const coordinator = createTriggerCoordinator({ clock: c, validate,
      run: async () => { calls++; if (calls !== 7) throw Error("offline"); } });
    t.after(() => coordinator.dispose());
    await assert.rejects(coordinator.request("poll", ["fixture.messages"]), /offline/); await flush();
    for (const cap of [1000, 2000, 4000, 8000, 30000, 30000]) {
      const delay = Math.max(1, random * cap);
      assert.equal(delays.at(-1), delay); t.mock.timers.tick(delay); await flush();
    }
    assert.equal(calls, 7);
    await assert.rejects(coordinator.request("manual", ["fixture.messages"]), /offline/);
    await flush(); assert.equal(delays.at(-1), Math.max(1, random * 1000));
  });
}
test("dispose aborts active work, rejects all waiters and ignores stale hints and timers", async t => {
  const pending = gate(); let signal!: AbortSignal; let calls = 0;
  const coordinator = createTriggerCoordinator({ clock: clock(t), validate,
    run: async (_ids, _reason, s) => { signal = s; calls++; await pending.promise; } });
  const first = coordinator.request("manual", ["fixture.messages"]);
  const second = coordinator.request("hint", ["fixture.notifications"]);
  const rejected = [first, second].map(p => assert.rejects(p, { name: "AbortError" }));
  coordinator.dispose(); assert.equal(signal.aborted, true); await Promise.all(rejected);
  pending.resolve(); coordinator.hint(hint("2")); t.mock.timers.tick(60000); await flush(); assert.equal(calls, 1);
  await assert.rejects(coordinator.request("manual", []), { name: "AbortError" });
});
test("empty requests perform full authenticated refresh and dominate queued domain subsets", async t => {
  const pending = gate(); const calls: string[][] = [];
  const coordinator = createTriggerCoordinator({ clock: clock(t), validate,
    run: async ids => { calls.push([...ids]); if (calls.length === 1) await pending.promise; } });
  t.after(() => coordinator.dispose());
  const first = coordinator.request("launch", []); const second = coordinator.request("manual", []);
  const third = coordinator.request("notification", ["fixture.messages"]);
  pending.resolve(); await Promise.all([first, second, third]); assert.deepEqual(calls, [[]]);
});
test("validator failure and changed epoch refresh manifest without forwarding untrusted domains", async t => {
  const calls: string[][] = []; const errors: string[] = [];
  const coordinator = createTriggerCoordinator({ clock: clock(t),
    validate: value => { if (value === "invalid") throw Error("secret payload"); return validate(value); },
    onError: code => errors.push(code), run: async ids => { calls.push([...ids]); } });
  t.after(() => coordinator.dispose());
  coordinator.hint(hint("10")); t.mock.timers.tick(250); await flush();
  coordinator.hint(hint("1", "fixture.messages", "epoch-2")); t.mock.timers.tick(250); await flush();
  coordinator.hint("invalid"); t.mock.timers.tick(250); await flush();
  assert.deepEqual(calls, [["fixture.messages"], [], []]); assert.deepEqual(errors, ["invalid", "invalid"]);
});
