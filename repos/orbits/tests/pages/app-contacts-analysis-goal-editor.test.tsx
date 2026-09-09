import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, create } from "react-test-renderer";
import { AnalysisGoalEditor } from "../../app/(app)/app/contacts/analysis/analysis-goal-editor";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

async function mount(t: TestContext, fetcher: typeof fetch, profileId = "profile:one") {
  t.mock.method(globalThis, "fetch", fetcher);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  const saved: string[] = [];
  const element = (text = "原目标") => <AnalysisGoalEditor profileId={profileId} initialGoal={text} onClose={() => {}} onSaved={(text) => saved.push(text)} />;
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(element()); });
  t.after(() => { act(() => root.unmount()); if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document"); });
  return { root, saved, element, save: () => root.root.findByProps({ "data-analysis-goal-save": true }), change: async (value: string) => { await act(async () => { root.root.findByType("textarea").props.onChange({ target: { value } }); }); } };
}
const ack = (text: string, id = "profile:one") => Response.json({ success: true, data: { profile: { id, relationshipGoal: text } } });

test("goal editing sends only the changed goal, trims text and blocks duplicate submissions", async (t) => {
  const calls: Array<{ path: string; init?: RequestInit }> = []; let respond!: (response: Response) => void;
  const ui = await mount(t, (async (path, init) => { calls.push({ path: String(path), init }); return new Promise<Response>((resolve) => { respond = resolve; }); }) as typeof fetch);
  assert.equal(ui.save().props.disabled, true);
  await ui.change("  认识日本供应链伙伴  ");
  let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); void ui.save().props.onClick(); });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/api/profile");
  assert.equal(calls[0].init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { relationshipGoal: "认识日本供应链伙伴" });
  await act(async () => { respond(ack("认识日本供应链伙伴")); await pending; });
  assert.deepEqual(ui.saved, ["认识日本供应链伙伴"]);
});

test("goal failure and wrong-account ACK retain the draft across prop refresh and retry", async (t) => {
  let calls = 0;
  const ui = await mount(t, (async () => { calls++; if (calls === 1) throw new Error("offline"); return ack("新目标", calls === 2 ? "profile:another" : "profile:one"); }) as typeof fetch);
  await ui.change("新目标");
  await act(async () => { ui.root.update(ui.element("远端变更")); });
  for (let i = 0; i < 2; i++) {
    await act(async () => { await ui.save().props.onClick(); });
    assert.equal(ui.root.root.findByType("textarea").props.value, "新目标");
    assert.ok(ui.root.root.findByProps({ role: "alert" }));
    assert.deepEqual(ui.saved, []);
  }
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(ui.saved, ["新目标"]);
});

test("clearing a goal sends an explicit empty string", async (t) => {
  const bodies: unknown[] = [];
  const ui = await mount(t, (async (_path, init) => { bodies.push(JSON.parse(String(init?.body))); return ack(""); }) as typeof fetch);
  await ui.change("  ");
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(bodies, [{ relationshipGoal: "" }]);
  assert.deepEqual(ui.saved, [""]);
});

test("a late response after unmount cannot update the parent", async (t) => {
  let respond!: (response: Response) => void;
  const ui = await mount(t, (() => new Promise<Response>((resolve) => { respond = resolve; })) as typeof fetch);
  await ui.change("新目标"); let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); });
  await act(async () => { ui.root.unmount(); });
  await act(async () => { respond(ack("新目标")); await pending; });
  assert.deepEqual(ui.saved, []);
});

test("goal-only UI writes survive a lost ACK and cold-read without replacing other profile fields", async (t) => {
  const actorId = "account_orbit_generated";
  const workspaceId = "workspace:web-analysis-goal";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  const provider = createStorageProfileProvider({ store, workspaceId });
  const service = createLiveProfileService({ provider });
  const seeded = await service.updateProfile({ relationshipGoal: "原目标", homeMarket: "Osaka", preferredLanguage: "ja", targetRelationshipTypes: ["供应商"], preferredIntroChannels: ["email"] }, { actorId });
  if (!seeded.success || !seeded.data.profile) throw new Error("Missing live profile fixture");
  const before = seeded.data.profile;
  let attempts = 0;
  const ui = await mount(t, (async (path, init) => {
    assert.equal(path, "/api/profile");
    const result = await service.updateProfile(JSON.parse(String(init?.body)), { actorId });
    if (++attempts === 1) throw new Error("Response lost after write");
    return Response.json(result);
  }) as typeof fetch, before.id);
  await ui.change("认识东京制造业伙伴");
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(ui.saved, []);
  await act(async () => { await ui.save().props.onClick(); });
  assert.deepEqual(ui.saved, ["认识东京制造业伙伴"]);
  const cold = await createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId }) }).getProfile({ actorId });
  if (!cold.success || !cold.data.profile) throw new Error("Missing saved profile");
  const { relationshipGoal, updatedAt: _updated, ...rest } = cold.data.profile;
  const { relationshipGoal: _originalGoal, updatedAt: _originalUpdated, ...originalRest } = before;
  assert.equal(relationshipGoal, "认识东京制造业伙伴");
  assert.deepEqual(rest, originalRest);
});
