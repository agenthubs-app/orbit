/**
 * W0059 纯函数：一次性导航意图（写／消费）、returnTo 校验、「返回 {来源}」标签（SC-W0059-01／02）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DETAIL_RETURN_STORAGE_KEY,
  comparableAppPath,
  consumeDetailReturnIntent,
  detailReturnLabel,
  isContactDetailPath,
  normalizeAppPath,
  sanitizeReturnTo,
  writeDetailReturnIntent,
  type DetailReturnStorage,
} from "../../app/(app)/app/contacts/network-0918/detail-return";

function memoryStorage(): DetailReturnStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

const throwing: DetailReturnStorage = {
  getItem() { throw new Error("SecurityError"); },
  removeItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
};

const T0 = 1_760_000_000_000;
const DETAIL = "/app/contacts/c%3A1";

test("isContactDetailPath: one id segment under /app/contacts, static sub-routes excluded", () => {
  for (const path of ["/app/contacts/c1", "/app/contacts/c%3A1", "/app/contacts/demo:wang", "/app/contacts/c1/"]) assert.equal(isContactDetailPath(path), true, path);
  for (const path of ["/app/contacts", "/app/contacts/", "/app/contacts/new", "/app/contacts/pipeline", "/app/contacts/dashboard", "/app/contacts/analysis", "/app/contacts/analysis/structure", "/app/agent", "/app/contactsX/1"]) assert.equal(isContactDetailPath(path), false, path);
});

test("normalizeAppPath keeps path + query, drops hash, refuses other origins and non-/app paths", () => {
  const origin = "https://orbit.example";
  assert.equal(normalizeAppPath("/app/contacts/c1?appointmentId=a#x", origin), "/app/contacts/c1?appointmentId=a");
  assert.equal(normalizeAppPath("https://orbit.example/app/contacts/c1", origin), "/app/contacts/c1");
  assert.equal(normalizeAppPath("https://evil.example/app/contacts/c1", origin), null);
  assert.equal(normalizeAppPath("/events/abc", origin), null);
  assert.equal(normalizeAppPath("http://[bad", origin), null);
});

test("comparableAppPath only drops the lang parameter", () => {
  assert.equal(comparableAppPath("/app/contacts/c1?lang=en"), "/app/contacts/c1");
  assert.equal(comparableAppPath("/app/contacts/c1?appointmentId=a&lang=en&eventId=e#t"), "/app/contacts/c1?appointmentId=a&eventId=e");
  assert.equal(comparableAppPath("/app/contacts/c1"), "/app/contacts/c1");
});

test("write → consume: a fresh intent to exactly this path returns the source once, then is gone", () => {
  const storage = memoryStorage();
  const written = writeDetailReturnIntent(storage, { from: "/app/agent/plan", to: DETAIL, now: T0, nonce: "n1" });
  assert.deepEqual(written, { from: "/app/agent/plan", to: DETAIL, at: T0, nonce: "n1" });
  assert.equal(consumeDetailReturnIntent(storage, { current: DETAIL, now: T0 + 1200, navigation: { type: "navigate", path: DETAIL } }), "/app/agent/plan");
  assert.equal(storage.data.has(DETAIL_RETURN_STORAGE_KEY), false, "consumed on read");
  assert.equal(consumeDetailReturnIntent(storage, { current: DETAIL, now: T0 + 1300 }), null, "second read finds nothing");
});

test("write is skipped for non-detail targets, same-page clicks and non-/app sources", () => {
  const storage = memoryStorage();
  assert.equal(writeDetailReturnIntent(storage, { from: "/app/agent", to: "/app/contacts", now: T0, nonce: "a" }), null);
  assert.equal(writeDetailReturnIntent(storage, { from: "/app/contacts/dashboard", to: "/app/contacts/dashboard", now: T0, nonce: "b" }), null);
  assert.equal(writeDetailReturnIntent(storage, { from: DETAIL, to: `${DETAIL}?lang=en`, now: T0, nonce: "c" }), null);
  assert.equal(writeDetailReturnIntent(storage, { from: "/events/x", to: DETAIL, now: T0, nonce: "d" }), null);
  assert.equal(storage.data.size, 0);
  assert.equal(writeDetailReturnIntent(throwing, { from: "/app/agent", to: DETAIL, now: T0, nonce: "e" }), null, "storage that throws → no intent, no error");
  assert.equal(writeDetailReturnIntent(null, { from: "/app/agent", to: DETAIL, now: T0, nonce: "f" }), null);
});

test("SC-W0059-02: no usable source → null (direct open, refresh, stale, other target, broken storage)", () => {
  const cases: { name: string; storage: DetailReturnStorage | null; current?: string; now?: number; navigation?: { type: string; path: string | null } | null }[] = [
    { name: "nothing recorded (address bar / new tab)", storage: memoryStorage() },
    { name: "storage unavailable", storage: null },
    { name: "storage throws", storage: throwing },
  ];
  for (const c of cases) assert.equal(consumeDetailReturnIntent(c.storage, { current: DETAIL, now: T0 }), null, c.name);

  const seeded = (intent: object) => {
    const storage = memoryStorage();
    storage.data.set(DETAIL_RETURN_STORAGE_KEY, JSON.stringify(intent));
    return storage;
  };
  const base = { from: "/app/contacts", to: DETAIL, at: T0, nonce: "n" };
  const expired = seeded(base);
  assert.equal(consumeDetailReturnIntent(expired, { current: DETAIL, now: T0 + 30_001 }), null, "older than 30 s");
  assert.equal(expired.data.size, 0, "a stale intent is still deleted");
  assert.equal(consumeDetailReturnIntent(seeded(base), { current: DETAIL, now: T0 - 5 }), null, "clock went backwards");
  assert.equal(consumeDetailReturnIntent(seeded(base), { current: "/app/contacts/other", now: T0 + 10 }), null, "intent was for another contact");
  assert.equal(consumeDetailReturnIntent(seeded(base), { current: `${DETAIL}?appointmentId=a`, now: T0 + 10 }), null, "query must match too");
  assert.equal(
    consumeDetailReturnIntent(seeded(base), { current: DETAIL, now: T0 + 10, navigation: { type: "reload", path: DETAIL } }),
    null,
    "this document is a reload of the detail page",
  );
  assert.equal(consumeDetailReturnIntent(seeded({ ...base, from: "https://evil.example/" }), { current: DETAIL, now: T0 + 10 }), null, "non-/app source");
  assert.equal(consumeDetailReturnIntent(seeded({ to: DETAIL }), { current: DETAIL, now: T0 + 10 }), null, "malformed record");
  const garbage = memoryStorage();
  garbage.data.set(DETAIL_RETURN_STORAGE_KEY, "{not json");
  assert.equal(consumeDetailReturnIntent(garbage, { current: DETAIL, now: T0 + 10 }), null, "unparsable record");
  assert.equal(garbage.data.size, 0);
});

test("a reload of some other page earlier in this document's life does not block a later in-app navigation; lang differences are ignored", () => {
  const storage = memoryStorage();
  writeDetailReturnIntent(storage, { from: "/app/contacts?lang=en", to: DETAIL, now: T0, nonce: "n" });
  assert.equal(
    consumeDetailReturnIntent(storage, { current: `${DETAIL}?lang=en`, now: T0 + 50, navigation: { type: "reload", path: "/app/contacts?lang=en" } }),
    "/app/contacts?lang=en",
  );
});

test("SC-W0059-02: returnTo accepts only a single-slash /app/ relative path that is not this contact", () => {
  assert.equal(sanitizeReturnTo("/app/agent/plan", "c:1"), "/app/agent/plan");
  assert.equal(sanitizeReturnTo("/app/contacts/dashboard?tab=opp#x", "c:1"), "/app/contacts/dashboard?tab=opp#x");
  assert.equal(sanitizeReturnTo("/app/contacts/other", "c:1"), "/app/contacts/other");
  const rejected: unknown[] = [
    undefined,
    ["/app/agent"],
    "",
    "//evil.com",
    "//evil.com/app/x",
    "https://evil.com/app/x",
    "https:/app/x",
    "javascript:alert(1)",
    "/\\evil.com",
    "/app/\\evil.com",
    "/app",
    "/events/x",
    "app/agent",
    "/app/../evil",
    "/app/x\u0000y",
    "/app/contacts/c:1",
    "/app/contacts/c%3A1",
    "/app/contacts/c%3A1/",
    "/app/contacts/c%3A1?lang=en",
    `/app/${"a".repeat(600)}`,
  ];
  for (const value of rejected) assert.equal(sanitizeReturnTo(value, "c:1"), null, String(value));
});

test("SC-W0059-01: 返回 {来源} label — longest prefix wins, segment-aware, zh and en", () => {
  const cases: [string | null, string, string][] = [
    ["/app/agent/plan", "返回我的计划", "Back to My plan"],
    ["/app/agent/plan?lang=en#plan-action-x", "返回我的计划", "Back to My plan"],
    ["/app/agent", "返回 iOrbit", "Back to iOrbit"],
    ["/app/agent?q=hi", "返回 iOrbit", "Back to iOrbit"],
    ["/app/agent/strategy", "返回 iOrbit", "Back to iOrbit"],
    ["/app/contacts/dashboard", "返回人脉分析", "Back to Network analysis"],
    ["/app/contacts/analysis/structure", "返回人脉分析", "Back to Network analysis"],
    ["/app/contacts", "返回人脉", "Back to Network"],
    ["/app/contacts?tier=core", "返回人脉", "Back to Network"],
    ["/app/contacts/c2", "返回人脉", "Back to Network"],
    ["/app/events/e1", "返回活动", "Back to Events"],
    ["/app/agentx", "返回", "Back"],
    ["/app/tasks/personal", "返回", "Back"],
    [null, "返回人脉", "Back to Network"],
  ];
  for (const [path, zh, en] of cases) assert.deepEqual(detailReturnLabel(path), { zh, en }, String(path));
});
