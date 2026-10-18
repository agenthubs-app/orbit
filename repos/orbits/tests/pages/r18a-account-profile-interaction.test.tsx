import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { AccountProfilePage } from "../../app/(app)/app/orbit-2026/account/AccountProfilePage";
import { createAccountDesignFixtureStore } from "../../features/profile/design-fixtures/service";

test("visibility switch changes preview before a confirmed CAS PUT", async t => {
  const store = createAccountDesignFixtureStore();
  const initial = store.read("actor", "100").data;
  if (!initial.profile) throw new Error("missing test profile");
  const originalFetch = globalThis.fetch;
  const writes: unknown[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { range: "upcoming", items: [], upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0, appliedThisMonth: 0 } });
    if (url === "/api/profile" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      const saved = store.update("actor", "100", body);
      return Response.json(saved.success ? { success: true, data: saved.data } : { success: false }, { status: saved.success ? 200 : 409 });
    }
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage, { initialPayload: initial })); });
  t.after(() => { void act(() => root.unmount()); });
  const bio = initial.profile.bio;
  assert.ok(bio);
  await act(async () => { root.root.findByProps({ "data-profile-edit": true }).props.onClick(); });
  await act(async () => { root.root.findByProps({ "data-public-field": "intro" }).props.onChange({ target: { checked: false } }); });
  const preview = root.root.findByProps({ "aria-label": "公开预览" });
  assert.ok(!preview.findAllByType("p").some(item => item.children.join("").includes(bio)));
  await act(async () => { await root.root.findByProps({ "data-profile-save": true }).props.onClick(); });
  assert.equal(writes.length, 1);
  const saved = writes[0] as { expectedUpdatedAt: string; mutationId: string; publicFields: { intro: boolean } };
  assert.equal(saved.expectedUpdatedAt, initial.profile.updatedAt);
  assert.ok(saved.mutationId);
  assert.equal(saved.publicFields.intro, false);
});

test("dismissed design candidate stays local; accepting another saves only seeking", async t => {
  const store = createAccountDesignFixtureStore();
  const initial = store.read("actor", "50").data;
  const first = "シリーズA のリード投資家";
  const second = "製造業の決裁者";
  const originalFetch = globalThis.fetch;
  const writes: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { range: "upcoming", items: [], upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0, appliedThisMonth: 0 } });
    if (url === "/api/profile" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      writes.push(body);
      const saved = store.update("actor", "50", body);
      return Response.json(saved.success ? { success: true, data: saved.data } : { success: false }, { status: saved.success ? 200 : 409 });
    }
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage, { initialPayload: initial, suggestions: [first, second] })); });
  t.after(() => { void act(() => root.unmount()); });
  await act(async () => { root.root.findByProps({ "aria-label": `忽略候选: ${first}` }).props.onClick(); });
  assert.equal(writes.length, 0);
  await act(async () => { await root.root.findByProps({ "aria-label": `采用候选: ${second}` }).props.onClick(); });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0]?.seeking, [second]);
  assert.ok(!("offering" in writes[0]!));
});

test("live profile loads seeker candidates from the supported-language endpoint", async t => {
  const initial = createAccountDesignFixtureStore().read("actor", "50").data;
  const originalFetch = globalThis.fetch;
  const requests: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0 } });
    if (url === "/api/profile/seek-suggestions") {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({ success: true, data: { suggestions: ["投资人"] } });
    }
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage, { initialPayload: initial })); });
  t.after(() => { void act(() => root.unmount()); });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.language, "zh");
  assert.ok((requests[0]?.candidates as string[]).includes("投资人"));
  assert.ok(root.root.findAllByType("button").some(button => button.props["aria-label"] === "采用候选: 投资人"));
});

