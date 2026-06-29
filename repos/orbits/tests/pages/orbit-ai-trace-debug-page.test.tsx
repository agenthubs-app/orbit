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
  assert.match(html, /data-stage-output-source="true"/);
  assert.match(html, /data-planner-only-comparison="true"/);
  assert.match(html, /data-runtime-snapshot="true"/);
  assert.match(html, /developer-debug-prompt-visible/);
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
});
