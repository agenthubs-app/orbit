import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { ContactNeedsHomeCard } from "../src/screens/contacts/ContactNeedsEditor";
import { ContactNeedsMatchesContent } from "../src/screens/contacts/ContactNeedsMatchesContent";
import type { OrbitLanguage } from "../src/api/contract/language";
import { OrbitLocaleContext } from "../src/i18n/OrbitLocaleContext";
import { createTranslator } from "../src/i18n/messages";
import type { ContactNeedsView } from "../src/view-models/contact-needs";
import { renderedText } from "./helpers/render";

const require = createRequire(import.meta.url);
const contactNeedsHookSource = readFileSync(new URL("../src/hooks/useContactNeeds.ts", import.meta.url), "utf8");
const contactNeedsMatchesScreenSource = readFileSync(new URL("../src/screens/contacts/ContactNeedsMatchesScreen.tsx", import.meta.url), "utf8");
let browser: Browser;
let homeScript: string;

const browserFixture = `
import React, { useSyncExternalStore } from "react";
const listeners = new Set(); let revision = 0;
const observe = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
const state = window.fixture = {
  actorId: "actor:one", baseUrl: "https://orbit.test", cookieHeader: "orbit_session=one", fontScale: 1, mode: "home", navigation: [], pending: [], requests: [], refreshes: 0,
  profile: { id: "profile:one", relationshipGoal: "", updatedAt: "2026-09-15T00:00:00.000Z" },
  ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision += 1; listeners.forEach(fn => fn()); },
  reply(index, result) { state.pending[index](result); revision += 1; listeners.forEach(fn => fn()); },
};
export const useFixture = () => { observe(); return state; };
export const useOrbitAuthSession = () => { observe(); return { ready: true, signedIn: true, cookieHeader: state.cookieHeader, user: { id: state.actorId } }; };
export const useOrbitApiBaseUrl = () => { observe(); return { ready: true, baseUrl: state.baseUrl }; };
export const useOrbitApiClient = () => ({ put(path, options) { const index = state.requests.length; state.requests.push({ path, body: options.body, signal: options.signal }); return new Promise(resolve => state.pending[index] = resolve); } });
export const useValidatedApiResource = () => { observe(); return { kind: "success", data: { state: "success", profile: state.profile, editor: { canSave: true } }, refreshing: false, refresh() { state.refreshes += 1; revision += 1; listeners.forEach(fn => fn()); } }; };
export const useRouter = () => ({ push(href) { state.navigation.push(href); } });
export const randomUUID = () => "needs-test-id";
export const Ionicons = ({ size = 16 }) => <span aria-hidden="true" style={{ display: "inline-block", height: size, width: size }} />;
`;

