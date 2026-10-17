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
