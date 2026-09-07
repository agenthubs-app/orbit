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

// Keep the acquisition screen, forms and decoders real. Only device pickers,
// navigation and network boundaries are replaced; no cloud or business writes.
const fixture = `
import React from "react";
const draft = { id: "card:risk", displayName: "Hana Sato", organization: "Aki Robotics", role: "Director", email: "wrong@example.invalid", phone: "", source: { type: "business_card_ocr" }, evidence: [{ evidenceId: "evidence:card:risk", excerpt: "Hana Sato" }] };
const state = window.fixture = { requests: [], issues: [{ code: "INVALID_EMAIL", field: "emails", message: "Review the email." }], draft };
const client = {
  async post(path, options) {
    state.requests.push({ method: "POST", path, ...options });
    if (path.includes("business-card") && path.endsWith("/confirm")) return { success: true, data: { state: "created", contact: { id: "contact:saved", displayName: options.body.displayName } } };
    return { success: true, data: { draft: state.draft, capture: { imageDigest: "sha256:card:risk" }, ocr: { reviewIssues: state.issues } } };
  },
  async patch(path, options) {
    state.requests.push({ method: "PATCH", path, ...options });
    return { success: true, data: { reviewDraft: { ...state.draft, ...options.body.reviewedFields } } };
  }
};
export const useOrbitApiClient = () => client;
export const useApiResource = () => ({ kind: "loading", refreshing: false, refresh() {} });
export const useRouter = () => ({ push() {} });
export const useLocalSearchParams = () => ({});
export const useCameraPermissions = () => [{ granted: true }, async () => ({ granted: true })];
export const CameraView = () => null;
export const requestMediaLibraryPermissionsAsync = async () => ({ granted: true });
export const requestCameraPermissionsAsync = requestMediaLibraryPermissionsAsync;
export const launchImageLibraryAsync = async () => ({ canceled: false, assets: [{ uri: "data:image/png;base64,iVBORw0KGgo=", base64: "test-image", mimeType: "image/png", fileName: "card.png", fileSize: 10 }] });
export const launchCameraAsync = launchImageLibraryAsync;
export const Ionicons = () => <span aria-hidden="true">◇</span>;
export const AppScreen = ({ children }) => <main>{children}</main>;
export const createThemedStyles = () => () => ({ colors: {}, styles: {} });
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { ContactAcquisitionScreen } from "./src/screens/contacts/ContactAcquisitionScreen"; createRoot(document.getElementById("root")).render(<ContactAcquisitionScreen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "card-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^(expo-router|expo-camera|expo-image-picker|@expo\/vector-icons)$|\/(useApiResource|useOrbitApiClient|AppScreen)$|\/design\/theme$/ }, () => ({ path: "fixture", namespace: "card-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "card-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }],
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
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

async function openScan(t: { after: (fn: () => Promise<void>) => void }): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(url);
  await page.getByRole("button", { name: "选图片", exact: true }).click();
  await page.getByRole("button", { name: "生成待确认候选", exact: true }).click();
  await page.getByRole("button", { name: "写入联系人", exact: true }).waitFor();
  return page;
}

test("a scanned card cannot be written before risks and final fields are reviewed", async (t) => {
  const page = await openScan(t);
  const write = page.getByRole("button", { name: "写入联系人", exact: true });
  assert.equal(await write.isDisabled(), true);
  const finalReview = page.getByRole("checkbox", { name: "我已核对所有字段，并决定将其收录进人脉。", exact: true });
  await finalReview.click();
  assert.equal(await write.isDisabled(), true, "final review alone cannot skip a risk");
  await page.getByRole("checkbox", { name: "邮箱可能有误，请对照名片核对。", exact: true }).click();
  assert.equal(await write.isEnabled(), true);
  await write.click();
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].path, "/api/contacts/business-card/confirm");
  assert.equal(requests[1].body.confirmed, true);
  assert.equal(requests[1].body.displayName, "Hana Sato");
});

test("editing a reviewed field requires a new final confirmation", async (t) => {
  const page = await openScan(t);
  const write = page.getByRole("button", { name: "写入联系人", exact: true });
  await page.getByRole("checkbox", { name: "邮箱可能有误，请对照名片核对。", exact: true }).click();
  await page.getByRole("checkbox", { name: "我已核对所有字段，并决定将其收录进人脉。", exact: true }).click();
  await page.getByPlaceholder("wrong@example.invalid", { exact: true }).fill("correct@example.invalid");
  assert.equal(await write.isDisabled(), true);
  assert.equal(await page.getByRole("checkbox", { name: "我已核对所有字段，并决定将其收录进人脉。", exact: true }).isChecked(), false);
});

test("saving review fields does not erase outstanding OCR risks", async (t) => {
  const page = await openScan(t);
  await page.getByRole("button", { name: "保存复核字段", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.some((request: any) => request.method === "PATCH"));
  await page.getByRole("checkbox", { name: "邮箱可能有误，请对照名片核对。", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "写入联系人", exact: true }).isDisabled(), true);
});

test("rescanning the same image clears both acknowledgements and final review", async (t) => {
  const page = await openScan(t);
  await page.getByRole("checkbox", { name: "邮箱可能有误，请对照名片核对。", exact: true }).click();
  await page.getByRole("checkbox", { name: "我已核对所有字段，并决定将其收录进人脉。", exact: true }).click();
  await page.getByRole("button", { name: "生成待确认候选", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  assert.equal(await page.getByRole("checkbox", { name: "邮箱可能有误，请对照名片核对。", exact: true }).isChecked(), false);
  assert.equal(await page.getByRole("checkbox", { name: "我已核对所有字段，并决定将其收录进人脉。", exact: true }).isChecked(), false);
  assert.equal(await page.getByRole("button", { name: "写入联系人", exact: true }).isDisabled(), true);
});

test("cards without OCR risks still require explicit final review", async (t) => {
  const page = await openScan(t);
  await page.evaluate(() => { (window as any).fixture.issues = []; });
  await page.getByRole("button", { name: "生成待确认候选", exact: true }).click();
  await page.waitForFunction(() => (window as any).fixture.requests.length === 2);
  const write = page.getByRole("button", { name: "写入联系人", exact: true });
  assert.equal(await write.isDisabled(), true);
  await page.getByRole("checkbox", { name: "我已核对所有字段，并决定将其收录进人脉。", exact: true }).click();
  assert.equal(await write.isEnabled(), true);
});

test("a new scan of the same draft displays the newly returned fields", async (t) => {
  const page = await openScan(t);
  await page.getByPlaceholder("Hana Sato", { exact: true }).fill("Old unsaved edit");
  await page.evaluate(() => { (window as any).fixture.draft = { ...(window as any).fixture.draft, displayName: "New recognition" }; });
  await page.getByRole("button", { name: "生成待确认候选", exact: true }).click();
  await page.getByPlaceholder("New recognition", { exact: true }).waitFor();
  assert.equal(await page.getByPlaceholder("New recognition", { exact: true }).inputValue(), "New recognition");
});