test.before(async () => {
  const result = await build({
    stdin: {
      contents: `import React from "react";
import { createRoot } from "react-dom/client";
import { ContactNeedsHomeEntry } from "./src/screens/contacts/ContactNeedsHomeEntry";
import { ContactNeedsMatchesContent } from "./src/screens/contacts/ContactNeedsMatchesContent";
import { useFixture } from "fixture";
const view = {
  state: "ready", goal: "寻找日本制造业合作伙伴", goalVersion: "2026-09-15T00:00:00.000Z", dataVersion: "${"a".repeat(64)}", scoringVersion: "needs-lexical-v1",
  criteria: [{ id: "location:japan", label: "日本" }, { id: "industry:manufacturing_supply_chain", label: "制造与供应链" }],
  scored: [
    { contactId: "contact:one", displayName: "田中健", role: "采购负责人", organization: "关东精工", location: "东京", score: 100, status: "matched", missingFields: [], matchedCriteria: [{ id: "location:japan", label: "日本" }, { id: "industry:manufacturing_supply_chain", label: "制造与供应链" }], unmatchedCriteria: [], evidence: [{ id: "location:japan", label: "日本", excerpt: "日本东京" }] },
    { contactId: "contact:zero", displayName: "Alex", role: "投资人", organization: "Northstar", location: "美国", score: 0, status: "no_match", missingFields: [], matchedCriteria: [], unmatchedCriteria: [{ id: "location:japan", label: "日本" }, { id: "industry:manufacturing_supply_chain", label: "制造与供应链" }], evidence: [] },
  ],
  insufficient: [],
};
function App() { const state = useFixture(); return state.mode === "matches" ? <ContactNeedsMatchesContent error={null} onEdit={() => state.navigation.push("edit")} onOpenContact={id => state.navigation.push(id)} onRetry={() => undefined} refreshing={false} view={view} /> : <ContactNeedsHomeEntry />; }
createRoot(document.getElementById("root")).render(<App />);`,
      loader: "tsx",
      resolveDir: process.cwd(),
    },
    bundle: true,
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    format: "iife",
    jsx: "automatic",
    plugins: [{
      name: "contact-needs-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "contact-needs" }));
        plugin.onResolve({ filter: /^(fixture|expo-router|expo-crypto|@expo\/vector-icons)$|\/(ApiBaseUrlProvider|AuthSessionProvider|useOrbitApiClient|useValidatedApiResource)$/ }, () => ({ path: "fixture", namespace: "contact-needs" }));
        plugin.onLoad({ filter: /.*/, namespace: "contact-needs" }, (args) => ({
          contents: args.path === "native" ? `
import React from "react"; import { Modal as _Modal, StyleSheet as _StyleSheet, Text as _Text, useWindowDimensions as _useWindowDimensions } from "react-native-web"; import { useFixture } from "fixture"; export * from "react-native-web";
export const Modal = ({ children, visible }) => visible ? <div role="dialog">{children}</div> : null;
export const useWindowDimensions = () => ({ ..._useWindowDimensions(), fontScale: useFixture().fontScale });
export const Text = React.forwardRef(({ allowFontScaling = true, style, ...props }, ref) => {
  const { fontScale } = useFixture();
  const flatStyle = _StyleSheet.flatten(style) || {};
  const scale = allowFontScaling ? fontScale : 1;
  return <_Text ref={ref} {...props} style={[style, {
    fontSize: typeof flatStyle.fontSize === "number" ? flatStyle.fontSize * scale : undefined,
    lineHeight: typeof flatStyle.lineHeight === "number" ? flatStyle.lineHeight * scale : undefined,
  }]} />;
});
` : browserFixture,
          loader: "jsx",
          resolveDir: process.cwd(),
        }));
        plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
      },
    }],
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    write: false,
  });
  homeScript = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});

test.after(async () => {
  await browser?.close();
});

async function openContactNeeds(t: { after(fn: () => Promise<void>): void }, initialFixture: Record<string, unknown> = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  t.after(async () => {
    await page.close();
    assert.deepEqual(errors, []);
  });
  await page.setContent('<div id="root"></div>');
  await page.evaluate((initial) => { (window as any).initialFixture = initial; }, initialFixture);
  await page.addScriptTag({ content: homeScript });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page;
}

async function openHome(t: { after(fn: () => Promise<void>): void }): Promise<Page> {
  return openContactNeeds(t);
}

function inLanguage(language: OrbitLanguage, child: React.ReactElement): React.ReactElement {
  return (
    <OrbitLocaleContext.Provider value={{
      choice: language,
      deviceLanguage: language,
      error: null,
      language,
      preference: { language, mode: "manual", updatedAt: null },
      retryLanguageSave: async () => undefined,
      setLanguage: async () => undefined,
      source: "account",
      syncState: "idle",
      t: createTranslator(language),
    }}>
      {child}
    </OrbitLocaleContext.Provider>
  );
}

