import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, BrowserContext, Page } from "playwright";

import { interpretInvitePreviewResponse } from "../../app/i/_landing/preview-response";
import { listActorContactRecords } from "../../features/contacts/business-card-contact-match";
import type { InviteProfile } from "../../features/invite-codes/contract";
import { createInviteCodeLiveHandlers } from "../../features/invite-codes/handlers";
import { inviteConnectedNotification } from "../../features/invite-codes/notification";
import { createInviteRateLimiter, createMemoryInviteAttemptStore } from "../../features/invite-codes/rate-limit";
import { createInviteCodeService, type InviteConnectedNotice } from "../../features/invite-codes/service";
import { ALICE, BOB, INVITE_WS, memoryHarness, profile } from "../support/invite-codes-harness";
import { bundle, errorsOf, launch } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

// R15 SC-02 end to end at service + render level (the Web pages over the real live handlers and service,
// in-memory storage): two browser contexts. A (signed in, has a profile) opens 人脈を追加 › 招待コード and
// creates a code; B opens /i/<code> signed out (→ 登録 link back to /i/<code>), then — after signing up, with
// an empty profile — fills the short profile (saved through the /api/profile shape), chooses what to share and
// connects. Both networks gain one person (values read from the profiles, only the chosen keys) and A gets one
// notification. The full-stack variant against a running dev server is tests/e2e/invite-codes-two-browsers.e2e.ts.

type Api = (actor: string | null, method: string, url: string, body: string | null) => Promise<{ status: number; text: string }>;

function world() {
  const harness = memoryHarness();
  const notices: InviteConnectedNotice[] = [];
  const service = createInviteCodeService({ linkOrigin: "https://orbitailink.com", log: () => undefined, notifier: { connected: async (notice) => void notices.push(notice) }, storage: harness.storage });
  const limiter = createInviteRateLimiter({ secret: Buffer.from("flow-test"), store: createMemoryInviteAttemptStore() });
  let current: string | null = null;
  const live = createInviteCodeLiveHandlers({ limiter, log: () => undefined, resolveActor: async () => (current ? { id: current } : null), service });
  const profiles = (harness.storage as unknown as { profiles: Map<string, InviteProfile> }).profiles;

  const json = (status: number, data: unknown) => ({ status, text: JSON.stringify({ success: status < 400, data }) });
  const route = async (actor: string | null, method: string, url: string, body: string | null) => {
    current = actor;
    const path = new URL(url, "http://localhost").pathname;
    const request = new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json", "x-real-ip": actor === BOB ? "10.0.0.2" : "10.0.0.1" }, ...(body ? { body } : {}) });
    const params = (code: string) => ({ params: Promise.resolve({ code }) });
    let response: Response | null = null;
    let match: RegExpMatchArray | null;
    if (path === "/api/invite-codes/current" && method === "GET") response = await live.current(request);
    else if (path === "/api/invite-codes" && method === "GET") response = await live.history(request);
    else if (path === "/api/invite-codes" && method === "POST") response = await live.create(request);
    else if ((match = path.match(/^\/api\/invite-codes\/([^/]+)\/redeem$/u)) && method === "POST") response = await live.redeem(request, params(decodeURIComponent(match[1]!)));
    else if ((match = path.match(/^\/api\/invite-codes\/([^/]+)\/preview$/u))) response = await live.preview(request, params(decodeURIComponent(match[1]!)));
    else if (path === "/api/contacts/manual/duplicates") return json(200, { candidates: [] });
    else if (path === "/api/profile" && actor) {
      // The existing profile API's shape (only what the invite pages read / send).
      if (method === "GET") {
        const p = profiles.get(actor);
        return json(200, { profile: p ? { displayName: p.displayName, organization: p.organization ?? "", role: p.role ?? "", offering: p.offering, seeking: p.seeking, handles: { ...(p.email ? { email: p.email } : {}), ...(p.phone ? { phone: p.phone } : {}) }, updatedAt: p.updatedAt } : null });
      }
      const input = JSON.parse(body ?? "{}");
      profiles.set(actor, { actorId: actor, displayName: input.displayName, email: null, offering: input.offering ?? [], organization: input.organization || null, phone: null, role: input.role || null, seeking: input.seeking ?? [], updatedAt: new Date().toISOString() });
      return json(200, { mutationId: input.mutationId });
    }
    if (!response) return { status: 404, text: JSON.stringify({ success: false, error: { code: "NOT_FOUND" } }) };
    return { status: response.status, text: await response.text() };
  };
  return { harness, live, notices, route, setActor: (actor: string | null) => void (current = actor) };
}

