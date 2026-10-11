import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

// R12 end to end on the Web (PLANNER 测试 · 端到端): the real upload page and batch page with
// the real card batch state machine (useCardBatch: upload, finalize, polling, the shared
// auto-import rule, まとめて確認 actions) against an in-page stand-in for the v2 batch API.
// Recognition results are mocked by file name (no OCR): 1 identical to a contact already in
// the network, 1 similar (same email, other company), 1 unreadable, 1 normal (front + back).
// Expected: identical → merged automatically; normal → added automatically; similar →
// まとめて確認 → 別人として追加; unreadable → スキップ. 完成: new 2 · merged 1 · unreadable 1,
// and the network grew by exactly 2.
let browser: Browser;
let code: { js: string; css: string };

const FAKE_SERVER = `
  const now = "2026-10-11T03:00:00.000Z";
  const contactFields = ["displayName", "organization", "role", "email", "phone", "address"];
  const server = window.fakeServer = {
    contacts: [
      { id: "p-same", displayName: "高山 亮", organization: "ミライ精機株式会社", role: "部長", email: "ryo@mirai.example", phone: "", address: "" },
      { id: "p-sim", displayName: "高橋 美咲", organization: "青葉VC", role: "パートナー", email: "misaki@aoba.example", phone: "", address: "" },
    ],
    batch: null, items: [], polls: 0, log: [],
  };
  const ex = (name, organization, title, email) => ({ addresses: [], certifications: [], contactPoints: [], departments: [], detectedLanguages: ["ja"], emails: email ? [{ label: null, value: email }] : [], fullName: name, nativeFullName: name, organization, romanizedFullName: null, title, website: null });
  const RESULTS = {
    "same.jpg": { extraction: ex("高山 亮", "ミライ精機株式会社", "部長", "ryo@mirai.example") },
    "similar.jpg": { extraction: ex("高橋 美咲", "青葉ベンチャーズ", "パートナー", "misaki@aoba.example") },
    "blurry.jpg": { failed: "IMAGE_INVALID" },
    "normal.jpg": { extraction: ex("伊達 修平", "北辰製作所", "経営企画", "") },
    "normal-back.jpg": { extraction: ex("伊達 修平", "北辰製作所", "", "date@hokushin.example") },
  };
  const json = (data, status = 200) => new Response(JSON.stringify(status < 400 ? { success: true, data } : { success: false, error: data }), { status, headers: { "content-type": "application/json" } });
  const detail = () => ({ batch: server.batch, items: server.items });
  const cardItems = (cardId) => server.items.filter((item) => item.cardId === cardId);
  const settle = () => {
    if (server.items.every((item) => ["confirmed", "skipped", "excluded"].includes(item.status))) server.batch = { ...server.batch, status: "completed" };
  };
  server.upload = (itemId) => {
    server.items = server.items.map((item) => item.id === itemId ? { ...item, status: "uploaded", imageDigest: "sha256:" + item.id, derivativeObjectKey: "k/" + item.id, version: item.version + 1 } : item);
  };
  const candidateFor = (fields) => {
    const contact = server.contacts.find((entry) => (fields.email && entry.email === fields.email) || (entry.displayName === fields.displayName && entry.organization === fields.organization));
    if (!contact) return null;
    const identical = contactFields.every((field) => (contact[field] || "") === (fields[field] || ""));
    return { contactId: contact.id, displayName: contact.displayName, organization: contact.organization, role: contact.role, email: contact.email, phone: contact.phone, address: contact.address, matchedOn: fields.email && contact.email === fields.email ? ["email"] : ["name_organization"], identical };
  };
  window.fetch = async (url, init = {}) => {
    const path = String(url);
    const method = init.method || "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    server.log.push(method + " " + path);
    const base = "/api/contact-drafts/business-card/batches/v2";
    if (path === base && method === "POST") {
      const id = "batch-e2e";
      server.batch = { id, status: "collecting", expectedItems: body.manifest.length, createdAt: now, updatedAt: now, finalizedAt: null, expiresAt: now, version: 1, reviewGeneration: 0, idempotencyKey: body.idempotencyKey, manifestFingerprint: "f", statusReason: null };
      server.items = body.manifest.map((entry, index) => ({
        id: "item-" + (index + 1), batchId: id, cardId: entry.cardId, side: entry.side, seq: entry.seq, status: "awaiting_upload", version: 1, sourceFileName: entry.fileName,
        rawSize: entry.rawSize, rawMimeType: entry.mimeType, clientDigest: entry.clientDigest, imageDigest: null, derivativeObjectKey: null, derivativeSize: null, extraction: null,
        extractionSchemaVersion: 3, reviewIssues: [], usage: null, confirmedContactId: null, cardIdentityExplicit: true, attemptCount: 0, nextRetryAt: null, leaseExpiresAt: null,
        errorStage: null, errorCode: null, createdAt: now, updatedAt: now,
      }));
      return json({ batch: server.batch }, 201);
    }
    if (path === base + "/batch-e2e" && method === "GET") {
      if (server.batch.status === "processing" && ++server.polls >= 2) {
        server.items = server.items.map((item) => {
          const result = RESULTS[item.sourceFileName];
          return result.failed ? { ...item, status: "terminal_failed", errorCode: result.failed, errorStage: "ocr", version: item.version + 1 } : { ...item, status: "extracted", extraction: result.extraction, version: item.version + 1 };
        });
        server.batch = { ...server.batch, status: "ready_for_review" };
      }
      return json(detail());
    }
    if (path === base && method === "GET") return json({ batches: server.batch ? [server.batch] : [] });
    if (path === base + "/batch-e2e/finalize") {
      server.batch = { ...server.batch, status: "processing" };
      server.items = server.items.map((item) => ({ ...item, status: "queued" }));
      return json(detail());
    }
    if (path === base + "/batch-e2e/duplicates" && window.shellFixture.duplicatesFail) return json({ code: "INTERNAL_ERROR", message: "down" }, 500);
    if (path === base + "/batch-e2e/duplicates") {
      const matches = {};
      for (const entry of body.cards) matches[entry.cardId] = candidateFor(entry.fields);
      return json({ matches });
    }
    if (path.startsWith("/api/agent/event-attribution/candidates")) return json({ events: [], cards: {} });
    const action = path.match(/\\/items\\/([^/]+)\\/(confirm|manual-entry|skip)$/);
    if (action) {
      const target = server.items.find((item) => item.id === action[1]);
      if (action[2] === "skip") {
        server.items = server.items.map((item) => item.cardId === target.cardId ? { ...item, status: "skipped", version: item.version + 1 } : item);
        settle();
        return json({ items: cardItems(target.cardId) });
      }
      let contactId = body.mergeIntoContactId;
      const merged = Boolean(contactId);
      if (!merged) {
        contactId = "p-new-" + (server.contacts.length + 1);
        server.contacts = [...server.contacts, { id: contactId, displayName: body.displayName, organization: body.organization, role: body.role, email: body.email, phone: body.phone, address: body.address }];
      }
      server.items = server.items.map((item) => item.cardId === target.cardId ? { ...item, status: "confirmed", confirmedContactId: contactId, version: item.version + 1 } : item);
      settle();
      return json({ state: "created", contactId, merged, metEventId: null, items: cardItems(target.cardId) });
    }
    return json({ code: "NOT_FOUND", message: "no stub " + path }, 404);
  };
`;

