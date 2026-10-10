import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { nativeUiStubs } from "./helpers/native-ui-stubs";
import { legacyTaskRedirect, parentForPath, taskHref } from "../src/view-models/app-navigation";
import { notificationHrefFromDeepLink } from "../src/notifications/notification-model";
import { taskListHref } from "../src/view-models/task-list-scope";
import { isPrivateMobileRoute } from "../src/view-models/mobile-route-access";

// R05 (SC-R05-02, 03): the Task container — four frozen segments, `?seg=` links,
// the 「＋」 per segment — rendered for real with react-native-web. The four slot
// pages are replaced by labelled stand-ins (their own behaviour has its own tests);
// the container, SwipeSegments, the shell memory and the embedding are real.
const root = new URL("..", import.meta.url).pathname;
const slotStub = (name: string) => `
import React, { forwardRef, useImperativeHandle, useRef } from "react";
import { Text, TextInput } from "react-native";
import { AppScreen } from "${join(root, "src/components/AppScreen")}";
${name === "TaskQuickAdd" ? "" : `export function ${name}() {
  return <AppScreen title="${name} title" headerActions={<Text>${name} header action</Text>}><Text>${name} page</Text>{Array.from({ length: ${name === "TasksScreen" ? 60 : 0} }, (_, i) => <Text key={i} style={{ height: 40 }}>${name} row {i}</Text>)}</AppScreen>;
}`}
export const TaskQuickAdd = forwardRef(function TaskQuickAdd(_props, ref) {
  const input = useRef(null);
  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);
  return <TextInput ref={input} accessibilityLabel="quick add" />;
});
`;
const SLOTS: Record<string, string> = {
  "schedule/ScheduleScreen": "ScheduleScreen",
  "tasks/TasksScreen": "TasksScreen",
  "notes/NotesScreen": "NotesScreen",
  "TaskQuickAdd": "TaskQuickAdd",
};

let browser: Browser;
let script: string;

test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import { TaskScreen } from "./src/screens/task/TaskScreen";
import { ToastProvider, UiPortalHost } from "./src/components/ui";
// window.remount(): the Task tab mounted again (a tab switch replaces it).
function Root() { const [key, setKey] = React.useState(0); window.remount = () => setKey((value) => value + 1); return <TaskScreen key={key} />; }
createRoot(document.getElementById("root")).render(<ToastProvider hasTabBar><UiPortalHost><Root /></UiPortalHost></ToastProvider>);
`, loader: "tsx", resolveDir: root },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    plugins: [nativeUiStubs, { name: "task-shell", setup(plugin) {
      plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
      plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-svg.js") }));
      plugin.onResolve({ filter: /^react-native-safe-area-context$/ }, () => ({ path: join(root, "tests/helpers/stubs/react-native-safe-area-context.js") }));
      plugin.onResolve({ filter: /^expo-router$/ }, () => ({ path: join(root, "tests/helpers/stubs/task-shell-router.js") }));
      plugin.onResolve({ filter: /(AuthSessionProvider|ApiBaseUrlProvider)$/ }, (args) => ({ path: args.path, namespace: "session" }));
      plugin.onLoad({ filter: /AuthSessionProvider$/, namespace: "session" }, () => ({ contents: `export const useOrbitAuthSession = () => ({ ready: true, signedIn: true, actorId: "actor", cookieHeader: "c", user: { name: "Aki" } });`, loader: "js" }));
      plugin.onLoad({ filter: /ApiBaseUrlProvider$/, namespace: "session" }, () => ({ contents: `export const useOrbitApiBaseUrl = () => ({ ready: true, baseUrl: "http://local.test" });`, loader: "js" }));
      for (const [suffix, name] of Object.entries(SLOTS)) {
        plugin.onResolve({ filter: new RegExp("(^|/)" + suffix.replace("/", "\\/") + "$") }, () => ({ path: suffix, namespace: "slot" }));
        plugin.onLoad({ filter: new RegExp("(^|/)" + suffix.replace("/", "\\/") + "$"), namespace: "slot" }, () => ({ contents: slotStub(name), loader: "tsx", resolveDir: root }));
      }
    } }],
  });
  script = result.outputFiles[0]!.text;
  if (process.env.DEBUG_SHELL) require("node:fs").writeFileSync("/tmp/claude-501/task-bundle.js", script);
  browser = await chromium.launch({ headless: true });
});

test.after(async () => { await browser?.close(); });

async function open(t: { after: (fn: () => Promise<void>) => void }, params: Record<string, string> = {}, width = 390, paramsDelay = 0): Promise<Page> {
  const page = await browser.newPage({ viewport: { width, height: 844 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => { errors.push(error.message); if (process.env.DEBUG_SHELL) console.log(error.stack?.slice(0, 3000)); });
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="height:100vh;display:flex;flex-direction:column"></div><script>window.shellFixture=${JSON.stringify({ path: "/task", params, navigation: [], paramsDelay })}</script></body></html>`);
  await page.addScriptTag({ content: script });
  await page.getByRole("tablist", { name: "Task" }).waitFor();
  return page;
}

