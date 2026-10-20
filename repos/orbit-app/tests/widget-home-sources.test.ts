import assert from "node:assert/strict";
import { test } from "node:test";
import type { OrbitApiClient } from "../src/api/client";

test("widget source reader uses R10 GETs and rejects a different actor's secretary preview", async () => {
  const module = await import("../src/widgets/read-home-sources").catch(() => null);
  const requests: string[] = [];
  const now = new Date("2026-10-20T08:00:00.000Z");
  const client = { get: async (path: string) => {
    requests.push(path);
    if (path === "/api/contacts/summary") return { success: true, data: {
      total: 2, sources: {}, statuses: {}, values: {}, tags: [], hasMoreTags: false, asOf: now.toISOString(), addedThisMonth: 1,
    } };
    if (path.startsWith("/api/contacts/page?")) return { success: true, data: { items: [{
      id: "c1", displayName: "高橋 花子", organization: "Orbit", role: "CFO", sourceType: "manual",
      status: "active", pendingInitialization: false, nextActionPreview: "", updatedAt: now.toISOString(),
    }], nextCursor: null, hasMore: false, asOf: now.toISOString() } };
    if (path === "/api/inbox/secretary/preview") return { success: true, data: {
      actorId: "other-actor", items: [], hasMore: false, asOf: now.toISOString(),
    } };
    return { success: false, error: { code: "SERVICE_UNAVAILABLE" } };
  } } as unknown as OrbitApiClient;
  const sources = await module?.readHomeWidgetSources(client, "actor-a", "Asia/Tokyo", now);
  assert.deepEqual(requests, [
    "/api/todo/page?date=2026-10-20&timeZone=Asia%2FTokyo", "/api/schedule-items",
    "/api/contacts/summary", "/api/contacts/page?sort=added&limit=4",
    "/api/inbox/secretary/preview", "/api/agent/plans/v2/summary", "/api/events/mine?range=upcoming",
  ]);
  assert.equal(sources?.networkSummary?.total, 2);
  assert.equal(sources?.networkPage?.items[0]?.displayName, "高橋 花子");
  assert.equal(sources?.secretary, undefined);
  assert.equal(sources?.todo, undefined);
});
