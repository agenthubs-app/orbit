import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Locator, type Page } from "playwright";

const require = createRequire(import.meta.url);
let browser: Browser;
let server: Server;
let url: string;

// Only HTTP, navigation and native camera/permission boundaries are controlled.
// Screens, charts, view-models, theme, inputs and disclosure state are production.
const fixture = `
import React, { useSyncExternalStore } from "react";
import { View } from "react-native";
const listeners = new Set(); let revision = 0;
const state = window.fixture = { requests: [], navigation: [], nativeCalls: [], cameraGranted: true, photoGranted: true, kind: "success", update(patch) { Object.assign(state, patch); revision++; listeners.forEach(f => f()); } };
const rerender = () => useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f); }, () => revision);
const contacts = { contacts: [{ id: "contact:1", displayName: "林悦", organization: "红桥科技", role: "市场负责人", location: "东京", industry: "enterprise_saas", status: "active", value: { score: 89, valueTypes: [] } }] };
const mobile = {
  aggregate: { relationshipAssetTotals: { contacts: 1 }, highValueCount: 1, pendingFollowups: { count: 1 }, dormantContacts: { count: 0 } },
  contacts, profile: { profile: { displayName: "测试用户", relationshipGoal: "拓展日本零售合作" } },
  summary: { metrics: [{ id: "relationship-assets", value: 1 }, { id: "high-value", value: 1 }] },
  distributions: { industryDistribution: [{ bucketId: "industry:technology", label: "科技", contactCount: 1, percentage: 100, topOrganizations: ["红桥科技"] }], relationshipStrengthDistribution: [{ strength: "strong", relationshipCount: 1, percentage: 100, followupRisk: "low" }], valueTypeDistribution: [] },
  gaps: { coverageScore: 72, gaps: [] },
  opportunities: { highPriorityOpportunities: [{ contactId: "contact:1", contactName: "林悦", organization: "红桥科技", title: "确认合作时间", priorityScore: 91, dueLabel: "今天", reason: "合作时间待确认", suggestedAction: "联系林悦", actionBrief: { ruleVersion: "opportunity-brief-v1", type: "follow_up", title: "确认合作时间", judgment: "本周需要确认合作安排。", evidence: ["已有交流记录"], steps: ["查看最近记录", "确认合作安排"], primaryAction: { contactId: "contact:1", kind: "open_contact", label: "开始联系" }, secondaryAction: { contactId: "contact:1", kind: "open_contact", label: "查看联系人" }, priority: { total: 91 }, evidenceIds: [], evaluatedAt: "2026-09-08T00:00:00Z" } }] }
};
export const useLocalSearchParams = () => ({ dimension: "industry", bucketId: "industry:technology" });
export const usePathname = () => "/contacts";
export const useRouter = () => ({ canGoBack: () => false, back() { state.navigation.push("back"); }, replace(path) { state.navigation.push(path); }, push(path) { state.navigation.push(path); } });
const structure = { dimension: "industry", bucket: { label: "科技合作伙伴", contactCount: 1, percentage: 100 }, contacts: [{ ...contacts.contacts[0], relationshipStrength: "strong" }], commonTags: [{ label: "日本市场", contactCount: 1 }], relationshipQuality: [{ id: "strong", label: "强关系", contactCount: 1, percentage: 100 }], insight: "科技合作伙伴已有交流基础。" };
const connections = { connections: [{ id: "connection:1", contactId: "contact:1", displayName: "林悦", organization: "红桥科技", relationshipStage: "needs_follow_up", strengthScore: 89, sourceLinks: [{ label: "朋友引荐", type: "referral" }], evidenceTimeline: [{ title: "已有交流记录" }] }] };
export const useApiResource = path => { rerender(); return { kind: state.kind, error: { message: "连接暂时失败" }, data: path.includes("structure/") ? structure : path.includes("connections") ? connections : path.includes("tasks") ? { tasks: [] } : path.includes("draft") ? {} : path.includes("aggregate") ? mobile.aggregate : path.includes("opportunities") ? mobile.opportunities : path.includes("distributions") ? mobile.distributions : path.includes("gaps") ? mobile.gaps : contacts, refreshing: false, refresh() {} }; };
export const useValidatedApiResource = () => { rerender(); return { kind: state.kind, data: mobile, error: { message: "连接暂时失败" }, refreshing: false, refresh() {} }; };
const record = method => async (path, options) => {
  state.requests.push({ method, path, body: options?.body });
  if (method === "GET" && path === "/api/connections/connection%3A1") return { success: true, data: { connection: connections.connections[0], sourceLinks: [{ evidenceId: "source:1", label: "朋友引荐", type: "referral" }], evidenceTimeline: [{ evidenceId: "evidence:1", title: "已有交流记录", excerpt: "上周确认了合作方向。", contribution: "user_note" }] } };
  return { success: false, error: { message: "暂时无法保存，请重试" } };
};
export const useOrbitApiClient = () => ({ post: record("POST"), put: record("PUT"), patch: record("PATCH"), get: record("GET") });
export const useOrbitApiBaseUrl = () => ({ baseUrl: "http://fixture" });
export const useRelationshipInboxBadgeCount = () => 0;
export const SafeAreaView = ({ children, edges, ...props }) => <View {...props}>{children}</View>;
export const Ionicons = ({ size }) => <span aria-hidden="true" style={{ display: "inline-block", flexShrink: 0, width: size, height: size }} />;
export const CameraView = ({ children, style }) => <View style={style} testID="camera-preview">{children}</View>;
export const useCameraPermissions = () => { rerender(); return [{ granted: state.cameraGranted }, async () => { state.nativeCalls.push("qr-permission"); return { granted: state.cameraGranted }; }]; };
export const requestCameraPermissionsAsync = async () => { state.nativeCalls.push("camera-permission"); return { granted: state.cameraGranted }; };
export const requestMediaLibraryPermissionsAsync = async () => { state.nativeCalls.push("photo-permission"); return { granted: state.photoGranted }; };
export const launchCameraAsync = async () => { state.nativeCalls.push("camera-launch"); return { canceled: true }; };
export const launchImageLibraryAsync = async () => { state.nativeCalls.push("photo-launch"); return { canceled: true }; };
`;