test("current relationship need is read from the network and scoped to the signed-in session", () => {
  assert.match(contactNeedsHookSource, /cachePolicy: "network-only"/u);
  assert.match(contactNeedsHookSource, /JSON\.stringify\(\[actorId, auth\.cookieHeader, baseUrl\]\)/u);
  assert.match(contactNeedsHookSource, /current\.baseline\.profileId !== profile\.id/u);
});

test("saving a need invalidates the network-only ranking instead of retaining old scores", () => {
  assert.match(contactNeedsMatchesScreenSource, /cachePolicy: "network-only"/u);
  assert.match(contactNeedsMatchesScreenSource, /useContactNeeds\(\{ onSaved: matchesState\.refresh \}\)/u);
});

test("contacts home shows the exact empty need prompt without contact scores", () => {
  const text = renderedText(
    <ContactNeedsHomeCard goal="" loading={false} onEdit={() => undefined} onOpenMatches={() => undefined} />,
  );
  assert.match(text, /我的人脉需求/);
  assert.match(text, /您还没填写您的人脉需求。/);
  assert.match(text, /填写需求/);
  assert.doesNotMatch(text, /\d+分/);
});

test("contacts home uses one compact saved need row and opens ranking from a separate action", () => {
  const text = renderedText(
    <ContactNeedsHomeCard goal="寻找日本制造业合作伙伴" loading={false} onEdit={() => undefined} onOpenMatches={() => undefined} />,
  );
  assert.match(text, /寻找日本制造业合作伙伴/);
  assert.match(text, /按需求排序/);
  assert.doesNotMatch(text, /需求匹配分/);
});

const matchesView: ContactNeedsView = {
  state: "ready",
  goal: "寻找日本制造业合作伙伴",
  goalVersion: "2026-09-15T00:00:00.000Z",
  dataVersion: "a".repeat(64),
  scoringVersion: "needs-lexical-v1",
  criteria: [{ id: "location:japan", label: "日本" }, { id: "industry:manufacturing_supply_chain", label: "制造与供应链" }],
  scored: [{
    contactId: "contact:one", displayName: "田中健", role: "采购负责人", organization: "关东精工", location: "东京",
    score: 100, status: "matched", missingFields: [], matchedCriteria: [{ id: "location:japan", label: "日本" }, { id: "industry:manufacturing_supply_chain", label: "制造与供应链" }],
    unmatchedCriteria: [],
    evidence: [{ id: "location:japan", label: "日本", excerpt: "日本东京" }, { id: "industry:manufacturing_supply_chain", label: "制造与供应链", excerpt: "manufacturing_supply_chain" }],
  }],
  insufficient: [{
    contactId: "contact:two", displayName: "林悦", role: "", organization: "", location: "",
    score: null, status: "insufficient_data", missingFields: ["location"], matchedCriteria: [], evidence: [],
    unmatchedCriteria: [{ id: "location:japan", label: "日本" }, { id: "industry:manufacturing_supply_chain", label: "制造与供应链" }],
  }],
};

test("matches page labels the score as need relevance and groups insufficient data", () => {
  const text = renderedText(
    <ContactNeedsMatchesContent
      error={null}
      onEdit={() => undefined}
      onOpenContact={() => undefined}
      onRetry={() => undefined}
      refreshing={false}
      view={matchesView}
    />,
  );
  assert.match(text, /按与你当前需求的匹配程度排序/);
  assert.match(text, /需求匹配分/);
  assert.match(text, /100分/);
  assert.match(text, /资料不足/);
  assert.match(text, /待补充/);
  assert.match(text, /查看匹配依据/);
});