const navigation = (page: Page) => page.evaluate(() => (window as any).shellFixture.navigation);
const selected = (page: Page) => page.locator('[role="tab"][aria-selected="true"]').textContent();
const visible = async (page: Page, text: string) => {
  const box = await page.getByText(text, { exact: true }).boundingBox();
  return Boolean(box && box.x >= 0 && box.x < 390);
};

test("four frozen segments in order; ?seg= opens one directly and only the shown page is mounted", async (t) => {
  const page = await open(t, { seg: "memo" });
  assert.deepEqual(await page.getByRole("tab").allTextContents(), ["カレンダー", "To-do", "プラン", "メモ"]);
  assert.equal(await selected(page), "メモ");
  assert.equal(await visible(page, "NotesScreen page"), true);
  assert.equal(await page.getByText("ScheduleScreen page").count(), 0, "unvisited segments are not mounted yet");
  // Embedded pages draw only their content: no own title, header actions or tab bar.
  assert.equal(await page.getByText("NotesScreen title").count(), 0);
  assert.equal(await page.getByText("NotesScreen header action").count(), 0);
  assert.equal(await page.getByRole("tablist", { name: "メインナビゲーション" }).count(), 0);
});

test("tapping a segment switches the page, keeps the URL in step and keeps visited pages mounted", async (t) => {
  const page = await open(t, { seg: "calendar" });
  await page.getByRole("tab", { name: "To-do" }).click();
  await page.waitForTimeout(400);
  assert.equal(await selected(page), "To-do");
  assert.equal(await visible(page, "TasksScreen page"), true);
  assert.equal(await page.getByText("ScheduleScreen page").count(), 1, "calendar stays mounted");
  assert.deepEqual(await navigation(page), [{ method: "setParams", params: { seg: "todo" } }]);
});

test("two taps in a row are never pulled back while the URL catches up (review M2)", async (t) => {
  const page = await open(t, { seg: "todo" }, 390, 600);
  // A plain script: both taps happen in the same task, before the first URL write lands.
  await page.evaluate(`(() => {
    const seen = [];
    window.seen = seen;
    const read = () => { const label = document.querySelector('[role="tab"][aria-selected="true"]')?.textContent ?? ""; if (seen[seen.length - 1] !== label) seen.push(label); };
    new MutationObserver(read).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-selected"] });
    const tab = (name) => [...document.querySelectorAll('[role="tab"]')].find((el) => el.textContent === name);
    tab("カレンダー").click();
    tab("メモ").click();
  })()`);
  await page.waitForTimeout(1600);
  // Never back to カレンダー once メモ showed (the old code went メモ → カレンダー → メモ).
  const seen: string[] = await page.evaluate(() => (window as any).seen);
  assert.equal(seen.at(-1), "メモ");
  assert.equal(seen.slice(seen.indexOf("メモ")).includes("カレンダー"), false, JSON.stringify(seen));
  assert.equal(await selected(page), "メモ");
});

test("tapping segments in a row is not pulled back by the URL catching up a render later", async (t) => {
  const page = await open(t, { seg: "todo" }, 390, 150);
  await page.getByRole("tab", { name: "プラン" }).click();
  assert.equal(await selected(page), "プラン");
  await page.waitForTimeout(400);
  assert.equal(await selected(page), "プラン");
  await page.getByRole("tab", { name: "カレンダー" }).click();
  await page.waitForTimeout(50);
  await page.getByRole("tab", { name: "メモ" }).click();
  await page.waitForTimeout(400);
  assert.equal(await selected(page), "メモ");
  assert.equal(await page.getByRole("button", { name: "メモを追加" }).count(), 1);
});

test("the 「＋」 follows the segment: new event, focus the add box, none on プラン, new note", async (t) => {
  const page = await open(t, { seg: "calendar" });
  await page.getByRole("button", { name: "予定を追加" }).click();
  await page.getByRole("tab", { name: "To-do" }).click();
  await page.getByRole("button", { name: "To-do を追加" }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "quick add");
  await page.getByRole("tab", { name: "プラン" }).click();
  assert.equal(await page.getByRole("button", { name: /を追加$/ }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "目標を決める" }).count(), 1, "plan shows its empty state with one action");
  await page.getByRole("button", { name: "目標を決める" }).click();
  await page.getByText("近日公開").waitFor();
  await page.getByRole("tab", { name: "メモ" }).click();
  await page.getByRole("button", { name: "メモを追加" }).click();
  const pushes = (await navigation(page)).filter((entry: { method: string }) => entry.method === "push");
  assert.deepEqual(pushes, [{ method: "push", href: "/schedule/personal/new" }, { method: "push", href: "/notes/new" }]);
});

test("a later link while Task is open moves the segment", async (t) => {
  const page = await open(t, { seg: "todo" });
  await page.evaluate(() => { const f = (window as any).shellFixture; f.params.seg = "memo"; f.rerender(); });
  await page.waitForTimeout(100);
  assert.equal(await selected(page), "メモ");
});