test.before(async () => {
  const result = await build({
    stdin: { contents: `import React from "react"; import { createRoot } from "react-dom/client";
import { ContactsScreen } from "./src/screens/contacts/ContactsScreen";
import { ContactAcquisitionScreen } from "./src/screens/contacts/ContactAcquisitionScreen";
import { ContactsDashboardScreen } from "./src/screens/contacts/ContactsDashboardScreen";
import { ContactPipelineScreen } from "./src/screens/contacts/ContactPipelineScreen";
import { ContactStructureDetailScreen } from "./src/screens/contacts/ContactStructureDetailScreen";
import { ContactIntrosScreen } from "./src/screens/contacts/ContactIntrosScreen";
import { ContactsGraphScreen } from "./src/screens/contacts/ContactsGraphScreen";
import { DashboardScreen } from "./src/screens/dashboard/DashboardScreen";
const screens = { overview: ContactsScreen, acquisition: ContactAcquisitionScreen, analysis: ContactsDashboardScreen, pipeline: ContactPipelineScreen, structure: ContactStructureDetailScreen, intros: ContactIntrosScreen, graph: ContactsGraphScreen, dashboard: DashboardScreen };
const Screen = screens[new URLSearchParams(location.search).get("screen") || "overview"];
createRoot(document.getElementById("root")).render(<Screen />);`, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{ name: "contacts-boundaries", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: require.resolve("react-native-svg/lib/module/ReactNativeSVG.web.js") }));
      plugin.onResolve({ filter: /^(expo-router|@expo\/vector-icons|react-native-safe-area-context|expo-camera|expo-image-picker)$|\/(useApiResource|useValidatedApiResource|useOrbitApiClient|ApiBaseUrlProvider|useRelationshipInboxBadgeCount)$/ }, () => ({ path: "fixture", namespace: "contacts-test" }));
      plugin.onLoad({ filter: /.*/, namespace: "contacts-test" }, () => ({ contents: fixture, loader: "jsx", resolveDir: process.cwd() }));
    } }]
  });
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<style>html,body,#root{margin:0;height:100%}</style><div id="root"></div><script>${result.outputFiles[0]!.text}</script>`);
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

