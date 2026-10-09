import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

// Sprint 0140 (SC-0140-04): the manual page, view-models, theme and request
// builders are real; only the API client, router and translator language are
// controlled. Response shapes mirror the live manual draft and confirm routes
// probed on the local stack (draft → confirmedDraft with contactId).
const fixture = `
import React, { useSyncExternalStore } from "react";
import { createTranslator } from "./src/i18n/messages";
let revision = 0; const listeners = new Set();
const state = window.fixture = { requests: [], navigation: [], language: "zh", confirmFailures: 0, hold: false, update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
const client = {
  async post(path, options) {
    state.requests.push({ path, body: options?.body });
    if (state.hold) await new Promise(resolve => state.release = resolve);
    // The live service rejects a draft without a relationship note (MANUAL_CONTACT_NOTE_REQUIRED, probed 2026-10-04).
    if (path === "/api/contact-drafts/manual" && state.requireNote && !options.body.note) return { success: false, status: 400, error: { code: "VALIDATION_ERROR", message: "A manual note is required before staging a contact draft.", context: { manualContactCreationErrorCode: "MANUAL_CONTACT_NOTE_REQUIRED" } } };
    if (path === "/api/contact-drafts/manual") return { success: true, data: { state: "pending_confirmation", draft: { id: "manual-draft:live:" + state.requests.length, status: "pending_confirmation", displayName: options.body.displayName, source: { type: "manual" } } } };
    if (path.endsWith("/confirm")) {
      if (state.confirmFailures > 0) { state.confirmFailures--; return { success: false, status: 503, error: { code: "UNAVAILABLE", message: "temporarily unavailable" } }; }
      const id = decodeURIComponent(path.split("/")[3]);
      return { success: true, data: { state: "confirmed", confirmedDraft: { id, status: "confirmed", displayName: "林悦", contactId: "contact:manual:1", contactWriteExecuted: true, source: { type: "manual" } }, contactCandidate: { contactId: "contact:manual:1" } } };
    }
    return { success: false, status: 404, error: { code: "NOT_FOUND", message: "unexpected" } };
  }
};
export const useOrbitApiClient = () => client;
export const useOrbitLocale = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return { language: state.language, t: createTranslator(state.language) }; };
export const useRouter = () => ({ canGoBack: () => true, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } });
export const Ionicons = () => <span aria-hidden="true">◇</span>;
export const SafeAreaView = ({ children, edges, ...props }) => <div {...props}>{children}</div>;
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { ManualContactAddScreen } from "./src/screens/contacts/ManualContactAddScreen"; createRoot(document.getElementById("root")).render(<ManualContactAddScreen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "manual-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context)$|\/(useOrbitApiClient|OrbitLocaleContext)$/ }, () => ({ path: "fixture", namespace: "manual-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "manual-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  url = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function openPage(t: { after: (fn: () => Promise<void>) => void }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(3000);
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url);
  await page.getByRole("textbox", { name: "姓名", exact: true }).waitFor();
  return page;
}

const requests = (page: Page) => page.evaluate(() => (window as any).fixture.requests);
const box = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

async function fillAll(page: Page) {
  await box(page, "姓名").fill("林悦");
  await box(page, "公司").fill("红桥科技");
  await box(page, "职位").fill("市场负责人");
  await page.getByRole("button", { name: "补充关系信息", exact: true }).click();
  await box(page, "关系备注").fill("东京 AI 活动认识，想找零售渠道");
  await box(page, "下一步").fill("下周约 30 分钟交流");
  await box(page, "标签").fill("AI, 东京");
}

test("a blank name cannot move to review and nothing is sent", async t => {
  const page = await openPage(t);
  await box(page, "公司").fill("红桥科技");
  await page.getByRole("button", { name: "下一步：核对信息", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "请先填写姓名。" }).waitFor();
  await box(page, "姓名").fill("   ");
  await page.getByRole("button", { name: "下一步：核对信息", exact: true }).click();
  assert.equal(await page.getByRole("heading", { name: "核对信息", exact: true }).count(), 0);
  assert.equal(await box(page, "公司").inputValue(), "红桥科技");
  assert.deepEqual(await requests(page), []);
});

test("folding relationship details keeps them; review shows every value; one explicit save creates exactly one contact", async t => {
  const page = await openPage(t);
  await fillAll(page);
  const disclosure = page.getByRole("button", { name: "补充关系信息", exact: true });
  await disclosure.click();
  assert.equal(await disclosure.getAttribute("aria-expanded"), "false");
  assert.equal(await box(page, "关系备注").count(), 0);
  await page.getByText("已填 3 项", { exact: true }).waitFor();
  await disclosure.click();
  assert.equal(await box(page, "关系备注").inputValue(), "东京 AI 活动认识，想找零售渠道");
  assert.equal(await box(page, "标签").inputValue(), "AI, 东京");
  await disclosure.click();
  await page.getByRole("button", { name: "下一步：核对信息", exact: true }).click();
  await page.getByRole("heading", { name: "核对信息", exact: true }).waitFor();
  for (const value of ["林悦", "红桥科技", "市场负责人", "东京 AI 活动认识，想找零售渠道", "下周约 30 分钟交流", "AI, 东京"]) assert.equal(await page.getByText(value, { exact: true }).count(), 1, value);
  assert.deepEqual(await requests(page), [], "review alone sends nothing");
  await page.getByRole("button", { name: "返回修改", exact: true }).click();
  assert.equal(await box(page, "职位").inputValue(), "市场负责人");
  await page.getByRole("button", { name: "下一步：核对信息", exact: true }).click();
  await page.evaluate(() => { (window as any).fixture.hold = true; });
  await page.getByRole("button", { name: "保存到人脉", exact: true }).click();
  await page.getByRole("button", { name: "正在保存…", exact: true }).click({ force: true });
  await page.evaluate(() => { const s = (window as any).fixture; s.hold = false; s.release(); });
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  await page.evaluate(() => (window as any).fixture.release?.());
  await page.getByRole("heading", { name: "已保存到人脉", exact: true }).waitFor();
  const sent = await requests(page);
  assert.equal(sent.length, 2, "one draft and one confirm; the double tap sent nothing more");
  assert.deepEqual(sent[0], { path: "/api/contact-drafts/manual", body: { displayName: "林悦", followUpHint: "下周约 30 分钟交流", note: "东京 AI 活动认识，想找零售渠道", organization: "红桥科技", role: "市场负责人", tags: ["AI", "东京"] } });
  assert.equal(sent[1].path, "/api/contact-drafts/manual-draft%3Alive%3A1/confirm");
  await page.getByRole("button", { name: "打开联系人", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation.at(-1)), { pathname: "/contacts/[id]", params: { id: "contact:manual:1" } });
});

test("a failed save is visible, creates no contact, and retrying confirms the same draft instead of making another", async t => {
  const page = await openPage(t);
  await box(page, "姓名").fill("林悦");
  await page.evaluate(() => { (window as any).fixture.confirmFailures = 1; });
  await page.getByRole("button", { name: "下一步：核对信息", exact: true }).click();
  await page.getByRole("button", { name: "保存到人脉", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "暂时没能保存，联系人没有创建。请重试。" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "已保存到人脉", exact: true }).count(), 0);
  await page.getByRole("button", { name: "保存到人脉", exact: true }).click();
  await page.getByRole("heading", { name: "已保存到人脉", exact: true }).waitFor();
  const paths = (await requests(page)).map((request: any) => request.path);
  assert.deepEqual(paths, ["/api/contact-drafts/manual", "/api/contact-drafts/manual-draft%3Alive%3A1/confirm", "/api/contact-drafts/manual-draft%3Alive%3A1/confirm"]);
});

test("manual add follows Japanese and English without losing typed values", async t => {
  const page = await openPage(t);
  await box(page, "姓名").fill("Hana Sato");
  await page.evaluate(() => (window as any).fixture.update({ language: "ja" }));
  await page.getByRole("button", { name: "次へ：内容を確認", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "名前", exact: true }).inputValue(), "Hana Sato");
  assert.equal(await page.getByRole("button", { name: "関係の情報を追加", exact: true }).count(), 1);
  await page.evaluate(() => (window as any).fixture.update({ language: "en" }));
  await page.getByRole("button", { name: "Next: check details", exact: true }).click();
  await page.getByRole("heading", { name: "Check details", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Save to network", exact: true }).count(), 1);
  assert.equal(await page.getByText("Not filled in", { exact: true }).count(), 5);
  assert.deepEqual(await requests(page), []);
});

test("when the server still requires a relationship note, the user is sent back to add one and nothing is created", async t => {
  const page = await openPage(t);
  await page.evaluate(() => { (window as any).fixture.requireNote = true; });
  await box(page, "姓名").fill("林悦");
  await page.getByRole("button", { name: "下一步：核对信息", exact: true }).click();
  await page.getByRole("button", { name: "保存到人脉", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "保存前还需要一句关系备注，比如在哪里认识。写好后再保存。" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "补充关系信息", exact: true }).getAttribute("aria-expanded"), "true");
  assert.equal(await box(page, "姓名").inputValue(), "林悦");
  assert.deepEqual((await requests(page)).map((request: any) => request.path), ["/api/contact-drafts/manual"]);
  await box(page, "关系备注").fill("东京活动认识");
  await page.getByRole("button", { name: "下一步：核对信息", exact: true }).click();
  await page.getByRole("button", { name: "保存到人脉", exact: true }).click();
  await page.getByRole("heading", { name: "已保存到人脉", exact: true }).waitFor();
  assert.deepEqual((await requests(page)).map((request: any) => request.path), ["/api/contact-drafts/manual", "/api/contact-drafts/manual", "/api/contact-drafts/manual-draft%3Alive%3A2/confirm"]);
});
