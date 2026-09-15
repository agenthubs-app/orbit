import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

const require = createRequire(import.meta.url);
const iconFont = readFileSync(require.resolve("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf")).toString("base64");
let browser: Browser;
let script: string;

// Actual three screens, shared form, scope hooks, image loader, schemas, VMs,
// AppScreen and theme run. Device APIs/router/providers and HTTP are controlled.
// The valid one-pixel PNG tests image handling, not OCR accuracy or card artwork.
const fixture = `
import React, { useEffect, useSyncExternalStore } from "react";
import { View } from "react-native-web";
import glyphs from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";
import { createTranslator } from "./src/i18n/messages";
let revision = 0; const listeners = new Set();
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
const stamp = "2026-09-12T00:00:00Z";
const s = window.fixture = { screen: "legacy", width: 390, fontScale: 1, language: "zh", batchId: "batch:review", status: "extracted", batchStatus: "ready_for_review", image: "available", requests: [], navigation: [], alerts: [], refreshes: 0, ...window.initialFixture,
  update(patch) { Object.assign(s, patch); revision++; listeners.forEach(fn => fn()); } };
export const useFixture = () => { useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision); return s; };
const extraction = () => ({ fullName: "许妍", nativeFullName: "许妍", romanizedFullName: null, organization: s.long ? "白露设计与国际合作研究工作室" : "白露设计", title: "创始人", departments: [], emails: [{ label: null, value: "xu.yan@example.test" }], contactPoints: [{ type: "mobile", label: null, value: "+81 90 1234 5678" }], website: null, addresses: [], certifications: [], detectedLanguages: ["zh"] });
const issues = () => [{ code: "INVALID_PHONE", field: "phone", message: "电话可能有误，请对照名片核对。" }];
function detail() {
  const terminal = ["completed", "cancelled"].includes(s.batchStatus), status = terminal ? "confirmed" : s.status;
  if (s.screen === "legacy") return {
    batch: { id: s.batchId, actorId: "actor", status: s.batchStatus, totalItems: 1, processedItems: ["pending", "processing"].includes(status) ? 0 : 1, failedItems: status === "failed" ? 1 : 0, confirmedItems: status === "confirmed" ? 1 : 0, skippedItems: status === "skipped" ? 1 : 0, sourceFiles: [], createdAt: stamp, updatedAt: stamp, expiresAt: "2099-09-12T00:00:00Z" },
    items: [{ id: "item:1", batchId: s.batchId, actorId: "actor", seq: 1, sourceFileName: s.long ? "国际产品设计合作交流会现场名片原始扫描图片.png" : "名片.png", sourcePage: null, status, imagePath: terminal ? null : "private/card", imageDigest: "sha256:" + "a".repeat(64), uploadMimeType: "image/png", extraction: status === "extracted" ? extraction() : null, reviewIssues: issues(), usage: null, errorCode: status === "failed" ? "OCR_PROVIDER_FAILED" : null, attempts: 1, leaseOwner: null, leasedAt: null, confirmedContactId: status === "confirmed" ? "contact:1" : null, createdAt: stamp, updatedAt: stamp }] };
  return {
    batch: { id: s.batchId, actorId: "actor", status: s.batchStatus, expectedItems: 1, version: 1, reviewGeneration: 1, idempotencyKey: "key-1", manifestFingerprint: "a".repeat(64), statusReason: null, createdAt: stamp, updatedAt: stamp, finalizedAt: stamp, expiresAt: "2099-09-12T00:00:00Z" },
    items: [{ id: "item:1", batchId: s.batchId, seq: 1, status, version: 1, sourceFileName: s.long ? "国际产品设计合作交流会现场名片原始扫描图片.png" : "名片.png", rawSize: 68, rawMimeType: "image/png", clientDigest: "sha256:" + "a".repeat(64), imageDigest: "sha256:" + "b".repeat(64), derivativeObjectKey: terminal ? null : "private/card", derivativeSize: terminal ? null : 68, extraction: status === "extracted" ? extraction() : null, extractionSchemaVersion: status === "extracted" ? 1 : null, reviewIssues: issues(), usage: null, confirmedContactId: status === "confirmed" ? "contact:1" : null, attemptCount: 1, nextRetryAt: null, leaseExpiresAt: null, errorStage: status === "terminal_failed" ? "ocr" : null, errorCode: status === "terminal_failed" ? "OCR_INVALID_OUTPUT" : null, createdAt: stamp, updatedAt: stamp }] };
}
const draft = () => ({ id: "draft:card", displayName: "许妍", organization: extraction().organization, role: "创始人", email: "xu.yan@example.test", phone: "+81 90 1234 5678", source: { type: "business_card_ocr" }, evidence: [{ evidenceId: "evidence:card", excerpt: "许妍 · 白露设计" }] });
const client = {
  async get(path, options) {
    s.requests.push({ method: "GET", path, responseType: options?.responseType });
    if (path.endsWith("/image")) {
      if (s.image === "loading") await new Promise(resolve => s.releaseImage = resolve);
      if (s.image === "unavailable") return { success: false, status: 404, error: { code: "NOT_FOUND", message: "名片图片暂时无法读取。" } };
      return { success: true, status: 200, data: { bytes: Uint8Array.from(atob(png), c => c.charCodeAt(0)), contentType: "image/png" } };
    }
    if (s.loading) await new Promise(resolve => s.releaseRead = resolve);
    if (s.readFailure) return { success: false, status: 403, error: { code: "FORBIDDEN", message: "无权访问此批次。" } };
    return { success: true, status: 200, data: detail() };
  },
  async post(path, options) {
    s.requests.push({ method: "POST", path, body: options?.body });
    if (s.holdWrite) await new Promise(resolve => s.releaseWrite = resolve);
    if (s.writeFailure) return { success: false, status: 503, error: { code: "UNAVAILABLE", message: "暂时无法保存，请重试。" } };
    if (path.endsWith("/confirm") && s.screen !== "single") return { success: true, status: 200, data: { state: "duplicate_review", duplicateContactId: "duplicate:1" } };
    if (path === "/api/contacts/business-card/confirm") return { success: true, status: 200, data: { state: "created", contact: { id: "contact:1", displayName: options.body.displayName } } };
    return { success: true, status: 200, data: { draft: draft(), capture: { imageDigest: "sha256:" + "a".repeat(64) }, ocr: { reviewIssues: issues() } } };
  },
  async patch(path, options) { s.requests.push({ method: "PATCH", path, body: options.body }); return s.writeFailure ? { success: false, status: 503, error: { code: "UNAVAILABLE", message: "暂时无法保存，请重试。" } } : { success: true, status: 200, data: { reviewDraft: { ...draft(), ...options.body.reviewedFields } } }; }
};
export const useOrbitApiClient = () => client;
export const useOrbitLocale = () => { useFixture(); return { language: s.language, t: createTranslator(s.language) }; };
export const useApiResource = () => ({ kind: "loading", refreshing: false, refresh() { s.refreshes++; } });
export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, accountId: "actor", actorId: "actor", user: { id: "actor" }, cookieHeader: "" });
export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "https://orbit.example" });
export const useLocalSearchParams = () => ({ id: s.batchId });
export const usePathname = () => s.screen === "single" ? "/contacts/new" : s.screen === "legacy" ? "/contacts/new/batch/" + s.batchId : "/contacts/new/batch2/" + s.batchId;
export const useFocusEffect = fn => { useEffect(fn, [fn]); };
export const useRouter = () => ({ canGoBack: () => s.hasHistory !== false, back() { s.navigation.push("back"); }, push(href) { s.navigation.push(href); }, replace(href) { s.navigation.push(href); } });
export const SafeAreaView = ({ edges, style, ...props }) => <View {...props} style={[style, { paddingTop: edges?.includes("top") ? 48 : 0 }]} />;
export const Ionicons = ({ name, size, color }) => <span aria-hidden="true" data-icon={name} style={{ fontFamily: "OrbitTestIonicons", fontSize: size, color, width: size, height: size, flexShrink: 0, lineHeight: 1 }}>{String.fromCodePoint(glyphs[name])}</span>;
export const AppState = { currentState: "active", addEventListener() { return { remove() {} }; } };
export const Alert = { alert(title, message, buttons) { s.alerts.push({ title, message, buttons }); } };
export const useCameraPermissions = () => [{ granted: true }, async () => ({ granted: true })];
export const CameraView = () => null;
export const UIImagePickerPreferredAssetRepresentationMode = { Current: "current" };
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: !s.denied });
export const requestCameraPermissionsAsync = requestMediaLibraryPermissionsAsync;
export const launchImageLibraryAsync = async () => ({ canceled: Boolean(s.cancelPick), assets: [{ uri: "data:image/png;base64," + png + (s.pickVersion ? "#" + s.pickVersion : ""), base64: s.unreadableImage ? null : png, mimeType: "image/png", fileName: "名片.png", fileSize: 68 }] });
export const launchCameraAsync = launchImageLibraryAsync;
export const File = class {};
export const CryptoDigestAlgorithm = { SHA256: "SHA-256" };
export const digest = () => { throw Error("unexpected hashing"); };
export const randomUUID = () => "key-1";
`;