async function openScreen(t: { after: (fn: () => Promise<void>) => void }, screen: string, colorScheme: "light" | "dark" = "light"): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 320, height: 874 }, colorScheme });
  page.setDefaultTimeout(2500);
  t.after(() => page.close());
  await page.route("**/*", route => route.request().url().startsWith(url) ? route.continue() : route.abort());
  await page.goto(`${url}?screen=${screen}`);
  return page;
}

async function touchFits(locator: Locator, minHeight = 44) {
  const box = (await locator.boundingBox())!;
  assert.ok(box && box.height >= minHeight, `expected ${minHeight}pt touch target, got ${box?.height}`);
  assert.ok(box.x >= 0 && box.x + box.width <= 320, "control must fit a 320pt phone");
}

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: overview keeps all four destinations in compact open navigation rows`, async t => {
    const page = await openScreen(t, "overview", scheme);
    const destinations = [["联系人库", "/contacts/list"], ["人脉分析", "/contacts/dashboard"], ["关系进展", "/contacts/pipeline"], ["添加人脉", "/contacts/new"]];
    let previousBottom = 0;
    for (const [name, path] of destinations) {
      const action = page.getByRole("button", { name: new RegExp(name!) });
      await touchFits(action);
      const box = (await action.boundingBox())!;
      assert.ok(box.y >= previousBottom, "library, analysis, progress and acquisition retain their visible order");
      previousBottom = box.y + box.height;
      assert.equal(box.width, 276, "all four entries must use the same full-width open row");
      assert.ok(box.height <= 112, "overview navigation must not become large tiles");
      assert.equal(await action.evaluate(el => getComputedStyle(el).borderTopWidth), "0px", "rows do not need an outer card border");
      await action.click();
      assert.equal(await page.evaluate(() => (window as any).fixture.navigation.at(-1)), path);
    }
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-contacts-overview-${scheme}.png`, fullPage: true });
  });

  test(`${scheme}: acquisition has a 50pt primary action, an open image group, and safe source switching`, async t => {
    const page = await openScreen(t, "acquisition", scheme);
    await touchFits(page.getByRole("button", { name: "生成待确认候选", exact: true }), 50);
    const imageGroup = page.getByText("拍名片或选图片", { exact: true }).locator("..").locator("..");
    assert.equal(await imageGroup.evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)", "image preview should not be wrapped in another card");
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-contacts-acquisition-${scheme}.png`, fullPage: true });
    for (const label of ["拍名片", "选图片"]) {
      const action = page.getByRole("button", { name: label, exact: true });
      await touchFits(action); await action.click();
    }
    await page.getByRole("tab", { name: "手动", exact: true }).click();
    assert.equal(await page.getByRole("tab", { name: "手动", exact: true }).getAttribute("aria-selected"), "true");
    for (const placeholder of ["例如：王小雨", "例如：Orbit", "例如：市场负责人", "在哪里认识、对方想找什么、你能提供什么。", "例如：下周约 30 分钟交流", "AI, 东京, 制造业"]) await touchFits(page.getByPlaceholder(placeholder));
    await page.getByPlaceholder("例如：王小雨").fill("林悦");
    await page.getByRole("tab", { name: "QR", exact: true }).click();
    await page.getByRole("button", { name: "扫 QR", exact: true }).click();
    await page.getByTestId("camera-preview").waitFor();
    await page.getByRole("button", { name: "关闭扫描", exact: true }).click();
    await touchFits(page.getByPlaceholder("粘贴扫码得到的文本或链接"));
    const referral = page.getByRole("radio", { name: /创始人引荐/ });
    await touchFits(referral); await referral.click();
    assert.equal(await referral.getAttribute("aria-checked"), "true");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  });
}

test("analysis uses open 18/26 sections and keeps structure, opportunity and goal drafts operable at 320pt", async t => {
  const page = await openScreen(t, "analysis");
  const title = page.getByText("结构摘要", { exact: true });
  await title.waitFor();
  assert.deepEqual(await title.evaluate(el => { const s = getComputedStyle(el); return [s.fontSize, s.lineHeight, s.fontWeight]; }), ["18px", "26px", "600"]);
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-app-wide-contacts-analysis.png", fullPage: true });
  const section = title.locator("..").locator("..").locator("..");
  assert.equal(await section.evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
  await page.getByRole("button", { name: /当前目标.*编辑目标/ }).click();
  const input = page.getByRole("textbox", { name: "关系目标", exact: true });
  await input.fill("先确认零售合作时间");
  await touchFits(page.getByRole("button", { name: "保存关系目标", exact: true }), 50);
  await page.getByRole("button", { name: "结构分析", exact: true }).click();
  for (const name of ["行业结构分析", "地区结构分析", "角色结构分析", "关系结构分析"]) {
    const action = page.getByRole("button", { name, exact: true });
    await touchFits(action); await action.click();
  }
  assert.ok(await page.locator("svg").count() > 0, "real structure chart remains rendered");
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-app-wide-contacts-analysis-structure.png", fullPage: true });
  await page.getByRole("button", { name: "机会分析", exact: true }).click();
  await page.getByRole("button", { name: /确认合作时间/ }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await touchFits(page.getByRole("button", { name: "关闭行动简报", exact: true }).last());
  await touchFits(page.getByRole("button", { name: "开始联系", exact: true }), 50);
  await page.getByRole("button", { name: "关闭行动简报", exact: true }).last().click();
  assert.equal(await input.inputValue(), "先确认零售合作时间");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  await page.getByRole("button", { name: "保存关系目标", exact: true }).click();
  await page.getByText("暂时无法保存，请重试", { exact: true }).waitFor();
  assert.equal(await input.inputValue(), "先确认零售合作时间");
  const requests = await page.evaluate(() => (window as any).fixture.requests);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "PUT");
  assert.equal(requests[0].path, "/api/profile");
  assert.equal(requests[0].body.relationshipGoal, "先确认零售合作时间");
});

test("structure detail renders real success content and opens its contact at 320pt", async t => {
  const page = await openScreen(t, "structure", "dark");
  await page.getByText("科技合作伙伴", { exact: true }).waitFor();
  for (const name of ["关系质量", "常见标签", "相关联系人"]) {
    const heading = page.getByText(name, { exact: true });
    assert.deepEqual(await heading.evaluate(el => { const s = getComputedStyle(el); return [s.fontSize, s.lineHeight, s.fontWeight]; }), ["18px", "26px", "600"]);
    assert.equal(await heading.locator("..").evaluate(el => getComputedStyle(el).borderTopWidth), "0px");
  }
  const contact = page.getByRole("button", { name: "查看林悦", exact: true });
  await touchFits(contact);
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-app-wide-contacts-structure-detail-dark.png", fullPage: true });
  await contact.click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/contact%3A1"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  await page.evaluate(() => (window as any).fixture.update({ kind: "offline" }));
  await page.getByText("连接暂时失败", { exact: true }).waitFor();
});

test("contact navigation and acquisition controls grow with doubled text without clipping", async t => {
  for (const screen of ["overview", "acquisition"]) {
    const page = await openScreen(t, screen, "dark");
    const actions = screen === "overview"
      ? [page.getByRole("button", { name: /联系人库/ }), page.getByRole("button", { name: /添加人脉/ })]
      : [page.getByRole("tab", { name: "名片", exact: true }), page.getByRole("button", { name: "生成待确认候选", exact: true }), page.getByRole("button", { name: "拍名片", exact: true })];
    await actions[0]!.waitFor();
    // Browser inflation measures reflow; actual native Dynamic Type is checked separately.
    await page.evaluate(() => document.querySelectorAll("[dir='auto'],input,textarea").forEach(node => {
      const element = node as HTMLElement, style = getComputedStyle(element);
      element.style.fontSize = `${parseFloat(style.fontSize) * 2}px`;
      element.style.lineHeight = `${parseFloat(style.lineHeight) * 2}px`;
    }));
    for (const action of actions) {
      await touchFits(action);
      const bounds = (await action.boundingBox())!;
      for (const label of await action.locator("[dir='auto']").all()) {
        const box = (await label.boundingBox())!;
        assert.ok(box.x >= bounds.x && box.x + box.width <= bounds.x + bounds.width, "inflated action text stays within its control");
        assert.ok(box.y >= bounds.y && box.y + box.height <= bounds.y + bounds.height, "inflated action text is not vertically clipped");
      }
    }
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-contacts-${screen}-large-dark.png`, fullPage: true });
  }
});

