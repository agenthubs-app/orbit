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

// Sprint 0140: the single-card review lives on 「扫描名片」 → 「核对名片信息」.
// The scan page, image preparation/compression (real browser canvas), forms and
// decoders are real. Only device pickers, navigation and the API client are
// replaced; no cloud or business writes.
const fixture = `
import React from "react";
const draft = { id: "card:risk", displayName: "Hana Sato", organization: "Aki Robotics", role: "Director", email: "wrong@example.invalid", phone: "", source: { type: "business_card_ocr" }, evidence: [{ evidenceId: "evidence:card:risk", excerpt: "Hana Sato" }] };
const state = window.fixture = { requests: [], navigation: [], issues: [{ code: "INVALID_EMAIL", field: "emails", message: "Review the email." }], draft, picks: [] };
const client = {
  async post(path, options) {
    state.requests.push({ method: "POST", path, ...options });
    if (path === "/api/contacts/business-card/confirm") return { success: true, data: { state: "created", contactId: "contact:saved", duplicateContactId: null, contactWriteExecuted: true, evidenceIds: [], confirmedAt: "2026-10-04T00:00:00Z" } };
    return { success: true, data: { draft: state.draft, capture: { imageDigest: "sha256:card:risk" }, ocr: { reviewIssues: state.issues } } };
  }
};
export const useOrbitApiClient = () => client;
export const useRouter = () => ({ canGoBack: () => true, back() { state.navigation.push("back"); }, push(href) { state.navigation.push(href); }, replace(href) { state.navigation.push(href); } });
export const requestCameraPermissionsAsync = async () => ({ granted: true });
export const launchImageLibraryAsync = async () => {
  const next = state.picks.shift();
  const file = next ? await next() : new globalThis.File([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII="), c => c.charCodeAt(0))], "card.png", { type: "image/png" });
  return { canceled: false, assets: [{ uri: URL.createObjectURL(file), file, mimeType: file.type, fileName: file.name, fileSize: file.size }] };
};
export const UIImagePickerPreferredAssetRepresentationMode = { Current: "current" };
export const launchCameraAsync = launchImageLibraryAsync;
export const Ionicons = () => <span aria-hidden="true">◇</span>;
export const SafeAreaView = ({ children, edges, ...props }) => <div {...props}>{children}</div>;
export const CryptoDigestAlgorithm = { SHA256: "SHA-256" };
export const digest = (_algorithm, bytes) => crypto.subtle.digest("SHA-256", bytes);
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { BusinessCardScanScreen } from "./src/screens/contacts/BusinessCardScanScreen"; createRoot(document.getElementById("root")).render(<BusinessCardScanScreen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"zh"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "card-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|expo-image-picker|expo-crypto|@expo\/vector-icons|react-native-safe-area-context)$|\/useOrbitApiClient$/ }, () => ({ path: "fixture", namespace: "card-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "card-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
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
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url);
  return page;
}

async function openScan(t: { after: (fn: () => Promise<void>) => void }): Promise<Page> {
  const page = await openPage(t);
  await page.getByRole("button", { name: "从相册选择", exact: true }).click();
  await page.getByRole("button", { name: "保存到人脉", exact: true }).waitFor();
  return page;
}

const posts = (page: Page) => page.evaluate(() => (window as any).fixture.requests.map((request: any) => request.path));

test("a scanned card cannot be saved before its risks are confirmed", async (t) => {
  const page = await openScan(t);
  await page.getByRole("heading", { name: "核对名片信息", exact: true }).waitFor();
  const save = page.getByRole("button", { name: "保存到人脉", exact: true });
  await save.click();
  await page.getByText("请先勾选上面需要确认的地方。", { exact: true }).waitFor();
  assert.deepEqual(await posts(page), ["/api/contact-drafts/business-card/scan"]);
  await page.getByRole("checkbox", { name: "邮箱可能有误，请对照名片核对。", exact: true }).click();
  await save.click();
  await page.getByRole("heading", { name: "已保存到人脉", exact: true }).waitFor();
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].path, "/api/contacts/business-card/confirm");
  assert.equal(requests[1].body.confirmed, true);
  assert.equal(requests[1].body.displayName, "Hana Sato");
});

test("a card without OCR risks is still saved only by the explicit save", async (t) => {
  const page = await openPage(t);
  await page.evaluate(() => { (window as any).fixture.issues = []; });
  await page.getByRole("button", { name: "从相册选择", exact: true }).click();
  await page.getByRole("button", { name: "保存到人脉", exact: true }).waitFor();
  assert.equal(await page.getByRole("checkbox").count(), 0);
  assert.deepEqual(await posts(page), ["/api/contact-drafts/business-card/scan"]);
  await page.getByRole("button", { name: "保存到人脉", exact: true }).click();
  await page.getByRole("heading", { name: "已保存到人脉", exact: true }).waitFor();
  assert.deepEqual(await posts(page), ["/api/contact-drafts/business-card/scan", "/api/contacts/business-card/confirm"]);
});

test("retaking clears acknowledgements and shows the newly recognized fields", async (t) => {
  const page = await openScan(t);
  await page.getByRole("checkbox", { name: "邮箱可能有误，请对照名片核对。", exact: true }).click();
  await page.getByLabel("姓名", { exact: true }).fill("Old unsaved edit");
  await page.evaluate(() => { (window as any).fixture.draft = { ...(window as any).fixture.draft, displayName: "New recognition" }; });
  await page.getByRole("button", { name: "重新拍摄或选择", exact: true }).click();
  await page.getByRole("button", { name: "从相册选择", exact: true }).click();
  await page.getByRole("button", { name: "保存到人脉", exact: true }).waitFor();
  assert.equal(await page.getByLabel("姓名", { exact: true }).inputValue(), "New recognition");
  assert.equal(await page.getByRole("checkbox", { name: "邮箱可能有误，请对照名片核对。", exact: true }).isChecked(), false);
  assert.deepEqual(await posts(page), ["/api/contact-drafts/business-card/scan", "/api/contact-drafts/business-card/scan"]);
});

test("an oversized photo is compressed in the browser and the scan carries the copy's bytes, size and type", { timeout: 60_000 }, async (t) => {
  const page = await openPage(t);
  const originalSize = await page.evaluate(() => {
    (window as any).fixture.picks.push(async () => {
      const canvas = document.createElement("canvas"); canvas.width = 4000; canvas.height = 2600;
      const context = canvas.getContext("2d")!; const image = context.createImageData(4000, 2600); let seed = 140;
      for (let index = 0; index < image.data.length; index += 4) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; const value = 80 + (seed % 70); image.data[index] = value; image.data[index + 1] = value; image.data[index + 2] = value; image.data[index + 3] = 255; }
      context.putImageData(image, 0, 0); context.fillStyle = "#fafafa"; context.fillRect(700, 500, 2600, 1600);
      context.fillStyle = "#111"; context.font = "bold 150px sans-serif"; context.fillText("Hana Sato", 900, 900);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), "image/png"));
      (window as any).fixture.originalSize = blob.size;
      return new File([blob], "IMG_0140.PNG", { type: "image/png" });
    });
    return 0;
  });
  assert.equal(originalSize, 0);
  await page.getByRole("button", { name: "从相册选择", exact: true }).click();
  await page.getByRole("button", { name: "保存到人脉", exact: true }).waitFor({ timeout: 30_000 });
  const observed = await page.evaluate(() => {
    const request = (window as any).fixture.requests[0];
    return { original: (window as any).fixture.originalSize, size: request.body.imageSizeBytes, decoded: atob(request.body.imageBase64).length, mimeType: request.body.mimeType, name: request.body.imageName, head: atob(request.body.imageBase64).slice(0, 2).split("").map((c: string) => c.charCodeAt(0)) };
  });
  assert.ok(observed.original > 7 * 1024 * 1024, `sample must exceed the 7 MiB direct-scan target, got ${observed.original}`);
  assert.equal(observed.size, observed.decoded, "imageSizeBytes is the size of the bytes actually sent");
  assert.ok(observed.size <= 7 * 1024 * 1024);
  assert.equal(observed.mimeType, "image/jpeg");
  assert.equal(observed.name, "IMG_0140.jpg");
  assert.deepEqual(observed.head, [0xff, 0xd8]);
});

test("a photo that cannot be compressed is never sent and the user can choose again", async (t) => {
  const page = await openPage(t);
  await page.evaluate(() => {
    (window as any).fixture.picks.push(async () => {
      const bytes = new Uint8Array(8 * 1024 * 1024); bytes.set([0xff, 0xd8, 0xff, 0xe0]);
      return new File([bytes], "broken.jpg", { type: "image/jpeg" });
    });
  });
  await page.getByRole("button", { name: "从相册选择", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "这张图片无法在手机上压缩，没有上传。请重拍或换一张。" }).waitFor();
  assert.deepEqual(await posts(page), []);
  assert.equal(await page.getByRole("button", { name: "拍一张名片", exact: true }).isEnabled(), true);
});
