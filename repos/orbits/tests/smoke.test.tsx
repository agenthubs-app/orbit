import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RootLayout from "../app/layout";
import Page from "../app/page";

test("scaffold exposes the runnable Next.js App Router contract", () => {
  const projectRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  );
  assert.equal(packageJson.scripts.dev, "next dev --webpack");
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.match(
    packageJson.scripts.lint,
    /^eslint next\.config\.js --ext \.js && tsc --noEmit --incremental false --allowJs false --jsx react-jsx --target ES2017 --lib dom,dom\.iterable,esnext --module esnext --moduleResolution bundler --esModuleInterop --skipLibCheck /,
  );
  for (const sourcePath of [
    "features/orbit-ai/gemini-provider.ts",
    "features/orbit-ai/live-conversation-service.ts",
    "app/(app)/app/orbit-real-landing-page.tsx",
    "app/(app)/app/orbit-landing-route-view-model.ts",
    "app/(app)/app/orbit-reference-styles.tsx",
    "app/(app)/app/orbit-reference-primitives.tsx",
    "app/(app)/app/orbit-lang-runtime.tsx",
    "app/(app)/app/orbit-agent-hero.tsx",
  ]) {
    assert.ok(
      packageJson.scripts.lint.includes(`"${sourcePath}"`),
      `expected lint script to type-check ${sourcePath}`,
    );
  }
  assert.equal(
    packageJson.scripts.test,
    'node --test --import tsx "tests/**/*.test.{ts,tsx}"',
  );

  for (const filePath of [
    "package.json",
    "package-lock.json",
    "next.config.js",
    "tsconfig.json",
    "next-env.d.ts",
    "app/layout.tsx",
    "app/page.tsx",
    "tests/smoke.test.tsx",
    "app/(app)/app/orbit-real-landing-page.tsx",
    "app/(app)/app/orbit-landing-route-view-model.ts",
    "app/(app)/app/orbit-reference-styles.tsx",
    "app/(app)/app/orbit-reference-primitives.tsx",
    "app/(app)/app/orbit-lang-runtime.tsx",
    "app/(app)/app/orbit-agent-hero.tsx",
  ]) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, filePath)),
      true,
      `expected ${filePath} to exist inside the app scaffold`,
    );
  }

  for (const generatedArtifactPath of ["harness-state", "harness-logs"]) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, generatedArtifactPath)),
      false,
      `expected ${generatedArtifactPath} to stay out of the app repo`,
    );
  }

  let html = "";
  assert.doesNotThrow(() => {
    html = renderToStaticMarkup(
      React.createElement(RootLayout, null, React.createElement(Page)),
    );
  });

  assert.match(html, /<main/);
  assert.match(html, /data-orbit-real-page="landing"/);
  assert.match(html, /orbit-landing-page/);
  assert.match(html, /让对的人/);
  // Language toggle renders the zh/en switcher ("中" and "EN" in separate spans).
  assert.match(html, /中/);
  assert.match(html, /EN/);
  assert.doesNotMatch(html, /orbit-prototype-frame/);
  assert.doesNotMatch(html, /Event-grounded relationship workspace/);
  assert.doesNotMatch(html, /href="#relationship-starter"/);
  assert.doesNotMatch(html, /scaffold|Sprint 1|Framework ready/i);
  assert.doesNotMatch(html, /Relationship context starter/);
  assert.doesNotMatch(html, /Mika Tanaka|Tokyo Founder Demo Night|Kenji Sato/);
  assert.doesNotMatch(html, /<details/);
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /<input/);
  assert.doesNotMatch(html, /ready for your review|follow-up draft/i);
});