test("a ready response with no contacts has its own three-language empty state without hiding zero scores or incomplete contacts", () => {
  const emptyReadyView: ContactNeedsView = {
    ...matchesView,
    insufficient: [],
    scored: [],
  };
  const render = (language: OrbitLanguage) => renderedText(inLanguage(language,
    <ContactNeedsMatchesContent
      error={null}
      onEdit={() => undefined}
      onOpenContact={() => undefined}
      onRetry={() => undefined}
      refreshing={false}
      view={emptyReadyView}
    />,
  ));

  const chinese = render("zh");
  assert.match(chinese, /还没有联系人可用于需求匹配。/u);
  assert.doesNotMatch(chinese, /需求匹配分|资料不足|待补充/u);
  assert.match(render("ja"), /マッチングできる連絡先がまだありません。/u);
  assert.match(render("en"), /There are no contacts to match yet\./u);

  const zeroScore = renderedText(<ContactNeedsMatchesContent
    error={null}
    onEdit={() => undefined}
    onOpenContact={() => undefined}
    onRetry={() => undefined}
    refreshing={false}
    view={{
      ...matchesView,
      insufficient: [],
      scored: [{ ...matchesView.scored[0]!, evidence: [], matchedCriteria: [], score: 0, status: "no_match" }],
    }}
  />);
  assert.match(zeroScore, /0分/u);
  assert.doesNotMatch(zeroScore, /还没有联系人可用于需求匹配。/u);

  const incompleteContact = renderedText(<ContactNeedsMatchesContent
    error={null}
    onEdit={() => undefined}
    onOpenContact={() => undefined}
    onRetry={() => undefined}
    refreshing={false}
    view={{ ...matchesView, scored: [] }}
  />);
  assert.match(incompleteContact, /资料不足|待补充/u);
  assert.doesNotMatch(incompleteContact, /还没有联系人可用于需求匹配。/u);
});

test("need entry and known scoring criteria render in Japanese and English without Chinese fallback copy", () => {
  const japaneseHome = renderedText(inLanguage("ja", <ContactNeedsHomeCard goal="" loading={false} onEdit={() => undefined} onOpenMatches={() => undefined} />));
  assert.match(japaneseHome, /まだ人脈ニーズを入力していません。/u);
  assert.doesNotMatch(japaneseHome, /您还没填写/u);

  const englishMatches = renderedText(inLanguage("en", <ContactNeedsMatchesContent error={null} onEdit={() => undefined} onOpenContact={() => undefined} onRetry={() => undefined} refreshing={false} view={matchesView} />));
  assert.match(englishMatches, /Match: Japan, Manufacturing (?:&|&amp;) supply chain/u);
  assert.match(englishMatches, /100 pts/u);
  assert.match(englishMatches, /Needs more information/u);
  assert.match(englishMatches, /Missing: location/u);
  assert.doesNotMatch(englishMatches, /制造与供应链|资料不足|待补充/u);
});

