import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { act, create } from "react-test-renderer";
import { AnalysisGoalEditor } from "../../app/(app)/app/contacts/analysis/analysis-goal-editor";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

async function mount(t: TestContext, fetcher: typeof fetch, profileId = "profile:one", initialUpdatedAt = "2026-09-14T00:00:00.000Z") {
  t.mock.method(globalThis, "fetch", fetcher);
  const previous = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: { activeElement: null, addEventListener() {}, removeEventListener() {} } });
  const saved: string[] = [];
  const element = (text = "原目标") => <AnalysisGoalEditor profileId={profileId} initialGoal={text} initialUpdatedAt={initialUpdatedAt} onClose={() => {}} onSaved={(text) => saved.push(text)} />;
  let root!: ReturnType<typeof create>;
  await act(async () => { root = create(element()); });
  t.after(() => { act(() => root.unmount()); if (previous) Object.defineProperty(globalThis, "document", previous); else Reflect.deleteProperty(globalThis, "document"); });
  return { root, saved, element, save: () => root.root.findByProps({ "data-analysis-goal-save": true }), change: async (value: string) => { await act(async () => { root.root.findByType("textarea").props.onChange({ target: { value } }); }); } };
}
const ack = (text: string, mutationId: string, id = "profile:one", updatedAt = "2026-09-15T00:00:00.000Z") => Response.json({ success: true, data: { mutationId, profile: { id, relationshipGoal: text, updatedAt }, editor: { lastSavedAt: updatedAt } } });

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
  const body = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(Object.keys(body).sort(), ["expectedUpdatedAt", "mutationId", "relationshipGoal"]);
  assert.equal(body.relationshipGoal, "认识日本供应链伙伴");
  assert.equal(body.expectedUpdatedAt, "2026-09-14T00:00:00.000Z");
  assert.match(body.mutationId, /^web:relationship-goal:/u);
  await act(async () => { respond(ack("认识日本供应链伙伴", body.mutationId)); await pending; });
  assert.deepEqual(ui.saved, ["认识日本供应链伙伴"]);
});

test("goal failure and wrong-account ACK retain the draft across prop refresh and retry", async (t) => {
  const bodies: Array<{ mutationId: string }> = [];
  const ui = await mount(t, (async (_path, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    if (bodies.length === 1) throw new Error("offline");
    return ack("新目标", body.mutationId, bodies.length === 2 ? "profile:another" : "profile:one");
  }) as typeof fetch);
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
  assert.equal(new Set(bodies.map((body) => body.mutationId)).size, 1);
});

test("clearing a goal sends an explicit empty string", async (t) => {
  const bodies: unknown[] = [];
  const ui = await mount(t, (async (_path, init) => { const body = JSON.parse(String(init?.body)); bodies.push(body); return ack("", body.mutationId); }) as typeof fetch);
  await ui.change("  ");
  await act(async () => { await ui.save().props.onClick(); });
  assert.equal(bodies.length, 1);
  assert.deepEqual(Object.keys(bodies[0] as object).sort(), ["expectedUpdatedAt", "mutationId", "relationshipGoal"]);
  assert.equal((bodies[0] as { relationshipGoal: string }).relationshipGoal, "");
  assert.deepEqual(ui.saved, [""]);
});

test("a late response after unmount cannot update the parent", async (t) => {
  let respond!: (response: Response) => void;
  let mutationId = "";
  const ui = await mount(t, ((_path, init) => {
    mutationId = JSON.parse(String(init?.body)).mutationId;
    return new Promise<Response>((resolve) => { respond = resolve; });
  }) as typeof fetch);
  await ui.change("新目标"); let pending!: Promise<void>;
  await act(async () => { pending = ui.save().props.onClick(); });
  await act(async () => { ui.root.unmount(); });
  await act(async () => { respond(ack("新目标", mutationId)); await pending; });
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
  let receipt: Awaited<ReturnType<typeof service.updateProfile>> | null = null;
  const ui = await mount(t, (async (path, init) => {
    assert.equal(path, "/api/profile");
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(Object.keys(body).sort(), ["expectedUpdatedAt", "mutationId", "relationshipGoal"]);
    if (!receipt) {
      const saved = await service.updateProfile({ relationshipGoal: body.relationshipGoal }, { actorId });
      receipt = saved.success
        ? { ...saved, data: { ...saved.data, mutationId: body.mutationId } }
        : saved;
    }
    if (++attempts === 1) throw new Error("Response lost after write");
    return Response.json(receipt);
  }) as typeof fetch, before.id, before.updatedAt);
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
