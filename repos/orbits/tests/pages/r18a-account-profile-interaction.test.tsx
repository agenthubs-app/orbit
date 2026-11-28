import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

import { AccountProfilePage } from "../../app/(app)/app/orbit-2026/account/AccountProfilePage";
import { createAccountDesignFixtureStore } from "../../features/profile/design-fixtures/service";

// The settings menu is next/link (prefetched); without IntersectionObserver its prefetch waits for an idle
// callback, which reads the browser's `self`.
(globalThis as { self?: unknown }).self ??= globalThis;

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
  // UR-P：公開する項目只在编辑面板里，用开关（role=switch）。
  await act(async () => { root.root.findByProps({ "data-public-field": "intro" }).findByProps({ role: "switch" }).props.onClick(); });
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
  // UR-P：提供できること是标签输入——全角与半角写法服务端归一成同一项。
  for (;;) {
    const remove = root.root.findByProps({ "data-profile-tags": "offering" }).findAll(node => node.type === "button" && node.props["data-profile-tag-add"] === undefined);
    if (!remove.length) break;
    await act(async () => { remove[0]!.props.onClick(); });
  }
  for (const value of ["ＡＢＣ", "ABC"]) {
    await act(async () => { root.root.findByProps({ "data-profile-tag-add": "offering" }).props.onClick(); });
    const input = root.root.findByProps({ "data-profile-tag-input": "offering" });
    await act(async () => { input.props.onChange({ target: { value } }); });
    await act(async () => { input.props.onKeyDown({ key: "Enter", nativeEvent: { isComposing: false }, preventDefault() {} }); });
  }
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

// UR-P9–P15（2026-11-27）：编辑资料面板里的「連絡先」——改过才提交 handles + contactMethodsConfirmed，其他 handles 保留；
// 格式不对时点保存不提交，只标那一栏。
async function contactHarness(t: { after: (fn: () => void) => void }) {
  const store = createAccountDesignFixtureStore();
  const initial = store.read("actor", "100").data;
  if (!initial.profile) throw new Error("missing test profile");
  const originalFetch = globalThis.fetch;
  const writes: Record<string, unknown>[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("/api/events/mine")) return Response.json({ data: { range: "upcoming", items: [], upcomingCount: 0 } });
    if (url.startsWith("/api/events/center")) return Response.json({ data: { eventCount: 0, activeCount: 0, appliedThisMonth: 0 } });
    if (url === "/api/profile" && init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push(body);
      const { contactMethodsConfirmed: _flag, ...profileBody } = body;
      const saved = store.update("actor", "100", profileBody);
      return Response.json(saved.success ? { success: true, data: saved.data } : { success: false }, { status: saved.success ? 200 : 409 });
    }
    throw new Error(`Unexpected test fetch ${url}`);
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  let root!: ReactTestRenderer;
  await act(async () => { root = create(createElement(AccountProfilePage, { initialPayload: initial })); });
  t.after(() => { void act(() => root.unmount()); });
  await act(async () => { root.root.findByProps({ "data-profile-edit": true }).props.onClick(); });
  return { root, writes, initial };
}

test("filling LINE in the edit panel saves it with the confirmation and keeps the other handles", async t => {
  const { root, writes, initial } = await contactHarness(t);
  await act(async () => { root.root.findByProps({ id: "pe-lineId" }).props.onChange({ target: { value: "  alice.line " } }); });
  await act(async () => { await root.root.findByProps({ "data-profile-save": true }).props.onClick(); });
  assert.equal(writes.length, 1);
  const body = writes[0] as { handles: Record<string, string>; contactMethodsConfirmed?: boolean };
  assert.equal(body.contactMethodsConfirmed, true);
  assert.equal(body.handles.lineId, "alice.line");
  for (const [key, value] of Object.entries(initial.profile!.handles ?? {})) {
    if (key !== "lineId" && typeof value === "string" && value.trim()) assert.equal(body.handles[key], value.trim(), `${key} is kept`);
  }
});

test("saving without touching the contact fields sends no handles and no confirmation", async t => {
  const { root, writes } = await contactHarness(t);
  await act(async () => { root.root.findByProps({ "data-public-field": "intro" }).findByProps({ role: "switch" }).props.onClick(); });
  await act(async () => { await root.root.findByProps({ "data-profile-save": true }).props.onClick(); });
  assert.equal(writes.length, 1);
  assert.ok(!("handles" in writes[0]!));
  assert.ok(!("contactMethodsConfirmed" in writes[0]!));
});

test("a malformed email stops the save and marks only that field", async t => {
  const { root, writes } = await contactHarness(t);
  const more = root.root.findAllByProps({ "data-profile-contact-more": "" });
  if (more.length) await act(async () => { more[0]!.props.onClick(); });
  await act(async () => { root.root.findByProps({ id: "pe-email" }).props.onChange({ target: { value: "k.sato@minatolink" } }); });
  await act(async () => { await root.root.findByProps({ "data-profile-save": true }).props.onClick(); });
  assert.equal(writes.length, 0);
  assert.equal(root.root.findByProps({ id: "pe-email" }).props["aria-invalid"], true);
  assert.equal(root.root.findByProps({ id: "pe-lineId" }).props["aria-invalid"], undefined);
  assert.ok(root.root.findAllByProps({ "data-profile-miss": "" }).length === 1);
});

// 2026-11-28「能改用户名等个人信息」：编辑面板最上面的「名前」改了就保存新名字；清空时不能保存。
test("the edit panel renames the person and saves the new name", async t => {
  const { root, writes } = await contactHarness(t);
  await act(async () => { root.root.findByProps({ "data-profile-name": "" }).props.onChange({ target: { value: "  格格 " } }); });
  await act(async () => { await root.root.findByProps({ "data-profile-save": true }).props.onClick(); });
  assert.equal(writes.length, 1);
  assert.equal((writes[0] as { displayName: string }).displayName, "格格");
  assert.ok(root.root.findAll(node => node.type === "strong" && node.children.join("") === "格格").length > 0, "the card shows the new name");
});

test("an empty name cannot be saved", async t => {
  const { root, writes } = await contactHarness(t);
  await act(async () => { root.root.findByProps({ "data-profile-name": "" }).props.onChange({ target: { value: "   " } }); });
  const save = root.root.findByProps({ "data-profile-save": true });
  assert.equal(save.props.disabled, true);
  assert.equal(root.root.findByProps({ "data-profile-name": "" }).props["aria-invalid"], true);
  assert.equal(writes.length, 0);
});