test("pipeline mode selection has 44pt targets and does not advance a relationship", async t => {
  const page = await openScreen(t, "pipeline");
  for (const name of ["待处理", "按阶段"]) {
    const mode = page.getByRole("tab", { name, exact: true });
    await touchFits(mode); await mode.click();
  }
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

test("analysis summary shows complete values and explanations on a narrow phone", async t => {
  const page = await openScreen(t, "analysis");
  const summary = page.getByText("结构摘要", { exact: true }).locator("..").locator("..").locator("..");
  await summary.waitFor();
  const clipped = await summary.locator("[dir='auto']").evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent));
  assert.deepEqual(clipped, [], "structure values and their explanations must wrap rather than disappear behind ellipses");
  await summary.locator("[dir='auto']").evaluateAll(elements => elements.forEach(node => {
    const element = node as HTMLElement, style = getComputedStyle(element);
    element.style.fontSize = `${parseFloat(style.fontSize) * 2}px`;
    element.style.lineHeight = `${parseFloat(style.lineHeight) * 2}px`;
  }));
  const inflatedClipped = await summary.locator("[dir='auto']").evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1).map(el => el.textContent));
  assert.deepEqual(inflatedClipped, [], "large-text structure summary keeps every percentage and explanation");
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-app-wide-contacts-analysis-summary-large.png", fullPage: true });
});