test.before(async () => {
  code = await bundle(`
    import React, { useEffect, useState } from "react";
    import { createRoot } from "react-dom/client";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    import { ScanUploadClient } from "./app/(app)/app/contacts/new/_add/scan-upload-client";
    import { ScanBatchClient } from "./app/(app)/app/contacts/new/_add/scan-batch-client";
    ${FAKE_SERVER}
    // about:blank is not a secure context: give the page the two crypto calls a real https page has.
    if (!crypto.randomUUID) crypto.randomUUID = () => "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
    if (!crypto.subtle) Object.defineProperty(crypto, "subtle", { configurable: true, value: { digest: async (_algorithm, bytes) => { const view = new Uint8Array(bytes); const out = new Uint8Array(32); view.forEach((value, index) => { out[index % 32] = (out[index % 32] * 31 + value + index) & 255; }); return out.buffer; } } });
    const store = new Map();
    Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (k) => store.has(k) ? store.get(k) : null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } } });
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: window.localStorage });
    function App() {
      const [path, setPath] = useState(window.shellFixture.path);
      useEffect(() => { const go = (event) => setPath(event.detail); window.addEventListener("test-nav", go); return () => window.removeEventListener("test-nav", go); }, []);
      window.shellFixture.path = path;
      const batch = path.match(/^\\/app\\/contacts\\/new\\/scan\\/(.+)$/);
      return batch ? <ScanBatchClient batchId={batch[1]} /> : <ScanUploadClient available />;
    }
    createRoot(document.getElementById("root")).render(<OrbitAskProvider><Orbit2026Shell language="ja" signedIn><App /></Orbit2026Shell></OrbitAskProvider>);
  `, {
    ...SHELL_STUBS,
    "^next/navigation$": `
      const f = () => window.shellFixture;
      const go = (href) => { f().calls.push({ push: href }); window.dispatchEvent(new CustomEvent("test-nav", { detail: href })); };
      export const usePathname = () => f().path;
      export const useRouter = () => ({ push: go, replace: go, back() {}, refresh() {} });
      export const useSearchParams = () => new URLSearchParams("");
      export const redirect = go;
    `,
    "^next-auth/react$": `
      import React from "react";
      export const SessionContext = React.createContext(null);
      export const useSession = () => ({ status: "authenticated", data: { user: { id: "user-1", name: "Hana Yamada" } } });
      export const signOut = () => {};
      export const SessionProvider = ({ children }) => children;
    `,
    "ingest-v2-content-transport$": `
      export async function uploadIngestContent(input) { window.fakeServer.upload(input.itemId); return { ok: true, errorCode: null }; }
    `,
  });
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

test("e2e: upload 4 cards (one front + back) → read → auto into 人脈 → まとめて確認 → 完成 numbers match the network", { timeout: 90_000 }, async (t) => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], lang: "ja", path: "/app/contacts/new/scan", unread: false })}</script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  const before = await page.evaluate(() => (window as any).fakeServer.contacts.length);
  const jpg = (name: string) => ({ name, mimeType: "image/jpeg", buffer: Buffer.from(name) });
  await page.locator("[data-scan-input]").setInputFiles(["same.jpg", "similar.jpg", "blurry.jpg", "normal.jpg", "normal-back.jpg"].map(jpg));
  await page.locator('[data-staged-card]').nth(4).locator("[data-staged-pair]").click();
  assert.equal(await page.locator("[data-staged-card]").count(), 4);
  await page.locator("[data-scan-start]").click();

  // Upload → read → the clean cards go straight in; the rest wait in まとめて確認.
  await page.locator('[data-scan-phase="review"]').waitFor({ timeout: 45_000 });
  const contacts = () => page.evaluate(() => (window as any).fakeServer.contacts.length);
  assert.equal(await contacts(), before + 1, "normal card added automatically; the identical one merged");
  const sections = await page.locator("[data-review-card]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-duplicate-card") ? "duplicate" : node.getAttribute("data-failed-card") ? "failed" : "review"));
  assert.deepEqual(sections, ["duplicate", "failed"]);
  await page.locator("[data-scan-auto-added]").getByText("2人はもう人脈に入っています。").waitFor();
  const manifest = await page.evaluate(() => (window as any).fakeServer.items.map((item: any) => [item.sourceFileName, item.side, item.cardId]));
  const back = manifest.find(([name]: string[]) => name === "normal-back.jpg");
  const front = manifest.find(([name]: string[]) => name === "normal.jpg");
  assert.equal(back[1], "back");
  assert.equal(back[2], front[2], "the back is paired with the card before it");

  // まとめて確認: the similar card is someone else; the unreadable card is skipped.
  await page.locator("[data-duplicate-card]").getByRole("button", { name: "別人として追加" }).click();
  await page.locator("[data-scan-add-all]").click();
  await page.locator("[data-failed-skip]").waitFor();
  await page.locator("[data-failed-skip]").click();

  await page.locator('[data-scan-phase="done"]').waitFor({ timeout: 20_000 });
  const settled = (key: string, n: number) => page.waitForFunction(([css, value]) => document.querySelector(css as string)?.textContent?.startsWith(String(value)), [`[data-done-tile="${key}"]`, n] as const);
  await settled("created", 2);
  await settled("merged", 1);
  await settled("unreadable", 1);
  assert.equal(await contacts(), before + 2, "完成「新しく追加」= how many people the network gained");
  assert.equal(await page.locator("[data-orbit-2026-mainhead] h1").textContent(), "3人を人脈に追加しました");
  await page.locator('[data-done-plan="ready"]').waitFor();
});

