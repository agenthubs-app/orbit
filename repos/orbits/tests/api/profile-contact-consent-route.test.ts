import assert from "node:assert/strict";
import test from "node:test";

import { createProfileRouteHandlers } from "../../app/api/profile/handlers";

// 「保存即确认」（2026-11-27）：只有带 contactMethodsConfirmed 且提交了 handles 的写入才改确认状态；
// 四种联系方式里有一种 → 确认，全部清空 → 撤销；这个键不进资料本身。
function harness() {
  const updates: Record<string, unknown>[] = [];
  const consent: [string, boolean][] = [];
  const handlers = createProfileRouteHandlers({
    resolveActor: async () => ({ id: "alice" }),
    designFixturesEnabled: false,
    profileService: () => ({
      updateProfile: async (input: Record<string, unknown>) => { updates.push(input); return { success: true, data: { profile: null } }; },
      getProfile: async () => ({ success: true, data: { profile: null } }),
    }) as never,
    setContactConsent: async (actorId, confirmed) => { consent.push([actorId, confirmed]); },
  });
  const put = (body: unknown) => handlers.PUT(new Request("https://orbit.test/api/profile", {
    method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  }));
  return { put, updates, consent };
}

test("the edit panel's save confirms when a contact method is filled, and the flag never reaches the profile", async () => {
  const { put, updates, consent } = harness();
  const response = await put({ handles: { lineId: "alice.line", website: "https://alice.example" }, contactMethodsConfirmed: true });
  assert.equal(response.status, 200);
  assert.deepEqual(consent, [["alice", true]]);
  assert.equal("contactMethodsConfirmed" in updates[0]!, false);
  assert.deepEqual(updates[0]!.handles, { lineId: "alice.line", website: "https://alice.example" });
});

test("clearing every contact method in the panel revokes; a website alone is not a contact method", async () => {
  const { put, consent } = harness();
  await put({ handles: { website: "https://alice.example" }, contactMethodsConfirmed: true });
  await put({ handles: {}, contactMethodsConfirmed: true });
  assert.deepEqual(consent, [["alice", false], ["alice", false]]);
});

test("writes without the panel's flag or without handles leave the confirmation alone", async () => {
  const { put, consent, updates } = harness();
  await put({ handles: { lineId: "scanned.line" } });
  await put({ bio: "hello", contactMethodsConfirmed: true });
  await put({ handles: { lineId: "x" }, contactMethodsConfirmed: "yes" });
  assert.deepEqual(consent, []);
  assert.equal(updates.length, 3);
});
