/** GET /api/account/usage（2026-11-27 分档）：只读，未登录 401；档位来自会话；上限与对照表来自档位表。 */
import assert from "node:assert/strict";
import test from "node:test";

import { createAccountUsageRouteHandlers } from "../../app/api/account/usage/handlers";
import { TIER_LIMITS } from "../../features/ai-quota/tiers";

const NOW = () => new Date("2026-11-27T03:00:00.000Z");

test("signed out is 401; without a database the usage is zero and the limits still come from the tier table", async () => {
  assert.equal((await createAccountUsageRouteHandlers({ database: () => null, resolveActor: async () => null }).GET()).status, 401);
  const response = await createAccountUsageRouteHandlers({ database: () => null, now: NOW, resolveActor: async () => ({ id: "actor:a", tier: "pro" }) }).GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = (await response.json()) as { data: { tier: string; items: { feature: string; used: number; limit: number; upgradeLimit: number | null; retryOn: string }[]; tiers: typeof TIER_LIMITS } };
  assert.equal(body.data.tier, "pro");
  assert.deepEqual(body.data.items.map((item) => [item.feature, item.used, item.limit, item.upgradeLimit, item.retryOn]), [
    ["agent_chat", 0, 1000, null, "2026-11-30T15:00:00.000Z"],
    ["card_scan", 0, 300, null, "2026-11-30T15:00:00.000Z"],
    ["plan_new_goal", 0, 10, null, "2026-11-30T15:00:00.000Z"],
  ]);
  assert.deepEqual(body.data.tiers.free.agent_chat, TIER_LIMITS.free.agent_chat);
  const free = await createAccountUsageRouteHandlers({ database: () => null, now: NOW, resolveActor: async () => ({ id: "actor:a" }) }).GET();
  assert.deepEqual(((await free.json()) as { data: { tier: string; items: { upgradeLimit: number | null }[] } }).data.items.map((item) => item.upgradeLimit), [1000, 300, 10], "no tier on the actor = free");
});
