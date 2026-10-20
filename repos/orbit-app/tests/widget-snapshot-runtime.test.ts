import assert from "node:assert/strict";
import { test } from "node:test";

const cards = { today: { status: "empty" }, network: { status: "empty" }, secretary: { status: "empty" },
  plan: { status: "empty" }, event: { status: "empty" } } as const;
const hash = (actorId: string) => actorId === "A" ? "a".repeat(64) : "b".repeat(64);

test("a missing native bridge never reports a successful clear or write", async () => {
  const { createWidgetSnapshotRuntime } = await import("../src/widgets/runtime");
  const runtime = createWidgetSnapshotRuntime({ native: null, hashScope: async () => "a".repeat(64) });
  assert.equal(await runtime.clear(), false);
  assert.equal(await runtime.activate("https://first.example", "A"), null);
  assert.equal(await runtime.publish({ baseUrl: "https://first.example", actorId: "A",
    now: new Date("2026-10-20T08:00:00Z"), timeZone: "Asia/Tokyo", layoutRevision: 1, widgets: cards }), false);
});

test("a cleared or switched account cannot publish its late widget snapshot", async () => {
  const module = await import("../src/widgets/runtime").catch(() => null);
  let authorized = "";
  let snapshot = "";
  const runtime = module?.createWidgetSnapshotRuntime({
    native: {
      activateScope: async value => { authorized = value; },
      clearSnapshot: async () => { authorized = ""; snapshot = ""; },
      writeSnapshot: async json => { if (JSON.parse(json).scopeHash !== authorized) throw Error("scope mismatch"); snapshot = json; },
      containerAvailable: async () => true,
    },
    hashScope: async (_, actorId) => hash(actorId),
  });
  assert.equal(await runtime?.activate("http://localhost:3510", "A"), "a".repeat(64));
  assert.equal(await runtime?.publish({ baseUrl: "http://localhost:3510", actorId: "A", now: new Date("2026-10-20T08:00:00Z"),
    timeZone: "Asia/Tokyo", layoutRevision: 1, widgets: cards }), true);
  assert.equal(JSON.parse(snapshot).scopeHash, "a".repeat(64));
  assert.equal(await runtime?.clear(), true);
  assert.equal(await runtime?.publish({ baseUrl: "http://localhost:3510", actorId: "A", now: new Date("2026-10-20T08:01:00Z"),
    timeZone: "Asia/Tokyo", layoutRevision: 1, widgets: cards }), false);
  assert.equal(snapshot, "");
  assert.equal(await runtime?.activate("http://localhost:3510", "B"), "b".repeat(64));
  assert.equal(await runtime?.publish({ baseUrl: "http://localhost:3510", actorId: "A", now: new Date("2026-10-20T08:02:00Z"),
    timeZone: "Asia/Tokyo", layoutRevision: 1, widgets: cards }), false);
  assert.equal(snapshot, "");
});

test("a scope hash finishing after sign-out cannot reactivate the old actor", async () => {
  const module = await import("../src/widgets/runtime").catch(() => null);
  let release: ((value: string) => void) | undefined;
  let activated = false;
  const runtime = module?.createWidgetSnapshotRuntime({
    native: { activateScope: async () => { activated = true; }, clearSnapshot: async () => {},
      writeSnapshot: async () => {}, containerAvailable: async () => true },
    hashScope: async () => new Promise<string>(resolve => { release = resolve; }),
  });
  const pending = runtime?.activate("http://localhost:3510", "A");
  assert.equal(await runtime?.clear(), true);
  release?.("a".repeat(64));
  assert.equal(await pending, null);
  assert.equal(activated, false);
});

test("root and Home coalesce activation for the same signed-in actor", async () => {
  const module = await import("../src/widgets/runtime").catch(() => null);
  let clears = 0;
  const runtime = module?.createWidgetSnapshotRuntime({
    native: { activateScope: async () => {}, clearSnapshot: async () => { clears += 1; },
      writeSnapshot: async () => {}, containerAvailable: async () => true },
    hashScope: async () => "a".repeat(64),
  });
  const results = await Promise.all([
    runtime?.activate("http://localhost:3510", "A"), runtime?.activate("http://localhost:3510", "A"),
  ]);
  assert.deepEqual(results, ["a".repeat(64), "a".repeat(64)]);
  assert.equal(clears, 1);
});

test("a delayed native activation is cleared before sign-out completes", async () => {
  const module = await import("../src/widgets/runtime");
  let finishActivation: (() => void) | undefined;
  const operations: string[] = [];
  const runtime = module.createWidgetSnapshotRuntime({
    native: {
      clearSnapshot: async () => { operations.push("clear"); },
      activateScope: async () => { operations.push("activate-start"); await new Promise<void>(resolve => { finishActivation = resolve; }); operations.push("activate-end"); },
      writeSnapshot: async () => {}, containerAvailable: async () => true,
    },
    hashScope: async () => "a".repeat(64),
  });
  const activation = runtime.activate("http://localhost:3510", "A");
  for (let index = 0; !finishActivation && index < 20; index += 1) await new Promise(resolve => setTimeout(resolve, 0));
  assert.ok(finishActivation);
  const clearing = runtime.clear();
  finishActivation?.();
  assert.equal(await activation, null);
  assert.equal(await clearing, true);
  assert.deepEqual(operations, ["clear", "activate-start", "activate-end", "clear"]);
});

test("changing API server revokes the same actor's prior snapshot", async () => {
  const module = await import("../src/widgets/runtime");
  let snapshot = "";
  let scope = "";
  const runtime = module.createWidgetSnapshotRuntime({
    native: {
      clearSnapshot: async () => { snapshot = ""; scope = ""; },
      activateScope: async value => { scope = value; },
      writeSnapshot: async json => { snapshot = json; }, containerAvailable: async () => true,
    },
    hashScope: async baseUrl => baseUrl.includes("first") ? "a".repeat(64) : "b".repeat(64),
  });
  assert.equal(await runtime.activate("https://first.example", "actor-a"), "a".repeat(64));
  assert.equal(await runtime.publish({ baseUrl: "https://first.example", actorId: "actor-a",
    now: new Date("2026-10-20T08:00:00Z"), timeZone: "Asia/Tokyo", layoutRevision: 1, widgets: cards }), true);
  assert.ok(snapshot);
  assert.equal(await runtime.activate("https://second.example", "actor-a"), "b".repeat(64));
  assert.equal(scope, "b".repeat(64));
  assert.equal(snapshot, "");
  assert.equal(await runtime.publish({ baseUrl: "https://first.example", actorId: "actor-a",
    now: new Date("2026-10-20T08:01:00Z"), timeZone: "Asia/Tokyo", layoutRevision: 1, widgets: cards }), false);
});
