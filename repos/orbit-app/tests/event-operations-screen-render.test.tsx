import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";
import React from "react";

import { EventOperationsContent, type EventOperationsContentState } from "../src/screens/events/EventOperationsContent";
import { eventOperationsToView } from "../src/view-models/event-operations";
import { renderedText, renderToHtml } from "./helpers/render";

const generationView = { ...eventOperationsToView(null), contractValid: true };
const generationCases = [
  { busy: null, active: false, disabled: false },
  { busy: "start", active: false, disabled: true },
  { busy: "", active: false, disabled: true },
  { busy: null, active: true, disabled: true },
  { busy: "start", active: true, disabled: true },
] as const;

for (const { busy, active, disabled } of generationCases) {
  test(`generation control renders its accessible name with busy=${JSON.stringify(busy)}, active=${active}`, () => {
    const html = renderToHtml(<EventOperationsContent busy={busy} onGenerationAction={() => undefined} onOpenAnalytics={() => undefined} onOpenCheckIn={() => undefined} onOpenRoles={() => undefined} onStartGeneration={() => undefined} state={{ kind: "success" }} view={{ ...generationView, hasActiveGeneration: active }} />);
    const button = html.match(/<[^>]+aria-label="开始生成匹配"[^>]*>/u)?.[0];
    assert.ok(button, "the rendered generation control must have an explicit accessible name");
    assert.match(button, /role="button"/u);
    assert.equal(button.includes('aria-disabled="true"'), disabled);
  });
}

test("named generation control calls only its start callback and preserves both disabled gates", async (t) => {
  const require = createRequire(import.meta.url);
  const result = await build({
    stdin: {
      contents: `import React from "react"; import { createRoot } from "react-dom/client"; import { EventOperationsContent } from "./src/screens/events/EventOperationsContent";
        const root = createRoot(document.getElementById("root"));
        window.calls = { start: 0, other: 0 };
        const other = () => window.calls.other++;
        window.renderGeneration = ({ busy, active }) => root.render(<EventOperationsContent busy={busy} onGenerationAction={other} onOpenAnalytics={other} onOpenCheckIn={other} onOpenRoles={other} onStartGeneration={() => window.calls.start++} state={{ kind: "success" }} view={{ ...${JSON.stringify(generationView)}, hasActiveGeneration: active }} />);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', __DEV__: "false" },
    plugins: [{
      name: "generation-device-boundaries",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve("react-native-web") }));
        plugin.onResolve({ filter: /^@expo\/vector-icons$/ }, () => ({ path: require.resolve("./helpers/stubs/expo-vector-icons.js") }));
      },
    }],
  });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(3000);
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: result.outputFiles[0]!.text });
  for (const { busy, active, disabled } of [...generationCases, generationCases[0]]) {
    await page.evaluate(({ busy, active }) => (window as any).renderGeneration({ busy, active }), { busy, active });
    const button = page.getByRole("button", { name: "开始生成匹配", exact: true });
    await button.waitFor();
    await page.waitForFunction(disabled => (document.querySelector('[aria-label="开始生成匹配"]')?.getAttribute("aria-disabled") === "true") === disabled, disabled);
    assert.equal(await button.isDisabled(), disabled);
    const before = await page.evaluate(() => (window as any).calls.start);
    // Dispatch reaches RN Web's real press handler even for disabled controls.
    if (disabled) await button.dispatchEvent("click");
    else await button.click();
    assert.equal(await page.evaluate(() => (window as any).calls.start), before + (disabled ? 0 : 1));
    assert.equal(await page.evaluate(() => (window as any).calls.other), 0);
  }
});

test("event operations render the mobile operations hierarchy", () => {
  const view = eventOperationsToView({
    configuration: {
      checkInOpensAt: "2026-08-19T08:00:00Z", eventEndsAt: "2026-08-19T13:00:00Z", eventId: "event:ops", eventStartsAt: "2026-08-19T09:00:00Z", maxAttemptsPerTask: 3, organizerActorId: "actor:owner", profileEditDeadlineAt: "2026-08-18T09:00:00Z", recommendationCount: 3, registrationCutoffAt: "2026-08-18T10:00:00Z", resultsAvailableAt: "2026-08-19T08:30:00Z", roundOneStartsAt: "2026-08-19T10:00:00Z", roundTwoStartsAt: "2026-08-19T11:00:00Z", shardSize: 20, tableSize: 6, updatedAt: "2026-08-18T12:00:00Z"
    },
    eventId: "event:ops",
    generations: [],
    metrics: { acceptedContactRequests: 1, checkedIn: 3, contactRequests: 2, participantCount: 8, publishedGenerationId: null },
    publishedResult: null
  });
  const text = renderedText(<EventOperationsContent busy={null} onGenerationAction={() => undefined} onOpenAnalytics={() => undefined} onOpenCheckIn={() => undefined} onOpenRoles={() => undefined} onStartGeneration={() => undefined} state={{ kind: "success" }} view={view} />);
  assert.match(text, /运营概览/u);
  assert.match(text, /AI 匹配与发布/u);
  assert.match(text, /时间门禁/u);
  assert.match(text, /签到台/u);
  assert.match(text, /活动分析/u);
});

for (const [state, expected] of [
  [{ kind: "loading" }, "正在读取运营状态"],
  [{ kind: "unconfigured" }, "尚未配置运营规则"],
  [{ kind: "offline", message: "无法连接服务器" }, "无法连接服务器"],
  [{ kind: "failure", message: "当前账号没有权限" }, "当前账号没有权限"]
] as const) {
  test(`event operations render ${state.kind} state`, () => {
    const text = renderedText(<EventOperationsContent busy={null} onGenerationAction={() => undefined} onOpenAnalytics={() => undefined} onOpenCheckIn={() => undefined} onOpenRoles={() => undefined} onStartGeneration={() => undefined} state={state as EventOperationsContentState} view={eventOperationsToView(null)} />);
    assert.match(text, new RegExp(expected, "u"));
  });
}