test.before(async () => {
  const result = await build({ stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { useFixture } from "fixture"; import { BusinessCardBatchScreen } from "./src/screens/contacts/BusinessCardBatchScreen"; import { BusinessCardIngestScreen } from "./src/screens/contacts/BusinessCardIngestScreen"; import { ContactAcquisitionScreen } from "./src/screens/contacts/ContactAcquisitionScreen"; function App() { const s = useFixture(); return s.screen === "single" ? <ContactAcquisitionScreen /> : s.screen === "legacy" ? <BusinessCardBatchScreen /> : <BusinessCardIngestScreen />; } createRoot(document.getElementById("root")).render(<App />);`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"], define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" }, plugins: [{ name: "ink-card-boundaries", setup(plugin) {
    plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ink-card" }));
    plugin.onResolve({ filter: /^(fixture|expo-router|expo-camera|expo-image-picker|expo-file-system|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/(ApiBaseUrlProvider|AuthSessionProvider|OrbitLocaleContext|useApiResource|useOrbitApiClient)$/ }, () => ({ path: "fixture", namespace: "ink-card" }));
    plugin.onLoad({ filter: /.*/, namespace: "ink-card" }, args => ({ contents: args.path === "native" ? `
import React from "react"; import { Image as RealImage, Text as RealText, TextInput as RealInput, StyleSheet, useWindowDimensions as realDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web"; export { Alert, AppState } from "fixture";
export const useWindowDimensions = () => { const s = useFixture(); return { ...realDimensions(), width: s.width, fontScale: s.fontScale }; };
function scaled(props) { const style = StyleSheet.flatten(props.style) || {}, scale = useFixture().fontScale; return [props.style, style.fontSize && { fontSize: style.fontSize * scale, ...(style.lineHeight ? { lineHeight: style.lineHeight * scale } : {}) }]; }
export const Text = props => <RealText {...props} style={scaled(props)} />;
export const TextInput = props => <RealInput {...props} style={scaled(props)} />;
export const Image = props => { (window.fixture.imageErrors ??= {})[props.accessibilityLabel] = props.onError; return <RealImage {...props} />; };
` : fixture, loader: "jsx", resolveDir: process.cwd() }));
    plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
  } }] });
  script = result.outputFiles[0]!.text; browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: Number(patch.width ?? 390), height: 844 }, deviceScaleFactor: 2, colorScheme: patch.dark ? "dark" : "light" });
  page.setDefaultTimeout(2000); const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", r => r.abort());
  await page.setContent('<style>@font-face{font-family:OrbitTestIonicons;src:url(data:font/ttf;base64,' + iconFont + ')}html,body,#root{margin:0;height:100%}#root{display:flex;flex-direction:column}</style><div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await page.addScriptTag({ content: script }); await page.getByRole("heading").first().waitFor(); await page.evaluate(() => document.fonts.ready);
  if (patch.screen === "single") {
    await page.getByRole("button", { name: "选图片", exact: true }).click();
    if (!patch.denied && !patch.cancelPick) { await page.getByRole("button", { name: "生成待确认候选", exact: true }).click(); await page.getByRole("button", { name: "写入联系人", exact: true }).waitFor(); }
  } else if (!patch.loading && !patch.readFailure && !["completed", "cancelled"].includes(String(patch.batchStatus))) {
    await page.getByText(/核对电话|电话可能有误/).first().waitFor();
  }
  return page;
}
async function shot(page: Page, name: string) { if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-ink-signal-card-review-${name}.png`, fullPage: true }); }
async function writes(page: Page) { return page.evaluate(() => (window as any).fixture.requests.filter((r: any) => r.method !== "GET")); }
async function top(page: Page) { await page.evaluate(() => document.querySelectorAll("div").forEach(el => { if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = 0; })); }

test("single scan presents its own image and labelled open review before other acquisition work", async t => {
  const page = await open(t, { screen: "single" }); await top(page);
  await page.getByRole("heading", { name: "名片导入", exact: true }).waitFor();
  await page.getByRole("heading", { name: "识别结果", exact: true }).waitFor();
  const name = page.getByLabel("姓名", { exact: true });
  assert.equal(await name.inputValue(), "许妍");
  assert.equal(await name.evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
  const image = page.locator('[role="img"][aria-label="待复核的名片图片"]'); await image.waitFor();
  assert.equal((await image.locator("..").boundingBox())!.height, 104);
  assert.ok((await image.boundingBox())!.y < (await name.boundingBox())!.y);
  assert.ok((await name.boundingBox())!.y < (await page.getByRole("button", { name: "生成待确认候选", exact: true }).boundingBox())!.y);
  const primary = page.getByRole("button", { name: "写入联系人", exact: true });
  assert.equal(await primary.isDisabled(), true); assert.ok((await primary.boundingBox())!.height >= 50);
  assert.equal(await page.getByText(/4 \/ 5|字段确认|星野工作室/).count(), 0);
  assert.equal((await writes(page)).length, 1, "recognition alone never writes a contact");
  await shot(page, "single-normal");
});

test("single open fields retain risk consent, failed-save drafts and exact reviewed contact payload", async t => {
  const page = await open(t, { screen: "single" });
  const risk = page.getByRole("checkbox", { name: "电话可能有误，请对照名片核对。", exact: true });
  const finalReview = page.getByRole("checkbox", { name: "我已核对所有字段，并决定将其收录进人脉。", exact: true });
  const write = page.getByRole("button", { name: "写入联系人", exact: true });
  await risk.click(); await finalReview.click(); assert.equal(await write.isEnabled(), true);
  await page.getByLabel("邮箱", { exact: true }).fill("correct@example.invalid");
  assert.equal(await write.isDisabled(), true); assert.equal(await finalReview.isChecked(), false);
  await page.evaluate(() => { (window as any).fixture.writeFailure = true; });
  await page.getByRole("button", { name: "保存复核字段", exact: true }).click();
  await page.getByText("暂时无法保存，请重试。", { exact: true }).waitFor();
  const feedback = page.getByRole("alert").filter({ hasText: "暂时无法保存，请重试。" });
  await feedback.waitFor();
  assert.ok((await feedback.boundingBox())!.y < (await page.getByRole("button", { name: "生成待确认候选", exact: true }).boundingBox())!.y, "review failures stay with the review instead of moving below the capture form");
  assert.equal(await page.getByLabel("邮箱", { exact: true }).inputValue(), "correct@example.invalid");
  await shot(page, "single-save-failure");
  await page.evaluate(() => { (window as any).fixture.writeFailure = false; });
  await finalReview.click(); await write.click();
  await page.getByText("联系人已收录", { exact: true }).waitFor();
  const requests = await writes(page), written = requests.at(-1);
  assert.equal(written.path, "/api/contacts/business-card/confirm");
  assert.equal(written.body.confirmed, true); assert.equal(written.body.displayName, "许妍"); assert.equal(written.body.email, "correct@example.invalid");
});

test("single-card acquisition chrome follows language without rewriting the recognized candidate", async t => {
  const page = await open(t, { screen: "single" });
  await page.evaluate(() => (window as any).fixture.update({ language: "ja" }));
  await page.getByRole("heading", { name: "名刺インポート", exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "確認候補を生成", exact: true }).count(), 1);
  assert.equal(await page.getByLabel("氏名", { exact: true }).inputValue(), "许妍");

  await page.evaluate(() => (window as any).fixture.update({ language: "en" }));
  await page.getByRole("heading", { name: "Business card import", exact: true }).first().waitFor();
  assert.equal(await page.getByRole("button", { name: "Generate review candidate", exact: true }).count(), 1);
  assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "许妍");
  assert.equal((await writes(page)).filter((request: any) => request.path === "/api/contacts/business-card/confirm").length, 0);
});

test("single review image belongs to the submitted scan and stale image failures cannot hide a rescan", async t => {
  const page = await open(t, { screen: "single" });
  const image = page.locator('[role="img"][aria-label="待复核的名片图片"]');
  const original = await image.locator("img").getAttribute("src");
  await page.evaluate(() => { const s = (window as any).fixture; s.pickVersion = "second"; s.oldImageError = s.imageErrors["待复核的名片图片"]; });
  await page.getByRole("button", { name: "选图片", exact: true }).click();
  assert.equal(await image.locator("img").getAttribute("src"), original, "picking a new image does not relabel the preceding OCR result");
  await page.evaluate(() => (window as any).fixture.oldImageError());
  await page.getByText("名片图片无法显示，请重新选择图片。", { exact: true }).waitFor();
  assert.equal(await page.getByText("名片图片无法显示，请重新选择图片。", { exact: true }).getAttribute("aria-live"), "polite");
  assert.equal(await image.count(), 0); await top(page); await shot(page, "single-image-unavailable");
  await page.getByRole("button", { name: "生成待确认候选", exact: true }).click();
  await image.waitFor(); assert.equal(await image.locator("img").getAttribute("src"), original + "#second");
  await page.evaluate(() => (window as any).fixture.oldImageError());
  assert.equal(await image.count(), 1);
  assert.equal(await page.getByRole("button", { name: "写入联系人", exact: true }).isDisabled(), true);
});

for (const failure of ["permission", "read", "submit"]) test(`second card ${failure} failure stays with source controls, not the preceding review`, async t => {
  const page = await open(t, { screen: "single" });
  const image = page.locator('[role="img"][aria-label="待复核的名片图片"]');
  const original = await image.locator("img").getAttribute("src");
  await page.evaluate(failure => {
    const s = (window as any).fixture;
    s.pickVersion = "second"; s.denied = failure === "permission";
    s.unreadableImage = failure === "read"; s.writeFailure = failure === "submit";
  }, failure);
  const picker = page.getByRole("button", { name: "选图片", exact: true });
  const submit = page.getByRole("button", { name: "生成待确认候选", exact: true });
  await picker.click();
  if (failure === "submit") await submit.click();
  const feedback = page.getByRole("alert"); await feedback.waitFor();
  assert.equal(await feedback.count(), 1);
  assert.ok((await feedback.boundingBox())!.y > (await picker.boundingBox())!.y, "new source failure must not be attached to the preceding review");
  assert.ok((await feedback.boundingBox())!.y < (await submit.boundingBox())!.y);
  assert.equal(await image.locator("img").getAttribute("src"), original);
  assert.equal(await page.getByLabel("姓名", { exact: true }).inputValue(), "许妍");
  assert.equal((await writes(page)).filter((r: any) => r.path === "/api/contacts/business-card/confirm").length, 0);
  await feedback.scrollIntoViewIfNeeded(); await shot(page, "single-second-" + failure + "-failure");
});

test("single capture keeps the whole chosen image visible and permission/cancellation never submits", async t => {
  const page = await open(t, { screen: "single" });
  const chosen = page.locator('[aria-label="已选择的名片图片"]');
  assert.equal(await chosen.evaluate(el => getComputedStyle(el.firstElementChild!).backgroundSize), "contain");
  for (const patch of [{ denied: true }, { cancelPick: true }]) {
    const pending = await open(t, { screen: "single", ...patch });
    if (patch.denied) await pending.getByRole("alert").filter({ hasText: "需要允许访问照片，才能选择名片图片。" }).waitFor();
    assert.deepEqual(await writes(pending), []);
    assert.equal(await pending.getByRole("button", { name: "写入联系人", exact: true }).count(), 0);
    assert.equal(await pending.getByLabel("已选择的名片图片").count(), 0);
  }
});

for (const screen of ["legacy", "ingest"]) for (const state of ["loading", "forbidden", "completed", "failed"]) test(`${screen} keeps ${state} separate from a successful editable scan`, async t => {
  const patch = state === "loading" ? { loading: true } : state === "forbidden" ? { readFailure: true } : state === "completed" ? { batchStatus: "completed" } : { status: screen === "legacy" ? "failed" : "terminal_failed" };
  const page = await open(t, { screen, ...patch });
  if (state === "loading") await page.getByText("正在读取批次...", { exact: true }).waitFor();
  if (state === "forbidden") await page.getByRole("alert").waitFor();
  if (state === "completed") await page.getByRole("button", { name: screen === "legacy" ? "查看联系人 1" : "打开联系人 1", exact: true }).waitFor();
  if (state !== "failed") assert.equal(await page.getByLabel("姓名", { exact: true }).count(), 0);
  else if (screen === "legacy") { assert.equal(await page.getByLabel("姓名", { exact: true }).count(), 0); assert.equal(await page.getByRole("button", { name: "重试识别", exact: true }).isEnabled(), true); }
  else { assert.equal(await page.getByLabel("姓名", { exact: true }).inputValue(), ""); assert.equal(await page.getByRole("button", { name: "确认收录", exact: true }).isDisabled(), true); }
  assert.deepEqual(await writes(page), []); await shot(page, screen + "-" + state);
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, fontScale: 1, dark: true }]) test(`single review and remaining acquisition controls are reachable at ${variant.name}`, async t => {
  const page = await open(t, { ...variant, screen: "single", long: true }); await top(page);
  await shot(page, "single-" + variant.name + "-top");
  const overflow = await page.locator('[dir="auto"]').evaluateAll(elements => elements.filter(el => { const box = el.getBoundingClientRect(); return box.width && (box.x < -0.5 || box.right > innerWidth + 0.5 || !el.matches("input,textarea") && el.scrollWidth > el.clientWidth + 1); }).map(el => el.textContent));
  assert.deepEqual(overflow, []);
  if (variant.fontScale > 1.3) await page.waitForFunction(() => { const el = document.querySelector('[aria-label="公司"]'); return el?.tagName === "TEXTAREA" && el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1; });
  await page.getByLabel("电话", { exact: true }).scrollIntoViewIfNeeded(); await shot(page, "single-" + variant.name + "-fields");
  await page.getByRole("button", { name: "写入联系人", exact: true }).scrollIntoViewIfNeeded(); await shot(page, "single-" + variant.name + "-review-actions");
  for (const control of await page.getByRole("button").or(page.getByRole("checkbox")).or(page.getByRole("tab")).all()) { await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox(); assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= variant.width && box.y >= 0 && box.y + box.height <= 845, await control.textContent() ?? "unnamed control"); }
  await shot(page, "single-" + variant.name + "-bottom");
  await page.getByRole("tab", { name: "手动", exact: true }).click();
  await page.getByRole("heading", { name: "添加人脉", exact: true }).waitFor();
  await page.getByPlaceholder("例如：王小雨", { exact: true }).waitFor();
});

