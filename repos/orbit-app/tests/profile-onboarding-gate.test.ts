import assert from "node:assert/strict";
import test from "node:test";

import { onboardingExemptRoute, onboardingGateHref, resolveOnboardingGate } from "../src/onboarding/onboarding-gate";
import { createProfileOnboardingStorage, onboardingDraftKey, parseOnboardingDraft, type OnboardingDraft } from "../src/storage/profile-onboarding-storage";
import { EMPTY_BASIC } from "../src/view-models/profile-onboarding";

test("an unfinished account may open only onboarding, its account rights, legal texts and an invite's public page", () => {
  for (const route of ["/", "/profile/onboarding", "/profile/continue", "/account/deletion", "/account/login", "/legal/terms", "/settings/privacy", "/help", "/i/H7KQ-M2TR"]) assert.equal(onboardingExemptRoute(route), true, route);
  for (const route of ["/home", "/contacts", "/events", "/events/e1", "/task", "/ai", "/profile", "/settings", "/inbox/notifications/n1", "/party", "/host/join/H7KQ", "/app/home", "/iorbit"]) assert.equal(onboardingExemptRoute(route), false, route);
  assert.equal(onboardingGateHref("/events/e1?tab=a"), "/profile/onboarding?next=%2Fevents%2Fe1%3Ftab%3Da");
});

function gate(stored: "required" | "clear" | null, required: () => Promise<boolean | null>) {
  const remembered: string[] = []; let asked = 0;
  return { remembered, asked: () => asked, run: () => resolveOnboardingGate({ stored: async () => stored, required: async () => { asked += 1; return required(); }, remember: async verdict => { remembered.push(verdict); }, waitMs: 20 }) };
}

test("the gate asks the server once per account and remembers the answer", async () => {
  for (const [answer, verdict] of [[true, "required"], [false, "clear"]] as const) {
    const first = gate(null, async () => answer);
    assert.equal(await first.run(), verdict);
    assert.deepEqual(first.remembered, [verdict]);
  }
  for (const stored of ["required", "clear"] as const) {
    const again = gate(stored, async () => { throw new Error("never asked"); });
    assert.equal(await again.run(), stored, "offline too: an unfinished account stays in onboarding, a set-up one is never held up");
    assert.equal(again.asked(), 0);
  }
});

test("an account from before the gate is let in while its first check cannot be answered, and asked again later", async () => {
  for (const required of [async () => null, async () => { throw new Error("offline"); }, () => new Promise<boolean | null>(() => undefined)]) {
    const unknown = gate(null, required);
    assert.equal(await unknown.run(), "open");
    assert.deepEqual(unknown.remembered, []);
  }
});

const draft: OnboardingDraft = { step: "goals", updatedAt: "2026-11-25T00:00:00.000Z", basic: { ...EMPTY_BASIC, name: "林晓" }, goals: ["获取客户"], focus: "", offer: ["a"], seek: [], topics: [], bio: "", headline: "", marks: { name: "card" }, scan: { card: 3, ai: 2 } };

test("the draft round-trips per account and server; a five-step draft lands on the step that holds its fields", async () => {
  const values = new Map<string, string>();
  const storage = createProfileOnboardingStorage({ getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } });
  const one = { actorId: "a", baseUrl: "https://orbit.test" }, other = { actorId: "b", baseUrl: "https://orbit.test" };
  await storage.writeDraft(one, draft);
  assert.deepEqual(await storage.readDraft(one), draft);
  assert.equal(await storage.readDraft(other), null);
  assert.notEqual(onboardingDraftKey(one), onboardingDraftKey(other));
  await storage.clearDraft(one);
  assert.equal(await storage.readDraft(one), null);
  for (const [old, step] of [["profile", "profile"], ["goals", "goals"], ["persona", "goals"], ["intro", "intro"], ["import", "intro"]] as const) {
    const migrated = parseOnboardingDraft(JSON.stringify({ step: old, basic: { name: "林晓" }, goals: ["获取客户"], offer: ["a"], bio: "b" }));
    assert.equal(migrated?.step, step);
    assert.deepEqual([migrated?.basic.name, migrated?.goals, migrated?.offer, migrated?.bio], ["林晓", ["获取客户"], ["a"], "b"], "nothing typed is lost");
  }
  for (const broken of [null, "", "{", "[]", "{}", JSON.stringify({ step: "other" })]) assert.equal(parseOnboardingDraft(broken), null);
});