test("matches page expands real evidence and opens the selected contact", async (t) => {
  const page = await openContactNeeds(t, { mode: "matches" });
  assert.equal(await page.getByText("100分", { exact: true }).count(), 1);
  await page.getByRole("button", { name: "查看田中健的匹配依据", exact: true }).click();
  await page.getByText("日本：日本东京", { exact: true }).waitFor();
  await page.getByRole("button", { name: "查看Alex的匹配依据", exact: true }).click();
  await page.getByText("未匹配：日本、制造与供应链", { exact: true }).waitFor();
  if (process.env.APP_STYLE_SCREENSHOTS) {
    await page.screenshot({ fullPage: true, path: "/tmp/orbit-0024-contact-needs-matches.png" });
  }
  await page.getByRole("button", { name: "打开田中健的联系人详情", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["contact:one"]);
});

test("matches page stacks score content and contains the avatar initial at accessibility text sizes", async (t) => {
  const page = await openContactNeeds(t, { fontScale: 2.4, mode: "matches" });
  const row = page.getByRole("button", { name: "打开田中健的联系人详情", exact: true });
  const avatarInitial = page.getByText("田", { exact: true });
  const reason = page.getByText("匹配：日本、制造与供应链", { exact: true });
  const score = page.getByText("100分", { exact: true });
  const [rowBox, avatarBox, avatarParentBox, reasonBox, scoreBox] = await Promise.all([
    row.boundingBox(),
    avatarInitial.boundingBox(),
    avatarInitial.locator("..").boundingBox(),
    reason.boundingBox(),
    score.boundingBox(),
  ]);
  assert.ok(rowBox && avatarBox && avatarParentBox && reasonBox && scoreBox);
  assert.ok(avatarBox.height <= avatarParentBox.height, `avatar initial ${avatarBox.height}px exceeds ${avatarParentBox.height}px circle`);
  assert.ok(scoreBox.y >= reasonBox.y + reasonBox.height, `score starts at ${scoreBox.y}px before reason ends at ${reasonBox.y + reasonBox.height}px`);
  assert.ok(scoreBox.x + scoreBox.width <= rowBox.x + rowBox.width, "score stays within the tappable row");
});

test("home editor saves a trimmed versioned need and rejects a false receipt without losing the draft", async (t) => {
  const page = await openHome(t);
  await page.getByRole("button", { name: "填写需求", exact: true }).first().click();
  const input = page.getByRole("textbox", { name: "人脉需求", exact: true });
  await input.fill("  寻找日本制造业合作伙伴  ");
  await page.getByRole("button", { name: "保存需求", exact: true }).click();
  const request = await page.evaluate(() => (window as any).fixture.requests[0]);
  assert.deepEqual(request.body, {
    expectedUpdatedAt: "2026-09-15T00:00:00.000Z",
    mutationId: "ios:relationship-goal:needs-test-id",
    relationshipGoal: "寻找日本制造业合作伙伴",
  });
  await page.evaluate(() => (window as any).fixture.reply(0, {
    success: true, status: 200,
    data: { editor: { lastSavedAt: "2026-09-15T00:00:01.000Z" }, mutationId: "wrong", profile: { id: "profile:one", relationshipGoal: "寻找日本制造业合作伙伴", updatedAt: "2026-09-15T00:00:01.000Z" } },
  }));
  await page.getByText("服务器没有确认本次保存，请重试。", { exact: true }).waitFor();
  assert.equal(await input.inputValue(), "  寻找日本制造业合作伙伴  ");
});

test("home editor accepts an exact receipt, shows the saved need, and opens the ranking page", async (t) => {
  const page = await openHome(t);
  await page.getByRole("button", { name: "填写需求", exact: true }).first().click();
  await page.getByRole("textbox", { name: "人脉需求", exact: true }).fill("寻找日本制造业合作伙伴");
  await page.getByRole("button", { name: "保存需求", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.reply(0, {
    success: true,
    status: 200,
    data: {
      editor: { lastSavedAt: "2026-09-15T00:00:01.000Z" },
      mutationId: "ios:relationship-goal:needs-test-id",
      profile: { id: "profile:one", relationshipGoal: "寻找日本制造业合作伙伴", updatedAt: "2026-09-15T00:00:01.000Z" },
    },
  }));
  await page.getByText("寻找日本制造业合作伙伴", { exact: true }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  if (process.env.APP_STYLE_SCREENSHOTS) {
    await page.screenshot({ fullPage: true, path: "/tmp/orbit-0024-contact-needs-home.png" });
  }
  await page.getByRole("button", { name: "按需求排序", exact: true }).click();
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.navigation), ["/contacts/matches"]);
});

test("cancelling need edits makes no request and restores the confirmed value", async (t) => {
  const page = await openHome(t);
  await page.getByRole("button", { name: "填写需求", exact: true }).first().click();
  await page.getByRole("textbox", { name: "人脉需求", exact: true }).fill("不保存的草稿");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.deepEqual(await page.evaluate(() => (window as any).fixture.requests), []);
  await page.getByRole("button", { name: "填写需求", exact: true }).first().click();
  assert.equal(await page.getByRole("textbox", { name: "人脉需求", exact: true }).inputValue(), "");
});

test("saving an empty need explicitly returns the home entry to its exact empty state", async (t) => {
  const page = await openContactNeeds(t, {
    profile: { id: "profile:one", relationshipGoal: "旧需求", updatedAt: "2026-09-15T00:00:00.000Z" },
  });
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await page.getByRole("textbox", { name: "人脉需求", exact: true }).fill("");
  await page.getByRole("button", { name: "保存需求", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.reply(0, {
    success: true,
    status: 200,
    data: {
      editor: { lastSavedAt: "2026-09-15T00:00:01.000Z" },
      mutationId: "ios:relationship-goal:needs-test-id",
      profile: { id: "profile:one", relationshipGoal: "", updatedAt: "2026-09-15T00:00:01.000Z" },
    },
  }));
  await page.getByText("您还没填写您的人脉需求。", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "填写需求", exact: true }).count(), 2);
});