test("analysis opened in dark appearance keeps its real modal readable and bounded", async t => {
  const page = await openScreen(t, "analysis", "dark");
  await page.getByText("结构摘要", { exact: true }).waitFor();
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-app-wide-contacts-analysis-dark.png", fullPage: true });
  await page.getByRole("button", { name: "机会分析", exact: true }).click();
  await page.getByRole("button", { name: /确认合作时间/ }).click();
  const action = page.getByRole("button", { name: "开始联系", exact: true });
  await action.click({ trial: true });
  await touchFits(action, 50);
  assert.equal(await action.evaluate(el => getComputedStyle(el).backgroundColor), "rgb(162, 175, 211)");
  const labelColor = await action.locator("[dir='auto']").first().evaluate(el => getComputedStyle(el).color);
  assert.equal(labelColor, "rgb(23, 28, 42)");
  if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: "/tmp/orbit-app-wide-contacts-analysis-brief-dark.png", fullPage: true, animations: "disabled" });
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

test("introduction selection opens an editable draft without preparing or sending an invitation", async t => {
  const page = await openScreen(t, "intros");
  const prepare = page.getByRole("button", { name: "准备邀请", exact: true });
  await touchFits(prepare, 50); await prepare.click();
  const email = page.getByPlaceholder("name@example.com");
  await touchFits(email); await email.fill("lin@example.com");
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(await email.inputValue(), "lin@example.com");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});

test("legacy graph and dashboard retain their real actions and request boundaries", async t => {
  const graph = await openScreen(t, "graph", "dark");
  for (const name of ["查看证据", "生成画像", "打开联系人"]) await touchFits(graph.getByRole("button", { name, exact: true }));
  await graph.getByRole("button", { name: "打开联系人", exact: true }).click();
  assert.deepEqual(await graph.evaluate(() => (window as any).fixture.navigation), ["/contacts/contact%3A1"]);
  assert.deepEqual(await graph.evaluate(() => (window as any).fixture.requests), []);
  const dashboard = await openScreen(t, "dashboard");
  const recompute = dashboard.getByRole("button", { name: "重新计算机会", exact: true });
  await touchFits(recompute, 50);
  assert.deepEqual(await dashboard.evaluate(() => (window as any).fixture.requests), []);
  await recompute.click();
  await dashboard.getByText("暂时无法保存，请重试", { exact: true }).waitFor();
  assert.equal((await dashboard.evaluate(() => (window as any).fixture.requests)).length, 1);
});

