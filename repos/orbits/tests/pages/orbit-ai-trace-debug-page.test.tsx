/**
 * Orbit AI trace debug 页面测试。
 *
 * 验证 trace debugger 页面能渲染执行链、source code 和折叠结构。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const testRequire = createRequire(import.meta.url);

testRequire.extensions[".css"] = () => undefined;

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(existsSync(absolutePath), true, `${pathFromRoot} must exist`);

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("/dev/orbit-ai/trace renders the Orbit AI trace debugger shell", async () => {
  const page = await importProjectModule<{ default: () => React.ReactElement }>(
    "app/dev/orbit-ai/trace/page.tsx",
  );
  const html = renderToStaticMarkup(React.createElement(page.default));

  assert.match(html, /Orbit AI trace debugger/);
  assert.match(html, /data-orbit-ai-trace-debugger="true"/);
  assert.match(html, /data-trace-timeline="true"/);
  assert.match(html, /data-trace-pipeline="true"/);
  assert.match(html, /data-trace-graph="true"/);
  assert.match(html, /Loop 1 \/ 1/);
  assert.match(html, /data-pipeline-stage="input_received"/);
  assert.match(html, /data-pipeline-stage="final_response"/);
  assert.match(html, /data-stage-output-source="true"/);
  assert.match(html, /data-database-lane="true"/);
  assert.match(html, /data-trace-lane="data"/);
  assert.match(html, /data-planner-only-comparison="true"/);
  assert.match(html, /data-runtime-snapshot="true"/);
  assert.match(html, /aria-label="切换 trace 界面语言"/);
  assert.match(html, />中文</);
  assert.match(html, />English</);
  assert.match(html, /Agent 执行管线/);
  assert.match(html, /管线检查台/);
  assert.match(html, /developer-debug-prompt-visible/);
});

test("/dev/orbit-ai/trace keeps pipeline nodes compact", async () => {
  const page = await importProjectModule<{ default: () => React.ReactElement }>(
    "app/dev/orbit-ai/trace/page.tsx",
  );
  const html = renderToStaticMarkup(React.createElement(page.default));
  const stageButtons = Array.from(
    html.matchAll(/<button[^>]*class="trace-stage-button"[\s\S]*?<\/button>/g),
    (match) => match[0],
  );
  const graphNodes = Array.from(
    html.matchAll(/<button[^>]*class="trace-graph-node"[\s\S]*?<\/button>/g),
    (match) => match[0],
  );

  assert.match(html, /运行一次 trace 后，在管线检查台查看当前阶段。/);
  assert.equal(stageButtons.every((button) => !button.includes("<p>")), true);
  assert.equal(graphNodes.every((button) => !button.includes("<p>")), true);
});

test("Orbit AI trace debugger posts prompts to the full-chain trace API", () => {
  const source = readFileSync(
    join(projectRoot, "app/dev/orbit-ai/trace/orbit-ai-trace-debugger.tsx"),
    "utf8",
  );

  assert.match(source, /fetch\(["']\/api\/dev\/orbit-ai\/trace["']/);
  assert.match(source, /method:\s*["']POST["']/);
  assert.match(source, /JSON\.stringify\([\s\S]*null,\s*2\)/);
  assert.match(source, /<details[^>]*data-stage-output-source="true"/);
  assert.match(source, /disabled=\{[^}]*!prompt\.trim\(\)/);
  assert.match(source, /runtimeSnapshot/);
  assert.match(source, /plannerOnly/);
  assert.match(source, /loopSummary/);
  assert.match(source, /graph/);
  assert.match(source, /databaseInteractions/);
  assert.match(source, /--trace-data/);
  assert.match(source, /--trace-agent/);
});
