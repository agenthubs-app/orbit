import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { OrbitRealProfile } from "../../app/(app)/app/profile/orbit-real-profile";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createLiveProfileService } from "../../features/profile/live-service";
import { profileServiceFactory } from "../../features/profile/service-factory";
import { createProfileRouteHandlers } from "../../app/api/profile/handlers";
import { loadAppProfileRouteViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-route-view-model";
import { profileRouteToOrbitProfileViewModel } from "../../app/(app)/app/profile/compose-app-profile-from-previously-approved-mock-first-capabilities/profile-view-model-adapter";

test("profile page projection preserves both stable industry IDs and legacy text, including missing IDs", async t => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId: "profile-page-projection" }) });
  const resolution = profileServiceFactory.create("mock");
  t.mock.method(profileServiceFactory, "create", () => ({ ...resolution, service }));
  await service.updateProfile({ displayName: "Projection owner", industry: "Legacy industry text", primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" }, { actorId: "profile-projection-owner" });
  const route = await loadAppProfileRouteViewModel({ id: "profile-projection-owner", displayName: "Projection owner" });
  assert.equal(route.state, "success");
  if (route.state !== "success") throw new Error("Missing profile route fixture");
  const mapped = profileRouteToOrbitProfileViewModel(route);
  assert.equal(Reflect.get(mapped.profile, "primaryIndustryId"), "technology_internet");
  assert.equal(Reflect.get(mapped.profile, "secondaryIndustryId"), "technology_internet.ai_data");
  assert.equal(mapped.profile.industry, "Legacy industry text");
  await service.updateProfile({ displayName: "Legacy owner", industry: "Legacy industry text" }, { actorId: "legacy-projection-owner" });
  const legacyRoute = await loadAppProfileRouteViewModel({ id: "legacy-projection-owner", displayName: "Legacy owner" });
  assert.equal(legacyRoute.state, "success");
  if (legacyRoute.state !== "success") throw new Error("Missing legacy profile route fixture");
  const legacy = profileRouteToOrbitProfileViewModel(legacyRoute);
  assert.equal(Reflect.get(legacy.profile, "primaryIndustryId"), undefined);
  assert.equal(Reflect.get(legacy.profile, "secondaryIndustryId"), undefined);
  assert.equal(legacy.profile.industry, "Legacy industry text");
});

test("Web profile selects a parent and child, verifies a real actor-scoped readback and preserves a failed draft", async t => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { addEventListener() {}, removeEventListener() {} } });
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const service = createLiveProfileService({ provider: createStorageProfileProvider({ store, workspaceId: "secondary-editor" }) });
  const resolution = profileServiceFactory.create("mock");
  t.mock.method(profileServiceFactory, "create", () => ({ ...resolution, service }));
  const handlers = createProfileRouteHandlers({ resolveActor: async () => ({ id: "editor-a" }) });
  const writes: Record<string, unknown>[] = [];
  let failReadback = false;
  t.mock.method(globalThis, "fetch", (async (path, init) => {
    if (path !== "/api/profile") return Response.json({ success: true, data: { items: [], unreadCount: 0 } });
    const request = new Request(`http://localhost${path}`, init);
    if (init?.method === "PUT") { writes.push(JSON.parse(String(init.body))); return handlers.PUT(request); }
    if (failReadback) return Response.json({ success: false }, { status: 503 });
    return handlers.GET(request);
  }) as typeof fetch);
  const model = { industries: [], offeringTags: [], seekingTags: [], topics: [], profile: {
    fullName: "Editor A", headline: "", company: "", title: "", industry: "Legacy raw industry", intro: "", bio: "Keep this bio", email: "", wechatName: "", lineId: "", offering: [], seeking: [], topics: [],
  } };
  let root!: ReactTestRenderer;
  await act(async () => { root = create(<OrbitRealProfile viewModel={model} />); });
  t.after(() => {
    act(() => root.unmount());
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
  });
  const primary = () => root.root.findAllByProps({ "aria-label": "一级行业" })[0];
  const secondary = () => root.root.findAllByProps({ "aria-label": "二级行业" })[0];
  const submit = async () => { await act(async () => { await root.root.findAllByType("form")[0].props.onSubmit({ preventDefault() {} }); }); };
  await act(async () => { primary().props.onChange({ target: { value: "technology_internet" } }); });
  await submit();
  assert.equal(writes.length, 0, "a new incomplete selection cannot be saved");
  await act(async () => { secondary().props.onChange({ target: { value: "technology_internet.ai_data" } }); });
  await submit();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].secondaryIndustryId, "technology_internet.ai_data");
  assert.equal(writes[0].industry, "Legacy raw industry");
  const saved = await service.getProfile({ actorId: "editor-a" });
  assert.equal(saved.success, true);
  if (!saved.success) throw new Error("Profile read failed");
  assert.equal(saved.data.profile?.secondaryIndustryId, "technology_internet.ai_data");
  assert.equal(saved.data.profile?.bio, "Keep this bio");
  assert.ok(root.root.findAllByProps({ role: "status" }).length);
  await act(async () => { primary().props.onChange({ target: { value: "finance_investment" } }); });
  assert.equal(secondary().props.value, "");
  assert.equal(secondary().findAllByType("option").some(option => option.props.value === "technology_internet.ai_data"), false);
  await act(async () => { secondary().props.onChange({ target: { value: "finance_investment.banking" } }); });
  failReadback = true;
  await submit();
  assert.equal(secondary().props.value, "finance_investment.banking");
  assert.ok(root.root.findAllByProps({ role: "alert" }).length);
  failReadback = false;
  await act(async () => { root.unmount(); });
  await act(async () => { root = create(<OrbitRealProfile viewModel={model} />); });
  assert.equal(primary().props.value, "finance_investment");
  assert.equal(secondary().props.value, "finance_investment.banking", "reopening reads the persisted IDs, not the old page projection");
  assert.equal(writes.length, 2, "reopening is read-only");
  const other = await service.getProfile({ actorId: "editor-b" });
  assert.equal(other.success && other.data.profile, null);
});