test("R12 review m9: when the duplicate lookup fails nothing is added automatically — every readable card waits in まとめて確認", { timeout: 90_000 }, async (t) => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], duplicatesFail: true, lang: "ja", path: "/app/contacts/new/scan", unread: false })}</script>` });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors.filter((error) => !/500/.test(error)), []); });
  const before = await page.evaluate(() => (window as any).fakeServer.contacts.length);
  const jpg = (name: string) => ({ name, mimeType: "image/jpeg", buffer: Buffer.from(name) });
  await page.locator("[data-scan-input]").setInputFiles(["same.jpg", "normal.jpg"].map(jpg));
  await page.locator("[data-scan-start]").click();
  await page.locator('[data-scan-phase="review"]').waitFor({ timeout: 45_000 });
  assert.equal(await page.evaluate(() => (window as any).fakeServer.contacts.length), before, "nothing was added behind the person's back");
  const confirms = await page.evaluate(() => (window as any).fakeServer.log.filter((line: string) => /\/confirm$/.test(line)));
  assert.deepEqual(confirms, []);
  assert.equal(await page.locator("[data-scan-auto-added]").count(), 0);
  assert.equal(await page.locator("[data-scan-add-all]").getAttribute("data-scan-add-all"), "2");
});

test("R12 review m12: the batch id is encoded before it goes into the API path", { timeout: 30_000 }, async (t) => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ calls: [], lang: "ja", path: "/app/contacts/new/scan/../evil", unread: false })}</script>` });
  t.after(async () => { await page.close(); });
  await page.waitForFunction(() => (window as any).fakeServer.log.length > 0);
  const log: string[] = await page.evaluate(() => (window as any).fakeServer.log);
  assert.ok(log.some((line) => line === "GET /api/contact-drafts/business-card/batches/v2/..%2Fevil"), JSON.stringify(log));
  assert.ok(!log.some((line) => line.includes("/v2/../")), JSON.stringify(log));
});