test("a Task segment mounted again comes back at the same scroll position (review m2)", async (t) => {
  const page = await open(t, { seg: "todo" });
  await page.getByText("TasksScreen row 59").waitFor({ state: "attached" });
  const scrollerOf = () => page.evaluate(() => {
    const node = [...document.querySelectorAll<HTMLElement>("div")].find((el) => el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.textContent?.includes("TasksScreen row 59"))!;
    return node.scrollTop;
  });
  await page.evaluate(() => {
    const node = [...document.querySelectorAll<HTMLElement>("div")].find((el) => el.scrollHeight > el.clientHeight + 10 && /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.textContent?.includes("TasksScreen row 59"))!;
    node.scrollTop = 800; node.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(200);
  await page.evaluate(() => (window as any).remount());
  await page.getByText("TasksScreen row 59").waitFor({ state: "attached" });
  await page.waitForTimeout(300);
  assert.ok(Math.abs((await scrollerOf()) - 800) <= 2, String(await scrollerOf()));
  assert.equal(await selected(page), "To-do");
});

test("320pt and 2× text: four segments stay inside the screen", async (t) => {
  const page = await open(t, { seg: "todo" }, 320);
  await page.addStyleTag({ content: '[role="tab"] [dir="auto"] { font-size: 25px !important; }' });
  for (const tab of await page.getByRole("tab").all()) {
    const box = (await tab.boundingBox())!;
    assert.ok(box.x >= 0 && box.x + box.width <= 320 && box.height >= 38);
  }
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 320));
});

test("old addresses and notifications land on the matching segment", () => {
  assert.equal(legacyTaskRedirect("/schedule"), "/task?seg=calendar");
  assert.equal(legacyTaskRedirect("/schedule", { date: "2026-10-10" }), "/task?seg=calendar&date=2026-10-10");
  assert.equal(legacyTaskRedirect("/today"), "/task?seg=todo");
  assert.equal(legacyTaskRedirect("/tasks", { scope: "relationship", view: "completed" }), "/task?seg=todo&scope=relationship&view=completed");
  assert.equal(legacyTaskRedirect("/followups"), "/task?seg=todo&scope=relationship");
  assert.equal(legacyTaskRedirect("/notes"), "/task?seg=memo");
  assert.equal(legacyTaskRedirect("/notes", { contactId: "c1" }), null, "one contact's notes stay their own page");
  assert.equal(taskHref("plan"), "/task?seg=plan");
  // Links generated in shared code use the new address.
  assert.equal(taskListHref({ scope: "relationship" }), "/task?seg=todo&scope=relationship");
  assert.equal(taskListHref(), "/task?seg=todo");
  // Reminder deep links scheduled with the old addresses open the Task segment;
  // the new address keeps its segment and To-do's list selection (review M3).
  assert.equal(notificationHrefFromDeepLink("orbit://today"), "/task?seg=todo");
  assert.equal(notificationHrefFromDeepLink("/schedule"), "/task?seg=calendar");
  assert.equal(notificationHrefFromDeepLink("/task?seg=todo"), "/task?seg=todo");
  assert.equal(notificationHrefFromDeepLink("orbit://task?seg=memo"), "/task?seg=memo");
  assert.equal(notificationHrefFromDeepLink("/task?seg=todo&scope=relationship&next=https://x.example"), "/task?seg=todo&scope=relationship");
  assert.equal(notificationHrefFromDeepLink("/task?seg=bogus"), "/task");
  assert.equal(notificationHrefFromDeepLink("/inbox?x=1"), null, "other addresses still take no query");
  assert.equal(notificationHrefFromDeepLink("/tasks/abc"), "/tasks/abc");
  assert.equal(notificationHrefFromDeepLink("/schedule/events/e1"), "/schedule/events/e1");
  // Detail pages go back to their segment.
  assert.deepEqual(parentForPath("/tasks/one").href, "/task?seg=todo");
  assert.deepEqual(parentForPath("/notes/one").href, "/task?seg=memo");
  assert.deepEqual(parentForPath("/schedule/personal/one").href, "/task?seg=calendar");
  // Signed-out visitors cannot open Task or notes.
  for (const route of ["/task", "/notes", "/notes/one"]) assert.equal(isPrivateMobileRoute(route), true, route);
});

test("the old route files stay as private redirects; the Task route is private", () => {
  for (const file of ["app/tasks.tsx", "app/today.tsx", "app/(app)/schedule.tsx"]) {
    const source = readFileSync(join(root, file), "utf8");
    assert.match(source, /withOrbitPrivateRoute\(LegacyTaskRedirect\)/u, file);
  }
  assert.match(readFileSync(join(root, "app/notes/index.tsx"), "utf8"), /LegacyTaskRedirect fallback=\{NotesRoute\}/u);
  assert.match(readFileSync(join(root, "app/task.tsx"), "utf8"), /withOrbitPrivateRoute\(TaskScreen\)/u);
});
