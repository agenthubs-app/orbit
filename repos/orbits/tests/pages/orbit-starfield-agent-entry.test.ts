import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("desktop and mobile starfields expose a real Agent prompt form", () => {
  for (const variant of ["desktop", "mobile"]) {
    const component = source(`app/(app)/app/orbit-starfield-${variant}.tsx`);
    const runtime = source(`app/(app)/app/orbit-starfield-${variant}-logic.ts`);

    assert.match(component, /<input[\s\S]*id="skPromptInput"/);
    assert.match(component, /<button[\s\S]*id="skEnter"/);
    assert.doesNotMatch(component, /href="\/app\/home\/events"/);
    assert.match(runtime, /bindStarfieldAgentPrompt/);
    assert.doesNotMatch(
      runtime,
      /querySelectorAll\('\.sk-chip'\)[\s\S]*goStop\(1\)/,
    );
  }
});

test("the starfield uses the product's shared top navigation", () => {
  const home = source("app/(app)/app/orbit-starfield-home.tsx");
  const desktop = source("app/(app)/app/orbit-starfield-desktop.tsx");
  const mobile = source("app/(app)/app/orbit-starfield-mobile.tsx");

  assert.match(home, /<OrbitTopNav/);
  assert.match(home, /active=\{null\}/);
  assert.match(home, /tone="starfield"/);
  assert.doesNotMatch(desktop, /id="skNav"/);
  assert.doesNotMatch(mobile, /id="skNav"|id="skMenu"|id="skBurger"/);
});

test("both starfield runtimes reuse the shared Agent entry binding", () => {
  const binding = source("app/(app)/app/orbit-starfield-agent-prompt.ts");

  assert.match(binding, /agentHrefForPrompt/);
  assert.match(binding, /window\.location\.assign/);
  assert.match(binding, /event\.key === "Enter"/);
  assert.match(binding, /event\.stopPropagation/);
});