for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: graph evidence opens an inset editor and retains its draft after a controlled failed write`, async t => {
    const page = await openScreen(t, "graph", scheme);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
    await page.getByRole("button", { name: "查看证据", exact: true }).click();
    await page.getByText("上周确认了合作方向。", { exact: true }).waitFor();
    const title = page.getByPlaceholder("标题，比如 后续可引荐");
    const excerpt = page.getByPlaceholder("写清楚这条关系为什么值得联系");
    const form = title.locator("..");
    assert.deepEqual(await form.evaluate(el => {
      const s = getComputedStyle(el);
      return [s.backgroundColor, s.borderRadius, s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft];
    }), [scheme === "light" ? "rgb(243, 243, 242)" : "rgb(39, 44, 53)", "12px", "12px", "12px", "12px", "12px"]);
    await touchFits(title); await touchFits(excerpt);
    const submit = page.getByRole("button", { name: "添加证据", exact: true });
    await touchFits(submit, 50);
    assert.equal(await submit.evaluate(el => getComputedStyle(el).backgroundColor), scheme === "light" ? "rgb(0, 109, 184)" : "rgb(162, 175, 211)");
    assert.equal(await submit.locator("[dir='auto']").evaluate(el => getComputedStyle(el).color), scheme === "light" ? "rgb(255, 255, 255)" : "rgb(23, 28, 42)");
    const formBox = (await form.boundingBox())!;
    const submitBox = (await submit.boundingBox())!;
    assert.equal(submitBox.x - formBox.x, 12);
    assert.equal(formBox.x + formBox.width - submitBox.x - submitBox.width, 12);
    await title.fill("后续可引荐"); await excerpt.fill("对方愿意介绍零售合作伙伴。");
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [{ method: "GET", path: "/api/connections/connection%3A1", body: undefined }]);
    await submit.click();
    await page.getByText("这条证据暂时补充不了，请刷新后再试一次。", { exact: true }).waitFor();
    assert.equal(await title.inputValue(), "后续可引荐");
    assert.equal(await excerpt.inputValue(), "对方愿意介绍零售合作伙伴。");
    assert.equal(await submit.isEnabled(), true);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), [
      { method: "GET", path: "/api/connections/connection%3A1", body: undefined },
      { method: "POST", path: "/api/connections/connection%3A1/evidence", body: { contribution: "user_note", excerpt: "对方愿意介绍零售合作伙伴。", sourceLabel: "iOS 手动补充", sourceType: "manual", title: "后续可引荐" } }
    ]);
    if (process.env.APP_STYLE_SCREENSHOTS) await page.screenshot({ path: `/tmp/orbit-app-wide-contacts-graph-evidence-${scheme}.png`, fullPage: true });
  });
}

test("denied camera and photo access show feedback and allow safe acquisition recovery without writes", async t => {
  const page = await openScreen(t, "acquisition");
  await page.evaluate(() => (window as any).fixture.update({ cameraGranted: false, photoGranted: false }));
  for (const [name, message] of [["拍名片", "需要允许使用相机，才能拍摄名片。"], ["选图片", "需要允许访问照片，才能选择名片图片。"]] as const) {
    const action = page.getByRole("button", { name, exact: true });
    await action.click();
    await page.getByText(message, { exact: true }).waitFor();
    assert.equal(await action.isEnabled(), true, "denial must release the pending state for retry");
  }
  await page.getByRole("tab", { name: "QR", exact: true }).click();
  const scan = page.getByRole("button", { name: "扫 QR", exact: true });
  await scan.click();
  await page.getByText("需要允许使用相机，才能扫描 QR。", { exact: true }).waitFor();
  assert.equal(await scan.isEnabled(), true);
  assert.equal(await page.getByTestId("camera-preview").count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.nativeCalls), ["camera-permission", "photo-permission", "qr-permission"]);
  await page.getByRole("tab", { name: "手动", exact: true }).click();
  await page.getByPlaceholder("例如：王小雨").fill("林悦");
  await page.getByRole("tab", { name: "名片", exact: true }).click();
  // Controlled permission recovery only; no native system permission is changed.
  await page.evaluate(() => (window as any).fixture.update({ cameraGranted: true, photoGranted: true }));
  for (const name of ["拍名片", "选图片"]) {
    const action = page.getByRole("button", { name, exact: true });
    await action.click(); assert.equal(await action.isEnabled(), true);
  }
  await page.getByRole("tab", { name: "QR", exact: true }).click();
  await scan.click(); await page.getByTestId("camera-preview").waitFor();
  await page.getByRole("button", { name: "关闭扫描", exact: true }).click();
  assert.equal(await page.getByTestId("camera-preview").count(), 0);
  await page.getByRole("tab", { name: "手动", exact: true }).click();
  assert.equal(await page.getByPlaceholder("例如：王小雨").inputValue(), "林悦");
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.nativeCalls), ["camera-permission", "photo-permission", "qr-permission", "camera-permission", "camera-launch", "photo-permission", "photo-launch"]);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
});
