import assert from "node:assert/strict";
import { test } from "node:test";

const scope = "a".repeat(64);
const emptyCards = {
  today: { status: "empty" }, network: { status: "empty" }, secretary: { status: "empty" },
  plan: { status: "empty" }, event: { status: "empty" },
} as const;

test("widget snapshot expires at 30 minutes and at the account's local day boundary", async () => {
  const module = await import("../src/widgets/snapshot").catch(() => null);
  const snapshot = module?.buildWidgetSnapshot({
    scopeHash: scope, timeZone: "Asia/Tokyo", layoutRevision: 7,
    now: new Date("2026-10-20T14:30:00.000Z"), widgets: emptyCards,
  });
  assert.equal(snapshot?.expiresAt, "2026-10-20T15:00:00.000Z");
  assert.ok(module?.readWidgetSnapshot(snapshot, scope, new Date("2026-10-20T14:59:59.000Z")));
  assert.equal(module?.readWidgetSnapshot(snapshot, scope, new Date("2026-10-20T15:00:00.000Z")), null);
});

test("widget snapshot rejects another scope, future, damaged or extra private fields", async () => {
  const module = await import("../src/widgets/snapshot").catch(() => null);
  const now = new Date("2026-10-20T08:00:00.000Z");
  const snapshot = module?.buildWidgetSnapshot({ scopeHash: scope, timeZone: "Asia/Tokyo", layoutRevision: 0, now, widgets: emptyCards });
  assert.equal(module?.readWidgetSnapshot(snapshot, "b".repeat(64), now), null);
  assert.equal(module?.readWidgetSnapshot(snapshot, scope, new Date("2026-10-20T07:59:59.000Z")), null);
  assert.equal(module?.readWidgetSnapshot("{broken", scope, now), null);
  assert.equal(module?.readWidgetSnapshot({ ...snapshot, schemaVersion: 2 }, scope, now), null);
  assert.equal(module?.readWidgetSnapshot({ ...snapshot, widgets: { ...emptyCards, secretary: { status: "ready", display: {
    count: 1, items: [{ title: "not legal", kind: "email_draft", href: "/inbox" }],
  } } } }, scope, now), null);
  assert.equal(module?.readWidgetSnapshot({ ...snapshot, cookieHeader: "private" }, scope, now), null);
});

test("widget snapshot uses earlier source expiry and keeps failed cards separate", async () => {
  const module = await import("../src/widgets/snapshot").catch(() => null);
  const now = new Date("2026-10-20T08:00:00.000Z");
  const snapshot = module?.buildWidgetSnapshot({
    scopeHash: scope, timeZone: "Asia/Tokyo", layoutRevision: 2, now,
    sourceExpiresAt: "2026-10-20T08:05:00.000Z",
    widgets: { ...emptyCards, network: { status: "ready", display: { total: 286, addedThisMonth: 24, people: [] } }, secretary: { status: "unavailable" } },
  });
  assert.equal(snapshot?.expiresAt, "2026-10-20T08:05:00.000Z");
  assert.deepEqual(module?.readWidgetSnapshot(snapshot, scope, now)?.widgets.network,
    { status: "ready", display: { total: 286, addedThisMonth: 24, people: [] } });
  assert.deepEqual(module?.readWidgetSnapshot(snapshot, scope, now)?.widgets.secretary, { status: "unavailable" });
  assert.equal(module?.readWidgetSnapshot(snapshot, scope, new Date("2026-10-20T08:05:00.000Z")), null);
});