test("profile editor does not publish another actor's successful-looking save receipt", async t => {
  const store = createAccountDesignFixtureStore();
  const initial = store.read("actor", "100").data;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0 } });
    if (url === "/api/profile" && init?.method === "PUT") {
      const saved = store.update("actor", "100", JSON.parse(String(init.body)));
      if (!saved.success || !saved.data.profile) throw new Error("fixture save failed");
      return Response.json({ success: true, data: { ...saved.data, profile: { ...saved.data.profile, id: "another-actor" } } });
    }
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage, { initialPayload: initial })); });
  t.after(() => { void act(() => root.unmount()); });
  await act(async () => { root.root.findByProps({ "data-profile-edit": true }).props.onClick(); });
  await act(async () => { await root.root.findByProps({ "data-profile-save": true }).props.onClick(); });
  assert.ok(root.root.findAllByProps({ role: "alert" }).length > 0);
  assert.ok(root.root.findAllByProps({ "data-profile-save": true }).length > 0);
  assert.equal(root.root.findAllByProps({ role: "status" }).length, 0);
});

test("profile editor confirms a save when the live service normalizes duplicate full-width tags", async t => {
  const store = createAccountDesignFixtureStore();
  const initial = store.read("actor", "100").data;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0 } });
    if (url === "/api/profile" && init?.method === "PUT") {
      const submitted = JSON.parse(String(init.body));
      const saved = store.update("actor", "100", { ...submitted, offering: ["ABC"] });
      return Response.json(saved.success ? { success: true, data: saved.data } : { success: false }, { status: saved.success ? 200 : 409 });
    }
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage, { initialPayload: initial })); });
  t.after(() => { void act(() => root.unmount()); });
  await act(async () => { root.root.findByProps({ "data-profile-edit": true }).props.onClick(); });
  await act(async () => { root.root.findAllByType("textarea")[0]!.props.onChange({ target: { value: "ＡＢＣ\nＡＢＣ" } }); });
  await act(async () => { await root.root.findByProps({ "data-profile-save": true }).props.onClick(); });
  assert.equal(root.root.findAllByProps({ role: "status" }).length, 1);
  assert.ok(root.root.findAllByType("span").some(span => span.children.join("") === "ABC"));
});

test("profile hides private data when a later read loses authorization", async t => {
  const profile = createAccountDesignFixtureStore().read("actor", "100").data;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url === "/api/profile") return Response.json({ success: true, data: profile });
    if (url === "/api/profile?design=25") return Response.json({ success: false }, { status: 401 });
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0 } });
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage)); });
  t.after(() => { void act(() => root.unmount()); });
  assert.ok(root.root.findAllByType("span").some(span => span.children.join("") === profile.profile?.handles.email));
  await act(async () => { root.update(createElement(AccountProfilePage, { design: "25" })); });
  assert.ok(root.root.findAllByProps({ role: "alert" }).length > 0);
  assert.ok(!root.root.findAllByType("span").some(span => span.children.join("") === profile.profile?.handles.email));
});

test("profile shows the sign-in prompt for a non-JSON unauthorized response", async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url === "/api/profile") return new Response("Unauthorized", { status: 401 });
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0 } });
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage)); });
  t.after(() => { void act(() => root.unmount()); });
  assert.ok(root.root.findAllByType("p").some(p => p.children.join("") === "登录后查看个人资料。"));
});

test("a late old-profile read cannot restore data after authorization fails", async t => {
  const profile = createAccountDesignFixtureStore().read("actor", "100").data;
  const originalFetch = globalThis.fetch;
  let resolveOld!: (response: Response) => void;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url === "/api/profile") return await new Promise<Response>(resolve => { resolveOld = resolve; });
    if (url === "/api/profile?design=25") return Response.json({ success: false }, { status: 401 });
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0 } });
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage)); });
  t.after(() => { void act(() => root.unmount()); });
  await act(async () => { root.update(createElement(AccountProfilePage, { design: "25" })); });
  await act(async () => { resolveOld(Response.json({ success: true, data: profile })); });
  assert.ok(root.root.findAllByProps({ role: "alert" }).length > 0);
  assert.ok(!root.root.findAllByType("span").some(span => span.children.join("") === profile.profile?.handles.email));
});