let browser: Browser;
let senderCode: { js: string; css: string };
let landingCode: { js: string; css: string };

const FETCH = `
  window.fetch = async (url, init = {}) => {
    const reply = await window.__orbitApi(window.__actor, init.method || "GET", String(url), init.body ?? null);
    return new Response(reply.text, { status: reply.status, headers: { "content-type": "application/json" } });
  };
  const store = new Map();
  Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } } });
`;

test.before(async () => {
  senderCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    import { AddContactScreen } from "./app/(app)/app/orbit-2026/add/AddContactScreen";
    ${FETCH}
    createRoot(document.getElementById("root")).render(<OrbitAskProvider><Orbit2026Shell language="ja" signedIn><AddContactScreen /></Orbit2026Shell></OrbitAskProvider>);
  `, SHELL_STUBS);
  landingCode = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { InviteLanding } from "./app/(app)/app/orbit-2026/invite-landing/InviteLanding";
    ${FETCH}
    const f = window.landingFixture;
    createRoot(document.getElementById("root")).render(<InviteLanding language="ja" initial={f.initial} signedIn={f.signedIn} accountName={f.accountName} navigate={(href) => f.navigations.push(href)} />);
  `);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function mount(context: BrowserContext, api: Api, actor: string | null, code: { js: string; css: string }, fixture: object, width = 1440): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize({ width, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  (page as Page & { errors: string[] }).errors = errors;
  await page.exposeFunction("__orbitApi", api);
  await page.route("**/*", (route) => route.abort());
  await page.setContent(`<!doctype html><html lang="ja"><head><style>body{margin:0;background:var(--bg)}</style></head><body><div id="root"></div><script>window.__actor=${JSON.stringify(actor)};window.landingFixture=${JSON.stringify({ navigations: [], ...fixture })};window.shellFixture={calls:[],lang:"ja",path:"/app/contacts/new",unread:false}</script></body></html>`);
  await page.addStyleTag({ path: `${process.cwd()}/app/(app)/app/orbit-2026/tokens.css` });
  if (code.css) await page.addStyleTag({ content: code.css });
  await page.addScriptTag({ content: code.js });
  return page;
}

test("A creates a code in the dialog; B opens /i/<code>, signs up, fills the short profile, shares, connects — both networks +1 and A has one notification", async () => {
  const w = world();
  await w.harness.setProfile(profile(ALICE, { displayName: "佐藤 健一", email: "kenichi@minato.example", offering: ["製造業 SaaS の導入知見"], organization: "株式会社ミナトリンク", phone: null, role: "代表取締役", seeking: ["投資家の紹介"] }));
  const before = { a: (await listActorContactRecords(w.harness.contacts, INVITE_WS, ALICE)).length, b: (await listActorContactRecords(w.harness.contacts, INVITE_WS, BOB)).length };
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    // A: 人脈を追加 › 招待コード (first time: 説明 → コードをつくる).
    const a = await mount(contextA, w.route, ALICE, senderCode, {});
    await a.locator('[data-add-door="invite"]').click();
    await a.locator("[data-invite-start]").click();
    const code = (await a.locator("[data-invite-code]").textContent())!;
    assert.match(code, /^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/u);
    assert.equal(await a.locator("[data-invite-link]").textContent(), `orbitailink.com/i/${code}`);

    // B, signed out: the page is server-rendered from the same preview handler.
    w.setActor(null);
    const signedOut = await interpretInvitePreviewResponse(await w.live.preview(new Request(`http://localhost/api/invite-codes/${code}/preview`, { headers: { "x-real-ip": "10.0.0.2" } }), { params: Promise.resolve({ code }) }));
    assert.equal(signedOut.kind, "preview");
    const b1 = await mount(contextB, w.route, null, landingCode, { initial: signedOut, signedIn: false, accountName: null }, 390);
    await b1.locator("[data-invite-open]").waitFor();
    assert.equal(await b1.locator("[data-invite-inviter]").getByText("佐藤 健一 さん").count(), 1);
    assert.doesNotMatch((await b1.locator("body").textContent())!, /kenichi@/u, "the preview never shows the e-mail");
    assert.equal(await b1.locator("[data-invite-signup]").getAttribute("href"), `/app/account/signup?next=%2Fi%2F${code}`);

    // B signed up (a new account has no profile yet) and came back to /i/<code>.
    w.setActor(BOB);
    const signedIn = await interpretInvitePreviewResponse(await w.live.preview(new Request(`http://localhost/api/invite-codes/${code}/preview`, { headers: { "x-real-ip": "10.0.0.2" } }), { params: Promise.resolve({ code }) }));
    const b2 = await mount(contextB, w.route, BOB, landingCode, { initial: signedIn, signedIn: true, accountName: "takahashi" }, 390);
    await b2.locator("[data-invite-profile]").waitFor();
    await b2.locator('[data-invite-field="displayName"]').fill("高橋 美咲");
    await b2.locator('[data-invite-field="organization"]').fill("青葉ベンチャーズ");
    await b2.locator('[data-invite-field="role"]').fill("パートナー");
    await b2.locator('[data-invite-tag="人の紹介"]').click();
    await b2.locator('[data-invite-tag="投資家の紹介"]').click();
    await b2.locator("[data-invite-profile-next]").click();
    await b2.locator("[data-invite-confirm]").waitFor();
    // 求めていること off: only 会社・役職 and 提供できること go to 佐藤さん.
    await b2.locator('[data-invite-switch="seeking"] [role="switch"]').click();
    await b2.locator("[data-invite-connect]").click();
    await b2.locator('[data-invite-done="connected"]').waitFor();
    assert.equal(await b2.locator("[data-invite-from-peer]").getByText("株式会社ミナトリンク · 代表取締役").count(), 1);

    const aContacts = await listActorContactRecords(w.harness.contacts, INVITE_WS, ALICE);
    const bContacts = await listActorContactRecords(w.harness.contacts, INVITE_WS, BOB);
    assert.equal(aContacts.length, before.a + 1, "A's network +1");
    assert.equal(bContacts.length, before.b + 1, "B's network +1");
    const bobInA = (await w.harness.contacts.listRecords({ collectionName: "contacts", limit: "unbounded", userId: ALICE, workspaceId: INVITE_WS })).map((record) => record.payload)[0] as Record<string, unknown>;
    assert.equal(bobInA.displayName, "高橋 美咲");
    assert.equal(bobInA.organization, "青葉ベンチャーズ");
    assert.equal(JSON.stringify(bobInA).includes("投資家の紹介"), false, "求めていること was not shared");
    assert.equal(w.notices.length, 1, "one notification for A");
    assert.equal(w.notices[0]!.inviterActorId, ALICE);
    const notification = inviteConnectedNotification({ ...w.notices[0]!, contactRevision: "r1" });
    assert.match(JSON.stringify(notification), /高橋 美咲/u);
    for (const page of [a, b1, b2]) assert.deepEqual(errorsOf(page), []);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