test("home editor ignores a late save after the account changes", async (t) => {
  const page = await openHome(t);
  await page.getByRole("button", { name: "填写需求", exact: true }).first().click();
  await page.getByRole("textbox", { name: "人脉需求", exact: true }).fill("旧账号需求");
  await page.getByRole("button", { name: "保存需求", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.update({
    actorId: "actor:two",
    profile: { id: "profile:two", relationshipGoal: "新账号需求", updatedAt: "2026-09-15T00:00:02.000Z" },
  }));
  await page.evaluate(() => (window as any).fixture.reply(0, {
    success: true, status: 200,
    data: { editor: { lastSavedAt: "2026-09-15T00:00:01.000Z" }, mutationId: "ios:relationship-goal:needs-test-id", profile: { id: "profile:one", relationshipGoal: "旧账号需求", updatedAt: "2026-09-15T00:00:01.000Z" } },
  }));
  await page.getByText("新账号需求", { exact: true }).waitFor();
  assert.equal(await page.getByText("旧账号需求", { exact: true }).count(), 0);
});

test("home editor ignores a late save after the signed-in session changes", async (t) => {
  const page = await openHome(t);
  await page.getByRole("button", { name: "填写需求", exact: true }).first().click();
  await page.getByRole("textbox", { name: "人脉需求", exact: true }).fill("旧会话需求");
  await page.getByRole("button", { name: "保存需求", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.update({
    cookieHeader: "orbit_session=two",
    profile: { id: "profile:one", relationshipGoal: "新会话需求", updatedAt: "2026-09-15T00:00:02.000Z" },
  }));
  await page.evaluate(() => (window as any).fixture.reply(0, {
    success: true, status: 200,
    data: { editor: { lastSavedAt: "2026-09-15T00:00:01.000Z" }, mutationId: "ios:relationship-goal:needs-test-id", profile: { id: "profile:one", relationshipGoal: "旧会话需求", updatedAt: "2026-09-15T00:00:01.000Z" } },
  }));
  await page.getByText("新会话需求", { exact: true }).waitFor();
  assert.equal(await page.getByText("旧会话需求", { exact: true }).count(), 0);
});

test("home editor keeps the current draft when the goal version conflicts", async (t) => {
  const page = await openHome(t);
  await page.getByRole("button", { name: "填写需求", exact: true }).first().click();
  const input = page.getByRole("textbox", { name: "人脉需求", exact: true });
  await input.fill("冲突时保留的需求");
  await page.getByRole("button", { name: "保存需求", exact: true }).click();
  await page.evaluate(() => (window as any).fixture.reply(0, {
    success: false,
    status: 409,
    error: { code: "CONFLICT", message: "conflict" },
  }));
  await page.getByText("人脉需求已在其他位置更新。已读取最新版本，请确认后重试。", { exact: true }).waitFor();
  assert.equal(await input.inputValue(), "冲突时保留的需求");
  assert.ok(await page.evaluate(() => (window as any).fixture.refreshes > 0));
});