for (const screen of ["legacy", "ingest"]) test(`${screen} review puts the actual image and open fields before batch management`, async t => {
  const page = await open(t, { screen });
  await page.getByRole("heading", { name: "名片导入", exact: true }).waitFor();
  const image = page.locator('[role="img"][aria-label="名片图片"]'); await image.waitFor();
  const preview = image.locator("..");
  assert.equal((await preview.boundingBox())!.height, 104);
  assert.equal(await preview.evaluate(el => getComputedStyle(el).borderRadius), "12px");
  assert.equal(await image.evaluate(el => getComputedStyle(el.firstElementChild!).backgroundSize), "contain");
  const name = page.getByLabel("姓名", { exact: true }); assert.equal(await name.inputValue(), "许妍");
  assert.equal(await name.evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
  assert.equal(await name.evaluate(el => getComputedStyle(el).fontSize), "14px");
  assert.equal(await name.locator("../..").evaluate(el => getComputedStyle(el).borderBottomWidth), "1px");
  const label = page.getByText("姓名", { exact: true });
  assert.equal((await name.boundingBox())!.x - (await label.boundingBox())!.x, 72);
  const action = page.getByRole("button", { name: "确认收录", exact: true });
  assert.equal(await action.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(11, 18, 32)");
  assert.ok((await action.boundingBox())!.height >= 50);
  const batchAction = page.getByRole("button", { name: screen === "legacy" ? "选择名片 1" : "复核名片 1", exact: true });
  assert.ok((await batchAction.boundingBox())!.y > (await name.boundingBox())!.y, "secondary batch controls follow the selected review");
  assert.equal(await page.getByText(/4 \/ 5|字段确认|星野工作室/).count(), 0);
  assert.deepEqual(await writes(page), []); await shot(page, screen + "-normal");
});

test("batch deep-link headers keep balanced large text and a real parent destination", async t => {
  for (const screen of ["legacy", "ingest"]) {
    const page = await open(t, { screen, width: 320, fontScale: 2, hasHistory: false });
    const heading = page.getByRole("heading", { name: /^名片\s*导入$/ });
    const lines = await heading.evaluate(el => {
      const counts: Record<string, number> = {}, walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) for (let i = 0; i < (node.textContent ?? "").length; i++) {
        if (/\s/.test(node.textContent![i]!)) continue;
        const range = document.createRange(); range.setStart(node, i); range.setEnd(node, i + 1);
        const line = Math.round(range.getBoundingClientRect().top); counts[line] = (counts[line] ?? 0) + 1;
      }
      return Object.values(counts);
    });
    assert.ok(lines.every(count => count >= 2), JSON.stringify(lines));
    await page.getByRole("button", { name: "返回导入中心", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/new"]);
    await shot(page, screen + "-deep-link-large");
  }
});

for (const screen of ["legacy", "ingest"]) test(`${screen} open review still edits the real payload and gates duplicate creation`, async t => {
  const page = await open(t, { screen });
  await page.getByLabel("姓名", { exact: true }).fill("核对后姓名");
  await page.getByLabel("邮箱", { exact: true }).fill("correct@example.invalid");
  await page.getByLabel("备注", { exact: true }).fill("保留原始来源");
  await page.getByRole("button", { name: "确认收录", exact: true }).click();
  await page.getByRole("button", { name: "查看重复联系人", exact: true }).waitFor();
  const requests = await writes(page);
  assert.equal(requests.length, 1); assert.equal(requests[0].path, `/api/contact-drafts/business-card/batches/${screen === "ingest" ? "v2/" : ""}batch%3Areview/items/item%3A1/confirm`);
  const expectedFields = { displayName: "核对后姓名", organization: "白露设计", role: "创始人", email: "correct@example.invalid", phone: "+81 90 1234 5678", relationshipContext: "", notes: "保留原始来源", allowDuplicate: false };
  if (screen === "legacy") assert.deepEqual(requests[0].body, expectedFields);
  else assert.deepEqual(requests[0].body, {
    ...expectedFields,
    confirmationIntentId: "key-1",
    expectedCardItems: [{ itemId: "item:1", version: 1, imageDigest: "sha256:" + "b".repeat(64) }],
    fieldSources: { displayName: null, organization: "item:1", role: "item:1", email: null, phone: "item:1" },
  });
  assert.equal(await page.getByRole("button", { name: "确认收录", exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "合并到已有人脉", exact: true }).count(), 0);
  await page.getByRole("button", { name: "仍然收录", exact: true }).click();
  assert.equal((await writes(page)).length, 1, "override retains native second confirmation");
  await page.getByRole("button", { name: "查看重复联系人", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/duplicate%3A1"]);
  await shot(page, screen + "-duplicate");
});

test("switching ingest-review language preserves dirty OCR fields, stable ids, and the confirm payload", async t => {
  const page = await open(t, { screen: "ingest" });
  await page.getByLabel("姓名", { exact: true }).fill("さくら / Sakura");
  await page.getByLabel("邮箱", { exact: true }).fill("sakura@example.invalid");
  await page.getByLabel("备注", { exact: true }).fill("OCR: 原文 / source text");

  await page.evaluate(() => (window as any).fixture.update({ language: "ja" }));
  await page.getByLabel("氏名", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("氏名", { exact: true }).inputValue(), "さくら / Sakura");
  assert.equal(await page.getByLabel("メール", { exact: true }).inputValue(), "sakura@example.invalid");
  assert.equal(await page.getByLabel("メモ", { exact: true }).inputValue(), "OCR: 原文 / source text");

  await page.evaluate(() => (window as any).fixture.update({ language: "en" }));
  await page.getByLabel("Name", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Name", { exact: true }).inputValue(), "さくら / Sakura");
  assert.equal(await page.getByLabel("Email", { exact: true }).inputValue(), "sakura@example.invalid");
  assert.equal(await page.getByLabel("Notes", { exact: true }).inputValue(), "OCR: 原文 / source text");
  await page.getByRole("button", { name: "Confirm contact", exact: true }).click();

  const requests = await writes(page);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, "/api/contact-drafts/business-card/batches/v2/batch%3Areview/items/item%3A1/confirm");
  assert.equal(requests[0].body.displayName, "さくら / Sakura");
  assert.equal(requests[0].body.email, "sakura@example.invalid");
  assert.equal(requests[0].body.notes, "OCR: 原文 / source text");
  assert.deepEqual(requests[0].body.expectedCardItems, [{ itemId: "item:1", version: 1, imageDigest: "sha256:" + "b".repeat(64) }]);
});

for (const screen of ["legacy", "ingest"]) test(`${screen} batch progress chrome follows the active language`, async t => {
  const page = await open(t, { screen });
  await page.evaluate(() => (window as any).fixture.update({ language: "ja" }));
  await page.getByRole("heading", { name: "名刺インポート", exact: true }).waitFor();
  assert.ok(await page.getByRole("button", { name: "バッチを再読み込み", exact: true }).count());

  await page.evaluate(() => (window as any).fixture.update({ language: "en" }));
  await page.getByRole("heading", { name: "Business card import", exact: true }).waitFor();
  assert.ok(await page.getByRole("button", { name: "Refresh batch", exact: true }).count());
});

for (const screen of ["legacy", "ingest"]) test(`${screen} unavailable and loading images remain explicit without hiding review fields`, async t => {
  const page = await open(t, { screen, image: "loading" });
  await page.getByText("正在读取图片...", { exact: true }).waitFor();
  assert.equal(await page.getByRole("img").count(), 0); await shot(page, screen + "-image-loading");
  await page.evaluate(() => { const s = (window as any).fixture; s.image = "unavailable"; s.releaseImage(); });
  await page.getByText(screen === "legacy" ? "名片图片暂时无法读取。" : "图片暂时无法显示。", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("姓名", { exact: true }).inputValue(), "许妍");
  await shot(page, screen + "-image-unavailable");
  await page.evaluate(() => { (window as any).fixture.image = "available"; });
  await page.getByRole("button", { name: screen === "legacy" ? "重载图片" : "重新读取图片", exact: true }).click();
  await page.locator('[role="img"][aria-label="名片图片"]').waitFor();
  assert.deepEqual(await writes(page), []);
});

for (const variant of [{ name: "narrow-large", width: 320, fontScale: 1.6 }, { name: "narrow-double", width: 320, fontScale: 2 }, { name: "wide-dark", width: 820, fontScale: 1, dark: true }]) test(`both batch reviews reflow fields and preserve reachable controls at ${variant.name}`, async t => {
  for (const screen of ["legacy", "ingest"]) {
    const page = await open(t, { ...variant, screen, long: true });
    await page.locator('[role="img"][aria-label="名片图片"]').waitFor();
    await top(page); await shot(page, screen + "-" + variant.name + "-top");
    const overflow = await page.locator('[dir="auto"]').evaluateAll(elements => elements.filter(el => { const box = el.getBoundingClientRect(); return box.width && (box.x < -0.5 || box.right > innerWidth + 0.5 || !el.matches("input,textarea") && el.scrollWidth > el.clientWidth + 1); }).map(el => el.textContent));
    assert.deepEqual(overflow, []);
    if (variant.fontScale > 1.3) {
      const company = page.getByLabel("公司", { exact: true });
      assert.equal(await company.evaluate(el => el.tagName), "TEXTAREA", "large company values wrap instead of disappearing in a single-line input");
      await page.waitForFunction(() => { const el = document.querySelector('[aria-label="公司"]'); return el && el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1; });
      const size = await company.evaluate(el => ({ contentHeight: el.scrollHeight, height: el.clientHeight, contentWidth: el.scrollWidth, width: el.clientWidth, cssHeight: getComputedStyle(el).height, value: (el as HTMLTextAreaElement).value }));
      assert.ok(size.contentHeight <= size.height + 1 && size.contentWidth <= size.width + 1, JSON.stringify(size));
    }
    await page.getByLabel("电话", { exact: true }).scrollIntoViewIfNeeded(); await shot(page, screen + "-" + variant.name + "-fields");
    await page.getByRole("button", { name: "确认收录", exact: true }).scrollIntoViewIfNeeded(); await shot(page, screen + "-" + variant.name + "-review-actions");
    for (const field of await page.getByRole("textbox").all()) { await field.scrollIntoViewIfNeeded(); const box = await field.boundingBox(); assert.ok(box && box.height >= 44 && box.x >= 16 && box.x + box.width <= variant.width - 16 + 0.5); }
    for (const control of await page.getByRole("button").all()) { await control.scrollIntoViewIfNeeded(); const box = await control.boundingBox(); assert.ok(box && box.height >= 44 && box.x >= 0 && box.x + box.width <= variant.width && box.y >= 0 && box.y + box.height <= 845); }
    await shot(page, screen + "-" + variant.name + "-bottom");
  }
});
